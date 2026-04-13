"""add agl_type check constraint

Revision ID: 531703098bae
Revises: a370ecf98674
Create Date: 2026-04-13 12:00:00.000000

"""

import logging
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "531703098bae"
down_revision: Union[str, None] = "a370ecf98674"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    # data guard - normalize any pre-existing values outside the enum to PAPI
    # so the check constraint can be added without IntegrityError. earlier
    # environments allowed free-form agl_type before this PR locked the schema.
    bind = op.get_bind()

    # audit log - surface the count and distinct bad values so a post-migration
    # review can tell whether any data was silently coerced
    bad_rows = bind.execute(
        text(
            "SELECT agl_type, COUNT(*) AS n FROM agl "
            "WHERE agl_type NOT IN ('PAPI', 'RUNWAY_EDGE_LIGHTS') "
            "GROUP BY agl_type"
        )
    ).fetchall()
    if bad_rows:
        total = sum(r.n for r in bad_rows)
        breakdown = ", ".join(f"{r.agl_type}={r.n}" for r in bad_rows)
        logger.warning(
            "coercing %d agl rows with out-of-enum agl_type to PAPI: %s",
            total,
            breakdown,
        )

    op.execute(
        "UPDATE agl SET agl_type = 'PAPI' WHERE agl_type NOT IN ('PAPI', 'RUNWAY_EDGE_LIGHTS')"
    )

    op.create_check_constraint(
        "ck_agl_agl_type",
        "agl",
        "agl_type IN ('PAPI', 'RUNWAY_EDGE_LIGHTS')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_agl_agl_type", "agl", type_="check")
