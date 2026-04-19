"""add organization_id to users and airport

Revision ID: 8e1cc0628ef4
Revises: 3edc932f71fd
Create Date: 2026-04-18 12:01:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "8e1cc0628ef4"
down_revision = "3edc932f71fd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """add nullable organization_id for future multi-tenancy."""
    op.add_column("users", sa.Column("organization_id", UUID, nullable=True))
    op.add_column("airport", sa.Column("organization_id", UUID, nullable=True))


def downgrade() -> None:
    """remove organization_id columns."""
    op.drop_column("airport", "organization_id")
    op.drop_column("users", "organization_id")
