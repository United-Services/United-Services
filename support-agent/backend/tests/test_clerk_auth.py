"""app/security/clerk_auth.py verified against a locally-generated RSA
keypair standing in for Clerk's real JWKS — no network call, no real
Clerk instance needed. Exercises the exact failure modes /chat/stream
depends on being rejected: no token, wrong signature, unknown key id,
expired token, and a token with no sub claim.
"""

import time

import jwt as pyjwt
import pytest
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


def _sign(private_key, kid=KID, sub="user_123", exp_delta=3600):
    return pyjwt.encode(
        {"sub": sub, "exp": int(time.time()) + exp_delta},
        private_key,
        algorithm="RS256",
        headers={"kid": kid},
    )


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


def test_session_cookie_accepted_as_fallback(monkeypatch, keypair):
    private_key, public_key = keypair
    _install_jwks(monkeypatch, public_key)
    token = _sign(private_key, sub="user_via_cookie")
    scope = {"type": "http", "headers": [(b"cookie", f"__session={token}".encode())]}

    user_id = clerk_auth.get_current_user_id(Request(scope))

    assert user_id == "user_via_cookie"
