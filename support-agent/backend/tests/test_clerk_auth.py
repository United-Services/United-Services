"""app/security/clerk_auth.py verified against a locally-generated RSA
keypair standing in for Clerk's real JWKS — no network call, no real
Clerk instance needed. Exercises the exact failure modes /chat/stream
depends on being rejected: no token, wrong signature, unknown key id,
expired token, wrong issuer, a token with no sub claim, and (since the
CSRF-motivated removal of the __session cookie fallback) a forged
cookie no longer working as a credential at all.
"""

import time

import jwt as pyjwt
import pytest
import requests
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException, Request

from app.security import clerk_auth

KID = "test-key-1"


def _make_keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private_key, private_key.public_key()


@pytest.fixture
def keypair():
    return _make_keypair()


@pytest.fixture(autouse=True)
def _reset_jwks_cache():
    clerk_auth._jwks_cache["keys"] = None
    clerk_auth._jwks_cache["fetched_at"] = 0.0
    yield
    clerk_auth._jwks_cache["keys"] = None
    clerk_auth._jwks_cache["fetched_at"] = 0.0


def _install_jwks(monkeypatch, public_key, kid=KID):
    jwk = pyjwt.algorithms.RSAAlgorithm.to_jwk(public_key, as_dict=True)
    jwk["kid"] = kid
    monkeypatch.setattr(clerk_auth, "_fetch_jwks", lambda force=False: [jwk])


def _request_with_bearer(token: str | None) -> Request:
    headers = [(b"authorization", f"Bearer {token}".encode())] if token else []
    scope = {"type": "http", "headers": headers}
    return Request(scope)


def _sign(private_key, kid=KID, sub="user_123", exp_delta=3600, iss=None):
    claims = {"sub": sub, "exp": int(time.time()) + exp_delta}
    claims["iss"] = clerk_auth._CLERK_ISSUER if iss is None else iss
    return pyjwt.encode(claims, private_key, algorithm="RS256", headers={"kid": kid})


def test_valid_token_returns_sub_claim(monkeypatch, keypair):
    private_key, public_key = keypair
    _install_jwks(monkeypatch, public_key)
    token = _sign(private_key, sub="user_abc")

    user_id = clerk_auth.get_current_user_id(_request_with_bearer(token))

    assert user_id == "user_abc"


def test_missing_token_rejected():
    with pytest.raises(HTTPException) as exc:
        clerk_auth.get_current_user_id(_request_with_bearer(None))
    assert exc.value.status_code == 401


def test_wrong_signature_rejected(monkeypatch, keypair):
    _, public_key = keypair
    other_private_key, _ = _make_keypair()  # different keypair — signature won't verify
    _install_jwks(monkeypatch, public_key)
    token = _sign(other_private_key)

    with pytest.raises(HTTPException) as exc:
        clerk_auth.get_current_user_id(_request_with_bearer(token))
    assert exc.value.status_code == 401


def test_unknown_kid_rejected(monkeypatch, keypair):
    private_key, public_key = keypair
    _install_jwks(monkeypatch, public_key, kid="a-different-kid")
    token = _sign(private_key, kid="not-in-jwks")

    with pytest.raises(HTTPException) as exc:
        clerk_auth.get_current_user_id(_request_with_bearer(token))
    assert exc.value.status_code == 401


def test_expired_token_rejected(monkeypatch, keypair):
    private_key, public_key = keypair
    _install_jwks(monkeypatch, public_key)
    token = _sign(private_key, exp_delta=-60)

    with pytest.raises(HTTPException) as exc:
        clerk_auth.get_current_user_id(_request_with_bearer(token))
    assert exc.value.status_code == 401


def test_token_without_sub_claim_rejected(monkeypatch, keypair):
    private_key, public_key = keypair
    _install_jwks(monkeypatch, public_key)
    token = pyjwt.encode(
        {"exp": int(time.time()) + 3600}, private_key, algorithm="RS256", headers={"kid": KID}
    )

    with pytest.raises(HTTPException) as exc:
        clerk_auth.get_current_user_id(_request_with_bearer(token))
    assert exc.value.status_code == 401


def test_wrong_issuer_rejected(monkeypatch, keypair):
    # A validly-signed, unexpired, correctly-keyed token for a
    # *different* Clerk instance must not be accepted — the JWKS fetch
    # is scoped by this app's own secret key, which could in principle
    # see more than one Clerk application; the explicit iss check is
    # what actually pins verification to this one instance rather than
    # relying on that scoping alone.
    private_key, public_key = keypair
    _install_jwks(monkeypatch, public_key)
    token = _sign(private_key, iss="https://some-other-clerk-instance.clerk.accounts.dev")

    with pytest.raises(HTTPException) as exc:
        clerk_auth.get_current_user_id(_request_with_bearer(token))
    assert exc.value.status_code == 401


def test_jwks_fetch_failure_degrades_to_clean_401_not_a_crash(monkeypatch, keypair):
    # Real regression, not hypothetical: a container still running with
    # a pre-rotation CLERK_SECRET_KEY made Clerk's real JWKS endpoint
    # return 401, and that raw requests.exceptions.HTTPError propagated
    # unhandled all the way to a 500 — which also skipped
    # DynamicCORSMiddleware's Access-Control-Allow-Origin header
    # entirely (never reached, since the exception left call_next
    # without returning), showing up in the browser purely as a
    # misleading CORS error. Any Clerk-JWKS-reachability failure must
    # degrade to the same 401 every other auth failure here produces.
    private_key, public_key = keypair
    token = _sign(private_key)

    def _raise(*args, **kwargs):
        raise requests.exceptions.HTTPError("401 Client Error: Unauthorized for url: ...")

    monkeypatch.setattr(clerk_auth.requests, "get", _raise)

    with pytest.raises(HTTPException) as exc:
        clerk_auth.get_current_user_id(_request_with_bearer(token))
    assert exc.value.status_code == 401


def test_session_cookie_no_longer_accepted(monkeypatch, keypair):
    # Fix for a live-confirmed CSRF gap: /chat/stream is a state-changing
    # POST reachable purely from a signed-in browser's ambient cookie,
    # with no CSRF token and no preflight-blocking custom header — CORS
    # blocks a cross-site page from *reading* the response, not the
    # request from *firing*. Bearer-only removes the ambient-authority
    # path entirely; a forged/replayed __session cookie must now be
    # rejected exactly like having no credential at all.
    private_key, public_key = keypair
    _install_jwks(monkeypatch, public_key)
    token = _sign(private_key, sub="user_via_cookie")
    scope = {"type": "http", "headers": [(b"cookie", f"__session={token}".encode())]}

    with pytest.raises(HTTPException) as exc:
        clerk_auth.get_current_user_id(Request(scope))
    assert exc.value.status_code == 401
