"""rename papi_horizontal_range to horizontal_range

Revision ID: b2c3d4e5f6a7
Revises: aaecedb1675e
Create Date: 2026-04-20 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "aaecedb1675e"
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
