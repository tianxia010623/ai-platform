from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.message_feedback import MessageFeedback


async def submit_feedback(
    db: AsyncSession, user_id: int, message_id: int, rating: int
) -> MessageFeedback:
    """Create or update a user's feedback rating for a given message (upsert)."""
    result = await db.execute(
        select(MessageFeedback).where(
            MessageFeedback.message_id == message_id,
            MessageFeedback.user_id == user_id,
        )
    )
    record = result.scalar_one_or_none()

    if record is None:
        record = MessageFeedback(message_id=message_id, user_id=user_id, rating=rating)
        db.add(record)
    else:
        record.rating = rating

    await db.commit()
    await db.refresh(record)
    return record
