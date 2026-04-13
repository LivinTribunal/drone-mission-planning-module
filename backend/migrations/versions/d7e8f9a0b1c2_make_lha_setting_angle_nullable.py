"""make lha setting_angle nullable

Revision ID: d7e8f9a0b1c2
Revises: 531703098bae
Create Date: 2026-04-13 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, None] = "531703098bae"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """drop not-null on lha.setting_angle so papi bulk-generate can leave it blank."""
    op.alter_column(
        "lha",
        "setting_angle",
        existing_type=sa.Float(),
        nullable=True,
    )


def downgrade() -> None:
    """restore not-null on lha.setting_angle."""
    op.alter_column(
        "lha",
        "setting_angle",
        existing_type=sa.Float(),
        nullable=False,
    )
