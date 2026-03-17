"""add hover_duration, horizontal_distance, sweep_angle to inspection_configuration

these fields allow per-inspection override of trajectory parameters
that were previously hardcoded module-level constants.

Revision ID: b2c3d4e5f6a7
Revises: f341383d7ac2
Create Date: 2026-03-15 16:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "f341383d7ac2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("inspection_configuration", sa.Column("hover_duration", sa.Float(), nullable=True))
    op.add_column(
        "inspection_configuration", sa.Column("horizontal_distance", sa.Float(), nullable=True)
    )
    op.add_column("inspection_configuration", sa.Column("sweep_angle", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("inspection_configuration", "sweep_angle")
    op.drop_column("inspection_configuration", "horizontal_distance")
    op.drop_column("inspection_configuration", "hover_duration")
