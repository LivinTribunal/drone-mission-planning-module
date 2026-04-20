"""merge camera defaults and angle offset heads."""

from typing import Union

revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = ("39a989e86099", "b6c7d8e9f0a1")
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    """merge only."""
    pass


def downgrade() -> None:
    """merge only."""
    pass
