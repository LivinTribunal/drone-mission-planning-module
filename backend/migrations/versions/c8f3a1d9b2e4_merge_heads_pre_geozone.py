"""merge heads pre geozone

merges the direction_reversed head and the lha_setting_angle_override head so
the supports_geozone_upload migration has a single parent to anchor against.

Revision ID: c8f3a1d9b2e4
Revises: 15dbde1d3c5b, 467fb3296d54
Create Date: 2026-04-22 22:00:00.000000

"""

from typing import Sequence, Union

revision: str = "c8f3a1d9b2e4"
down_revision: Union[str, None] = ("15dbde1d3c5b", "467fb3296d54")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """no-op merge."""
    pass


def downgrade() -> None:
    """no-op merge."""
    pass
