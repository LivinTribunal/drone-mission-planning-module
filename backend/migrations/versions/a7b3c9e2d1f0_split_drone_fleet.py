"""split drone fleet: airport-scoped Drone + shared DroneProfile templates

Revision ID: a7b3c9e2d1f0
Revises: 15dbde1d3c5b, 467fb3296d54
Create Date: 2026-04-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "a7b3c9e2d1f0"
down_revision: Union[str, Sequence[str], None] = ("15dbde1d3c5b", "467fb3296d54")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # create the new fleet-level table
    op.create_table(
        "drone",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("airport_id", sa.UUID(), nullable=False),
        sa.Column("drone_profile_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("serial_number", sa.String(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["airport_id"], ["airport.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["drone_profile_id"], ["drone_profile.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("airport_id", "name", name="uq_drone_airport_name"),
    )
    op.create_index("ix_drone_airport_id", "drone", ["airport_id"])
    op.create_index("ix_drone_drone_profile_id", "drone", ["drone_profile_id"])

    # add drone_id columns to mission + airport (nullable during backfill)
    op.add_column("mission", sa.Column("drone_id", sa.UUID(), nullable=True))
    op.add_column("airport", sa.Column("default_drone_id", sa.UUID(), nullable=True))

    # materialize a fleet drone per (airport, profile) combo that is currently referenced
    # either from a mission row or from airport.default_drone_profile_id. disambiguate
    # duplicate profile names by appending a numeric suffix scoped to the airport.
    op.execute(
        """
        INSERT INTO drone (id, airport_id, drone_profile_id, name)
        SELECT
            gen_random_uuid(),
            pairs.airport_id,
            pairs.drone_profile_id,
            COALESCE(dp.name, 'Drone')
                || CASE WHEN pairs.rn > 1 THEN ' #' || pairs.rn::text ELSE '' END
        FROM (
            SELECT
                airport_id,
                drone_profile_id,
                ROW_NUMBER() OVER (
                    PARTITION BY airport_id, COALESCE((
                        SELECT name FROM drone_profile WHERE id = drone_profile_id
                    ), 'Drone')
                    ORDER BY drone_profile_id
                ) AS rn
            FROM (
                SELECT airport_id, drone_profile_id
                FROM mission
                WHERE drone_profile_id IS NOT NULL
                UNION
                SELECT id AS airport_id, default_drone_profile_id AS drone_profile_id
                FROM airport
                WHERE default_drone_profile_id IS NOT NULL
            ) base
        ) pairs
        LEFT JOIN drone_profile dp ON dp.id = pairs.drone_profile_id;
        """
    )

    # repoint mission.drone_id from the (airport, drone_profile) pair
    op.execute(
        """
        UPDATE mission m
        SET drone_id = d.id
        FROM drone d
        WHERE m.airport_id = d.airport_id
          AND m.drone_profile_id = d.drone_profile_id;
        """
    )

    # repoint airport.default_drone_id from the (airport, default_drone_profile) pair
    op.execute(
        """
        UPDATE airport a
        SET default_drone_id = d.id
        FROM drone d
        WHERE a.id = d.airport_id
          AND a.default_drone_profile_id = d.drone_profile_id;
        """
    )

    # drop the old fks and columns now that backfill is complete
    op.drop_constraint("mission_drone_profile_id_fkey", "mission", type_="foreignkey")
    op.create_foreign_key(
        "mission_drone_id_fkey",
        "mission",
        "drone",
        ["drone_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_column("mission", "drone_profile_id")

    op.drop_constraint(
        "airport_default_drone_profile_id_fkey", "airport", type_="foreignkey"
    )
    op.create_foreign_key(
        "airport_default_drone_id_fkey",
        "airport",
        "drone",
        ["default_drone_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_column("airport", "default_drone_profile_id")


def downgrade() -> None:
    # reconstruct drone_profile_id on mission + default_drone_profile_id on airport
    op.add_column(
        "mission",
        sa.Column("drone_profile_id", postgresql.UUID(), nullable=True),
    )
    op.add_column(
        "airport",
        sa.Column("default_drone_profile_id", postgresql.UUID(), nullable=True),
    )

    op.execute(
        """
        UPDATE mission m
        SET drone_profile_id = d.drone_profile_id
        FROM drone d
        WHERE m.drone_id = d.id;
        """
    )
    op.execute(
        """
        UPDATE airport a
        SET default_drone_profile_id = d.drone_profile_id
        FROM drone d
        WHERE a.default_drone_id = d.id;
        """
    )

    op.drop_constraint("mission_drone_id_fkey", "mission", type_="foreignkey")
    op.create_foreign_key(
        "mission_drone_profile_id_fkey",
        "mission",
        "drone_profile",
        ["drone_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_column("mission", "drone_id")

    op.drop_constraint("airport_default_drone_id_fkey", "airport", type_="foreignkey")
    op.create_foreign_key(
        "airport_default_drone_profile_id_fkey",
        "airport",
        "drone_profile",
        ["default_drone_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_column("airport", "default_drone_id")

    op.drop_index("ix_drone_drone_profile_id", table_name="drone")
    op.drop_index("ix_drone_airport_id", table_name="drone")
    op.drop_table("drone")
