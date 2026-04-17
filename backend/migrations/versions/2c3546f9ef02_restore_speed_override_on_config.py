"""restore speed_override on inspection_configuration

the prior migrations moved speed_override off inspection_configuration and
added measurement_speed_override to mission, but the codebase still references
speed_override on inspection_configuration everywhere. this migration restores
the original column and drops the orphan columns.

Revision ID: 2c3546f9ef02
Revises: 538f931cfdcc
Create Date: 2026-04-17 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "2c3546f9ef02"
down_revision: Union[str, None] = "538f931cfdcc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """restore speed_override, drop orphan measurement_speed_override columns."""
    op.add_column(
        "inspection_configuration",
        sa.Column("speed_override", sa.Float(), nullable=True),
    )
    op.drop_column("inspection_configuration", "measurement_speed_override")
    op.drop_column("mission", "measurement_speed_override")


def downgrade() -> None:
    """reverse: remove speed_override, restore measurement_speed_override."""
    op.add_column(
        "mission",
        sa.Column("measurement_speed_override", sa.Float(), nullable=True),
    )
    op.add_column(
        "inspection_configuration",
        sa.Column("measurement_speed_override", sa.Float(), nullable=True),
    )
    op.drop_column("inspection_configuration", "speed_override")
