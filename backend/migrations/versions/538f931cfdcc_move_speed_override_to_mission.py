"""move speed_override to mission

Revision ID: 538f931cfdcc
Revises: f0a1b2c3d4e5
Create Date: 2026-04-14 00:00:01.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "538f931cfdcc"
down_revision: Union[str, None] = "f0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """drop speed_override from config, add measurement_speed_override to mission."""
    op.drop_column("inspection_configuration", "speed_override")
    op.add_column(
        "mission",
        sa.Column("measurement_speed_override", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    """reverse: drop from mission, restore on config."""
    op.drop_column("mission", "measurement_speed_override")
    op.add_column(
        "inspection_configuration",
        sa.Column("speed_override", sa.Float(), nullable=True),
    )
