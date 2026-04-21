"""rename focus_distance_m to focus_distance_mode

Revision ID: 30a1f0aafa7c
Revises: 4f1a8d2c6b09
Create Date: 2026-04-21 01:15:39.888557

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '30a1f0aafa7c'
down_revision: Union[str, None] = '4f1a8d2c6b09'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """replace numeric focus_distance_m with string focus_distance_mode
    on inspection_configuration and camera_preset. also drop the unused
    mission-level focus_distance/optical_zoom defaults (replaced by the
    inspection-level fields).
    """
    op.add_column(
        'camera_preset',
        sa.Column('focus_distance_mode', sa.String(length=20), nullable=True),
    )
    op.drop_column('camera_preset', 'focus_distance_m')

    op.add_column(
        'inspection_configuration',
        sa.Column('focus_distance_mode', sa.String(length=20), nullable=True),
    )
    op.drop_column('inspection_configuration', 'focus_distance_m')

    op.drop_column('mission', 'default_focus_distance_m')
    op.drop_column('mission', 'default_optical_zoom')


def downgrade() -> None:
    """restore numeric focus_distance_m columns and mission defaults."""
    op.add_column(
        'mission',
        sa.Column('default_optical_zoom', sa.Float(), nullable=True),
    )
    op.add_column(
        'mission',
        sa.Column('default_focus_distance_m', sa.Float(), nullable=True),
    )

    op.add_column(
        'inspection_configuration',
        sa.Column('focus_distance_m', sa.Float(), nullable=True),
    )
    op.drop_column('inspection_configuration', 'focus_distance_mode')

    op.add_column(
        'camera_preset',
        sa.Column('focus_distance_m', sa.Float(), nullable=True),
    )
    op.drop_column('camera_preset', 'focus_distance_mode')
