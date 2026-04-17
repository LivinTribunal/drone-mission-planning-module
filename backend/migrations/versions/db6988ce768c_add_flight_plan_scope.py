"""add flight_plan_scope to mission

Revision ID: db6988ce768c
Revises: b435c08f47f1
Create Date: 2026-04-17 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "db6988ce768c"
down_revision: Union[str, None] = "b435c08f47f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add flight_plan_scope column with check constraint."""
    op.add_column(
        "mission",
        sa.Column(
            "flight_plan_scope",
            sa.String(25),
            nullable=False,
            server_default="FULL",
        ),
    )
    op.create_check_constraint(
        "ck_mission_flight_plan_scope",
        "mission",
        "flight_plan_scope IN ('FULL', 'NO_TAKEOFF_LANDING', 'MEASUREMENTS_ONLY')",
    )


def downgrade() -> None:
    """remove flight_plan_scope column."""
    op.drop_constraint("ck_mission_flight_plan_scope", "mission", type_="check")
    op.drop_column("mission", "flight_plan_scope")
