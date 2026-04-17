"""add require_perpendicular_runway_crossing to mission

Adds a mission-level toggle that lets the trajectory planner pick the
shortest geodesic runway crossing instead of the perpendicular crossing,
shrinking the runway-closure window.

Revision ID: f1a2b3c4d5e6
Revises: e9f0a1b2c3d4
Create Date: 2026-04-14 16:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e9f0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add require_perpendicular_runway_crossing column."""
    op.add_column(
        "mission",
        sa.Column(
            "require_perpendicular_runway_crossing",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    """drop require_perpendicular_runway_crossing column."""
    op.drop_column("mission", "require_perpendicular_runway_crossing")
