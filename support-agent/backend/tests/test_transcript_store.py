"""transcript_store.append_message against a real Postgres — the local
standby (docker compose's `postgres` service) rather than Supabase, so
these tests never touch the real shared production database. Skipped
automatically if that database isn't reachable (e.g. CI without the
compose stack up)."""

import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.db.models import Base, ConversationSession
from app.memory import transcript_store

pytestmark = pytest.mark.integration


@pytest.fixture
def db_session_factory():
    engine = create_engine(settings.local_database_url)
    try:
        with engine.connect():
            pass
    except Exception:
        pytest.skip("local standby Postgres not reachable — start it with `docker compose up postgres`")
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine)
    engine.dispose()


@pytest.fixture(autouse=True)
def _use_local_db(monkeypatch, db_session_factory):
    # app.db.session did `from app.failover.manager import
    # get_failover_manager` (a direct name import) — patching the
    # attribute on app.failover.manager itself wouldn't affect that
    # already-bound name, so the name inside app.db.session's own
    # namespace has to be the patch target instead.
    import app.db.session as db_session_module

    class _FixedEngineManager:
        active_engine = db_session_factory.kw["bind"]

    monkeypatch.setattr(db_session_module, "get_failover_manager", lambda: _FixedEngineManager())


def test_append_message_creates_session_and_appends(db_session_factory):
    user_id = f"test-user-{uuid.uuid4()}"

    transcript_store.append_message(user_id, "user", "hello")
    transcript_store.append_message(user_id, "assistant", "hi there")

    with db_session_factory() as db:
        session = db.get(ConversationSession, user_id)
        assert session is not None
        assert [m["role"] for m in session.transcript] == ["user", "assistant"]
        assert [m["content"] for m in session.transcript] == ["hello", "hi there"]
        db.execute(text("DELETE FROM conversation_sessions WHERE id = :id"), {"id": user_id})
        db.commit()


def test_append_is_a_single_row_across_many_messages(db_session_factory):
    # The whole point of the consolidation from transcript_messages (one
    # row per message) to one JSON column per user — every message for
    # this user_id must land in the same single row, not accumulate new
    # rows.
    user_id = f"test-user-{uuid.uuid4()}"

    for i in range(5):
        transcript_store.append_message(user_id, "user", f"message {i}")

    with db_session_factory() as db:
        count = db.execute(
            text("SELECT COUNT(*) FROM conversation_sessions WHERE id = :id"), {"id": user_id}
        ).scalar_one()
        assert count == 1
        session = db.get(ConversationSession, user_id)
        assert len(session.transcript) == 5
        db.execute(text("DELETE FROM conversation_sessions WHERE id = :id"), {"id": user_id})
        db.commit()
