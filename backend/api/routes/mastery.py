from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.database import get_db
from models.user import User
from schemas import TopicMasteryOut
from services import mastery_service

router = APIRouter(prefix="/api/mastery", tags=["mastery"])


@router.get("", response_model=list[TopicMasteryOut])
async def get_all_mastery(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return await mastery_service.get_all_mastery(db, current_user.id)


@router.get("/{avatar_id}", response_model=list[TopicMasteryOut])
async def get_avatar_mastery(
    avatar_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return await mastery_service.get_mastery_for_avatar(db, current_user.id, avatar_id)
