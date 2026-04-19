"""add angle_offset to inspection_configuration

Revision ID: b6c7d8e9f0a1
Revises: aaecedb1675e
Create Date: 2026-04-19 14:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b6c7d8e9f0a1"
down_revision: Union[str, None] = "aaecedb1675e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add angle_offset column for papi observation angle derivation."""
    op.add_column(
        "inspection_configuration",
        sa.Column("angle_offset", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    """remove angle_offset column."""
    op.drop_column("inspection_configuration", "angle_offset")
