"""add camera_mode columns to mission and inspection_configuration

Revision ID: 4f1a8d2c6b09
Revises: 1c9c3e48be5a
Create Date: 2026-04-21 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4f1a8d2c6b09"
down_revision: str | None = "1c9c3e48be5a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """add camera_mode columns."""
    op.add_column(
        "mission",
        sa.Column(
            "camera_mode",
            sa.String(length=10),
            nullable=False,
            server_default="AUTO",
        ),
    )
    op.add_column(
        "inspection_configuration",
        sa.Column(
            "camera_mode",
            sa.String(length=10),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """drop camera_mode columns."""
    op.drop_column("inspection_configuration", "camera_mode")
    op.drop_column("mission", "camera_mode")
