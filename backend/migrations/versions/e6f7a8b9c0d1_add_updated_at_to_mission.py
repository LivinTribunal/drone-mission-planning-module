"""add updated_at to mission

tracks when the mission was last modified.

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-03-20 18:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add updated_at column to mission table."""
    # onupdate=func.now() on the ORM model is orm-only - not a db trigger.
    # acceptable since all writes go through the ORM layer.
    op.add_column(
        "mission",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # backfill existing rows - semantically correct to match created_at
    op.execute("UPDATE mission SET updated_at = created_at")


def downgrade() -> None:
    """remove updated_at column from mission table."""
    op.drop_column("mission", "updated_at")
