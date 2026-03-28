"""add category to validation_violation

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-03-28 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add category column, backfill from is_warning + message prefix, drop is_warning."""
    op.add_column(
        "validation_violation",
        sa.Column("category", sa.String(), server_default="violation", nullable=False),
    )

    # backfill existing rows
    op.execute(
        """
        UPDATE validation_violation
        SET category = CASE
            WHEN is_warning = true AND message LIKE '[SUGGESTION]%' THEN 'suggestion'
            WHEN is_warning = true THEN 'warning'
            ELSE 'violation'
        END
        """
    )

    # remove server default after backfill
    op.alter_column("validation_violation", "category", server_default=None)

    op.drop_column("validation_violation", "is_warning")

    op.create_check_constraint(
        "ck_validation_violation_category",
        "validation_violation",
        "category IN ('violation', 'warning', 'suggestion')",
    )


def downgrade() -> None:
    """re-add is_warning, backfill from category, drop category."""
    op.drop_constraint("ck_validation_violation_category", "validation_violation")
    op.add_column(
        "validation_violation",
        sa.Column("is_warning", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )

    op.execute(
        """
        UPDATE validation_violation
        SET is_warning = CASE
            WHEN category IN ('warning', 'suggestion') THEN true
            ELSE false
        END
        """
    )

    op.alter_column("validation_violation", "is_warning", server_default=None)

    op.drop_column("validation_violation", "category")
