"""add mission default transit altitude

Revision ID: c6d7e8f9a0b1
Revises: b4c5d6e7f8a9, b5c6d7e8f9a0
Create Date: 2026-04-09 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c6d7e8f9a0b1"
down_revision: Union[str, Sequence[str], None] = ("b4c5d6e7f8a9", "b5c6d7e8f9a0")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """no-op - transit_agl column already exists via eec7d1c63489."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'mission' AND column_name = 'transit_agl'"
        )
    )
    if result.fetchone() is not None:
        return

    op.add_column(
        "mission",
        sa.Column("transit_agl", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    """drop transit_agl column from mission if it exists."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'mission' AND column_name = 'transit_agl'"
        )
    )
    if result.fetchone() is None:
        return
    op.drop_column("mission", "transit_agl")
