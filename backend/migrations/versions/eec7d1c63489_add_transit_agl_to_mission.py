"""add transit_agl to mission

Revision ID: eec7d1c63489
Revises: 1744e4e7afee
Create Date: 2026-04-11 23:40:15.510612

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'eec7d1c63489'
down_revision: Union[str, None] = '1744e4e7afee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add transit_agl column to mission table."""
    op.add_column('mission', sa.Column('transit_agl', sa.Float(), nullable=True))


def downgrade() -> None:
    """remove transit_agl column from mission table."""
    op.drop_column('mission', 'transit_agl')
