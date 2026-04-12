"""merge heads

Revision ID: f2cea25e628a
Revises: b3c4d5e6f7a8, b4c5d6e7f8a9
Create Date: 2026-04-09 21:01:42.604056

"""
from typing import Sequence, Union

from alembic import op  # noqa: F401


revision: str = 'f2cea25e628a'
down_revision: Union[str, None] = ('b3c4d5e6f7a8', 'b4c5d6e7f8a9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
