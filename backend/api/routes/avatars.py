import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.config import settings
from core.database import get_db
from models.user import User
from schemas import AvatarCreate, AvatarOut, AvatarUpdate
from services import avatar_service

router = APIRouter(prefix="/api/avatars", tags=["avatars"])

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}


def _save_avatar_image(file: UploadFile) -> str:
    ext = Path(file.filename or "").suffix or ".png"
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = settings.avatar_dir / filename
    with open(dest, "wb") as f:
        f.write(file.file.read())
    return f"/api/avatars/image/{filename}"


@router.post("", response_model=AvatarOut)
async def create_avatar(
    name: str = Form(...),
    description: str = Form(""),
    personality: str = Form(""),
    speaking_style: str = Form(""),
    expertise: str = Form(""),
    topic_tags: str = Form("[]"),
    image: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        tags = json.loads(topic_tags) if topic_tags else []
        if not isinstance(tags, list):
            raise ValueError
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(status_code=400, detail="topic_tags must be a JSON array of strings")

    data = AvatarCreate(
        name=name,
        description=description,
        personality=personality,
        speaking_style=speaking_style,
        expertise=expertise,
        topic_tags=tags,
    )

    image_path = None
    if image is not None and image.filename:
        if image.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail="Unsupported image type")
        image_path = _save_avatar_image(image)

    avatar = await avatar_service.create_avatar(db, current_user.id, data, image_path)
    return avatar


@router.get("", response_model=list[AvatarOut])
async def list_avatars(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return await avatar_service.list_avatars(db, current_user.id)


@router.get("/image/{filename}")
async def get_avatar_image(filename: str):
    path = settings.avatar_dir / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path)


@router.get("/{avatar_id}", response_model=AvatarOut)
async def get_avatar(
    avatar_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    avatar = await avatar_service.get_avatar(db, current_user.id, avatar_id)
    if avatar is None:
        raise HTTPException(status_code=404, detail="Avatar not found")
    return avatar


@router.patch("/{avatar_id}", response_model=AvatarOut)
async def update_avatar(
    avatar_id: int,
    data: AvatarUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    avatar = await avatar_service.get_avatar(db, current_user.id, avatar_id)
    if avatar is None:
        raise HTTPException(status_code=404, detail="Avatar not found")
    return await avatar_service.update_avatar(db, avatar, data)


@router.delete("/{avatar_id}")
async def delete_avatar(
    avatar_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    avatar = await avatar_service.get_avatar(db, current_user.id, avatar_id)
    if avatar is None:
        raise HTTPException(status_code=404, detail="Avatar not found")
    await avatar_service.delete_avatar(db, avatar)
    return {"ok": True}
