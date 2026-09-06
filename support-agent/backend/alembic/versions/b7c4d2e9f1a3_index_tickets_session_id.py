"""index tickets.session_id

Revision ID: b7c4d2e9f1a3
Revises: 0a5f1148fe4b
Create Date: 2026-09-06 12:30:00.000000

tickets.session_id is a foreign key to conversation_sessions.id with no
supporting index — there was not a single op.create_index across the
four revisions before this one. Every lookup of a session's tickets
sequential-scanned tickets, and every DELETE/UPDATE of a
conversation_sessions row had to scan all of tickets to enforce the FK
(mirror_sync's delete-reconciliation does exactly that every cycle).
The main backend hit this same class of bug and fixed it in
20260827121323_add_missing_foreign_key_indexes; this service never got
the equivalent pass.

CONCURRENTLY so it takes no write lock on a populated table — which
requires running outside a transaction, hence autocommit_block().
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'b7c4d2e9f1a3'
down_revision: Union[str, None] = '0a5f1148fe4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.create_index(
            "ix_tickets_session_id",
            "tickets",
            ["session_id"],
            unique=False,
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index("ix_tickets_session_id", table_name="tickets", postgresql_concurrently=True)
