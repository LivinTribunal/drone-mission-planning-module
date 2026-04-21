"""drop optical_zoom + focus_distance_mode from camera_preset, drop
focus_distance_mode from inspection_configuration, repurpose focus_mode
to AUTO/INFINITY.

DESTRUCTIVE: dropped column values are lost and legacy focus_mode values
outside {AUTO, INFINITY} are nulled. Downgrade is one-way.

Revision ID: b5d7e9f1c3a2
Revises: 30a1f0aafa7c
Create Date: 2026-04-21 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b5d7e9f1c3a2"
down_revision: Union[str, None] = "30a1f0aafa7c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _drop_column_if_exists(bind, table: str, column: str) -> None:
    """drop a column only when it exists - safe for fresh DBs where earlier
    iterations of the preset schema may have never been applied.
    """
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns(table)}
    if column in cols:
        op.drop_column(table, column)


def upgrade() -> None:
    """drop zoom + focus_distance_mode from preset; drop focus_distance_mode
    from inspection_configuration; null legacy focus_mode values since the
    enum now means AUTO/INFINITY instead of MANUAL/AUTO_CENTER/AUTO_AREA.
    """
    bind = op.get_bind()
    _drop_column_if_exists(bind, "camera_preset", "optical_zoom")
    _drop_column_if_exists(bind, "camera_preset", "focus_distance_mode")
    _drop_column_if_exists(bind, "inspection_configuration", "focus_distance_mode")

    # enum semantics changed - wipe stale values so reads don't fail validation
    op.execute(
        "UPDATE camera_preset SET focus_mode = NULL "
        "WHERE focus_mode NOT IN ('AUTO', 'INFINITY')"
    )
    op.execute(
        "UPDATE inspection_configuration SET focus_mode = NULL "
        "WHERE focus_mode NOT IN ('AUTO', 'INFINITY')"
    )
    op.execute(
        "UPDATE mission SET default_focus_mode = NULL "
        "WHERE default_focus_mode NOT IN ('AUTO', 'INFINITY')"
    )


def downgrade() -> None:
    """one-way: forward drops data and rewrites focus_mode values with no
    preserving inverse. refuse rather than leave a half-restored schema.
    """
    raise NotImplementedError(
        "b5d7e9f1c3a2 is one-way: dropped columns and rewritten focus_mode "
        "values cannot be restored. restore from backup if you need the old shape."
    )
