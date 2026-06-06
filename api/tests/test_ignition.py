"""Tests for the fire-ignition serving layer (services/ignition.py + route).

Network-free: the route tests stub the live fetch; the model tests use the
committed artifact (api/models/ignition_model.joblib) directly to check that
hot-dry conditions score higher than cold-wet ones (sanity + training/serving
parity), skipping if the artifact isn't present.
"""
from fastapi.testclient import TestClient

from api.main import app
from api.services import ignition

client = TestClient(app)

_HOT_DRY = {
    "temperature_c": 38.0, "humidity_pct": 12.0, "wind_kph": 25.0,
    "days_since_rain": 30, "kbdi": 600.0, "month": 7, "season": "summer",
}
_COLD_WET = {
    "temperature_c": 5.0, "humidity_pct": 90.0, "wind_kph": 6.0,
    "days_since_rain": 1, "kbdi": 30.0, "month": 1, "season": "winter",
}


def test_score_features_hot_dry_beats_cold_wet():
    hot = ignition.score_features(_HOT_DRY)
    cold = ignition.score_features(_COLD_WET)
    if hot is None or cold is None:
        import pytest
        pytest.skip("ignition model artifact not present")
    assert 0 <= hot["percentile"] <= 100
    assert hot["percentile"] > cold["percentile"]
    assert hot["level"] in {"low", "moderate", "high", "extreme"}


def test_score_features_incomplete_returns_none():
    assert ignition.score_features({"temperature_c": None, "humidity_pct": 50}) is None


def test_route_returns_payload(monkeypatch):
    async def fake(lat, lon):
        return {"percentile": 82.0, "probability": 0.41, "level": "high",
                "as_of": "2026-05-30"}
    monkeypatch.setattr("api.routes.ignition.ignition_for_location", fake)
    r = client.get("/ignition?lat=37.0&lon=-122.0")
    assert r.status_code == 200
    assert r.json()["level"] == "high"


def test_route_null_on_unavailable(monkeypatch):
    async def fake(lat, lon):
        return None
    monkeypatch.setattr("api.routes.ignition.ignition_for_location", fake)
    r = client.get("/ignition?lat=37.0&lon=-122.0")
    assert r.status_code == 200
    assert r.json() is None


def test_route_validates_coords():
    assert client.get("/ignition?lat=200&lon=0").status_code == 422
    assert client.get("/ignition?lat=0&lon=999").status_code == 422
