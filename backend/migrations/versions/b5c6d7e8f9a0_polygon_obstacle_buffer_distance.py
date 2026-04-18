"""polygon obstacle geometry and buffer distance

Revision ID: b5c6d7e8f9a0
Revises: b3c4d5e6f7a8
Create Date: 2026-04-08 10:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b5c6d7e8f9a0"
down_revision: Union[str, None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(conn, table: str, column: str) -> bool:
    """check if a column exists on a table."""
    return bool(
        conn.execute(
            sa.text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = :c"
            ),
            {"t": table, "c": column},
        ).scalar()
    )


def upgrade() -> None:
    """add buffer_distance columns; skip obstacle renames handled by initial schema."""
    conn = op.get_bind()

    if not _has_column(conn, "obstacle", "buffer_distance"):
        op.add_column(
            "obstacle",
            sa.Column("buffer_distance", sa.Float(), nullable=False, server_default="5.0"),
        )

    if not _has_column(conn, "airfield_surface", "buffer_distance"):
        op.add_column(
            "airfield_surface",
            sa.Column("buffer_distance", sa.Float(), nullable=False, server_default="5.0"),
        )

    if not _has_column(conn, "mission", "default_buffer_distance"):
        op.add_column(
            "mission",
            sa.Column("default_buffer_distance", sa.Float(), nullable=True),
        )

    if not _has_column(conn, "inspection_configuration", "buffer_distance"):
        op.add_column(
            "inspection_configuration",
            sa.Column("buffer_distance", sa.Float(), nullable=True),
        )


def downgrade() -> None:
    """drop buffer_distance columns added by upgrade, skipping if already absent."""
    conn = op.get_bind()

    if _has_column(conn, "inspection_configuration", "buffer_distance"):
        op.drop_column("inspection_configuration", "buffer_distance")

    if _has_column(conn, "mission", "default_buffer_distance"):
        op.drop_column("mission", "default_buffer_distance")

    if _has_column(conn, "airfield_surface", "buffer_distance"):
        op.drop_column("airfield_surface", "buffer_distance")

    if _has_column(conn, "obstacle", "buffer_distance"):
        op.drop_column("obstacle", "buffer_distance")
