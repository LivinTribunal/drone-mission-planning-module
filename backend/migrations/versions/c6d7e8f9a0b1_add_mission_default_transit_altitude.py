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
    """add nullable default_transit_altitude column to mission."""
    op.add_column(
        "mission",
        sa.Column("default_transit_altitude", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    """drop default_transit_altitude column from mission."""
    op.drop_column("mission", "default_transit_altitude")
