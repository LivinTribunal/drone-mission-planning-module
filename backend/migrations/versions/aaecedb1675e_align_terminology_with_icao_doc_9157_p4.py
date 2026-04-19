"""align terminology with icao doc 9157 p4

Revision ID: aaecedb1675e
Revises: 8e1cc0628ef4, b1c2d3e4f5a6
Create Date: 2026-04-19 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "aaecedb1675e"
down_revision: Union[str, None] = ("8e1cc0628ef4", "b1c2d3e4f5a6")
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
        "UPDATE insp_template_methods SET method = 'PAPI_HORIZONTAL_RANGE' "
        "WHERE method = 'ANGULAR_SWEEP'"
    )

    # part B: convert unit_number (integer) to unit_designator (string)
    op.add_column("lha", sa.Column("unit_designator", sa.String(4), nullable=True))

    # papi lhas: map 1->D, 2->C, 3->B, 4->A per icao
    for num, letter in UNIT_NUMBER_TO_DESIGNATOR.items():
        op.execute(
            f"UPDATE lha SET unit_designator = '{letter}' "
            f"FROM agl WHERE lha.agl_id = agl.id "
            f"AND agl.agl_type = 'PAPI' AND lha.unit_number = {num}"
        )

    # non-papi lhas: keep numeric designator as string
    op.execute(
        "UPDATE lha SET unit_designator = CAST(unit_number AS VARCHAR) "
        "FROM agl WHERE lha.agl_id = agl.id AND agl.agl_type != 'PAPI'"
    )

    # fallback for any remaining nulls
    op.execute(
        "UPDATE lha SET unit_designator = CAST(unit_number AS VARCHAR) "
        "WHERE unit_designator IS NULL"
    )

    op.alter_column("lha", "unit_designator", nullable=False)
    op.drop_column("lha", "unit_number")
    op.create_check_constraint(
        "ck_lha_unit_designator", "lha",
        "length(unit_designator) > 0",
    )


def downgrade() -> None:
    """revert papi_horizontal_range -> angular_sweep, unit_designator -> unit_number."""
    op.drop_constraint("ck_lha_unit_designator", "lha", type_="check")
    op.add_column("lha", sa.Column("unit_number", sa.Integer(), nullable=True))

    # papi lhas: revert letter -> number
    designator_to_number = {"A": 4, "B": 3, "C": 2, "D": 1}
    for letter, num in designator_to_number.items():
        op.execute(
            f"UPDATE lha SET unit_number = {num} "
            f"FROM agl WHERE lha.agl_id = agl.id "
            f"AND agl.agl_type = 'PAPI' AND lha.unit_designator = '{letter}'"
        )

    # non-papi lhas: cast string back to integer
    op.execute(
        "UPDATE lha SET unit_number = CAST(unit_designator AS INTEGER) "
        "FROM agl WHERE lha.agl_id = agl.id AND agl.agl_type != 'PAPI'"
    )

    op.execute("UPDATE lha SET unit_number = 1 WHERE unit_number IS NULL")

    op.alter_column("lha", "unit_number", nullable=False)
    op.drop_column("lha", "unit_designator")

    op.execute(
        "UPDATE inspection SET method = 'ANGULAR_SWEEP' "
        "WHERE method = 'PAPI_HORIZONTAL_RANGE'"
    )
    op.execute(
        "UPDATE insp_template_methods SET method = 'ANGULAR_SWEEP' "
        "WHERE method = 'PAPI_HORIZONTAL_RANGE'"
    )
