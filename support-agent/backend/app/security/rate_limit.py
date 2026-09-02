"""Throttles /chat/stream before a request ever reaches OpenRouter — per
the plan's "Rate-limit the endpoint, not just the model" decision: this
account is on a free OpenRouter quota (confirmed live in Phase 1's own
testing: a shared free-tier model can 429 under load, and the account's
own daily cap was hit once already during this project's development —
see README's Phase 4 notes). A single user hammering this endpoint can
exhaust that quota for everyone; the model provider's own rate limiting
is the wrong place to first notice that.

By client IP, not session_id: session_id is client-supplied and
trivially regenerable (a new UUID per request defeats a session-scoped
limit for free), so it's not a real identity boundary to throttle
against. IP is what actually costs an attacker something to rotate.
"""

import time

from fastapi import HTTPException, Request

from app.config import settings
from app.memory.redis_memory import get_redis_client

# Fixed window, not sliding — simple, and precise enough for "stop one
# client from burning the whole account's free daily quota," which
# doesn't need sub-window accuracy.
WINDOW_SECONDS = 60
MAX_REQUESTS_PER_WINDOW = settings.rate_limit_per_minute


def _client_ip(request: Request) -> str:
    # No X-Forwarded-For handling here — this app has no reverse proxy
    # in front of it yet (unlike the main United-Services backend, which
    # explicitly handles Cloudflare's real-IP headers). If one's ever
    # added in front of this service, that's the moment to also add the
    # matching trusted-proxy header parsing here — trusting a
    # client-supplied header with no proxy actually stripping/setting it
    # first would let a request just claim any IP it wants.
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(request: Request) -> None:
    ip = _client_ip(request)
    window = int(time.time() // WINDOW_SECONDS)
    key = f"support-agent:ratelimit:{ip}:{window}"

    redis_client = get_redis_client()
    count = redis_client.incr(key)
    if count == 1:
        # Only set expiry on the first request in this window — an INCR
        # on every request would keep pushing the expiry back and the
        # window would never actually close.
        redis_client.expire(key, WINDOW_SECONDS)

    if count > MAX_REQUESTS_PER_WINDOW:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded — max {MAX_REQUESTS_PER_WINDOW} requests per {WINDOW_SECONDS}s. Please wait and try again.",
        )
