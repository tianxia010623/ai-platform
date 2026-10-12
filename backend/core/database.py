import asyncio
from pathlib import Path
from typing import AsyncGenerator

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from core.config import BASE_DIR, settings

engine = create_async_engine(settings.database_url, echo=False, future=True)

AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)

BASELINE_REVISION = "0001_baseline"


class Base(DeclarativeBase):
    pass


def sync_database_url() -> str:
    """Alembic runs migrations synchronously; same database, sync driver."""
    return settings.database_url.replace("+aiosqlite", "")


def _legacy_add_missing_columns(conn) -> None:
    """Columns that pre-Alembic versions of the app added with ad-hoc ALTER
    TABLEs at startup. Applied once to such databases so they match the
    baseline revision before being stamped."""
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    if "messages" in tables:
        cols = {c["name"] for c in inspector.get_columns("messages")}
        if "prompt_variant_id" not in cols:
            conn.execute(sa.text("ALTER TABLE messages ADD COLUMN prompt_variant_id INTEGER"))
    if "users" in tables:
        cols = {c["name"] for c in inspector.get_columns("users")}
        if "reset_token" not in cols:
            conn.execute(sa.text("ALTER TABLE users ADD COLUMN reset_token VARCHAR(255)"))
        if "reset_token_expires" not in cols:
            conn.execute(sa.text("ALTER TABLE users ADD COLUMN reset_token_expires DATETIME"))


def run_migrations() -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BASE_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(BASE_DIR) / "migrations"))
    cfg.set_main_option("sqlalchemy.url", sync_database_url())

    sync_engine = sa.create_engine(sync_database_url())
    try:
        with sync_engine.begin() as conn:
            tables = sa.inspect(conn).get_table_names()
            pre_alembic = "users" in tables and "alembic_version" not in tables
            if pre_alembic:
                _legacy_add_missing_columns(conn)
    finally:
        sync_engine.dispose()

    if pre_alembic:
        command.stamp(cfg, BASELINE_REVISION)
    command.upgrade(cfg, "head")


async def init_db() -> None:
    await asyncio.to_thread(run_migrations)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
