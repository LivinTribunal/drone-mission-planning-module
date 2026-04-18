"""add check constraint on user role

Revision ID: 909c64f14df1
Revises: db18669e8ead
Create Date: 2026-04-18 23:33:37.761367

"""
from typing import Sequence, Union

from alembic import op


revision: str = '909c64f14df1'
down_revision: Union[str, None] = 'db18669e8ead'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_users_role_valid",
        "users",
        "role IN ('OPERATOR', 'COORDINATOR', 'SUPER_ADMIN')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_role_valid", "users", type_="check")
