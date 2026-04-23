"""merge heads before mission boundary options migration."""

from typing import Union

revision: str = "37694cd9990d"
down_revision: Union[str, None] = ("15dbde1d3c5b", "467fb3296d54")
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    """merge only."""
    pass


def downgrade() -> None:
    """merge only."""
    pass
