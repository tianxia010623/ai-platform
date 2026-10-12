import asyncio
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncGenerator, Coroutine

import anthropic
from anthropic import AsyncAnthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import AsyncSessionLocal
from core.uploads import resolve_stored_file
from models.avatar import Avatar
from models.chat_session import ChatSession
from models.message import Message
from models.prompt_variant import PromptVariant
from services import bandit_service, mastery_service, rag_service
from services.file_service import attachment_text, extract_full_text, image_block

log = logging.getLogger(__name__)

DEFAULT_TITLE = "New Chat"
# Images are re-sent as real images only for the most recent turns that had
# any; older ones become a one-line placeholder so a long chat with many
# screenshots doesn't resend all of them on every turn.
RECENT_IMAGE_TURNS = 2
# Rough character-equivalent cost of one image when budgeting history.
IMAGE_CHAR_COST = 6000

# Models that support server-side refusal fallbacks in the "default" form.
FALLBACK_MODELS = {"claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"}
FALLBACK_BETA = "server-side-fallback-2026-07-01"

# Strong references to fire-and-forget tasks so they aren't garbage collected
# mid-flight.
_background_tasks: set[asyncio.Task] = set()


def _spawn(coro: Coroutine) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


@dataclass
class SavedUpload:
    path: Path
    original_filename: str
    stored_name: str
    kind: str  # "image" | "pdf" | "text"


# ---------- sessions & messages ----------
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
    return collapsed[: max_len - 1].rstrip() + "…"


async def get_messages(db: AsyncSession, session_id: int) -> list[Message]:
    result = await db.execute(
        select(Message).where(Message.session_id == session_id).order_by(Message.created_at.asc(), Message.id.asc())
    )
    return list(result.scalars().all())


async def save_message(
    db: AsyncSession,
    session_id: int,
    role: str,
    content: str,
    attached_files: list[dict] | None = None,
    prompt_variant_id: int | None = None,
    attachment_context: str | None = None,
) -> Message:
    message = Message(
        session_id=session_id,
        role=role,
        content=content,
        attached_files=attached_files or [],
        prompt_variant_id=prompt_variant_id,
        attachment_context=attachment_context,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


# ---------- request building ----------
def _has_image(m: Message) -> bool:
    return any(isinstance(f, dict) and f.get("kind") == "image" for f in m.attached_files or [])


def _user_blocks(m: Message, include_images: bool) -> list[dict]:
    blocks: list[dict] = []
    for f in m.attached_files or []:
        if not isinstance(f, dict) or f.get("kind") != "image":
            continue
        block = None
        if include_images:
            path = resolve_stored_file(settings.chat_files_dir, f.get("stored_name") or "")
            if path is not None and path.is_file():
                block = image_block(path)
        blocks.append(block or {"type": "text", "text": f"[Image shared earlier: {f.get('filename')}]"})
    if m.attachment_context:
        blocks.append({"type": "text", "text": m.attachment_context})
    blocks.append({"type": "text", "text": m.content or "(see attached file)"})
    return blocks


def _block_cost(block: dict) -> int:
    return IMAGE_CHAR_COST if block["type"] == "image" else len(block.get("text", ""))


def build_api_messages(history: list[Message], max_chars: int) -> list[dict]:
    """Turn stored messages into API messages, keeping attachments, and drop
    the oldest turns once the history exceeds max_chars."""
    image_turns: set[int] = set()
    for m in reversed(history):
        if m.role == "user" and _has_image(m):
            image_turns.add(m.id)
            if len(image_turns) >= RECENT_IMAGE_TURNS:
                break

    entries: list[tuple[dict, int]] = []
    for m in history:
        if m.role == "assistant":
            if not (m.content or "").strip():
                continue
            entries.append(({"role": "assistant", "content": [{"type": "text", "text": m.content}]}, len(m.content)))
        else:
            blocks = _user_blocks(m, m.id in image_turns)
            entries.append(({"role": "user", "content": blocks}, sum(_block_cost(b) for b in blocks)))

    total = sum(cost for _, cost in entries)
    while len(entries) > 1 and total > max_chars:
        total -= entries.pop(0)[1]
    # The conversation must open with a user turn.
    while entries and entries[0][0]["role"] != "user":
        entries.pop(0)
    return [msg for msg, _ in entries]


def _add_retrieved_context(api_messages: list[dict], chunks: list) -> None:
    """Put retrieved passages in the latest user turn (not the system prompt)
    so the system prompt and earlier history stay byte-identical across
    turns and keep hitting the prompt cache."""
    if not chunks or not api_messages:
        return
    context = "\n\n".join(f"[From {c.source_filename}]\n{c.content}" for c in chunks)
    api_messages[-1]["content"].insert(
        len(api_messages[-1]["content"]) - 1,
        {
            "type": "text",
            "text": "Relevant passages from files this user previously shared with you:\n\n" + context,
        },
    )


def _mark_cache_breakpoint(api_messages: list[dict]) -> None:
    """Cache everything up to the end of the previous turn; only the newest
    user turn is new each time."""
    if len(api_messages) >= 2:
        api_messages[-2]["content"][-1]["cache_control"] = {"type": "ephemeral"}


def _build_system_prompt(avatar: Avatar, variant: PromptVariant | None) -> str:
    if variant is None or not variant.prompt_modifier:
        return avatar.system_prompt
    return f"{avatar.system_prompt}\n\n{variant.prompt_modifier}"


def friendly_error(exc: BaseException) -> str:
    if isinstance(exc, anthropic.AuthenticationError):
        return "The AI service rejected the API key. Check ANTHROPIC_API_KEY in backend/.env."
    if isinstance(exc, anthropic.PermissionDeniedError):
        return "This API key isn't allowed to use the configured model."
    if isinstance(exc, anthropic.NotFoundError):
        return f"The configured model ({settings.anthropic_model}) wasn't found. Check ANTHROPIC_MODEL in backend/.env."
    if isinstance(exc, anthropic.RateLimitError):
        return "The AI service is handling too many requests right now. Please wait a moment and try again."
    if isinstance(exc, anthropic.BadRequestError):
        if "credit balance" in str(exc).lower():
            return "The Anthropic account is out of credits. Add credits in the Anthropic Console, then try again."
        return "The request couldn't be processed. The conversation or an attachment may be too large."
    if isinstance(exc, anthropic.APIStatusError):
        if exc.status_code == 529 or exc.status_code >= 500:
            return "The AI service is temporarily overloaded. Please try again in a moment."
        return f"The AI service returned an error ({exc.status_code}). Please try again."
    if isinstance(exc, anthropic.APIConnectionError):
        return "Couldn't reach the AI service. Check your internet connection and try again."
    return "Something went wrong while generating a reply. Please try again."


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


async def _save_partial_reply(session_id: int, text: str, variant_id: int | None) -> None:
    async with AsyncSessionLocal() as db:
        await save_message(db, session_id, "assistant", text, prompt_variant_id=variant_id)


async def _run_mastery(client: AsyncAnthropic, user_id: int, avatar_id: int, topics: list[str], user_text: str, assistant_text: str) -> None:
    try:
        async with AsyncSessionLocal() as db:
            await mastery_service.analyze_and_update_mastery(
                db=db,
                client=client,
                user_id=user_id,
                avatar_id=avatar_id,
                candidate_topics=topics,
                user_message=user_text,
                assistant_message=assistant_text,
            )
    except Exception:  # noqa: BLE001
        log.exception("Background mastery update failed")


# ---------- the chat turn ----------
async def stream_chat_response(
    client: AsyncAnthropic,
    session_id: int,
    avatar_id: int,
    user_text: str,
    uploads: list[SavedUpload],
    regenerate: bool = False,
) -> AsyncGenerator[str, None]:
    """Run one chat turn as an SSE stream.

    Opens its own database session: a StreamingResponse body runs after the
    endpoint has returned, by which point the request-scoped session from
    get_db has already been closed and its objects detached."""
    async with AsyncSessionLocal() as db:
        session = await db.get(ChatSession, session_id)
        avatar = await db.get(Avatar, avatar_id)
        if session is None or avatar is None:
            yield _sse({"type": "error", "message": "This conversation no longer exists."})
            return
        turn = _stream_turn(db, client, session, avatar, user_text, uploads, regenerate)
        try:
            async for chunk in turn:
                yield chunk
        finally:
            await turn.aclose()


async def _stream_turn(
    db: AsyncSession,
    client: AsyncAnthropic,
    session: ChatSession,
    avatar: Avatar,
    user_text: str,
    uploads: list[SavedUpload],
    regenerate: bool,
) -> AsyncGenerator[str, None]:
    """Persist the user message (or, when regenerating, drop the last reply),
    stream Claude's reply, persist it, then grade topic mastery in the
    background."""

    history = await get_messages(db, session.id)
    is_first_message = False

    if regenerate:
        if history and history[-1].role == "assistant":
            await db.delete(history.pop())
            await db.commit()
        if not history or history[-1].role != "user":
            yield _sse({"type": "error", "message": "There's no message to reply to."})
            return
        user_message = history[-1]
    else:
        is_first_message = not history
        attached_meta: list[dict] = []
        context_parts: list[str] = []
        for u in uploads:
            attached_meta.append({"filename": u.original_filename, "stored_name": u.stored_name, "kind": u.kind})
            if u.kind != "image":
                text = await asyncio.to_thread(attachment_text, u.path, u.original_filename)
                if text:
                    context_parts.append(text)
        user_message = await save_message(
            db,
            session.id,
            "user",
            user_text or "(see attached file)",
            attached_meta,
            attachment_context="\n\n".join(context_parts) or None,
        )
        history.append(user_message)

        if is_first_message and session.title == DEFAULT_TITLE and user_text.strip():
            session.title = _auto_title_from_text(user_text)
            await db.commit()
            await db.refresh(session)

    yield _sse({"type": "user_saved", "message_id": user_message.id})

    # RAG: index newly uploaded files into this avatar's permanent knowledge
    # base, then retrieve whatever is relevant to this message.
    notices: list[str] = []
    for u in uploads:
        if u.kind == "image":
            continue
        text = await asyncio.to_thread(extract_full_text, u.path, u.original_filename)
        if not text:
            continue
        try:
            await rag_service.index_file_for_avatar(db, avatar.id, u.original_filename, text)
        except Exception as exc:  # noqa: BLE001
            log.warning("Indexing %s failed: %s", u.original_filename, exc)
            notices.append(
                f"“{u.original_filename}” was used for this reply, but couldn't be saved to "
                f"{avatar.name}'s long-term memory (the file-search model isn't available yet)."
            )
    relevant_chunks: list = []
    try:
        relevant_chunks = await rag_service.retrieve_relevant_chunks(db, avatar.id, user_message.content)
    except Exception as exc:  # noqa: BLE001
        log.warning("Retrieval failed: %s", exc)
    for notice in notices:
        yield _sse({"type": "notice", "message": notice})

    # Pick a prompt variant via Thompson Sampling, if any are configured.
    variant = await bandit_service.select_variant_for_avatar(db, avatar.id)
    variant_id = variant.id if variant else None
    system_blocks = [
        {"type": "text", "text": _build_system_prompt(avatar, variant), "cache_control": {"type": "ephemeral"}}
    ]

    api_messages = await asyncio.to_thread(build_api_messages, history, settings.max_history_chars)
    _add_retrieved_context(api_messages, relevant_chunks)
    _mark_cache_breakpoint(api_messages)

    request = dict(
        model=settings.anthropic_model,
        max_tokens=settings.chat_max_tokens,
        system=system_blocks,
        messages=api_messages,
    )
    extra_body: dict = {"output_config": {"effort": settings.chat_effort}}

    parts: list[str] = []
    stop_reason = None
    try:
        if settings.anthropic_model in FALLBACK_MODELS:
            extra_body["fallbacks"] = "default"
            stream_cm = client.beta.messages.stream(**request, betas=[FALLBACK_BETA], extra_body=extra_body)
        else:
            stream_cm = client.messages.stream(**request, extra_body=extra_body)
        async with stream_cm as stream:
            async for text in stream.text_stream:
                parts.append(text)
                yield _sse({"type": "delta", "content": text})
            final = await stream.get_final_message()
            stop_reason = getattr(final, "stop_reason", None)
    except (asyncio.CancelledError, GeneratorExit):
        # The user pressed stop (or closed the tab): keep what was written.
        partial = "".join(parts)
        if partial.strip():
            try:
                _spawn(_save_partial_reply(session.id, partial, variant_id))
            except RuntimeError:
                log.warning("Could not save partial reply: event loop unavailable")
        raise
    except Exception as exc:  # noqa: BLE001
        log.warning("Chat stream failed: %r", exc)
        partial = "".join(parts)
        if partial.strip():
            await save_message(db, session.id, "assistant", partial, prompt_variant_id=variant_id)
        yield _sse({"type": "error", "message": friendly_error(exc)})
        return

    assistant_text = "".join(parts)
    if stop_reason == "refusal" and not assistant_text.strip():
        yield _sse({"type": "error", "message": f"{avatar.name} declined to answer that. Try rephrasing your message."})
        return

    assistant_message = await save_message(
        db, session.id, "assistant", assistant_text, prompt_variant_id=variant_id
    )
    if variant:
        await bandit_service.record_impression(db, variant)

    done_payload: dict = {"type": "message_done", "message_id": assistant_message.id}
    if stop_reason == "max_tokens":
        done_payload["truncated"] = True
    if is_first_message:
        done_payload["session_title"] = session.title
    if variant:
        done_payload["prompt_variant"] = {"id": variant.id, "name": variant.name}
    if relevant_chunks:
        done_payload["retrieved_sources"] = list(dict.fromkeys(c.source_filename for c in relevant_chunks))
    yield _sse(done_payload)

    # Knowledge tracking runs after the reply is delivered, so the user can
    # keep chatting while it's graded.
    if avatar.topic_tags:
        _spawn(
            _run_mastery(
                client, session.user_id, session.avatar_id, list(avatar.topic_tags), user_message.content, assistant_text
            )
        )

    yield _sse({"type": "done"})
