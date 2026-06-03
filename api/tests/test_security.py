"""Security regression tests.

Covers the trust-boundary behavior added in the security pass: config fail-fast,
bbox/param validation, body-size + rate limits, safe error responses, and the
security headers. Rate limiting is disabled for the main app during the suite
(see conftest), so the 429 behavior is exercised on an isolated app here.
"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from api.core.config import Settings
from api.main import app

client = TestClient(app)


# ── Config fail-fast ─────────────────────────────────────────────────────────
def test_prod_rejects_wildcard_origin():
    s = Settings(
        environment="prod",
        allowed_origins="*",
        nasa_firms_api_key="x" * 12,
        openweathermap_api_key="x" * 12,
    )
    assert any("ALLOWED_ORIGINS" in p for p in s.startup_problems())


def test_prod_requires_secrets():
    s = Settings(
        environment="prod",
        allowed_origins="https://app.example.com",
        nasa_firms_api_key=None,
        openweathermap_api_key=None,
    )
    problems = s.startup_problems()
    assert any("NASA_FIRMS_API_KEY" in p for p in problems)
    assert any("OPENWEATHERMAP_API_KEY" in p for p in problems)


def test_prod_clean_config_has_no_problems():
    s = Settings(
        environment="prod",
        allowed_origins="https://app.example.com,http://localhost:3000",
        nasa_firms_api_key="x" * 12,
        openweathermap_api_key="x" * 12,
    )
    assert s.startup_problems() == []


def test_dev_is_permissive():
    assert Settings(environment="dev", allowed_origins="*").startup_problems() == []


# ── Input validation / injection ─────────────────────────────────────────────
def test_fires_rejects_malformed_bbox():
    for bad in ("world/../etc", "1,2,3", "abc,2,3,4", "200,2,3,4", "1,2,1,2"):
        assert client.get(f"/fires?bbox={bad}").status_code == 422, bad


def test_fires_accepts_and_canonicalizes_valid_bbox(monkeypatch):
    seen: dict = {}

    async def stub(days=1, bbox=None):
        seen["bbox"] = bbox
        return {"type": "FeatureCollection", "features": []}

    monkeypatch.setattr("api.routes.fires.fetch_fires_geojson", stub)
    assert client.get("/fires?bbox=-122,37,-121,38").status_code == 200
    assert seen["bbox"] == "-122.0,37.0,-121.0,38.0"


def test_trajectory_rejects_out_of_range():
    assert client.get("/trajectory?lat=200&lon=0").status_code == 422
    assert client.get("/trajectory?lat=0&lon=999").status_code == 422


# ── Body size guard ──────────────────────────────────────────────────────────
def test_oversized_body_rejected():
    body = {
        "temperature": 30.0,
        "humidity": 25.0,
        "wind_speed": 20.0,
        "days_since_rain": 1,
        "season": "summer",
        "pad": "x" * 20_000,
    }
    assert client.post("/risk", json=body).status_code == 413


# ── Safe failure ─────────────────────────────────────────────────────────────
def test_unhandled_error_is_generic(monkeypatch):
    async def boom(*a, **k):
        raise ValueError("sensitive internal detail")

    monkeypatch.setattr("api.routes.weather.fetch_current_weather", boom)
    safe = TestClient(app, raise_server_exceptions=False)
    r = safe.get("/weather?lat=37&lon=-122")
    assert r.status_code == 500
    assert r.json() == {"detail": "Internal server error."}
    # No stack trace / internal detail leaks to the client.
    assert "ValueError" not in r.text
    assert "sensitive internal detail" not in r.text


# ── Security headers ─────────────────────────────────────────────────────────
def test_security_headers_present():
    r = client.get("/healthz")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "referrer-policy" in r.headers
    assert "content-security-policy" in r.headers


# ── Rate limiting (isolated app with the same wiring as main.py) ──────────────
def test_rate_limit_returns_429():
    limiter = Limiter(key_func=get_remote_address, default_limits=["2/minute"], enabled=True)
    iso = FastAPI()
    iso.state.limiter = limiter
    iso.add_exception_handler(
        RateLimitExceeded,
        lambda request, exc: JSONResponse(status_code=429, content={"detail": "Rate limit exceeded."}),
    )
    iso.add_middleware(SlowAPIMiddleware)

    @iso.get("/ping")
    async def ping(request: Request):
        return {"ok": True}

    c = TestClient(iso)
    assert c.get("/ping").status_code == 200
    assert c.get("/ping").status_code == 200
    assert c.get("/ping").status_code == 429


def test_decorated_route_does_not_500_when_limiting_enabled(monkeypatch):
    # Regression: the suite disables rate limiting, so a decorated route's
    # ENABLED path was never exercised — and slowapi's header injection 500'd
    # every rate-limited endpoint in real dev (no `response` param). Enable the
    # real limiter and confirm a normal request still succeeds.
    from api.core import rate_limit

    async def fake_weather(lat, lon):
        return {
            "temperature": 20,
            "humidity": 50,
            "wind_speed": 5,
            "wind_deg": 0,
            "conditions": "clear",
            "location": {"lat": lat, "lon": lon, "name": "Test"},
        }

    monkeypatch.setattr("api.routes.weather.fetch_current_weather", fake_weather)
    monkeypatch.setattr(rate_limit.limiter, "enabled", True)
    r = client.get("/weather?lat=37&lon=-122")
    assert r.status_code == 200
