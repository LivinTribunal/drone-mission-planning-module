"""add model_identifier to drone_profile

Revision ID: d6e7f8a9b0c1
Revises: c9d0e1f2a3b5
Create Date: 2026-03-29 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, None] = "c9d0e1f2a3b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add model_identifier column to drone_profile."""
    op.add_column(
        "drone_profile",
        sa.Column("model_identifier", sa.String(), nullable=True),
    )


def downgrade() -> None:
    """remove model_identifier column from drone_profile."""
    op.drop_column("drone_profile", "model_identifier")
