import json
from pathlib import Path
from typing import AsyncGenerator

from anthropic import AsyncAnthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.avatar import Avatar
from models.chat_session import ChatSession
from models.message import Message
from services import mastery_service
from services.file_service import build_content_blocks_for_file


async def create_session(db: AsyncSession, user_id: int, avatar_id: int, title: str) -> ChatSession:
    session = ChatSession(user_id=user_id, avatar_id=avatar_id, title=title)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def list_sessions(db: AsyncSession, user_id: int, avatar_id: int | None = None) -> list[ChatSession]:
    stmt = select(ChatSession).where(ChatSession.user_id == user_id)
    if avatar_id is not None:
        stmt = stmt.where(ChatSession.avatar_id == avatar_id)
    stmt = stmt.order_by(ChatSession.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_session(db: AsyncSession, user_id: int, session_id: int) -> ChatSession | None:
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_messages(db: AsyncSession, session_id: int) -> list[Message]:
    result = await db.execute(
        select(Message).where(Message.session_id == session_id).order_by(Message.created_at.asc())
    )
    return list(result.scalars().all())


async def save_message(
    db: AsyncSession, session_id: int, role: str, content: str, attached_files: list[dict] | None = None
) -> Message:
    message = Message(
        session_id=session_id, role=role, content=content, attached_files=attached_files or []
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


def _build_user_content(user_text: str, files: list[tuple[Path, str]]) -> list[dict] | str:
    if not files:
        return user_text

    blocks: list[dict] = []
    for path, original_filename in files:
        blocks.extend(build_content_blocks_for_file(path, original_filename))
    blocks.append({"type": "text", "text": user_text or "(see attached file)"})
    return blocks


async def stream_chat_response(
    db: AsyncSession,
    client: AsyncAnthropic,
    session: ChatSession,
    avatar: Avatar,
    user_text: str,
    files: list[tuple[Path, str]],
    attached_files_meta: list[dict],
) -> AsyncGenerator[str, None]:
    """Persist the user message, stream Claude's reply as SSE, persist the
    assistant message, then run knowledge tracking. Yields SSE-formatted strings."""

    history = await get_messages(db, session.id)
    api_messages = [{"role": m.role, "content": m.content} for m in history]

    user_content = _build_user_content(user_text, files)
    api_messages.append({"role": "user", "content": user_content})

    await save_message(db, session.id, "user", user_text, attached_files_meta)

    assistant_text_parts: list[str] = []
    try:
        async with client.messages.stream(
            model=settings.anthropic_model,
            max_tokens=4096,
            system=avatar.system_prompt,
            messages=api_messages,
        ) as stream:
            async for text in stream.text_stream:
                assistant_text_parts.append(text)
                yield f"data: {json.dumps({'type': 'delta', 'content': text})}\n\n"
    except Exception as exc:  # noqa: BLE001
        yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
        return

    assistant_text = "".join(assistant_text_parts)
    assistant_message = await save_message(db, session.id, "assistant", assistant_text)

    yield f"data: {json.dumps({'type': 'message_done', 'message_id': assistant_message.id})}\n\n"

    # Knowledge tracking: analyze this exchange and update TopicMastery
    try:
        updated = await mastery_service.analyze_and_update_mastery(
            db=db,
            client=client,
            user_id=session.user_id,
            avatar_id=session.avatar_id,
            candidate_topics=avatar.topic_tags,
            user_message=user_text,
            assistant_message=assistant_text,
        )
        if updated:
            payload = [
                {
                    "topic": t.topic,
                    "mastery_score": t.mastery_score,
                    "interaction_count": t.interaction_count,
                }
                for t in updated
            ]
            yield f"data: {json.dumps({'type': 'mastery_update', 'topics': payload})}\n\n"
    except Exception:  # noqa: BLE001
        pass

    yield "data: {\"type\": \"done\"}\n\n"
