"""consolidate transcript into conversation_sessions json column

Revision ID: 0a5f1148fe4b
Revises: 65f636541bd7
Create Date: 2026-09-02 23:49:17.714856

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0a5f1148fe4b'
down_revision: Union[str, None] = '65f636541bd7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# The include_object filter in env.py (added after a real autogenerate
# run against this same database tried to drop all 22 of the main
# backend's Prisma-managed tables — see that filter's own comment)
# deliberately skips any table that's in the DB but not in this app's
# own Base.metadata, so it can't ever again propose dropping something
# this app doesn't own. That protection also means it can't autogenerate
# dropping transcript_messages either, since from its perspective that
# table looks the same as a foreign one at this point (already removed
# from models.py) — so that drop, and the column's server-side default,
# are both added here by hand instead of trusting autogenerate for them.


def upgrade() -> None:
    op.add_column(
        'conversation_sessions',
        sa.Column(
            'transcript',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.drop_table('transcript_messages')


def downgrade() -> None:
    op.create_table(
        'transcript_messages',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('session_id', sa.String(), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['conversation_sessions.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.drop_column('conversation_sessions', 'transcript')
