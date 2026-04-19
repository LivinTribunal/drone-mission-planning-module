"""align terminology with icao doc 9157 p4

Revision ID: aaecedb1675e
Revises: f7c0935d47ec
Create Date: 2026-04-19 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "aaecedb1675e"
down_revision: Union[str, None] = "f7c0935d47ec"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# icao designator mapping: unit 1 (closest to runway) -> D, 4 (farthest) -> A
UNIT_NUMBER_TO_DESIGNATOR = {1: "D", 2: "C", 3: "B", 4: "A"}


def upgrade() -> None:
    """rename angular_sweep -> papi_horizontal_range, unit_number -> unit_designator."""
    # part A: rename inspection method
    op.execute(
        "UPDATE inspection SET method = 'PAPI_HORIZONTAL_RANGE' "
        "WHERE method = 'ANGULAR_SWEEP'"
    )
    op.execute(
        "UPDATE inspection_template_methods SET method = 'PAPI_HORIZONTAL_RANGE' "
        "WHERE method = 'ANGULAR_SWEEP'"
    )

    # part B: convert unit_number (integer) to unit_designator (string)
    op.add_column("lha", sa.Column("unit_designator", sa.String(1), nullable=True))

    for num, letter in UNIT_NUMBER_TO_DESIGNATOR.items():
        op.execute(
            f"UPDATE lha SET unit_designator = '{letter}' WHERE unit_number = {num}"
        )
    # reject data that cannot be safely migrated
    conn = op.get_bind()
    bad_rows = conn.execute(
        sa.text("SELECT COUNT(*) FROM lha WHERE unit_number > 4")
    ).scalar()
    if bad_rows:
        raise RuntimeError(
            f"migration blocked: {bad_rows} lha row(s) have unit_number > 4 - "
            "clean up before migrating"
        )

    # fallback for rows with null unit_number (e.g. unit_number was null)
    op.execute(
        "UPDATE lha SET unit_designator = 'D' "
        "WHERE unit_designator IS NULL"
    )

    op.alter_column("lha", "unit_designator", nullable=False)
    op.drop_column("lha", "unit_number")
    op.create_check_constraint(
        "ck_lha_unit_designator", "lha",
        "unit_designator IN ('A', 'B', 'C', 'D')",
    )


def downgrade() -> None:
    """revert papi_horizontal_range -> angular_sweep, unit_designator -> unit_number."""
    op.drop_constraint("ck_lha_unit_designator", "lha", type_="check")
    op.add_column("lha", sa.Column("unit_number", sa.Integer(), nullable=True))

    designator_to_number = {"A": 4, "B": 3, "C": 2, "D": 1}
    for letter, num in designator_to_number.items():
        op.execute(
            f"UPDATE lha SET unit_number = {num} WHERE unit_designator = '{letter}'"
        )
    op.execute("UPDATE lha SET unit_number = 1 WHERE unit_number IS NULL")

    op.alter_column("lha", "unit_number", nullable=False)
    op.drop_column("lha", "unit_designator")

    op.execute(
        "UPDATE inspection SET method = 'ANGULAR_SWEEP' "
        "WHERE method = 'PAPI_HORIZONTAL_RANGE'"
    )
    op.execute(
        "UPDATE inspection_template_methods SET method = 'ANGULAR_SWEEP' "
        "WHERE method = 'PAPI_HORIZONTAL_RANGE'"
    )
