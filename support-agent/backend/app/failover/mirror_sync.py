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
"""

import logging
import threading

from sqlalchemy import bindparam, text
from sqlalchemy.engine import Engine

from app.failover.manager import FailoverManager

logger = logging.getLogger("failover.mirror_sync")

SYNC_INTERVAL_SECONDS = 600  # 10 minutes — matches the main backend's DbMirrorSyncWorker cadence.

# Parent-before-child for upserts; reversed for delete-reconciliation —
# see this module's docstring.
TABLES_IN_FK_ORDER = ["conversation_sessions", "tickets"]


def _fetch_all(engine: Engine, table: str) -> list[dict]:
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT * FROM {table}"))
        return [dict(row._mapping) for row in result]


def _upsert_rows(engine: Engine, table: str, rows: list[dict]) -> None:
    if not rows:
        return
    columns = list(rows[0].keys())
    col_list = ", ".join(columns)
    placeholders = ", ".join(f":{c}" for c in columns)
    update_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in columns if c != "id")
    stmt = text(
        f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) "
        f"ON CONFLICT (id) DO UPDATE SET {update_clause}"
    )
    with engine.begin() as conn:
        for row in rows:
            conn.execute(stmt, row)


def _delete_stale(engine: Engine, table: str, keep_ids: set) -> int:
    with engine.begin() as conn:
        if not keep_ids:
            result = conn.execute(text(f"DELETE FROM {table}"))
            return result.rowcount
        # expanding=True lets SQLAlchemy turn a single bound list into the
        # right number of positional placeholders for IN (...) — a plain
        # bindparams(ids=[...]) without it sends the list as one opaque
        # parameter, which the driver can't expand into SQL itself.
        stmt = text(f"DELETE FROM {table} WHERE id NOT IN :ids").bindparams(
            bindparam("ids", expanding=True)
        )
        result = conn.execute(stmt, {"ids": list(keep_ids)})
        return result.rowcount


def sync_once(manager: FailoverManager) -> None:
    if manager.mode != "primary":
        logger.info("Skipping mirror sync — currently running on local standby")
        return

    primary_ids_by_table: dict[str, set] = {}

    for table in TABLES_IN_FK_ORDER:
        rows = _fetch_all(manager.primary_engine, table)
        _upsert_rows(manager.local_engine, table, rows)
        primary_ids_by_table[table] = {row["id"] for row in rows}
        logger.info("mirror sync: upserted %d row(s) into local.%s", len(rows), table)

    for table in reversed(TABLES_IN_FK_ORDER):
        deleted = _delete_stale(manager.local_engine, table, primary_ids_by_table[table])
        if deleted:
            logger.info("mirror sync: deleted %d stale row(s) from local.%s", deleted, table)


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
