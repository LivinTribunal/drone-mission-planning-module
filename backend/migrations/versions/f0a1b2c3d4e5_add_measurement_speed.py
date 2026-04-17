"""add measurement_speed_override to inspection_configuration

adds a distinct measurement speed that governs only measurement waypoints
(vertical-profile, fly-over, parallel-side-sweep). speed_override keeps
governing transit segments.

Revision ID: f0a1b2c3d4e5
Revises: e9f0a1b2c3d4
Create Date: 2026-04-14 17:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f0a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "e9f0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add measurement_speed_override column."""
    op.add_column(
        "inspection_configuration",
        sa.Column("measurement_speed_override", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    """drop measurement_speed_override column."""
    op.drop_column("inspection_configuration", "measurement_speed_override")
