"""add city and country to airport

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-03-19 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("airport", sa.Column("city", sa.String(100), nullable=True))
    op.add_column("airport", sa.Column("country", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("airport", "country")
    op.drop_column("airport", "city")
