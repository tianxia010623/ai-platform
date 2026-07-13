import json

from anthropic import AsyncAnthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.topic_mastery import TopicMastery

EMA_ALPHA = 0.3

MASTERY_SCHEMA = {
    "type": "object",
    "properties": {
        "topics": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": "One of the candidate topic tags this exchange touched on",
                    },
                    "mastery_score": {
                        "type": "number",
                        "description": "Estimated user understanding of this topic in THIS exchange, from 0 (no grasp) to 1 (full mastery)",
                    },
                    "summary": {
                        "type": "string",
                        "description": "One short sentence on what was discussed/demonstrated for this topic",
                    },
                },
                "required": ["topic", "mastery_score", "summary"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["topics"],
    "additionalProperties": False,
}


async def analyze_and_update_mastery(
    db: AsyncSession,
    client: AsyncAnthropic,
    user_id: int,
    avatar_id: int,
    candidate_topics: list[str],
    user_message: str,
    assistant_message: str,
) -> list[TopicMastery]:
    """Ask Claude to grade the topic mastery demonstrated in one exchange, then
    fold the result into TopicMastery via an exponential moving average."""
    if not candidate_topics:
        return []

    analysis_prompt = (
        "Analyze the following single exchange between a user and an AI tutor persona. "
        f"Candidate topic tags for this persona are: {', '.join(candidate_topics)}.\n\n"
        "Identify which of these candidate topics (only from the given list, verbatim) were "
        "actually touched on in this exchange, and estimate how well the USER demonstrated "
        "understanding of each (not the assistant). If a topic wasn't discussed, omit it.\n\n"
        f"User: {user_message}\n\nAssistant: {assistant_message}"
    )

    try:
        response = await client.messages.create(
            model=settings.anthropic_model,
            max_tokens=1024,
            output_config={"format": {"type": "json_schema", "schema": MASTERY_SCHEMA}},
            messages=[{"role": "user", "content": analysis_prompt}],
        )
        text = next((b.text for b in response.content if b.type == "text"), "{}")
        parsed = json.loads(text)
    except Exception as exc:  # noqa: BLE001
        print(f"[mastery_service] analyze_and_update_mastery failed: {exc}")
        return []

    updated: list[TopicMastery] = []
    for entry in parsed.get("topics", []):
        topic = entry.get("topic")
        score = entry.get("mastery_score")
        summary = entry.get("summary", "")
        if topic not in candidate_topics or not isinstance(score, (int, float)):
            continue
        score = max(0.0, min(1.0, float(score)))

        result = await db.execute(
            select(TopicMastery).where(
                TopicMastery.user_id == user_id,
                TopicMastery.avatar_id == avatar_id,
                TopicMastery.topic == topic,
            )
        )
        record = result.scalar_one_or_none()
        if record is None:
            record = TopicMastery(
                user_id=user_id,
                avatar_id=avatar_id,
                topic=topic,
                mastery_score=score,
                interaction_count=1,
                last_topics_summary=summary,
            )
            db.add(record)
        else:
            record.mastery_score = EMA_ALPHA * score + (1 - EMA_ALPHA) * record.mastery_score
            record.interaction_count += 1
            record.last_topics_summary = summary

        updated.append(record)

    if updated:
        await db.commit()
        for record in updated:
            await db.refresh(record)

    return updated


async def get_mastery_for_avatar(db: AsyncSession, user_id: int, avatar_id: int) -> list[TopicMastery]:
    result = await db.execute(
        select(TopicMastery)
        .where(TopicMastery.user_id == user_id, TopicMastery.avatar_id == avatar_id)
        .order_by(TopicMastery.mastery_score.desc())
    )
    return list(result.scalars().all())


async def get_all_mastery(db: AsyncSession, user_id: int) -> list[TopicMastery]:
    result = await db.execute(
        select(TopicMastery).where(TopicMastery.user_id == user_id).order_by(TopicMastery.updated_at.desc())
    )
    return list(result.scalars().all())
