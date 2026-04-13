"""add agl_type check constraint

Revision ID: d8e9f0a1b2c3
Revises: a1b2c3d4e5f6
Create Date: 2026-04-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "d8e9f0a1b2c3"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_agl_agl_type",
        "agl",
        "agl_type IN ('PAPI', 'RUNWAY_EDGE_LIGHTS')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_agl_agl_type", "agl", type_="check")
