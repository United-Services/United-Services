"""Verifies the Clerk session token on /chat/stream and returns the
Clerk user id (the JWT's "sub" claim) — the same identity the main
backend's ClerkAuthGuard verifies
(backend/src/auth/clerk-auth.guard.ts), just re-implemented here in
Python rather than shared code, since the two backends don't share a
runtime.

This is what makes "one JSON transcript per user across every session"
(app/db/models.py's ConversationSession) actually true rather than
aspirational: before this, the row was keyed by a client-supplied
session_id (a UUID the browser picked and stored in localStorage) —
easy to spoof, and a new browser/private window meant a new "user" with
no history. Now the widget only renders for a signed-in visitor
(frontend's ChatWidget.tsx), and the id used everywhere downstream
(app/session_context.py, tickets, transcripts) is this cryptographically
verified Clerk id instead — stable across every device/browser the same
person signs into, and impossible for the client to forge.

Verification is done directly against Clerk's JWKS rather than via the
Node-only @clerk/backend SDK: fetch
https://api.clerk.com/v1/jwks (authenticated with the shared secret
key — this is what the SDK does internally too), cache it for an hour,
and check the token's RS256 signature + expiry with PyJWT. No audience
check: Clerk's own session tokens don't set one by default (matching
verifyToken's own default behavior on the Node side). `iss` IS checked
(pinned to this specific Clerk instance's frontend API domain, derived
from the publishable key) — the JWKS endpoint above is fetched using
this app's own secret key, which scopes it to whatever Clerk
application(s) that key can see; an explicit issuer check is what
actually pins verification to this one instance rather than trusting
that scoping alone.
"""

import base64
import json
import logging
import time

import jwt
import requests
from fastapi import HTTPException, Request

from app.config import settings

logger = logging.getLogger("clerk_auth")

_JWKS_URL = "https://api.clerk.com/v1/jwks"
_CACHE_TTL_SECONDS = 3600

_jwks_cache: dict[str, object] = {"keys": None, "fetched_at": 0.0}


def _derive_issuer(publishable_key: str) -> str:
    # A Clerk publishable key is "pk_{test|live}_" + base64(frontend-api-
    # domain + "$") — e.g. pk_test_Y29t...ZGV2JA decodes to
    # "composed-bengal-53.clerk.accounts.dev$". Clerk's own frontend SDKs
    # derive the frontend API host the same way rather than hardcoding
    # it, which is what makes this robust across dev/staging/prod
    # instances without a manually-maintained domain string that drifts.
    _, _, encoded = publishable_key.partition("_")
    _, _, encoded = encoded.partition("_")
    padded = encoded + "=" * (-len(encoded) % 4)
    domain = base64.b64decode(padded).decode().rstrip("$")
    return f"https://{domain}"


_CLERK_ISSUER = _derive_issuer(settings.clerk_publishable_key)


def _fetch_jwks(force: bool = False) -> list[dict]:
    now = time.time()
    if force or _jwks_cache["keys"] is None or now - _jwks_cache["fetched_at"] > _CACHE_TTL_SECONDS:
        try:
            response = requests.get(
                _JWKS_URL,
                headers={"Authorization": f"Bearer {settings.clerk_secret_key}"},
                timeout=5,
            )
            response.raise_for_status()
        except requests.exceptions.RequestException as exc:
            # Confirmed live: a stale CLERK_SECRET_KEY (a container
            # still running with a pre-rotation env value — `docker
            # compose restart` reuses the already-materialized
            # environment, it does not re-read env_file) made this
            # 401 and crashed the whole request into an *unhandled*
            # 500 — which also skipped app/security/cors.py's
            # Access-Control-Allow-Origin header entirely (never
            # reached, since the exception propagated straight past
            # DynamicCORSMiddleware's post-call_next code), showing up
            # in the browser as a misleading CORS error instead of the
            # real auth-service failure. Any failure reaching Clerk's
            # JWKS endpoint — network, a bad/rotated key, Clerk itself
            # being down — must degrade to the same clean 401 every
            # other auth failure here produces, never propagate as a
            # raw exception.
            logger.error("Clerk JWKS fetch failed: %s", exc)
            raise HTTPException(status_code=401, detail="Invalid session token") from exc
        _jwks_cache["keys"] = response.json()["keys"]
        _jwks_cache["fetched_at"] = now
    return _jwks_cache["keys"]  # type: ignore[return-value]


def _extract_token(request: Request) -> str:
    # Bearer header only — no __session cookie fallback. /chat/stream is
    # a state-changing POST (files tickets, can trigger
    # escalate_to_human), and a cookie is ambient authority a
    # cross-site page can ride along with; CORS (app/security/cors.py)
    # blocks that page from reading the response, but not the request
    # itself from firing (CORS isn't a CSRF defense without an explicit
    # preflight-blocking custom header). The widget is this app's own
    # JS talking to its own backend, so it can always send a real Bearer
    # header instead — see frontend/lib/useChatStream.ts in the main
    # site's repo.
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[len("Bearer ") :]
    raise HTTPException(status_code=401, detail="Missing session token")


def get_current_user_id(request: Request) -> str:
    token = _extract_token(request)

    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid session token") from exc

    jwks = _fetch_jwks()
    key_data = next((k for k in jwks if k["kid"] == header.get("kid")), None)
    if key_data is None:
        # Clerk rotates signing keys occasionally — refetch once before
        # giving up, rather than caching a stale keyset for a full hour
        # every time a rotation happens to land inside that window.
        jwks = _fetch_jwks(force=True)
        key_data = next((k for k in jwks if k["kid"] == header.get("kid")), None)
    if key_data is None:
        raise HTTPException(status_code=401, detail="Invalid session token")

    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key_data))
    try:
        payload = jwt.decode(
            token,
            key=public_key,
            algorithms=["RS256"],
            issuer=_CLERK_ISSUER,
            options={"verify_aud": False},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session token")
    return user_id
