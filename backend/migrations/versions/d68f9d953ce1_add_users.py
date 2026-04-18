"""add users and user_airports tables

Revision ID: d68f9d953ce1
Revises: 16fee43
Create Date: 2026-04-18 10:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "d68f9d953ce1"
down_revision = "b435c08f47f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """create users table and user_airports junction."""
    op.create_table(
        "users",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("email", sa.String, unique=True, nullable=False, index=True),
        sa.Column("hashed_password", sa.String, nullable=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="OPERATOR"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("invitation_token", sa.String, nullable=True),
        sa.Column("invitation_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "user_airports",
        sa.Column(
            "user_id",
            UUID,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "airport_id",
            UUID,
            sa.ForeignKey("airport.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )


def downgrade() -> None:
    """drop user_airports and user tables."""
    op.drop_table("user_airports")
    op.drop_table("users")
