"""add direction_heading to inspection_config

Revision ID: a4b5c6d7e8f9
Revises: 1744e4e7afee
Create Date: 2026-04-20 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, None] = "1744e4e7afee"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add nullable direction_heading float column."""
    op.add_column(
        "inspection_configuration",
        sa.Column("direction_heading", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    """remove direction_heading column."""
    op.drop_column("inspection_configuration", "direction_heading")
