"""create scans table

Revision ID: b2371732b9b2
Revises: 898230ed20cc
Create Date: 2026-09-23 23:02:38.890300

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2371732b9b2'
down_revision: Union[str, Sequence[str], None] = '898230ed20cc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('scans',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('project_id', sa.UUID(), nullable=False),
    sa.Column('status', sa.String(), nullable=False),
    sa.Column('scanner', sa.String(), nullable=False, server_default='semgrep'),
    sa.Column('security_score', sa.Integer(), nullable=True),
    sa.Column('critical_count', sa.Integer(), nullable=False, server_default='0'),
    sa.Column('high_count', sa.Integer(), nullable=False, server_default='0'),
    sa.Column('medium_count', sa.Integer(), nullable=False, server_default='0'),
    sa.Column('low_count', sa.Integer(), nullable=False, server_default='0'),
    sa.Column('total_findings', sa.Integer(), nullable=False, server_default='0'),
    sa.Column('summary', sa.Text(), nullable=True),
    sa.Column('started_at', sa.DateTime(), nullable=True),
    sa.Column('completed_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('scans')
