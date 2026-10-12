import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.config import settings
from core.database import get_db
from core.uploads import (
    IMAGE_MEDIA_TYPES,
    delete_quietly,
    detect_image_ext,
    new_stored_name,
    read_limited,
    resolve_stored_file,
    write_file,
)
from models.user import User
from schemas import AvatarCreate, AvatarOut, AvatarUpdate
from services import avatar_service, cleanup_service

router = APIRouter(prefix="/api/avatars", tags=["avatars"])

IMAGE_URL_PREFIX = "/api/avatars/image/"


async def _save_avatar_image(file: UploadFile) -> str:
    data = await read_limited(file, settings.max_avatar_image_bytes)
    ext = detect_image_ext(data)
    if ext is None:
        raise HTTPException(status_code=400, detail="Avatar image must be a PNG, JPG, WEBP, or GIF file.")
    name = new_stored_name(ext)
    await write_file(settings.avatar_dir / name, data)
    return f"{IMAGE_URL_PREFIX}{name}"


async def _get_owned(db: AsyncSession, user: User, avatar_id: int):
    avatar = await avatar_service.get_avatar(db, user.id, avatar_id)
    if avatar is None:
        raise HTTPException(status_code=404, detail="Avatar not found")
    return avatar


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
        if not isinstance(tags, list) or not all(isinstance(t, str) for t in tags):
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
        image_path = await _save_avatar_image(image)

    return await avatar_service.create_avatar(db, current_user.id, data, image_path)


@router.get("", response_model=list[AvatarOut])
async def list_avatars(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return await avatar_service.list_avatars(db, current_user.id)


@router.get("/image/{filename}")
async def get_avatar_image(filename: str):
    # Public on purpose (<img> tags can't send auth headers); names are
    # unguessable UUIDs. resolve_stored_file rejects anything that isn't a
    # name we generated, so "..\\..\\.env"-style paths never reach the disk.
    path = resolve_stored_file(settings.avatar_dir, filename)
    media_type = IMAGE_MEDIA_TYPES.get(path.suffix.lower()) if path else None
    if path is None or media_type is None or not path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(
        path,
        media_type=media_type,
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400"},
    )


@router.get("/{avatar_id}", response_model=AvatarOut)
async def get_avatar(
    avatar_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return await _get_owned(db, current_user, avatar_id)


@router.patch("/{avatar_id}", response_model=AvatarOut)
async def update_avatar(
    avatar_id: int,
    data: AvatarUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    avatar = await _get_owned(db, current_user, avatar_id)
    return await avatar_service.update_avatar(db, avatar, data)


@router.put("/{avatar_id}/image", response_model=AvatarOut)
async def replace_avatar_image(
    avatar_id: int,
    image: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    avatar = await _get_owned(db, current_user, avatar_id)
    old_path = avatar.image_path
    new_path = await _save_avatar_image(image)
    try:
        updated = await avatar_service.set_avatar_image(db, avatar, new_path)
    except Exception:
        delete_quietly(resolve_stored_file(settings.avatar_dir, new_path.rsplit("/", 1)[-1]))
        raise
    cleanup_service.delete_avatar_image(old_path)
    return updated


@router.delete("/{avatar_id}/image", response_model=AvatarOut)
async def remove_avatar_image(
    avatar_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    avatar = await _get_owned(db, current_user, avatar_id)
    old_path = avatar.image_path
    updated = await avatar_service.set_avatar_image(db, avatar, None)
    cleanup_service.delete_avatar_image(old_path)
    return updated


@router.delete("/{avatar_id}")
async def delete_avatar(
    avatar_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    avatar = await _get_owned(db, current_user, avatar_id)
    await cleanup_service.delete_avatar(db, avatar)
    return {"ok": True}
