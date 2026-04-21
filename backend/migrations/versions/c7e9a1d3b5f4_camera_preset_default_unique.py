"""partial unique index: at most one default camera preset per drone_profile

Revision ID: c7e9a1d3b5f4
Revises: b5d7e9f1c3a2
Create Date: 2026-04-21 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "c7e9a1d3b5f4"
down_revision: Union[str, None] = "b5d7e9f1c3a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add two partial unique indexes to enforce 'one default per drone_profile'
    at the DB layer. one covers drone_profile_id IS NOT NULL; the other covers
    generic (drone_profile_id IS NULL) presets. together they mean at most one
    default exists in each bucket.
    """
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS "
        "uq_camera_preset_default_per_drone "
        "ON camera_preset (drone_profile_id) "
        "WHERE is_default = TRUE AND drone_profile_id IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS "
        "uq_camera_preset_default_generic "
        "ON camera_preset ((drone_profile_id IS NULL)) "
        "WHERE is_default = TRUE AND drone_profile_id IS NULL"
    )


def downgrade() -> None:
    """drop the partial unique indexes."""
    op.execute("DROP INDEX IF EXISTS uq_camera_preset_default_per_drone")
    op.execute("DROP INDEX IF EXISTS uq_camera_preset_default_generic")
