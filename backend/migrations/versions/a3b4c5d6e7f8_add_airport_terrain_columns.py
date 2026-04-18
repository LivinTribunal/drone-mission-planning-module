"""add airport terrain columns

Revision ID: a3b4c5d6e7f8
Revises: f8a9b0c1d2e3
Create Date: 2026-04-05 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, None] = "f8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add terrain_source and dem_file_path columns to airport."""
    op.execute(
        sa.text(
            "ALTER TABLE airport ADD COLUMN IF NOT EXISTS "
            "terrain_source VARCHAR(20) NOT NULL DEFAULT 'FLAT'"
        )
    )
    op.execute(
        sa.text("ALTER TABLE airport ADD COLUMN IF NOT EXISTS dem_file_path VARCHAR")
    )

    # idempotent constraint - drop first if exists to avoid duplicate
    conn = op.get_bind()
    has_constraint = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.check_constraints "
            "WHERE constraint_name = 'ck_airport_terrain_source' "
            "AND constraint_schema = current_schema()"
        )
    ).scalar()
    if not has_constraint:
        op.create_check_constraint(
            "ck_airport_terrain_source",
            "airport",
            "terrain_source IN ('FLAT', 'DEM')",
        )


def downgrade() -> None:
    """remove terrain_source and dem_file_path columns from airport."""
    op.drop_constraint("ck_airport_terrain_source", "airport", type_="check")
    op.drop_column("airport", "dem_file_path")
    op.drop_column("airport", "terrain_source")
