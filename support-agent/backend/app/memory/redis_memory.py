"""The hot, short-lived conversation buffer the agent reads every turn —
Redis, not Postgres, per the plan's "Redis vs Postgres, not Redis or
Postgres" decision: TTL expiry is a natural fit for "a chat session that
eventually goes stale," and this is read/written on every single
message, not archival. transcript_store.py holds the durable copy in
Postgres; this module is never the source of truth for anything beyond
the current session's lifetime.
"""

import json

import redis

from app.config import settings

# Sliding expiry — every append refreshes it, so an active conversation
# never expires mid-use, but an abandoned one is reclaimed automatically
# instead of accumulating forever (the plan's own "commonly goes wrong"
# warning: "No Redis expiry policy set, so abandoned sessions accumulate
# forever").
SESSION_TTL_SECONDS = 1800  # 30 minutes of inactivity

# Caps how many past turns get sent back to the model — without this,
# context grows unbounded across a long conversation (the plan's other
# "commonly goes wrong" item), eventually blowing past the model's
# context window or just getting slower/more expensive turn over turn.
# A "turn" here is one message (user or assistant), not a full
# round-trip, so this is ~10 back-and-forth exchanges.
MAX_HISTORY_MESSAGES = 20

_redis_client: redis.Redis | None = None


def get_redis_client() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


def _key(session_id: str) -> str:
    return f"support-agent:conversation:{session_id}"


def get_history(session_id: str) -> list[dict]:
    """Returns [{"role": "user"|"assistant", "content": str}, ...] in
    chronological order, oldest first — directly usable as LangGraph
    message tuples."""
    raw = get_redis_client().get(_key(session_id))
    if not raw:
        return []
    return json.loads(raw)


def append_turn(session_id: str, role: str, content: str) -> None:
    history = get_history(session_id)
    history.append({"role": role, "content": content})
    # Trim from the front (oldest first) — keeps the most recent
    # exchange, which is what actually matters for a support
    # conversation's immediate context.
    if len(history) > MAX_HISTORY_MESSAGES:
        history = history[-MAX_HISTORY_MESSAGES:]
    get_redis_client().set(_key(session_id), json.dumps(history), ex=SESSION_TTL_SECONDS)
