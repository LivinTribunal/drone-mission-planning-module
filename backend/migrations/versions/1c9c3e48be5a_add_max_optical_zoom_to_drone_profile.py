"""add max_optical_zoom to drone_profile

Revision ID: 1c9c3e48be5a
Revises: d3e4f5a6b7c8
Create Date: 2026-04-20 23:49:34.690354

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "1c9c3e48be5a"
down_revision: Union[str, None] = "d3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add max_optical_zoom column to drone_profile."""
    op.add_column("drone_profile", sa.Column("max_optical_zoom", sa.Float(), nullable=True))


def downgrade() -> None:
    """remove max_optical_zoom from drone_profile."""
    op.drop_column("drone_profile", "max_optical_zoom")
