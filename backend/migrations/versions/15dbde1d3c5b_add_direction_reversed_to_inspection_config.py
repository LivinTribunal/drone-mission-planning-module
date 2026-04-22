"""add direction_reversed to inspection_config

Revision ID: 15dbde1d3c5b
Revises: 1744e4e7afee
Create Date: 2026-04-22 21:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "15dbde1d3c5b"
down_revision: Union[str, None] = "1744e4e7afee"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add non-null direction_reversed boolean column with default false."""
    op.add_column(
        "inspection_configuration",
        sa.Column(
            "direction_reversed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # drop server_default so application-level default takes over for new rows
    op.alter_column("inspection_configuration", "direction_reversed", server_default=None)


def downgrade() -> None:
    """remove direction_reversed column."""
    op.drop_column("inspection_configuration", "direction_reversed")
