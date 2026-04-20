"""add camera preset table and FK on inspection configuration."""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "d3e4f5a6b7c8"
down_revision: Union[str, None] = "c2d3e4f5a6b7"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    """add camera_preset table and camera_preset_id to inspection_configuration."""
    op.create_table(
        "camera_preset",
        sa.Column("id", sa.dialects.postgresql.UUID(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "drone_profile_id",
            sa.dialects.postgresql.UUID(),
            sa.ForeignKey("drone_profile.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by",
            sa.dialects.postgresql.UUID(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("white_balance", sa.String(20), nullable=True),
        sa.Column("iso", sa.Integer(), nullable=True),
        sa.Column("shutter_speed", sa.String(20), nullable=True),
        sa.Column("focus_mode", sa.String(20), nullable=True),
        sa.Column("focus_distance_m", sa.Float(), nullable=True),
        sa.Column("optical_zoom", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.add_column(
        "inspection_configuration",
        sa.Column(
            "camera_preset_id",
            sa.dialects.postgresql.UUID(),
            sa.ForeignKey("camera_preset.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """drop camera_preset_id and camera_preset table."""
    op.drop_column("inspection_configuration", "camera_preset_id")
    op.drop_table("camera_preset")
