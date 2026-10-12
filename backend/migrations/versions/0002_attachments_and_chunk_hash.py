"""Persist attachment text on messages; hash indexed RAG sources.

Revision ID: 0002_attachments_and_chunk_hash
Revises: 0001_baseline
Create Date: 2026-10-12
"""
import sqlalchemy as sa
from alembic import op

revision = "0002_attachments_and_chunk_hash"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "attachment_context" not in _columns("messages"):
        with op.batch_alter_table("messages") as batch:
            batch.add_column(sa.Column("attachment_context", sa.Text(), nullable=True))
    if "source_hash" not in _columns("document_chunks"):
        with op.batch_alter_table("document_chunks") as batch:
            batch.add_column(sa.Column("source_hash", sa.String(64), nullable=True))
            batch.create_index("ix_document_chunks_source_hash", ["source_hash"])


def downgrade() -> None:
    with op.batch_alter_table("document_chunks") as batch:
        batch.drop_index("ix_document_chunks_source_hash")
        batch.drop_column("source_hash")
    with op.batch_alter_table("messages") as batch:
        batch.drop_column("attachment_context")
