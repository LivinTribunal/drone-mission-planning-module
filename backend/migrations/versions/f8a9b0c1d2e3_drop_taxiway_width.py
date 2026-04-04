"""drop taxiway_width from airfield_surface

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-04-04 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f8a9b0c1d2e3"
down_revision: Union[str, None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """drop redundant taxiway_width column - width is derived from boundary polygon."""
    op.drop_column("airfield_surface", "taxiway_width")


def downgrade() -> None:
    """restore taxiway_width column."""
    op.add_column(
        "airfield_surface",
        sa.Column("taxiway_width", sa.Float(), nullable=True),
    )
