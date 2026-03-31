"""add boundary polygon to airfield_surface

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-03-31 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import geoalchemy2
import sqlalchemy as sa


revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, None] = "d6e7f8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "airfield_surface",
        sa.Column("boundary", geoalchemy2.Geometry("POLYGONZ", srid=4326), nullable=True),
    )
    op.create_index(
        "idx_airfield_surface_boundary",
        "airfield_surface",
        ["boundary"],
        postgresql_using="gist",
    )


def downgrade() -> None:
    op.drop_index("idx_airfield_surface_boundary", table_name="airfield_surface")
    op.drop_column("airfield_surface", "boundary")
