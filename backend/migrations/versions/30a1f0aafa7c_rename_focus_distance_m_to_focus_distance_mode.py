"""replace focus_distance_m (numeric) with focus_distance_mode (string);
drop mission.default_focus_distance_m and default_optical_zoom.

DESTRUCTIVE: values in focus_distance_m and the mission defaults are lost -
the new column has different semantics (enum-ish string, not a distance)
so no value-mapping is meaningful. Downgrade is one-way (see downgrade()).

Revision ID: 30a1f0aafa7c
Revises: 4f1a8d2c6b09
Create Date: 2026-04-21 01:15:39.888557

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

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
    """one-way migration: the forward direction drops data with no preserving
    inverse, so restoring the old columns would leave a table shape that
    never existed in prod. refuse rather than produce an inconsistent schema.
    """
    raise NotImplementedError(
        "30a1f0aafa7c is one-way: focus_distance_m values were dropped with "
        "no preserving inverse. restore from backup if you need the old shape."
    )
