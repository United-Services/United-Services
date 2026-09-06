"""DynamicCORSMiddleware's preflight response — a real regression, not
hypothetical: the widget's Authorization Bearer header was rejected by
the browser's own preflight check (Access-Control-Allow-Headers didn't
list it), confirmed live, before this test existed."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.security import cors as cors_module
from app.security.cors import DynamicCORSMiddleware


def _make_client(monkeypatch, allowed: bool):
    monkeypatch.setattr(cors_module, "is_origin_allowed", lambda origin: allowed)
    app = FastAPI()
    app.add_middleware(DynamicCORSMiddleware)

    @app.post("/chat/stream")
    def chat_stream():
        return {"ok": True}

    return TestClient(app)


def test_preflight_allows_authorization_header(monkeypatch):
    client = _make_client(monkeypatch, allowed=True)

    response = client.options(
        "/chat/stream",
        headers={
            "origin": "http://localhost:8080",
            "access-control-request-method": "POST",
            "access-control-request-headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    allowed_headers = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers


def test_preflight_from_disallowed_origin_rejected(monkeypatch):
    client = _make_client(monkeypatch, allowed=False)

    response = client.options(
        "/chat/stream",
        headers={
            "origin": "http://evil.example.com",
            "access-control-request-method": "POST",
            "access-control-request-headers": "authorization",
        },
    )

    assert response.status_code == 400


def test_real_request_from_allowed_origin_gets_cors_header(monkeypatch):
    client = _make_client(monkeypatch, allowed=True)

    response = client.post(
        "/chat/stream",
        headers={"origin": "http://localhost:8080", "authorization": "Bearer fake"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:8080"


def test_unhandled_error_still_gets_cors_header(monkeypatch):
    """Verified live with Redis down: an exception escaping call_next
    propagated straight past the header-setting code, so every 500 left
    with NO Access-Control-Allow-Origin — and the browser reported a
    CORS error, not the outage it actually was. A FastAPI
    @app.exception_handler(Exception) would not fix it (Starlette runs
    those in its outermost ServerErrorMiddleware, so their response
    never comes back through this middleware); the 500 has to be built
    inside dispatch."""
    monkeypatch.setattr(cors_module, "is_origin_allowed", lambda origin: True)
    app = FastAPI()
    app.add_middleware(DynamicCORSMiddleware)

    @app.post("/chat/stream")
    def chat_stream():
        raise RuntimeError("redis is down")

    client = TestClient(app, raise_server_exceptions=False)
    response = client.post("/chat/stream", headers={"origin": "http://localhost:8080"})

    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == "http://localhost:8080"
    assert response.json() == {"detail": "Internal server error"}
