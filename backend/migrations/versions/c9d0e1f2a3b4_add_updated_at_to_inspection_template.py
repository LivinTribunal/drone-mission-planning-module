"""add updated_at to inspection_template

tracks when the template was last modified.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-03-28 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add updated_at column to inspection_template table."""
    # note: onupdate=func.now() is orm-only - raw sql updates won't auto-set this column
    op.add_column(
        "inspection_template",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
    )

    op.execute("UPDATE inspection_template SET updated_at = created_at")


def downgrade() -> None:
    """remove updated_at column from inspection_template table."""
    op.drop_column("inspection_template", "updated_at")
