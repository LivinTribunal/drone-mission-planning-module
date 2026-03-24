"""add has_unsaved_map_changes to mission

Revision ID: a7b8c9d0e1f2
Revises: e6f7a8b9c0d1
Create Date: 2026-03-24 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add has_unsaved_map_changes boolean column to mission table."""
    op.add_column(
        "mission",
        sa.Column(
            "has_unsaved_map_changes",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    """remove has_unsaved_map_changes column from mission table."""
    op.drop_column("mission", "has_unsaved_map_changes")
