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
verifyToken's own default behavior on the Node side).
"""

import json
import time

import jwt
import requests
from fastapi import HTTPException, Request

from app.config import settings

_JWKS_URL = "https://api.clerk.com/v1/jwks"
_CACHE_TTL_SECONDS = 3600

_jwks_cache: dict[str, object] = {"keys": None, "fetched_at": 0.0}


def _fetch_jwks(force: bool = False) -> list[dict]:
    now = time.time()
    if force or _jwks_cache["keys"] is None or now - _jwks_cache["fetched_at"] > _CACHE_TTL_SECONDS:
        response = requests.get(
            _JWKS_URL,
            headers={"Authorization": f"Bearer {settings.clerk_secret_key}"},
            timeout=5,
        )
        response.raise_for_status()
        _jwks_cache["keys"] = response.json()["keys"]
        _jwks_cache["fetched_at"] = now
    return _jwks_cache["keys"]  # type: ignore[return-value]


def _extract_token(request: Request) -> str:
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[len("Bearer ") :]
    cookie_token = request.cookies.get("__session")
    if cookie_token:
        return cookie_token
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
            options={"verify_aud": False},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session token")
    return user_id
