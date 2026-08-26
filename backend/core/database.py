from typing import AsyncGenerator

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from core.config import settings

engine = create_async_engine(settings.database_url, echo=False, future=True)

AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


def _add_missing_columns(sync_conn) -> None:
    """SQLite's create_all only creates tables that don't exist yet — it
    won't add new columns to a table that's already on disk. This adds
    columns introduced after a table already existed locally (currently just
    Message.prompt_variant_id), so an existing app.db keeps working instead
    of needing to be deleted and recreated."""
    inspector = sa.inspect(sync_conn)
    if "messages" in inspector.get_table_names():
        existing_cols = {c["name"] for c in inspector.get_columns("messages")}
        if "prompt_variant_id" not in existing_cols:
            sync_conn.execute(
                sa.text("ALTER TABLE messages ADD COLUMN prompt_variant_id INTEGER")
            )
    if "users" in inspector.get_table_names():
        existing_cols = {c["name"] for c in inspector.get_columns("users")}
        if "reset_token" not in existing_cols:
            sync_conn.execute(sa.text("ALTER TABLE users ADD COLUMN reset_token VARCHAR(255)"))
        if "reset_token_expires" not in existing_cols:
            sync_conn.execute(sa.text("ALTER TABLE users ADD COLUMN reset_token_expires DATETIME"))


async def init_db() -> None:
    # Import models so they are registered on Base.metadata before create_all
    from models import (  # noqa: F401
        avatar,
        chat_session,
        document_chunk,
        message,
        message_feedback,
        prompt_variant,
        topic_mastery,
        user,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_columns)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
