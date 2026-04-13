"""add AIRPORT_BOUNDARY safety zone type

Revision ID: a8f1c2d3e4b5
Revises: f7c0935d47ec
Create Date: 2026-04-13 00:00:00.000000

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "a8f1c2d3e4b5"
down_revision = "f7c0935d47ec"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """extend ck_safety_zone_type to include AIRPORT_BOUNDARY."""
    op.drop_constraint("ck_safety_zone_type", "safety_zone", type_="check")
    op.create_check_constraint(
        "ck_safety_zone_type",
        "safety_zone",
        "type IN ('CTR', 'RESTRICTED', 'PROHIBITED', 'TEMPORARY_NO_FLY', 'AIRPORT_BOUNDARY')",
    )


def downgrade() -> None:
    """revert ck_safety_zone_type; drop any AIRPORT_BOUNDARY rows first."""
    op.execute("DELETE FROM safety_zone WHERE type = 'AIRPORT_BOUNDARY'")
    op.drop_constraint("ck_safety_zone_type", "safety_zone", type_="check")
    op.create_check_constraint(
        "ck_safety_zone_type",
        "safety_zone",
        "type IN ('CTR', 'RESTRICTED', 'PROHIBITED', 'TEMPORARY_NO_FLY')",
    )
