from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.database import get_db
from models.avatar import Avatar
from models.user import User
from schemas import PromptVariantCreate, PromptVariantOut, PromptVariantUpdate
from services import avatar_service, variant_service

router = APIRouter(prefix="/api/avatars/{avatar_id}/prompt-variants", tags=["prompt-variants"])


async def _get_owned_avatar(db: AsyncSession, avatar_id: int, current_user: User) -> Avatar:
    avatar = await avatar_service.get_avatar(db, current_user.id, avatar_id)
    if avatar is None:
        raise HTTPException(status_code=404, detail="Avatar not found")
    return avatar


@router.get("", response_model=list[PromptVariantOut])
async def list_variants(
    avatar_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_owned_avatar(db, avatar_id, current_user)
    return await variant_service.list_variants(db, avatar_id)


@router.post("", response_model=PromptVariantOut)
async def create_variant(
    avatar_id: int,
    data: PromptVariantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_owned_avatar(db, avatar_id, current_user)
    return await variant_service.create_variant(db, avatar_id, data.name, data.prompt_modifier)


@router.patch("/{variant_id}", response_model=PromptVariantOut)
async def update_variant(
    avatar_id: int,
    variant_id: int,
    data: PromptVariantUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_owned_avatar(db, avatar_id, current_user)
    variant = await variant_service.get_variant(db, avatar_id, variant_id)
    if variant is None:
        raise HTTPException(status_code=404, detail="Prompt variant not found")
    return await variant_service.set_variant_active(db, variant, data.is_active)
