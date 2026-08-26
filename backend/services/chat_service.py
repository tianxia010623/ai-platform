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
from models.prompt_variant import PromptVariant
from services import bandit_service, mastery_service, rag_service
from services.file_service import build_content_blocks_for_file, extract_full_text


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


async def rename_session(db: AsyncSession, user_id: int, session_id: int, title: str) -> ChatSession | None:
    """Manually rename a session (the "self-name it" feature)."""
    session = await get_session(db, user_id, session_id)
    if session is None:
        return None
    session.title = title.strip()[:60] or session.title
    await db.commit()
    await db.refresh(session)
    return session


def _auto_title_from_text(text: str, max_len: int = 40) -> str:
    """Collapse whitespace and truncate the first user message into a short
    session title, the same way most chat apps auto-name a fresh thread."""
    collapsed = " ".join(text.split())
    if len(collapsed) <= max_len:
        return collapsed
    return collapsed[: max_len - 1].rstrip() + "\u2026"


async def get_messages(db: AsyncSession, session_id: int) -> list[Message]:
    result = await db.execute(
        select(Message).where(Message.session_id == session_id).order_by(Message.created_at.asc())
    )
    return list(result.scalars().all())


async def save_message(
    db: AsyncSession,
    session_id: int,
    role: str,
    content: str,
    attached_files: list[dict] | None = None,
    prompt_variant_id: int | None = None,
) -> Message:
    message = Message(
        session_id=session_id,
        role=role,
        content=content,
        attached_files=attached_files or [],
        prompt_variant_id=prompt_variant_id,
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


def _build_system_prompt(avatar: Avatar, variant: PromptVariant | None) -> str:
    if variant is None or not variant.prompt_modifier:
        return avatar.system_prompt
    return f"{avatar.system_prompt}\n\n{variant.prompt_modifier}"


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
    is_first_message = not history
    api_messages = [
        {"role": m.role, "content": m.content} for m in history if m.content
    ]

    user_content = _build_user_content(user_text, files)
    api_messages.append({"role": "user", "content": user_content})

    stored_user_text = user_text or "(see attached file)"
    await save_message(db, session.id, "user", stored_user_text, attached_files_meta)

    # Auto-name fresh sessions from their first message, the same way most
    # chat apps replace a generic "New Chat" placeholder once there's
    # something real to call it -- otherwise every session in the sidebar
    # (across every avatar) is titled identically and looks like nothing
    # ever changes when you switch avatars. A manual rename (PATCH
    # /sessions/{id}) still overrides this on request.
    if is_first_message and session.title == "New Chat" and stored_user_text.strip():
        session.title = _auto_title_from_text(stored_user_text)
        await db.commit()
        await db.refresh(session)

    # RAG: permanently index any newly uploaded files into this avatar's
    # knowledge base (chunk + embed), so they're retrievable in this turn
    # AND every future conversation with this avatar -- not just this one.
    # This is on top of, not instead of, the full-text-in-this-message
    # behavior above (_build_user_content) so "here's a file, ask about it
    # right now" still works even before anything is indexed.
    relevant_chunks: list = []
    try:
        for path, original_filename in files:
            text = extract_full_text(path, original_filename)
            if text:
                await rag_service.index_file_for_avatar(db, avatar.id, original_filename, text)

        # Retrieve whatever's semantically relevant to this message from the
        # avatar's knowledge base (empty if nothing's been indexed, or
        # nothing clears the relevance bar) and fold it into the system
        # prompt.
        relevant_chunks = await rag_service.retrieve_relevant_chunks(db, avatar.id, user_text)
    except Exception:  # noqa: BLE001
        # RAG is additive context, not core chat functionality -- a bad
        # embedding call (e.g. sentence-transformers not installed yet)
        # should never take down the whole conversation.
        relevant_chunks = []

    # Pick a prompt variant for this avatar via Thompson Sampling, if any are
    # configured. Returns None (falls back to avatar.system_prompt as-is)
    # for avatars nobody has set up variants for yet.
    variant = await bandit_service.select_variant_for_avatar(db, avatar.id)
    system_prompt = _build_system_prompt(avatar, variant)
    if relevant_chunks:
        context_block = "\n\n".join(
            f"[From {c.source_filename}]\n{c.content}" for c in relevant_chunks
        )
        system_prompt = (
            f"{system_prompt}\n\n"
            "Relevant context retrieved from files this user has previously shared "
            f"with you:\n\n{context_block}"
        )

    assistant_text_parts: list[str] = []
    try:
        async with client.messages.stream(
            model=settings.anthropic_model,
            max_tokens=4096,
            system=system_prompt,
            messages=api_messages,
        ) as stream:
            async for text in stream.text_stream:
                assistant_text_parts.append(text)
                yield f"data: {json.dumps({'type': 'delta', 'content': text})}\n\n"
    except Exception as exc:  # noqa: BLE001
        yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
        return

    assistant_text = "".join(assistant_text_parts)
    assistant_message = await save_message(
        db,
        session.id,
        "assistant",
        assistant_text,
        prompt_variant_id=variant.id if variant else None,
    )

    if variant:
        await bandit_service.record_impression(db, variant)

    done_payload = {"type": "message_done", "message_id": assistant_message.id}
    if is_first_message:
        done_payload["session_title"] = session.title
    if variant:
        done_payload["prompt_variant"] = {"id": variant.id, "name": variant.name}
    if relevant_chunks:
        seen = []
        for c in relevant_chunks:
            if c.source_filename not in seen:
                seen.append(c.source_filename)
        done_payload["retrieved_sources"] = seen
    yield f"data: {json.dumps(done_payload)}\n\n"

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
