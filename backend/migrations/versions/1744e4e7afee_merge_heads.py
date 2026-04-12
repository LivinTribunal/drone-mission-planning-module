"""merge heads

Revision ID: 1744e4e7afee
Revises: b5c6d7e8f9a0, c4d5e6f7a8b0
Create Date: 2026-04-11 23:40:02.249044

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2


revision: str = '1744e4e7afee'
down_revision: Union[str, None] = ('b5c6d7e8f9a0', 'c4d5e6f7a8b0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
