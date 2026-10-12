"""Deleting avatars and chat sessions together with everything hanging off
them: messages, feedback, RAG chunks, mastery, prompt variants, and the
files those rows point at on disk. Done with explicit bulk deletes so no
row is left orphaned (SQLite doesn't enforce the foreign keys for us)."""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.uploads import delete_quietly, resolve_stored_file
from models.avatar import Avatar
from models.chat_session import ChatSession
from models.document_chunk import DocumentChunk
from models.message import Message
from models.message_feedback import MessageFeedback
from models.prompt_variant import PromptVariant
from models.topic_mastery import TopicMastery
from services import rag_service


def stored_chat_files(messages: list[Message]) -> list[str]:
    names: list[str] = []
    for m in messages:
        for f in m.attached_files or []:
            name = f.get("stored_name") if isinstance(f, dict) else None
            if name:
                names.append(name)
    return names


def delete_chat_files(names: list[str]) -> None:
    for name in names:
        delete_quietly(resolve_stored_file(settings.chat_files_dir, name))


async def _delete_messages(db: AsyncSession, session_ids: list[int]) -> list[str]:
    """Delete the messages (and their feedback) of the given sessions.
    Returns the stored attachment names so the caller can remove the files
    once the transaction has committed."""
    if not session_ids:
        return []
    result = await db.execute(select(Message).where(Message.session_id.in_(session_ids)))
    messages = list(result.scalars().all())
    message_ids = [m.id for m in messages]
    files = stored_chat_files(messages)
    if message_ids:
        await db.execute(delete(MessageFeedback).where(MessageFeedback.message_id.in_(message_ids)))
        await db.execute(delete(Message).where(Message.id.in_(message_ids)))
    return files


async def delete_session(db: AsyncSession, session: ChatSession) -> None:
    files = await _delete_messages(db, [session.id])
    await db.execute(delete(ChatSession).where(ChatSession.id == session.id))
    await db.commit()
    delete_chat_files(files)


async def delete_avatar(db: AsyncSession, avatar: Avatar) -> None:
    avatar_id = avatar.id
    image_path = avatar.image_path

    result = await db.execute(select(ChatSession.id).where(ChatSession.avatar_id == avatar_id))
    session_ids = list(result.scalars().all())
    files = await _delete_messages(db, session_ids)
    if session_ids:
        await db.execute(delete(ChatSession).where(ChatSession.id.in_(session_ids)))
    await db.execute(delete(DocumentChunk).where(DocumentChunk.avatar_id == avatar_id))
    await db.execute(delete(TopicMastery).where(TopicMastery.avatar_id == avatar_id))
    await db.execute(delete(PromptVariant).where(PromptVariant.avatar_id == avatar_id))
    await db.execute(delete(Avatar).where(Avatar.id == avatar_id))
    await db.commit()

    rag_service.invalidate_cache(avatar_id)
    delete_chat_files(files)
    delete_avatar_image(image_path)


def delete_avatar_image(image_path: str | None) -> None:
    """image_path is the public URL path, /api/avatars/image/<stored name>."""
    if not image_path:
        return
    name = image_path.rsplit("/", 1)[-1]
    delete_quietly(resolve_stored_file(settings.avatar_dir, name))
