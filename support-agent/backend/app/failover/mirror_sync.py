"""Keeps the local standby's data reasonably fresh while Supabase is
primary — same reasoning as the main backend's DbMirrorSyncService: a
failover is only actually useful if the local copy isn't stale by the
time it's needed. Much smaller job than the original (two tables, one
FK) but the same core properties: idempotent upsert (so a re-run
updates in place, never duplicates), parent-before-child order for
upserts (conversation_sessions before tickets, since tickets.session_id
references it), and the reverse order for delete-reconciliation.

Only runs while Postgres is in `primary` mode — syncing FROM local while
the app is already running off local would overwrite the very
fallback-mode writes a real reconciliation step would need to replay
later. (This project doesn't build that reconciliation step — see
README's "Known limitation" note; it's a smaller, portfolio-scale
Postgres failover, not the full write-log/replay system the main site
has.)

Built entirely on SQLAlchemy's Core query builder against the real ORM
model tables (ConversationSession.__table__, Ticket.__table__) — no
sqlalchemy.text()/raw SQL string-building anywhere in this module.
Earlier versions built each query as an f-string with the table name
interpolated in, guarded by a runtime allowlist check
(_validated_table()) since Semgrep's avoid-sqlalchemy-text rule can't
see that a fixed list makes that safe — reworked to use real model
Table objects instead so the question doesn't arise at all: there is no
string to interpolate a table name into anymore, the same guarantee the
main backend's Prisma-generated queries get by construction.
"""

import logging
import threading

from sqlalchemy import Table, delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Engine

from app.db.models import ConversationSession, Ticket
from app.failover.manager import FailoverManager

logger = logging.getLogger("failover.mirror_sync")

SYNC_INTERVAL_SECONDS = 600  # 10 minutes — matches the main backend's DbMirrorSyncWorker cadence.

# Parent-before-child for upserts; reversed for delete-reconciliation —
# see this module's docstring. Real ORM model classes, not table-name
# strings — the fixed list itself is still what keeps this bounded to
# exactly these two tables, same as before, just enforced by Python's
# own type system now instead of a runtime string check.
MODELS_IN_FK_ORDER = [ConversationSession, Ticket]


def _fetch_all(engine: Engine, table: Table) -> list[dict]:
    with engine.connect() as conn:
        result = conn.execute(select(table))
        return [dict(row) for row in result.mappings()]


def _upsert_rows(engine: Engine, table: Table, rows: list[dict]) -> None:
    if not rows:
        return
    columns = list(rows[0].keys())
    stmt = pg_insert(table).values(rows)
    update_cols = {c: stmt.excluded[c] for c in columns if c != "id"}
    stmt = stmt.on_conflict_do_update(index_elements=["id"], set_=update_cols)
    with engine.begin() as conn:
        conn.execute(stmt)


def _delete_stale(engine: Engine, table: Table, keep_ids: set) -> int:
    with engine.begin() as conn:
        if not keep_ids:
            result = conn.execute(delete(table))
        else:
            result = conn.execute(delete(table).where(table.c.id.not_in(keep_ids)))
        return result.rowcount


def sync_once(manager: FailoverManager) -> None:
    if manager.mode != "primary":
        logger.info("Skipping mirror sync — currently running on local standby")
        return

    primary_ids_by_table: dict[str, set] = {}

    for model in MODELS_IN_FK_ORDER:
        table = model.__table__
        rows = _fetch_all(manager.primary_engine, table)
        _upsert_rows(manager.local_engine, table, rows)
        primary_ids_by_table[model.__tablename__] = {row["id"] for row in rows}
        logger.info("mirror sync: upserted %d row(s) into local.%s", len(rows), model.__tablename__)

    for model in reversed(MODELS_IN_FK_ORDER):
        table = model.__table__
        deleted = _delete_stale(manager.local_engine, table, primary_ids_by_table[model.__tablename__])
        if deleted:
            logger.info("mirror sync: deleted %d stale row(s) from local.%s", deleted, model.__tablename__)


def start_mirror_sync_loop(manager: FailoverManager) -> threading.Thread:
    stop_event = threading.Event()

    def _loop() -> None:
        while not stop_event.wait(SYNC_INTERVAL_SECONDS):
            try:
                sync_once(manager)
            except Exception:
                logger.exception("mirror sync run failed — will retry next interval")

    thread = threading.Thread(target=_loop, daemon=True, name="mirror-sync")
    thread.start()
    return thread
