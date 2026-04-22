"""add supports_geozone_upload to drone_profile

per-drone capability flag gating the 'include geozones in export' option.
seeds True for ArduPilot/PX4/MAVLink-capable manufacturers; everyone else
(consumer DJI, Litchi-only, photogrammetry platforms) stays False.

Revision ID: d2e5f7a9c1b3
Revises: c8f3a1d9b2e4
Create Date: 2026-04-22 22:05:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d2e5f7a9c1b3"
down_revision: Union[str, None] = "c8f3a1d9b2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# manufacturers known to accept embedded mavlink fences on the upload link
_MAVLINK_MANUFACTURER_PATTERNS = (
    "ArduPilot",
    "PX4",
    "Holybro",
    "CubePilot",
    "Pixhawk",
)


def upgrade() -> None:
    """add supports_geozone_upload boolean column, default false, seed mavlink fleets."""
    op.add_column(
        "drone_profile",
        sa.Column(
            "supports_geozone_upload",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    # seed known mavlink-fence-capable manufacturers to true. substring match
    # (wrapped in %) so "ArduPilot Custom", "PX4 Autopilot", etc. all get flagged.
    bind = op.get_bind()
    for pattern in _MAVLINK_MANUFACTURER_PATTERNS:
        bind.execute(
            sa.text(
                "UPDATE drone_profile SET supports_geozone_upload = true "
                "WHERE manufacturer ILIKE :pattern"
            ),
            {"pattern": f"%{pattern}%"},
        )


def downgrade() -> None:
    """drop supports_geozone_upload column."""
    op.drop_column("drone_profile", "supports_geozone_upload")
