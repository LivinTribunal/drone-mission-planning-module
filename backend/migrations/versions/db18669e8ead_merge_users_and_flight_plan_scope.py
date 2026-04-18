"""merge users and flight_plan_scope

Revision ID: db18669e8ead
Revises: a1b2c3d4e5f8, db6988ce768c
Create Date: 2026-04-18 23:21:53.790224

"""
from typing import Sequence, Union

from alembic import op  # noqa: F401


revision: str = 'db18669e8ead'
down_revision: Union[str, None] = ('a1b2c3d4e5f8', 'db6988ce768c')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
