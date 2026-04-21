"""merge heads and rename papi_horizontal_range to horizontal_range

merges the 39a989e86099 (mission_camera_defaults) and b6c7d8e9f0a1
(angle_offset) heads, and renames PAPI_HORIZONTAL_RANGE method values
to HORIZONTAL_RANGE in inspection and template tables.

originally this rename lived in a file that collided on revision id
b2c3d4e5f6a7 with add_config_override_columns. the file was renamed to
this fresh id and repurposed as the merge migration so the chain has a
single head again.

Revision ID: e1d2c3b4a5f6
Revises: 39a989e86099, b6c7d8e9f0a1
Create Date: 2026-04-21 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "e1d2c3b4a5f6"
down_revision: Union[str, Sequence[str], None] = ("39a989e86099", "b6c7d8e9f0a1")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """rename PAPI_HORIZONTAL_RANGE -> HORIZONTAL_RANGE in inspection and template methods."""
    op.execute(
        "UPDATE inspection SET method = 'HORIZONTAL_RANGE' "
        "WHERE method = 'PAPI_HORIZONTAL_RANGE'"
    )
    op.execute(
        "UPDATE insp_template_methods SET method = 'HORIZONTAL_RANGE' "
        "WHERE method = 'PAPI_HORIZONTAL_RANGE'"
    )


def downgrade() -> None:
    """revert HORIZONTAL_RANGE -> PAPI_HORIZONTAL_RANGE."""
    op.execute(
        "UPDATE inspection SET method = 'PAPI_HORIZONTAL_RANGE' "
        "WHERE method = 'HORIZONTAL_RANGE'"
    )
    op.execute(
        "UPDATE insp_template_methods SET method = 'PAPI_HORIZONTAL_RANGE' "
        "WHERE method = 'HORIZONTAL_RANGE'"
    )
