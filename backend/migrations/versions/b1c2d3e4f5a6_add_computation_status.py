"""add computation_status columns to mission

Revision ID: b1c2d3e4f5a6
Revises: 909c64f14df1
Create Date: 2026-04-19 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "909c64f14df1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add computation_status, computation_error, computation_started_at to mission."""
    # NOT NULL + server_default takes ACCESS EXCLUSIVE lock for table rewrite - schedule during maintenance
    op.add_column(
        "mission",
        sa.Column(
            "computation_status",
            sa.String(20),
            nullable=False,
            server_default="IDLE",
        ),
    )
    op.add_column(
        "mission",
        sa.Column("computation_error", sa.String(), nullable=True),
    )
    op.add_column(
        "mission",
        sa.Column(
            "computation_started_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_check_constraint(
        "ck_mission_computation_status",
        "mission",
        "computation_status IN ('IDLE', 'COMPUTING', 'COMPLETED', 'FAILED')",
    )


def downgrade() -> None:
    """remove computation status columns from mission."""
    op.drop_constraint("ck_mission_computation_status", "mission", type_="check")
    op.drop_column("mission", "computation_started_at")
    op.drop_column("mission", "computation_error")
    op.drop_column("mission", "computation_status")
