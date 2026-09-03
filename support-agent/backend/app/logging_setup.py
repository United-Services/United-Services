"""Ships every log line (INFO and above, from every module — the root
logger's handler, so `logging.getLogger("agent")`,
`logging.getLogger("cors")`, `logging.getLogger("failover")`, etc. are
all covered without each needing its own setup) to the same Betterstack
source the main NestJS backend ships to
(backend/src/logging/betterstack.logger.ts) — same dashboard, same
"Last 30 days" live tail, distinguished by the "service": "support-agent"
tag in the payload rather than a second Betterstack source, matching
how the NestJS logger already tags "service": "backend" for the same
reason.

Deliberately *not* the NestJS logger's ship-only design (which
guarantees nothing ever prints to stdout/stderr). This is an additional
handler on top of whatever logging already happens — `docker logs
support-agent-backend-1` has been this service's primary debugging tool
throughout its own development (there's no equivalent to the NestJS
app's structured request logging here yet), and there's no reason
stated for that backend's ship-only choice beyond architectural
cleanliness, not a security requirement that would also apply here.

Fire-and-forget via a background thread per log line, not a blocking
call inside emit() — this app is async (FastAPI/uvicorn); a blocking
`requests.post` inside a logging handler would stall the event loop on
every single log line whenever Betterstack is slow or unreachable.
"""

import logging
import threading
import traceback
from datetime import datetime, timezone

import requests

from app.config import settings


class BetterstackHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        if not settings.betterstack_ingest_url or not settings.betterstack_source_token:
            return
        try:
            message = record.getMessage()
        except Exception:
            message = str(record.msg)
        if record.exc_info:
            message = f"{message}\n{''.join(traceback.format_exception(*record.exc_info))}"

        payload = {
            "dt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            "level": record.levelname.lower(),
            "message": message,
            "context": record.name,
            "service": "support-agent",
        }
        # A daemon thread per log line, not a shared queue/worker — log
        # volume here is low (agent turns, tool calls, failover state
        # changes), not per-request HTTP access logging, so the
        # simplicity of "one thread per line" outweighs the overhead a
        # proper queue would avoid at higher volume.
        threading.Thread(target=self._ship, args=(payload,), daemon=True).start()

    @staticmethod
    def _ship(payload: dict) -> None:
        try:
            requests.post(
                settings.betterstack_ingest_url,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.betterstack_source_token}",
                },
                json=payload,
                timeout=5,
            )
        except Exception:
            pass  # never let log shipping itself raise anywhere


def install_betterstack_logging() -> None:
    handler = BetterstackHandler()
    handler.setLevel(logging.INFO)
    logging.getLogger().addHandler(handler)
