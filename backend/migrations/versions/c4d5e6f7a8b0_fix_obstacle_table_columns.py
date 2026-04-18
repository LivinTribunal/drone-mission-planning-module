"""fix obstacle table - rename boundary to geometry, add position and radius

Revision ID: c4d5e6f7a8b0
Revises: f2cea25e628a
Create Date: 2026-04-09 20:00:00.000000

"""
from typing import Sequence, Union

import geoalchemy2
import sqlalchemy as sa
from alembic import op

revision: str = 'c4d5e6f7a8b0'
down_revision: Union[str, None] = 'f2cea25e628a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """rename boundary->geometry, add position and radius columns."""
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

    if _has_column("obstacle", "boundary"):
        op.alter_column('obstacle', 'boundary', new_column_name='geometry')

    if not _has_column("obstacle", "position"):
        op.add_column(
            'obstacle',
            sa.Column(
                'position',
                geoalchemy2.types.Geometry(
                    geometry_type='POINTZ', srid=4326,
                    from_text='ST_GeomFromEWKT', name='geometry',
                ),
                nullable=True,
            ),
        )

    if not _has_column("obstacle", "radius"):
        op.add_column(
            'obstacle',
            sa.Column('radius', sa.Float(), nullable=True),
        )

    null_count = conn.execute(
        sa.text("SELECT COUNT(*) FROM obstacle WHERE geometry IS NULL")
    ).scalar()
    if null_count:
        raise RuntimeError(
            f"migration aborted: {null_count} obstacle(s) have NULL geometry and cannot be "
            "backfilled. resolve these rows manually before running this migration."
        )

    op.execute(
        sa.text("""
        UPDATE obstacle
        SET position = ST_Force3D(ST_Centroid(geometry)),
            radius = SQRT(ST_Area(geometry::geography) / PI())
        WHERE position IS NULL
        """)
    )

    op.alter_column('obstacle', 'geometry', nullable=False)


def downgrade() -> None:
    """reverse - drop position/radius, rename geometry back to boundary."""
    # abort if the renamed column is missing data - a bare rename-back would
    # silently destroy whatever the upgrade populated.
    conn = op.get_bind()
    null_count = conn.execute(
        sa.text("SELECT COUNT(*) FROM obstacle WHERE geometry IS NULL")
    ).scalar()
    if null_count:
        raise RuntimeError(
            f"downgrade aborted: {null_count} obstacle(s) have NULL geometry. "
            "renaming geometry back to boundary would lose spatial data - "
            "resolve these rows manually before running this downgrade."
        )

    op.drop_column('obstacle', 'radius')
    op.drop_column('obstacle', 'position')
    op.alter_column('obstacle', 'geometry', new_column_name='boundary')
