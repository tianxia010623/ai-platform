from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.avatar import Avatar
from models.chat_session import ChatSession
from models.message import Message
from models.message_feedback import MessageFeedback
from models.prompt_variant import PromptVariant
from services import bandit_service


async def _get_variant_for_message(db: AsyncSession, message_id: int) -> PromptVariant | None:
    result = await db.execute(
        select(PromptVariant)
        .join(Message, Message.prompt_variant_id == PromptVariant.id)
        .where(Message.id == message_id)
    )
    return result.scalar_one_or_none()


async def submit_feedback(
    db: AsyncSession, user_id: int, message_id: int, rating: int
) -> MessageFeedback:
    """Create or update a user's feedback rating for a given message (upsert).

    rating is 1 (thumbs up), -1 (thumbs down), or 0 (un-voting — the user
    clicked the same button again to clear their rating). Only 1/-1 count as
    a real opinion: they're the only ones that feed the bandit's Thompson
    Sampling stats (see bandit_service) or count toward a message's approval
    rate. Because feedback is an upsert, changing an existing rating first
    reverts the old reward (if the old rating was 1/-1) before applying the
    new one, so a variant's stats always reflect the user's latest opinion
    rather than double-counting or treating "un-voted" as a thumbs down.
    """
    result = await db.execute(
        select(MessageFeedback).where(
            MessageFeedback.message_id == message_id,
            MessageFeedback.user_id == user_id,
        )
    )
    record = result.scalar_one_or_none()
    variant = await _get_variant_for_message(db, message_id)

    if record is None:
        record = MessageFeedback(message_id=message_id, user_id=user_id, rating=rating)
        db.add(record)
        await db.commit()
        await db.refresh(record)
        if variant and rating != 0:
            await bandit_service.apply_reward(db, variant, reward=1 if rating == 1 else 0)
    elif record.rating != rating:
        if variant and record.rating != 0:
            await bandit_service.revert_reward(db, variant, reward=1 if record.rating == 1 else 0)
        record.rating = rating
        await db.commit()
        await db.refresh(record)
        if variant and rating != 0:
            await bandit_service.apply_reward(db, variant, reward=1 if rating == 1 else 0)

    return record


async def get_feedback_map(
    db: AsyncSession, user_id: int, message_ids: list[int]
) -> dict[int, int]:
    """Returns {message_id: rating} for this user's feedback on the given
    messages (only messages with a rating present are included). Used to
    restore 👍/👎 button state when a chat session's history is reloaded."""
    if not message_ids:
        return {}
    result = await db.execute(
        select(MessageFeedback.message_id, MessageFeedback.rating).where(
            MessageFeedback.user_id == user_id,
            MessageFeedback.message_id.in_(message_ids),
        )
    )
    return {message_id: rating for message_id, rating in result.all()}


async def get_feedback_summary(db: AsyncSession, user_id: int) -> list[dict]:
    """Aggregate feedback stats per avatar for the given user."""
    result = await db.execute(
        select(
            Avatar.id.label("avatar_id"),
            Avatar.name.label("avatar_name"),
            # rating == 0 means "un-voted" (see submit_feedback) — excluded
            # from every count below so a cleared vote doesn't silently drag
            # down the approval rate.
            func.sum(case((MessageFeedback.rating != 0, 1), else_=0)).label("total"),
            func.sum(case((MessageFeedback.rating == 1, 1), else_=0)).label("thumbs_up"),
            func.sum(case((MessageFeedback.rating == -1, 1), else_=0)).label("thumbs_down"),
        )
        .join(ChatSession, ChatSession.avatar_id == Avatar.id)
        .join(Message, Message.session_id == ChatSession.id)
        .join(MessageFeedback, MessageFeedback.message_id == Message.id)
        .where(Avatar.user_id == user_id, MessageFeedback.user_id == user_id)
        .group_by(Avatar.id, Avatar.name)
    )

    rows = result.all()
    summary = []
    for row in rows:
        total = row.total or 0
        up = row.thumbs_up or 0
        down = row.thumbs_down or 0
        summary.append(
            {
                "avatar_id": row.avatar_id,
                "avatar_name": row.avatar_name,
                "total": total,
                "thumbs_up": up,
                "thumbs_down": down,
                "approval_rate": round(up / total, 3) if total > 0 else None,
            }
        )
    return summary
