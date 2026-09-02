"""The durable side of conversation memory — see redis_memory.py's
module docstring for the Redis/Postgres split this implements. Goes
through the same failover-aware get_db_session() every other Phase 3
write uses, for the same reason: this app has exactly one Postgres
concern (Supabase primary / local standby), not a special case for
transcripts.

One JSON array on ConversationSession.transcript, not one row per
message — see that model's own docstring for the full reasoning
(avoiding an ever-growing transcript_messages table, one row per
browser instead of one row per message across every conversation it's
ever had).
"""

import json
from datetime import datetime, timezone

from sqlalchemy import text

from app.db.models import ConversationSession
from app.db.session import get_db_session


def append_message(session_id: str, role: str, content: str) -> None:
    entry = {
        "role": role,
        "content": content,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    with get_db_session() as db:
        if db.get(ConversationSession, session_id) is None:
            db.add(ConversationSession(id=session_id))
            db.flush()

        # A single atomic UPDATE ... transcript = transcript || :entry,
        # not a Python-side read-modify-write — two concurrent turns for
        # the same session_id (e.g. two open tabs sending messages close
        # together) each get their own atomic append instead of racing
        # to overwrite the same in-memory list and silently dropping
        # one's message.
        db.execute(
            text(
                "UPDATE conversation_sessions "
                "SET transcript = transcript || CAST(:entry AS jsonb) "
                "WHERE id = :session_id"
            ),
            {"entry": json.dumps([entry]), "session_id": session_id},
        )
