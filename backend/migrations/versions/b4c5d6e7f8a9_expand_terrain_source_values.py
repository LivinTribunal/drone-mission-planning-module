"""expand terrain source values

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-04-05 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """expand check constraint to allow DEM_UPLOAD and DEM_API values."""
    op.drop_constraint("ck_airport_terrain_source", "airport", type_="check")
    op.execute(
        "UPDATE airport SET terrain_source = 'DEM_UPLOAD' WHERE terrain_source = 'DEM'"
    )
    op.create_check_constraint(
        "ck_airport_terrain_source",
        "airport",
        "terrain_source IN ('FLAT', 'DEM_UPLOAD', 'DEM_API')",
    )


def downgrade() -> None:
    """collapse DEM variants back to DEM."""
    op.drop_constraint("ck_airport_terrain_source", "airport", type_="check")
    op.execute(
        "UPDATE airport SET terrain_source = 'DEM' "
        "WHERE terrain_source IN ('DEM_UPLOAD', 'DEM_API')"
    )
    op.create_check_constraint(
        "ck_airport_terrain_source",
        "airport",
        "terrain_source IN ('FLAT', 'DEM')",
    )
