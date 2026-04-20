"""add lha_setting_angle_override_id to inspection_configuration

allows operators to pick a specific lha unit's setting angle for
horizontal range altitude calculation instead of the default max.

Revision ID: a4b5c6d7e8f9
Revises: 39a989e86099
Create Date: 2026-04-20 12:00:00.000000

"""

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, None] = "39a989e86099"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    """add lha_setting_angle_override_id column with fk to lha."""
    op.add_column(
        "inspection_configuration",
        sa.Column("lha_setting_angle_override_id", sa.dialects.postgresql.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_inspection_config_lha_setting_angle_override",
        "inspection_configuration",
        "lha",
        ["lha_setting_angle_override_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """drop lha_setting_angle_override_id column."""
    op.drop_constraint(
        "fk_inspection_config_lha_setting_angle_override",
        "inspection_configuration",
        type_="foreignkey",
    )
    op.drop_column("inspection_configuration", "lha_setting_angle_override_id")
