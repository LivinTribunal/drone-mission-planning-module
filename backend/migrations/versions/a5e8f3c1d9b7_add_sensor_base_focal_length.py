"""add sensor_base_focal_length to drone_profile

merges the c7e9a1d3b5f4 (camera preset default unique) and e1d2c3b4a5f6
(merge heads + horizontal_range rename) heads, and adds the new
drone_profile.sensor_base_focal_length column used by the kmz/wpml export
to translate optical_zoom factors into dji wpml focalLength values.

Revision ID: a5e8f3c1d9b7
Revises: c7e9a1d3b5f4, e1d2c3b4a5f6
Create Date: 2026-04-21 14:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a5e8f3c1d9b7"
down_revision: Union[str, Sequence[str], None] = ("c7e9a1d3b5f4", "e1d2c3b4a5f6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add sensor_base_focal_length column to drone_profile."""
    op.add_column(
        "drone_profile",
        sa.Column("sensor_base_focal_length", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    """remove sensor_base_focal_length from drone_profile."""
    op.drop_column("drone_profile", "sensor_base_focal_length")
