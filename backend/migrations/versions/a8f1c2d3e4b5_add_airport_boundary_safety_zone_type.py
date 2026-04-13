"""add AIRPORT_BOUNDARY safety zone type

Revision ID: a8f1c2d3e4b5
Revises: f7c0935d47ec
Create Date: 2026-04-13 00:00:00.000000

"""

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "a8f1c2d3e4b5"
down_revision = "f7c0935d47ec"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """extend ck_safety_zone_type and enforce one-boundary-per-airport at the db."""
    op.drop_constraint("ck_safety_zone_type", "safety_zone", type_="check")
    op.create_check_constraint(
        "ck_safety_zone_type",
        "safety_zone",
        "type IN ('CTR', 'RESTRICTED', 'PROHIBITED', 'TEMPORARY_NO_FLY', 'AIRPORT_BOUNDARY')",
    )

    # partial unique index: at most one AIRPORT_BOUNDARY per airport
    op.create_index(
        "uq_safety_zone_airport_boundary",
        "safety_zone",
        ["airport_id"],
        unique=True,
        postgresql_where=text("type = 'AIRPORT_BOUNDARY'"),
    )


def downgrade() -> None:
    """revert ck_safety_zone_type; drop any AIRPORT_BOUNDARY rows first."""
    op.drop_index("uq_safety_zone_airport_boundary", table_name="safety_zone")
    op.execute("DELETE FROM safety_zone WHERE type = 'AIRPORT_BOUNDARY'")
    op.drop_constraint("ck_safety_zone_type", "safety_zone", type_="check")
    op.create_check_constraint(
        "ck_safety_zone_type",
        "safety_zone",
        "type IN ('CTR', 'RESTRICTED', 'PROHIBITED', 'TEMPORARY_NO_FLY')",
    )
