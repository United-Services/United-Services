"""Automatic Supabase (primary) -> local Postgres (standby) failover for
the support agent's own tickets/sessions database — same design as the
main United-Services backend's FailoverService (backend/src/failover/
failover.service.ts): independent health-check ping loop, N consecutive
failures/successes to flip mode, reentrancy-guarded so a slow check
can't double-count toward the threshold from an overlapping tick.

Deliberately does NOT cover Qdrant or the LLM call — Supabase is the
only piece of this app's own state (tickets, escalations) that has a
real "primary managed service could be unreachable" story worth
building failover for, matching why the original design only covered
Postgres/Redis and not, say, the LLM provider itself.
"""

import logging
import threading
import time
from typing import Literal

from sqlalchemy import Engine, create_engine, text

logger = logging.getLogger("failover")

FailoverMode = Literal["primary", "local"]

# Same thresholds as the main backend's FailoverService, for the same
# reason: a single blip must never trigger a failover, and recovery is
# held to the same bar so the app doesn't flap back and forth if primary
# is only intermittently reachable.
FAILURE_THRESHOLD = 3
RECOVERY_THRESHOLD = 3
CHECK_INTERVAL_SECONDS = 5


class FailoverManager:
    def __init__(self, primary_url: str, local_url: str):
        self._primary_engine: Engine = create_engine(primary_url, pool_pre_ping=True, pool_size=2)
        self._local_engine: Engine = create_engine(local_url, pool_pre_ping=True, pool_size=2)

        self._mode: FailoverMode = "primary"
        self._failure_count = 0
        self._success_count = 0
        # Reentrancy guard — see failover.service.ts's identical comment:
        # a check slower than CHECK_INTERVAL_SECONDS must not let a
        # second tick start concurrently and double-count toward the
        # threshold.
        self._check_in_flight = False

        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    @property
    def mode(self) -> FailoverMode:
        return self._mode

    @property
    def active_engine(self) -> Engine:
        return self._local_engine if self._mode == "local" else self._primary_engine

    @property
    def primary_engine(self) -> Engine:
        return self._primary_engine

    @property
    def local_engine(self) -> Engine:
        return self._local_engine

    def start(self) -> None:
        self._thread = threading.Thread(target=self._loop, daemon=True, name="failover-check")
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=CHECK_INTERVAL_SECONDS + 1)

    def _loop(self) -> None:
        while not self._stop_event.is_set():
            self._check()
            self._stop_event.wait(CHECK_INTERVAL_SECONDS)

    def _check(self) -> None:
        if self._check_in_flight:
            return
        self._check_in_flight = True
        try:
            self._ping(self._primary_engine)
            self._failure_count = 0
            if self._mode == "local":
                self._success_count += 1
                if self._success_count >= RECOVERY_THRESHOLD:
                    self._mode = "primary"
                    self._success_count = 0
                    logger.warning("Supabase primary reachable again — failing back from local standby")
        except Exception as err:
            self._success_count = 0
            if self._mode == "primary":
                self._failure_count += 1
                if self._failure_count >= FAILURE_THRESHOLD:
                    self._mode = "local"
                    self._failure_count = 0
                    logger.error(
                        "Supabase primary unreachable after %d checks — failing over to local standby: %s",
                        FAILURE_THRESHOLD,
                        err,
                    )
        finally:
            self._check_in_flight = False

    @staticmethod
    def _ping(engine: Engine) -> None:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))


# Module-level singleton — mirrors PrismaService/RedisService being the
# one shared instance the whole app routes through in the original
# design. Created in app/db/session.py (which owns the actual
# primary_url/local_url config values) and imported from there by
# main.py's startup hook.
_manager: FailoverManager | None = None


def init_failover_manager(primary_url: str, local_url: str) -> FailoverManager:
    global _manager
    _manager = FailoverManager(primary_url, local_url)
    return _manager


def get_failover_manager() -> FailoverManager:
    if _manager is None:
        raise RuntimeError("FailoverManager not initialized — call init_failover_manager() at app startup")
    return _manager
