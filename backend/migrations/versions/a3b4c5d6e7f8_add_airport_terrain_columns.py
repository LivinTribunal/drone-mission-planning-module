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
    conn = op.get_bind()
    has_col = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'airport' AND column_name = 'terrain_source'"
        )
    ).scalar()
    if not has_col:
        op.add_column(
            "airport",
            sa.Column("terrain_source", sa.String(20), nullable=False, server_default="FLAT"),
        )
        op.add_column("airport", sa.Column("dem_file_path", sa.String(), nullable=True))
        op.create_check_constraint(
            "ck_airport_terrain_source",
            "airport",
            "terrain_source IN ('FLAT', 'DEM')",
        )


def downgrade() -> None:
    op.drop_constraint("ck_airport_terrain_source", "airport", type_="check")
    op.drop_column("airport", "dem_file_path")
    op.drop_column("airport", "terrain_source")
