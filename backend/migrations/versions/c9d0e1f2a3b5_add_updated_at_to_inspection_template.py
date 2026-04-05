"""add updated_at to inspection_template

tracks when the template was last modified.

Revision ID: c9d0e1f2a3b5
Revises: c9d0e1f2a3b4
Create Date: 2026-03-28 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c9d0e1f2a3b5"
down_revision: Union[str, None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add updated_at column with auto-update trigger to inspection_template table."""
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

    # postgres trigger so raw sql updates also set updated_at
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_inspection_template_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_inspection_template_updated_at
        BEFORE UPDATE ON inspection_template
        FOR EACH ROW
        EXECUTE FUNCTION set_inspection_template_updated_at();
        """
    )


def downgrade() -> None:
    """remove updated_at column and trigger from inspection_template table."""
    op.execute("DROP TRIGGER IF EXISTS trg_inspection_template_updated_at ON inspection_template")
    op.execute("DROP FUNCTION IF EXISTS set_inspection_template_updated_at()")
    op.drop_column("inspection_template", "updated_at")
