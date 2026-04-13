"""add agl_type check constraint

Revision ID: 531703098bae
Revises: a370ecf98674
Create Date: 2026-04-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "531703098bae"
down_revision: Union[str, None] = "a370ecf98674"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # data guard - normalize any pre-existing values outside the enum to PAPI
    # so the check constraint can be added without IntegrityError. earlier
    # environments allowed free-form agl_type before this PR locked the schema.
    op.execute(
        "UPDATE agl SET agl_type = 'PAPI' "
        "WHERE agl_type NOT IN ('PAPI', 'RUNWAY_EDGE_LIGHTS')"
    )

    op.create_check_constraint(
        "ck_agl_agl_type",
        "agl",
        "agl_type IN ('PAPI', 'RUNWAY_EDGE_LIGHTS')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_agl_agl_type", "agl", type_="check")
