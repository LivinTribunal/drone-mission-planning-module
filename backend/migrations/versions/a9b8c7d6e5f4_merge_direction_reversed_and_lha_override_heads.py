"""merge direction_reversed and lha_override heads

Revision ID: a9b8c7d6e5f4
Revises: 15dbde1d3c5b, 467fb3296d54
Create Date: 2026-04-22 22:00:00.000000

"""

from typing import Sequence, Union

revision: str = "a9b8c7d6e5f4"
down_revision: Union[str, Sequence[str], None] = ("15dbde1d3c5b", "467fb3296d54")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """no-op merge node."""


def downgrade() -> None:
    """no-op merge node."""
