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
