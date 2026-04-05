"""add waypoint_ids and export formats

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-04-05 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, None] = "d6e7f8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add waypoint_ids jsonb column and expand export format check constraint."""
    op.add_column(
        "validation_violation",
        sa.Column("waypoint_ids", postgresql.JSONB(), nullable=True),
    )
    op.drop_constraint("ck_export_format", "export_result")
    op.create_check_constraint(
        "ck_export_format",
        "export_result",
        "format IN ('MAVLINK', 'KML', 'KMZ', 'JSON', 'UGCS', "
        "'WPML', 'CSV', 'GPX', 'LITCHI', 'DRONEDEPLOY')",
    )


def downgrade() -> None:
    """remove waypoint_ids column and revert export format constraint."""
    op.drop_constraint("ck_export_format", "export_result")
    op.create_check_constraint(
        "ck_export_format",
        "export_result",
        "format IN ('MAVLINK', 'KML', 'KMZ', 'JSON', 'UGCS')",
    )
    op.drop_column("validation_violation", "waypoint_ids")
