"""add default_drone_profile_id to airport

Revision ID: b3c4d5e6f7a8
Revises: f9a0b1c2d3e4
Create Date: 2026-04-05 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, None] = "f9a0b1c2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add default_drone_profile_id FK column to airport table."""
    op.add_column(
        "airport",
        sa.Column("default_drone_profile_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_airport_default_drone_profile_id",
        "airport",
        "drone_profile",
        ["default_drone_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """remove default_drone_profile_id column from airport table."""
    op.drop_constraint("fk_airport_default_drone_profile_id", "airport", type_="foreignkey")
    op.drop_column("airport", "default_drone_profile_id")
