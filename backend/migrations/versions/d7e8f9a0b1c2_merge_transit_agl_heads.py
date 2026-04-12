"""merge transit_agl heads

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1, f7c0935d47ec
Create Date: 2026-04-12 20:00:00.000000

"""

from typing import Sequence, Union


revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, Sequence[str], None] = ("c6d7e8f9a0b1", "f7c0935d47ec")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """no-op merge migration."""
    pass


def downgrade() -> None:
    """no-op merge migration."""
    pass
