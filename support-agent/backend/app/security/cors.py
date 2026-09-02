"""CORS, backed by the AllowedOrigin table — not a static config list.
Same pattern as the main United-Services backend: origins are managed
directly in the database (no admin UI, no API endpoint to add one — see
README's Phase 6 section for the exact insert command), which is what
"added in the db" means in practice here. A misconfigured/compromised
env var can't silently widen the CORS allowlist the way it could with
the Phase 6 draft's original static CORS_ALLOWED_ORIGINS setting; adding
an origin is a deliberate, auditable database write.

Starlette's stock CORSMiddleware only accepts a fixed list of origins
at app-construction time — there's no supported hook for "check this
per request against something that can change without a restart." This
is a small custom ASGI middleware instead, doing the same thing stock
CORSMiddleware does (handle the OPTIONS preflight directly, add
Access-Control-Allow-Origin to real responses) but checking against a
locally-cached copy of the table rather than a fixed list.
"""

import logging
import threading
import time

from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.db.models import AllowedOrigin
from app.db.session import get_db_session

logger = logging.getLogger("cors")

# Refreshed on this interval, not queried per-request — CORS is checked
# on every single request (including every SSE stream), and this app's
# Postgres is already carrying real traffic (tickets, transcripts,
# failover pings); adding a synchronous DB round-trip to that hot path
# for a list that changes rarely isn't worth it. 30s is a reasonable
# bound on "how stale can the allowlist be after someone adds a row."
REFRESH_INTERVAL_SECONDS = 30

_allowed_origins: set[str] = set()
_lock = threading.Lock()


def _refresh_once() -> None:
    with get_db_session() as db:
        origins = {row.origin for row in db.execute(select(AllowedOrigin)).scalars()}
    with _lock:
        global _allowed_origins
        _allowed_origins = origins


def is_origin_allowed(origin: str | None) -> bool:
    if origin is None:
        return False
    with _lock:
        return origin in _allowed_origins


def start_cors_refresh_loop() -> threading.Thread:
    # First load happens synchronously before the thread starts, not on
    # its own first tick — without this, every request in the first
    # REFRESH_INTERVAL_SECONDS after boot would see an empty allowlist
    # and get rejected.
    try:
        _refresh_once()
    except Exception:
        logger.exception("initial CORS origin load failed — allowlist starts empty")

    stop_event = threading.Event()

    def _loop() -> None:
        while not stop_event.wait(REFRESH_INTERVAL_SECONDS):
            try:
                _refresh_once()
            except Exception:
                logger.exception("CORS origin refresh failed — keeping previous allowlist")

    thread = threading.Thread(target=_loop, daemon=True, name="cors-refresh")
    thread.start()
    return thread


class DynamicCORSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin")
        allowed = is_origin_allowed(origin)

        if request.method == "OPTIONS":
            # Preflight — answered directly, same as stock
            # CORSMiddleware, never reaches the actual route handler.
            if not allowed:
                return Response(status_code=400, content="CORS origin not allowed")
            return Response(
                status_code=200,
                headers={
                    "Access-Control-Allow-Origin": origin,  # type: ignore[dict-item]
                    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                    "Vary": "Origin",
                },
            )

        response = await call_next(request)
        if allowed:
            response.headers["Access-Control-Allow-Origin"] = origin  # type: ignore[assignment]
            response.headers["Vary"] = "Origin"
        return response
