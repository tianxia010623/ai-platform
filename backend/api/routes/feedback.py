from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.database import get_db
from models.user import User
from schemas import FeedbackSummaryOut, MessageFeedbackCreate, MessageFeedbackOut
from services import feedback_service

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


@router.post("/{message_id}", response_model=MessageFeedbackOut)
async def submit_feedback(
    message_id: int,
    data: MessageFeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await feedback_service.submit_feedback(
        db, current_user.id, message_id, data.rating
    )
@router.get("/summary", response_model=list[FeedbackSummaryOut])
async def get_feedback_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await feedback_service.get_feedback_summary(db, current_user.id)