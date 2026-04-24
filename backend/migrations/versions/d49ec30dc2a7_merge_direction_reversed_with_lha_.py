"""merge direction_reversed with lha_setting_angle_override heads

Revision ID: d49ec30dc2a7
Revises: 15dbde1d3c5b, 467fb3296d54
Create Date: 2026-04-24 12:47:19.997765

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2  # noqa: F401


revision: str = 'd49ec30dc2a7'
down_revision: Union[str, None] = ('15dbde1d3c5b', '467fb3296d54')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
