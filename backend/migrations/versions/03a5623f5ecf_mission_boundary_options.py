"""add boundary_constraint_mode and boundary_preference to mission

Mission-level hard constraint and soft preference for airport-boundary
awareness in A* pathfinding.

Revision ID: 03a5623f5ecf
Revises: 37694cd9990d
Create Date: 2026-04-22 10:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "03a5623f5ecf"
down_revision: Union[str, Sequence[str], None] = "37694cd9990d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add boundary_constraint_mode and boundary_preference columns."""
    op.add_column(
        "mission",
        sa.Column(
            "boundary_constraint_mode",
            sa.String(length=10),
            nullable=False,
            server_default=sa.text("'NONE'"),
        ),
    )
    op.add_column(
        "mission",
        sa.Column(
            "boundary_preference",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'DONT_CARE'"),
        ),
    )
    op.create_check_constraint(
        "ck_mission_boundary_constraint_mode",
        "mission",
        "boundary_constraint_mode IN ('INSIDE', 'OUTSIDE', 'NONE')",
    )
    op.create_check_constraint(
        "ck_mission_boundary_preference",
        "mission",
        "boundary_preference IN ('PREFER_INSIDE', 'PREFER_OUTSIDE', 'DONT_CARE')",
    )


def downgrade() -> None:
    """drop boundary_constraint_mode and boundary_preference columns."""
    op.drop_constraint("ck_mission_boundary_preference", "mission", type_="check")
    op.drop_constraint("ck_mission_boundary_constraint_mode", "mission", type_="check")
    op.drop_column("mission", "boundary_preference")
    op.drop_column("mission", "boundary_constraint_mode")
