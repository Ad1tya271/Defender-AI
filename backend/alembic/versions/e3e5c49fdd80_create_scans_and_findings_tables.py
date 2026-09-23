"""create findings table

Revision ID: e3e5c49fdd80
Revises: b2371732b9b2
Create Date: 2026-09-22 21:08:34.502720

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3e5c49fdd80'
down_revision: Union[str, Sequence[str], None] = 'b2371732b9b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('findings',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('scan_id', sa.UUID(), nullable=False),
    sa.Column('scanner', sa.String(), nullable=False),
    sa.Column('rule_id', sa.String(), nullable=True),
    sa.Column('title', sa.String(), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('severity', sa.String(), nullable=False),
    sa.Column('file_path', sa.String(), nullable=True),
    sa.Column('start_line', sa.Integer(), nullable=True),
    sa.Column('end_line', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['scan_id'], ['scans.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('findings')
