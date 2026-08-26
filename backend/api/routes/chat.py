import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.ai_client import anthropic_client
from core.config import settings
from core.database import get_db
from models.user import User
from schemas import ChatSessionCreate, ChatSessionOut, ChatSessionUpdate, MessageOut
from services import avatar_service, chat_service, feedback_service

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


def _save_upload(file: UploadFile) -> tuple[Path, str]:
    ext = Path(file.filename or "").suffix
    stored_name = f"{uuid.uuid4().hex}{ext}"
    dest = settings.chat_files_dir / stored_name
    with open(dest, "wb") as f:
        f.write(file.file.read())
    return dest, file.filename or stored_name


@router.post("/stream")
async def stream_chat(
    session_id: int = Form(...),
    message: str = Form(""),
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

    saved_files: list[tuple[Path, str]] = []
    attached_meta: list[dict] = []
    for f in files:
        if f.filename:
            path, original_name = _save_upload(f)
            saved_files.append((path, original_name))
            attached_meta.append({"filename": original_name})

    generator = chat_service.stream_chat_response(
        db=db,
        client=anthropic_client,
        session=session,
        avatar=avatar,
        user_text=message,
        files=saved_files,
        attached_files_meta=attached_meta,
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
