"""add touchpoint coordinates to airfield_surface

Revision ID: a370ecf98674
Revises: f7c0935d47ec
Create Date: 2026-04-13 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a370ecf98674'
down_revision: Union[str, None] = 'f7c0935d47ec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'airfield_surface',
        sa.Column('touchpoint_latitude', sa.Float(), nullable=True),
    )
    op.add_column(
        'airfield_surface',
        sa.Column('touchpoint_longitude', sa.Float(), nullable=True),
    )
    op.add_column(
        'airfield_surface',
        sa.Column('touchpoint_altitude', sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('airfield_surface', 'touchpoint_altitude')
    op.drop_column('airfield_surface', 'touchpoint_longitude')
    op.drop_column('airfield_surface', 'touchpoint_latitude')
