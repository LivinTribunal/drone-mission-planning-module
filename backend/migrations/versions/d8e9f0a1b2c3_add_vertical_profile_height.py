"""add vertical_profile_height config column

adds vertical_profile_height to inspection_configuration so the VERTICAL_PROFILE
method can specify the max altitude above the PAPI center to climb to, instead
of reusing the angular-sweep sweep_angle field.

Revision ID: d8e9f0a1b2c3
Revises: c1e2f3a4b5d6
Create Date: 2026-04-14 13:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d8e9f0a1b2c3"
down_revision: Union[str, Sequence[str], None] = "c1e2f3a4b5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add vertical_profile_height column."""
    op.add_column(
        "inspection_configuration",
        sa.Column("vertical_profile_height", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    """drop vertical_profile_height column."""
    op.drop_column("inspection_configuration", "vertical_profile_height")
