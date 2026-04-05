"""add ugcs to export format constraint

Revision ID: a2b3c4d5e6f7
Revises: a1b2c3d4e5f7
Create Date: 2026-03-31 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('ck_export_format', 'export_result', type_='check')
    op.create_check_constraint(
        'ck_export_format',
        'export_result',
        "format IN ('MAVLINK', 'KML', 'KMZ', 'JSON', 'UGCS')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_export_format', 'export_result', type_='check')
    op.create_check_constraint(
        'ck_export_format',
        'export_result',
        "format IN ('MAVLINK', 'KML', 'KMZ', 'JSON')",
    )
