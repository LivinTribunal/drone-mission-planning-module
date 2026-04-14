"""add method-specific inspection configuration columns

adds columns for FLY_OVER, PARALLEL_SIDE_SWEEP, and HOVER_POINT_LOCK
inspection methods: height_above_lights, lateral_offset, distance_from_lha,
height_above_lha, camera_gimbal_angle, selected_lha_id.

methods are stored in insp_template_methods as VARCHAR(30) and are not a
postgres enum type, so no enum alteration is needed here.

Revision ID: c1e2f3a4b5d6
Revises: a8f1c2d3e4b5, d7e8f9a0b1c2
Create Date: 2026-04-13 09:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c1e2f3a4b5d6"
down_revision: Union[str, Sequence[str], None] = ("a8f1c2d3e4b5", "d7e8f9a0b1c2")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add method-specific config columns."""
    op.add_column(
        "inspection_configuration", sa.Column("height_above_lights", sa.Float(), nullable=True)
    )
    op.add_column(
        "inspection_configuration", sa.Column("lateral_offset", sa.Float(), nullable=True)
    )
    op.add_column(
        "inspection_configuration", sa.Column("distance_from_lha", sa.Float(), nullable=True)
    )
    op.add_column(
        "inspection_configuration", sa.Column("height_above_lha", sa.Float(), nullable=True)
    )
    op.add_column(
        "inspection_configuration", sa.Column("camera_gimbal_angle", sa.Float(), nullable=True)
    )
    op.add_column(
        "inspection_configuration",
        sa.Column("selected_lha_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    # FK ensures orphaned references are cleared if the referenced LHA is deleted
    op.create_foreign_key(
        "fk_inspection_configuration_selected_lha_id_lha",
        "inspection_configuration",
        "lha",
        ["selected_lha_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """drop method-specific config columns."""
    op.drop_constraint(
        "fk_inspection_configuration_selected_lha_id_lha",
        "inspection_configuration",
        type_="foreignkey",
    )
    op.drop_column("inspection_configuration", "selected_lha_id")
    op.drop_column("inspection_configuration", "camera_gimbal_angle")
    op.drop_column("inspection_configuration", "height_above_lha")
    op.drop_column("inspection_configuration", "distance_from_lha")
    op.drop_column("inspection_configuration", "lateral_offset")
    op.drop_column("inspection_configuration", "height_above_lights")
