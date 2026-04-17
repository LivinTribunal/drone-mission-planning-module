"""merge perpendicular crossing and speed override branches

Revision ID: b435c08f47f1
Revises: 538f931cfdcc, f1a2b3c4d5e6
Create Date: 2026-04-17 14:00:13.470012

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2


revision: str = 'b435c08f47f1'
down_revision: Union[str, None] = ('538f931cfdcc', 'f1a2b3c4d5e6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
