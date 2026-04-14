"""add hover_bearing and hover_bearing_reference config columns

adds operator-controlled approach bearing for hover-point-lock inspections,
referenced either to the runway heading of the AGL hosting the selected LHA
(reference = "RUNWAY") or to true compass heading (reference = "COMPASS").

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
Create Date: 2026-04-14 15:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e9f0a1b2c3d4"
down_revision: Union[str, Sequence[str], None] = "d8e9f0a1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """add hover bearing columns."""
    op.add_column(
        "inspection_configuration",
        sa.Column("hover_bearing", sa.Float(), nullable=True),
    )
    op.add_column(
        "inspection_configuration",
        sa.Column("hover_bearing_reference", sa.String(length=10), nullable=True),
    )


def downgrade() -> None:
    """drop hover bearing columns."""
    op.drop_column("inspection_configuration", "hover_bearing_reference")
    op.drop_column("inspection_configuration", "hover_bearing")
