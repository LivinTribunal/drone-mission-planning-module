"""add camera settings to inspection configuration

Revision ID: c1d2e3f4a5b6
Revises: aaecedb1675e
Create Date: 2026-04-19 00:00:00.000000

"""

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "aaecedb1675e"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    """add six nullable camera settings columns."""
    op.add_column(
        "inspection_configuration",
        sa.Column("white_balance", sa.String(20), nullable=True),
    )
    op.add_column(
        "inspection_configuration",
        sa.Column("iso", sa.Integer(), nullable=True),
    )
    op.add_column(
        "inspection_configuration",
        sa.Column("shutter_speed", sa.String(20), nullable=True),
    )
    op.add_column(
        "inspection_configuration",
        sa.Column("focus_mode", sa.String(20), nullable=True),
    )
    op.add_column(
        "inspection_configuration",
        sa.Column("focus_distance_m", sa.Float(), nullable=True),
    )
    op.add_column(
        "inspection_configuration",
        sa.Column("optical_zoom", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    """remove camera settings columns."""
    op.drop_column("inspection_configuration", "optical_zoom")
    op.drop_column("inspection_configuration", "focus_distance_m")
    op.drop_column("inspection_configuration", "focus_mode")
    op.drop_column("inspection_configuration", "shutter_speed")
    op.drop_column("inspection_configuration", "iso")
    op.drop_column("inspection_configuration", "white_balance")
