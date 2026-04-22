"""merge heads before lha_setting_angle_override_id

Revision ID: 6b779529b749
Revises: c7e9a1d3b5f4, e1d2c3b4a5f6
Create Date: 2026-04-21 18:40:00.000000

"""
from typing import Sequence, Union

from alembic import op  # noqa: F401

revision: str = "6b779529b749"
down_revision: Union[str, None] = ("c7e9a1d3b5f4", "e1d2c3b4a5f6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """merge only."""
    pass


def downgrade() -> None:
    """merge only."""
    pass
