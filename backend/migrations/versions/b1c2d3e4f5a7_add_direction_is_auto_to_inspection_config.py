"""add direction_is_auto to inspection_config

Revision ID: b1c2d3e4f5a7
Revises: a9b8c7d6e5f4
Create Date: 2026-04-22 22:05:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "b1c2d3e4f5a7"
down_revision: Union[str, None] = "a9b8c7d6e5f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add non-null direction_is_auto boolean column with default false."""
    op.add_column(
        "inspection_configuration",
        sa.Column(
            "direction_is_auto",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("inspection_configuration", "direction_is_auto", server_default=None)


def downgrade() -> None:
    """remove direction_is_auto column."""
    op.drop_column("inspection_configuration", "direction_is_auto")
