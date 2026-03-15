"""add airport_id to mission

schema addition - mission.airport_id FK NOT NULL referencing airport.id.
not in original ERD. added so missions are directly queryable by airport
without joining through inspections/templates/AGLs/surfaces. missions are
always created in the context of a selected airport.

Revision ID: a1b2c3d4e5f6
Revises: 26025150d7ba
Create Date: 2026-03-15 01:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "26025150d7ba"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("mission", sa.Column("airport_id", sa.UUID(), nullable=False))
    op.create_foreign_key(
        "fk_mission_airport_id",
        "mission",
        "airport",
        ["airport_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_mission_airport_id", "mission", type_="foreignkey")
    op.drop_column("mission", "airport_id")
