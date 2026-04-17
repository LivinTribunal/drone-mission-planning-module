"""move speed_override from inspection_configuration to mission

removes per-inspection speed_override (transit speed now comes only from
mission.default_speed). adds mission.measurement_speed_override as a
mission-level default for measurement waypoint speed.

Revision ID: 538f931cfdcc
Revises: f0a1b2c3d4e5
Create Date: 2026-04-17 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "538f931cfdcc"
down_revision: Union[str, Sequence[str], None] = "f0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """drop inspection speed_override, add mission measurement_speed_override."""
    op.drop_column("inspection_configuration", "speed_override")
    op.add_column(
        "mission",
        sa.Column("measurement_speed_override", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    """restore inspection speed_override, drop mission measurement_speed_override."""
    op.drop_column("mission", "measurement_speed_override")
    op.add_column(
        "inspection_configuration",
        sa.Column("speed_override", sa.Float(), nullable=True),
    )
