from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.ai_client import anthropic_client
from core.config import settings
from core.database import get_db
from core.uploads import (
    CHAT_ALLOWED_EXTENSIONS,
    CHAT_IMAGE_EXTENSIONS,
    delete_quietly,
    detect_image_ext,
    new_stored_name,
    read_limited,
    write_file,
)
from models.user import User
from schemas import ChatSessionCreate, ChatSessionOut, ChatSessionUpdate, MessageOut
from services import avatar_service, chat_service, cleanup_service, feedback_service
from services.chat_service import SavedUpload

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/sessions", response_model=ChatSessionOut)
async def create_session(
    data: ChatSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    avatar = await avatar_service.get_avatar(db, current_user.id, data.avatar_id)
    if avatar is None:
        raise HTTPException(status_code=404, detail="Avatar not found")
    return await chat_service.create_session(db, current_user.id, data.avatar_id, data.title)


@router.get("/sessions", response_model=list[ChatSessionOut])
async def list_sessions(
    avatar_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await chat_service.list_sessions(db, current_user.id, avatar_id)


@router.patch("/sessions/{session_id}", response_model=ChatSessionOut)
async def update_session(
    session_id: int,
    data: ChatSessionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await chat_service.rename_session(db, current_user.id, session_id, data.title)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await chat_service.get_session(db, current_user.id, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    await cleanup_service.delete_session(db, session)
    return {"ok": True}


@router.get("/sessions/{session_id}/messages", response_model=list[MessageOut])
async def get_session_messages(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await chat_service.get_session(db, current_user.id, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    messages = await chat_service.get_messages(db, session_id)
    feedback_map = await feedback_service.get_feedback_map(
        db, current_user.id, [m.id for m in messages]
    )
    for m in messages:
        m.user_feedback = feedback_map.get(m.id)
    return messages


async def _save_chat_uploads(files: list[UploadFile]) -> list[SavedUpload]:
    """Validate and store a message's attachments. Nothing is kept if any
    file is rejected."""
    files = [f for f in files if f.filename]
    if len(files) > settings.max_chat_files_per_message:
        raise HTTPException(
            status_code=400,
            detail=f"You can attach up to {settings.max_chat_files_per_message} files per message.",
        )

    saved: list[SavedUpload] = []
    try:
        for f in files:
            original = Path(f.filename or "").name
            ext = Path(original).suffix.lower()
            if ext not in CHAT_ALLOWED_EXTENSIONS:
                raise HTTPException(status_code=400, detail=f"“{original}” isn't a supported file type.")
            data = await read_limited(f, settings.max_chat_file_bytes)
            if ext in CHAT_IMAGE_EXTENSIONS:
                detected = detect_image_ext(data)
                if detected is None:
                    raise HTTPException(status_code=400, detail=f"“{original}” isn't a valid image.")
                ext, kind = detected, "image"
            elif ext == ".pdf":
                if not data.startswith(b"%PDF"):
                    raise HTTPException(status_code=400, detail=f"“{original}” isn't a valid PDF.")
                kind = "pdf"
            else:
                kind = "text"
            stored = new_stored_name(ext)
            path = settings.chat_files_dir / stored
            await write_file(path, data)
            saved.append(SavedUpload(path=path, original_filename=original, stored_name=stored, kind=kind))
    except Exception:
        for s in saved:
            delete_quietly(s.path)
        raise
    return saved


@router.post("/stream")
async def stream_chat(
    session_id: int = Form(...),
    message: str = Form(""),
    regenerate: bool = Form(False),
    files: list[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await chat_service.get_session(db, current_user.id, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    avatar = await avatar_service.get_avatar(db, current_user.id, session.avatar_id)
    if avatar is None:
        raise HTTPException(status_code=404, detail="Avatar not found")

    if regenerate:
        uploads: list[SavedUpload] = []
    else:
        uploads = await _save_chat_uploads(files)
        if not message.strip() and not uploads:
            raise HTTPException(status_code=400, detail="Message is empty.")

    generator = chat_service.stream_chat_response(
        client=anthropic_client,
        session_id=session.id,
        avatar_id=avatar.id,
        user_text=message.strip(),
        uploads=uploads,
        regenerate=regenerate,
    )

    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
