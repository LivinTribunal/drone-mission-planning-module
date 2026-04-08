"""polygon obstacle geometry and buffer distance

Revision ID: b5c6d7e8f9a0
Revises: f9a0b1c2d3e4
Create Date: 2026-04-08 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry


revision: str = "b5c6d7e8f9a0"
down_revision: Union[str, None] = "f9a0b1c2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """migrate obstacles from point+radius to polygon boundary with buffer distance."""
    # add buffer_distance to obstacle (before dropping old columns)
    op.add_column(
        "obstacle",
        sa.Column("buffer_distance", sa.Float(), nullable=False, server_default="5.0"),
    )

    # rename geometry -> boundary and cast from generic geometry to POLYGONZ
    op.alter_column(
        "obstacle",
        "geometry",
        new_column_name="boundary",
        type_=Geometry("POLYGONZ", srid=4326),
        postgresql_using="geometry::geometry(POLYGONZ,4326)",
    )

    # drop old obstacle columns
    op.drop_column("obstacle", "position")
    op.drop_column("obstacle", "radius")

    # add buffer_distance to airfield_surface
    op.add_column(
        "airfield_surface",
        sa.Column("buffer_distance", sa.Float(), nullable=False, server_default="5.0"),
    )

    # add default_buffer_distance to mission
    op.add_column(
        "mission",
        sa.Column("default_buffer_distance", sa.Float(), nullable=True),
    )

    # add buffer_distance to inspection_configuration
    op.add_column(
        "inspection_configuration",
        sa.Column("buffer_distance", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    """restore obstacle position+radius columns and remove buffer_distance fields."""
    op.drop_column("inspection_configuration", "buffer_distance")
    op.drop_column("mission", "default_buffer_distance")
    op.drop_column("airfield_surface", "buffer_distance")

    # restore obstacle columns
    op.add_column(
        "obstacle",
        sa.Column("radius", sa.Float(), nullable=False, server_default="15.0"),
    )
    op.add_column(
        "obstacle",
        sa.Column(
            "position",
            Geometry("POINTZ", srid=4326),
            nullable=True,
        ),
    )

    # rename boundary -> geometry and cast back to generic geometry
    op.alter_column(
        "obstacle",
        "boundary",
        new_column_name="geometry",
        type_=Geometry("GEOMETRY", srid=4326),
        postgresql_using="boundary::geometry(Geometry,4326)",
    )

    op.drop_column("obstacle", "buffer_distance")
