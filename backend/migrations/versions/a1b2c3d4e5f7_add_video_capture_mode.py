"""add video capture mode columns

Revision ID: a1b2c3d4e5f7
Revises: f8a9b0c1d2e3
Create Date: 2026-04-04 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, None] = "f8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add video capture mode columns and update camera action constraint."""
    op.add_column(
        "inspection_configuration",
        sa.Column("capture_mode", sa.String(20), nullable=True),
    )
    op.add_column(
        "inspection_configuration",
        sa.Column("recording_setup_duration", sa.Float(), nullable=True),
    )
    op.add_column(
        "mission",
        sa.Column(
            "default_capture_mode",
            sa.String(20),
            nullable=True,
            server_default="VIDEO_CAPTURE",
        ),
    )

    # add RECORDING to waypoint camera_action check constraint
    op.drop_constraint("ck_waypoint_camera_action", "waypoint", type_="check")
    op.create_check_constraint(
        "ck_waypoint_camera_action",
        "waypoint",
        "camera_action IN ('NONE', 'PHOTO_CAPTURE', 'RECORDING_START', 'RECORDING', 'RECORDING_STOP')",
    )


def downgrade() -> None:
    """remove video capture mode columns and restore old constraint."""
    op.drop_constraint("ck_waypoint_camera_action", "waypoint", type_="check")
    op.create_check_constraint(
        "ck_waypoint_camera_action",
        "waypoint",
        "camera_action IN ('NONE', 'PHOTO_CAPTURE', 'RECORDING_START', 'RECORDING_STOP')",
    )
    op.drop_column("mission", "default_capture_mode")
    op.drop_column("inspection_configuration", "recording_setup_duration")
    op.drop_column("inspection_configuration", "capture_mode")
