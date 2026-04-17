"""polygon obstacle geometry and buffer distance

Revision ID: b5c6d7e8f9a0
Revises: b3c4d5e6f7a8
Create Date: 2026-04-08 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry


revision: str = "b5c6d7e8f9a0"
down_revision: Union[str, None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add buffer_distance columns; skip obstacle renames handled by initial schema."""
    conn = op.get_bind()

    def _has_column(table: str, column: str) -> bool:
        """check if a column exists on a table."""
        return bool(conn.execute(
            sa.text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = :c"
            ),
            {"t": table, "c": column},
        ).scalar())

    if not _has_column("obstacle", "buffer_distance"):
        op.add_column(
            "obstacle",
            sa.Column("buffer_distance", sa.Float(), nullable=False, server_default="5.0"),
        )

    if not _has_column("airfield_surface", "buffer_distance"):
        op.add_column(
            "airfield_surface",
            sa.Column("buffer_distance", sa.Float(), nullable=False, server_default="5.0"),
        )

    if not _has_column("mission", "default_buffer_distance"):
        op.add_column(
            "mission",
            sa.Column("default_buffer_distance", sa.Float(), nullable=True),
        )

    if not _has_column("inspection_configuration", "buffer_distance"):
        op.add_column(
            "inspection_configuration",
            sa.Column("buffer_distance", sa.Float(), nullable=True),
        )


def downgrade() -> None:
    """restore obstacle position+radius columns and remove buffer_distance fields."""
    op.drop_column("inspection_configuration", "buffer_distance")
    op.drop_column("mission", "default_buffer_distance")
    op.drop_column("airfield_surface", "buffer_distance")

    # restore obstacle columns - position is nullable because centroid
    # extraction from boundary is lossy (original point data is lost)
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
