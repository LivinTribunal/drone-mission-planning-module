"""add mission-level camera setting defaults

Revision ID: 39a989e86099
Revises: 6a0e063b6699
Create Date: 2026-04-20 00:00:00.000000

"""

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "39a989e86099"
down_revision: Union[str, None] = "6a0e063b6699"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    """add four nullable camera default columns to mission."""
    op.add_column(
        "mission",
        sa.Column("default_white_balance", sa.String(20), nullable=True),
    )
    op.add_column(
        "mission",
        sa.Column("default_iso", sa.Integer(), nullable=True),
    )
    op.add_column(
        "mission",
        sa.Column("default_shutter_speed", sa.String(20), nullable=True),
    )
    op.add_column(
        "mission",
        sa.Column("default_focus_mode", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    """remove mission camera default columns."""
    op.drop_column("mission", "default_focus_mode")
    op.drop_column("mission", "default_shutter_speed")
    op.drop_column("mission", "default_iso")
    op.drop_column("mission", "default_white_balance")
