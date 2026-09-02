from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy.orm import Session, sessionmaker

from app.failover.manager import get_failover_manager


@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """Used by tools, not by a FastAPI Depends() — these are called from
    inside LangGraph's tool-execution loop, not directly from a request
    handler, so there's no request-scoped dependency injection to hook
    into here. Commits on success, rolls back on any exception (so a
    tool that errors partway through never leaves a half-written row),
    always closes.

    Resolves the active engine fresh on every call, not once at import
    time — this is what makes failover actually transparent to
    create_ticket/get_ticket_status/escalate_to_human: the *next* call
    after a mode flip simply binds to the other engine, exactly like the
    main backend's Prisma/Redis Proxy re-checking FailoverService's mode
    on every property access.
    """
    engine = get_failover_manager().active_engine
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
