"""add users table

Revision ID: a0b1c2d3e4f5
Revises: f9a0b1c2d3e4
Create Date: 2026-04-06 10:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a0b1c2d3e4f5"
down_revision: Union[str, None] = "f9a0b1c2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """create users and user_airports tables."""
    op.create_table(
        "users",
        sa.Column("id", sa.dialects.postgresql.UUID(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="OPERATOR"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "user_airports",
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "airport_id",
            sa.dialects.postgresql.UUID(),
            sa.ForeignKey("airport.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_index("ix_user_airports_airport_id", "user_airports", ["airport_id"])

    # db-level updated_at trigger for raw sql updates - namespaced to avoid
    # clashing with other tables that may define their own set_updated_at()
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_users_updated_at()
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
        CREATE TRIGGER trg_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION set_users_updated_at();
        """
    )


def downgrade() -> None:
    """drop users and user_airports tables."""
    op.execute("DROP TRIGGER IF EXISTS trg_users_updated_at ON users")
    op.execute("DROP FUNCTION IF EXISTS set_users_updated_at()")
    op.drop_index("ix_user_airports_airport_id", table_name="user_airports")
    op.drop_table("user_airports")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
