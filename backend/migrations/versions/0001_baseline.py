"""Baseline schema.

Fresh databases get every table here. Databases created before Alembic was
introduced are stamped at this revision instead (see core/migrations.py),
after the old ad-hoc ALTER TABLE fix-ups have brought them up to the same
shape, so later revisions apply to both kinds of database identically.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-12
"""
from alembic import op

from core.database import Base
import models  # noqa: F401

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Later revisions only ever add to this, and each one checks whether its
    # change already exists, so creating from the current metadata is safe.
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
