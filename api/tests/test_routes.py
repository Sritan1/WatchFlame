"""End-to-end route tests using FastAPI's TestClient.

Upstream services are patched where the route module imports them, not on the service
module, because that's the name the route actually calls. Every route gets a success
path and at least one upstream-failure path.
"""
from __future__ import annotations

import json

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from api.core.source_health import SourceUnavailable
from api.main import app

client = TestClient(app)


# /healthz

def test_healthz():
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


# /fires

def test_fires_success(monkeypatch):
    payload = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-120.0, 37.5]},
                "properties": {
                    "lat": 37.5, "lon": -120.0, "brightness": 320,
                    "confidence": "h", "acq_date": "2026-05-08",
                    "acq_time": "1842", "satellite": "N", "frp": 12.3,
                    "daynight": "D",
                },
            },
        ],
    }
    async def stub(days=1, bbox=None):
        return payload
    monkeypatch.setattr("api.routes.fires.fetch_fires_geojson", stub)
    r = client.get("/fires?days=1")
    assert r.status_code == 200
    assert r.json() == payload


def test_fires_validates_days_range():
    r = client.get("/fires?days=100")
    assert r.status_code == 422


def test_fires_passes_bbox(monkeypatch):
    seen: dict = {}
    async def stub(days=1, bbox=None):
        seen["days"] = days
        seen["bbox"] = bbox
        return {"type": "FeatureCollection", "features": []}
    monkeypatch.setattr("api.routes.fires.fetch_fires_geojson", stub)
    r = client.get("/fires?days=3&bbox=-122,37,-121,38")
    assert r.status_code == 200
    # The route normalizes the bbox to floats before the service sees it, which
    # keeps arbitrary text out of the FIRMS URL path.
    assert seen == {"days": 3, "bbox": "-122.0,37.0,-121.0,38.0"}


# /risk

_RISK_BODY = {
    "temperature": 30.0,
    "humidity": 25.0,
    "wind_speed": 20.0,
    "days_since_rain": 14,
    "season": "summer",
}


@pytest.fixture(autouse=True)
def _stub_ndvi(monkeypatch):
    """Return None by default so /risk tests never reach the live CDSE API.
    Both fetches returning None makes compute_risk fall back to season_mult.
    Tests that want the NDVI path override these."""
    async def _none(*_args, **_kwargs):
        return None
    monkeypatch.setattr("api.routes.risk.get_ndvi_current", _none)
    monkeypatch.setattr("api.routes.risk.get_ndvi_climatology", _none)


@pytest.fixture(autouse=True)
def _stub_census(monkeypatch):
    """Return None by default so /risk tests never reach the live Census
    endpoint. None makes regional_level fall back to its bbox/centroid guess.
    Tests that want the authoritative lookup override this with a CountyInfo."""
    async def _none(*_args, **_kwargs):
        return None
    monkeypatch.setattr("api.routes.risk.reverse_geocode", _none)


@pytest.fixture(autouse=True)
def _stub_openmeteo(monkeypatch):
    """Return None by default so any /risk test with coords never reaches the live
    Archive and Forecast APIs. Without it the route fires real fetches whenever
    body.kbdi is None, and gather hides the failure while burning live quota."""
    async def _none(*_args, **_kwargs):
        return None
    monkeypatch.setattr("api.routes.risk.fetch_kbdi_today", _none)
    monkeypatch.setattr("api.routes.risk.fetch_days_since_rain_today", _none)


def test_risk_basic_no_location():
    """The pure what-if path, so every regional and kbdi field comes back None."""
    r = client.post("/risk", json=_RISK_BODY)
    assert r.status_code == 200
    j = r.json()
    assert 0.0 <= j["risk_score"] <= 1.0
    assert j["danger_level"] in ("LOW", "MODERATE", "HIGH", "EXTREME")
    assert j["regional_level"] is None
    assert j["regional_state"] is None
    assert j["regional_thresholds"] is None
    assert j["kbdi"] is None
    assert set(j["factors"].keys()) == {"vpd", "wind", "drought", "season"}


def test_risk_validates_humidity():
    bad = {**_RISK_BODY, "humidity": 150}  # above the 100 ceiling
    r = client.post("/risk", json=bad)
    assert r.status_code == 422


def test_risk_validates_season():
    bad = {**_RISK_BODY, "season": "monsoon"}  # not in Literal
    r = client.post("/risk", json=bad)
    assert r.status_code == 422


def test_risk_rejects_out_of_domain_temperature():
    """A value near the saturation-vapor-pressure singularity must 422, not 500."""
    for bad_temp in (-237.3, -238.0, -500.0, 200.0):
        r = client.post("/risk", json={**_RISK_BODY, "temperature": bad_temp})
        assert r.status_code == 422, f"temperature={bad_temp} should be rejected"


def test_risk_rejects_nonfinite_temperature():
    """JSON and pydantic accept NaN by default, so the bound has to reject it."""
    import json as _json
    for token in ("NaN", "Infinity", "-Infinity"):
        r = client.post(
            "/risk",
            content=_json.dumps({**_RISK_BODY, "temperature": None}).replace(
                "null", token
            ),
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 422, f"temperature={token} should be rejected"


def test_risk_with_location_returns_regional(monkeypatch):
    async def stub_kbdi(lat, lon):
        return None  # KBDI unavailable, route falls back to days_since_rain
    monkeypatch.setattr("api.routes.risk.fetch_kbdi_today", stub_kbdi)

    body = {**_RISK_BODY, "lat": 37.77, "lon": -122.42}  # SF
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    j = r.json()
    assert j["regional_state"] == "CA"
    assert j["regional_level"] in ("LOW", "MODERATE", "HIGH", "EXTREME")
    assert j["kbdi"] is None  # stub returned None


def test_risk_with_location_uses_kbdi(monkeypatch):
    async def stub_kbdi(lat, lon):
        return {"kbdi": 555.0, "mean_annual_precip_mm": 600,
                "end_date": "2026-05-01", "n_days": 365}
    monkeypatch.setattr("api.routes.risk.fetch_kbdi_today", stub_kbdi)

    body = {**_RISK_BODY, "lat": 37.77, "lon": -122.42}
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    j = r.json()
    assert j["kbdi"] == 555.0


def test_risk_manual_kbdi_skips_fetch_and_propagates(monkeypatch):
    fetch_called = False
    async def stub_kbdi(lat, lon):
        nonlocal fetch_called
        fetch_called = True
        return {"kbdi": 999.0}  # would be obvious if it leaked
    monkeypatch.setattr("api.routes.risk.fetch_kbdi_today", stub_kbdi)

    body = {**_RISK_BODY, "lat": 37.77, "lon": -122.42, "kbdi": 300.0}
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    j = r.json()
    assert j["kbdi"] == 300.0
    assert fetch_called is False  # manual value short-circuits the fetch


def test_risk_manual_kbdi_validates_range():
    bad = {**_RISK_BODY, "kbdi": 1000}  # above the 800 ceiling
    r = client.post("/risk", json=bad)
    assert r.status_code == 422


def test_risk_calibration_endpoint():
    r = client.get("/risk/calibration")
    assert r.status_code == 200
    j = r.json()
    assert "version" in j and "states_calibrated" in j
    assert isinstance(j["states_calibrated"], list)


# /risk NDVI integration

def test_risk_with_ndvi_propagates_to_response(monkeypatch):
    """The score should reflect ndvi_factor in place of season_mult."""
    async def stub_current(lat, lon):
        return 0.35
    async def stub_clim(lat, lon, month):
        return 0.50
    monkeypatch.setattr("api.routes.risk.get_ndvi_current", stub_current)
    monkeypatch.setattr("api.routes.risk.get_ndvi_climatology", stub_clim)

    body = {**_RISK_BODY, "lat": 37.77, "lon": -122.42}
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    j = r.json()
    # current(0.35) - clim(0.50) = -0.15 = slightly stressed vegetation
    assert j["ndvi_anomaly"] == pytest.approx(-0.15)


def test_risk_manual_ndvi_anomaly_skips_fetch(monkeypatch):
    current_called = False
    clim_called = False
    async def stub_current(lat, lon):
        nonlocal current_called
        current_called = True
        return 0.99
    async def stub_clim(lat, lon, month):
        nonlocal clim_called
        clim_called = True
        return 0.99
    monkeypatch.setattr("api.routes.risk.get_ndvi_current", stub_current)
    monkeypatch.setattr("api.routes.risk.get_ndvi_climatology", stub_clim)

    body = {**_RISK_BODY, "lat": 37.77, "lon": -122.42, "ndvi_anomaly": -0.10}
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    j = r.json()
    assert j["ndvi_anomaly"] == pytest.approx(-0.10)
    assert current_called is False
    assert clim_called is False


def test_risk_manual_ndvi_anomaly_validates_range():
    bad = {**_RISK_BODY, "ndvi_anomaly": 1.5}
    r = client.post("/risk", json=bad)
    assert r.status_code == 422


def test_risk_census_state_used_for_regional_lookup(monkeypatch):
    """The Census state has to reach regional_level as state_hint and beat the
    bbox guess. Pins the Reno border-overlap fix."""
    from api.services.census import CountyInfo

    async def stub_census(lat, lon):
        # Reno's real Census result.
        return CountyInfo(
            state="NV",
            state_fips="32",
            county_name="Washoe County",
            county_fips="32031",
        )
    monkeypatch.setattr("api.routes.risk.reverse_geocode", stub_census)

    body = {**_RISK_BODY, "lat": 39.53, "lon": -119.81}  # Reno NV
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    j = r.json()
    # Census said NV, so NV has to win. The bbox guess would have said CA,
    # whose centroid sits closer to Reno.
    assert j["regional_state"] == "NV"


def test_risk_census_unavailable_falls_back_to_heuristic(monkeypatch):
    """The bbox guess is shaky at borders but beats no calibration at all."""
    # _stub_census already makes reverse_geocode return None.
    body = {**_RISK_BODY, "lat": 37.77, "lon": -122.42}  # SF
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    j = r.json()
    # SF sits well inside CA's box, so the guess gets it right unaided.
    assert j["regional_state"] == "CA"


def test_risk_state_body_field_without_coords_returns_regional():
    """The what-if dropdown sends a state and no coords, and that alone has to
    bucket against the state's thresholds."""
    body = {**_RISK_BODY, "state": "CA"}
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    j = r.json()
    assert j["regional_state"] == "CA"
    assert j["regional_level"] in ("LOW", "MODERATE", "HIGH", "EXTREME")
    # No coords means no upstream fetches, so kbdi has to stay None.
    assert j["kbdi"] is None


def test_risk_state_body_field_skips_census_when_provided(monkeypatch):
    """An explicit `state` in the body skips reverse_geocode entirely. Saves a
    round trip and lets the user's choice beat the lookup chain."""
    census_called = False
    async def stub_census(lat, lon):
        nonlocal census_called
        census_called = True
        from api.services.census import CountyInfo
        # Return a different state to prove the body's state wins.
        return CountyInfo(
            state="CA", state_fips="06",
            county_name="Sacramento", county_fips="06067",
        )
    monkeypatch.setattr("api.routes.risk.reverse_geocode", stub_census)
    async def stub_kbdi(lat, lon): return None
    monkeypatch.setattr("api.routes.risk.fetch_kbdi_today", stub_kbdi)

    body = {**_RISK_BODY, "lat": 37.77, "lon": -122.42, "state": "NV"}
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    assert r.json()["regional_state"] == "NV"
    assert census_called is False


def test_risk_state_body_field_lowercase_normalized():
    """Body field is normalized to uppercase server-side so callers can be
    sloppy without breaking the calibration lookup."""
    body = {**_RISK_BODY, "state": "ca"}
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    assert r.json()["regional_state"] == "CA"


def test_risk_regional_thresholds_present_when_state_calibrated():
    """The Status orb fills against these, so a schema change must not drop what the
    frontend reads."""
    body = {**_RISK_BODY, "state": "FL"}
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    t = r.json().get("regional_thresholds")
    assert t is not None, "regional_thresholds must be present when state is calibrated"
    for k in ("low", "moderate", "high", "extreme", "score_max"):
        assert k in t, f"missing key: {k}"
        assert isinstance(t[k], (int, float))
    # Monotonic ordering, guards against accidentally swapping fields.
    assert t["low"] < t["moderate"] < t["extreme"] <= t["score_max"]


def test_risk_regional_thresholds_absent_for_unknown_state():
    """An unknown state code must not crash, just fall back to the globals."""
    body = {**_RISK_BODY, "state": "XX"}
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    j = r.json()
    # The unknown code maps to no fit, so regional_state stays None and the
    # response is still well-formed.
    assert j["regional_state"] is None
    assert j["regional_thresholds"] is None


def test_risk_ndvi_partial_failure_falls_back_to_season(monkeypatch):
    """One of the two alone gives no anomaly, so the route falls back to season."""
    async def stub_current(lat, lon):
        return 0.35  # have current
    async def stub_clim(lat, lon, month):
        return None  # but climatology failed
    monkeypatch.setattr("api.routes.risk.get_ndvi_current", stub_current)
    monkeypatch.setattr("api.routes.risk.get_ndvi_climatology", stub_clim)

    body = {**_RISK_BODY, "lat": 37.77, "lon": -122.42}
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    j = r.json()
    assert j["ndvi_anomaly"] is None  # half the data means no anomaly


# /weather

def test_weather_success(monkeypatch):
    async def stub(lat, lon):
        return {
            "temperature": 22.5,
            "humidity": 55,
            "wind_speed": 8.0,
            "wind_deg": 180,
            "conditions": "clear sky",
            "location": {"lat": lat, "lon": lon, "name": "Mock City"},
        }
    monkeypatch.setattr("api.routes.weather.fetch_current_weather", stub)
    r = client.get("/weather?lat=37.0&lon=-120.0")
    assert r.status_code == 200
    assert r.json()["temperature"] == 22.5
    assert r.json()["location"]["name"] == "Mock City"


def test_weather_upstream_503_propagates(monkeypatch):
    async def stub(lat, lon):
        raise HTTPException(status_code=503, detail="Weather service unavailable")
    monkeypatch.setattr("api.routes.weather.fetch_current_weather", stub)
    r = client.get("/weather?lat=37.0&lon=-120.0")
    assert r.status_code == 503
    assert "unavailable" in r.json()["detail"].lower()


def test_weather_validates_lat():
    r = client.get("/weather?lat=200&lon=-120.0")  # lat out of range
    assert r.status_code == 422


# /geocode

def test_geocode_passthrough(monkeypatch):
    async def stub(q, limit=5):
        return [{"name": q, "state": "CA", "country": "US", "lat": 37.0, "lon": -120.0}]
    monkeypatch.setattr("api.routes.geocode.geocode_city", stub)
    r = client.get("/geocode?q=fresno")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["name"] == "fresno"


def test_geocode_empty_when_no_matches(monkeypatch):
    """A genuine empty result stays a 200, so "No matches" never means an outage."""
    async def stub(q, limit=5):
        return []
    monkeypatch.setattr("api.routes.geocode.geocode_city", stub)
    r = client.get("/geocode?q=anything")
    assert r.status_code == 200
    assert r.json() == []


def test_geocode_upstream_outage_returns_503(monkeypatch):
    """A real failure surfaces as 503, distinct from an empty result, so the
    frontend can say "search unavailable" instead of "No matches"."""
    async def stub(q, limit=5):
        raise HTTPException(status_code=503, detail="Geocoding service unavailable")
    monkeypatch.setattr("api.routes.geocode.geocode_city", stub)
    r = client.get("/geocode?q=anything")
    assert r.status_code == 503


def test_geocode_city_raises_on_upstream_error(monkeypatch):
    """Raises rather than swallowing the outage as an empty "no matches" list."""
    import asyncio

    import httpx as _httpx

    from api.services import owm

    monkeypatch.setenv("OPENWEATHERMAP_API_KEY", "test-key")

    class _FailingClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, *a, **k):
            raise _httpx.ConnectError("simulated owm-geocode outage")

    monkeypatch.setattr(owm.httpx, "AsyncClient", lambda *a, **k: _FailingClient())

    with pytest.raises(HTTPException) as ei:
        asyncio.run(owm.geocode_city("fresno"))
    assert ei.value.status_code == 503


def test_geocode_city_scopes_to_us(monkeypatch):
    """US-only twice over, with ',US' on the query plus a filter on the results."""
    import asyncio

    from api.services import owm

    monkeypatch.setenv("OPENWEATHERMAP_API_KEY", "test-key")
    captured: dict = {}

    class _Resp:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            # A mixed-country payload, where only the US entry survives the filter.
            return [
                {"name": "London", "state": "England", "country": "GB", "lat": 51.5, "lon": -0.1},
                {"name": "London", "state": "Kentucky", "country": "US", "lat": 37.1, "lon": -84.1},
            ]

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, params=None):
            captured["params"] = params
            return _Resp()

    monkeypatch.setattr(owm.httpx, "AsyncClient", lambda *a, **k: _Client())

    out = asyncio.run(owm.geocode_city("London"))
    assert captured["params"]["q"].endswith(",US")  # query scoped to the US
    assert [c["country"] for c in out] == ["US"]  # non-US result filtered out
    assert out[0]["state"] == "Kentucky"


def test_geocode_validates_query_length():
    r = client.get("/geocode?q=a")  # min_length=2
    assert r.status_code == 422


# /incidents/near

# Minimal NIFC and Cal Fire stand-ins shaped like the dataclasses the route iterates.

class _NIFC:
    def __init__(self, **kw):
        self.id = kw.get("id", "irwin-1")
        self.name = kw.get("name", "Test Fire")
        self.lat = kw.get("lat", 37.5)
        self.lon = kw.get("lon", -120.0)
        self.acres = kw.get("acres", 100)
        self.contained_pct = kw.get("contained_pct", 25)
        self.personnel = kw.get("personnel", 50)
        self.cause = kw.get("cause", "Lightning")
        self.discovered = kw.get("discovered", "2026-05-01T12:00:00Z")
        self.agency = kw.get("agency", "USFS")
        self.state = kw.get("state", "CA")


class _CalFire:
    def __init__(self, **kw):
        self.id = kw.get("id", "uid-1")
        self.name = kw.get("name", "Test Fire")
        self.lat = kw.get("lat", 37.51)
        self.lon = kw.get("lon", -120.01)
        self.acres = kw.get("acres", 105)
        self.contained_pct = kw.get("contained_pct", 30)
        self.started = kw.get("started", "2026-05-01")
        self.county = kw.get("county", "Mariposa")
        self.location = kw.get("location", "near Yosemite")
        self.control_statement = kw.get("control_statement", "Active burning")
        self.agency = kw.get("agency", "Cal Fire")
        self.url = kw.get("url", "https://example.com/inc1")
        self.is_active = True


def test_incidents_near_merges_calfire_and_nifc(monkeypatch):
    """The merge keeps the richer Cal Fire row and fills its gaps from NIFC."""
    async def stub_nifc():
        return [_NIFC(personnel=120, cause="Powerline", acres=None)]
    async def stub_calfire():
        return [_CalFire()]  # has acres and url, no personnel or cause
    monkeypatch.setattr("api.routes.incidents.fetch_nifc", stub_nifc)
    monkeypatch.setattr("api.routes.incidents.fetch_calfire", stub_calfire)

    r = client.get("/incidents/near?lat=37.5&lon=-120.0&radius_mi=50")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["source"] == "calfire"   # base
    assert row["url"] == "https://example.com/inc1"
    # filled from NIFC duplicate
    assert row["personnel"] == 120
    assert row["cause"] == "Powerline"
    # base value preserved when both have it
    assert row["acres"] == 105


def test_incidents_near_survives_nifc_exception(monkeypatch):
    async def stub_nifc():
        raise RuntimeError("WFIGS exploded")
    async def stub_calfire():
        return [_CalFire()]
    monkeypatch.setattr("api.routes.incidents.fetch_nifc", stub_nifc)
    monkeypatch.setattr("api.routes.incidents.fetch_calfire", stub_calfire)

    r = client.get("/incidents/near?lat=37.5&lon=-120.0&radius_mi=50")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["source"] == "calfire"


def test_incidents_near_filters_by_radius(monkeypatch):
    async def stub_nifc():
        return [_NIFC(lat=40.0, lon=-122.0)]  # about 200 mi from the query point
    async def stub_calfire():
        return []
    monkeypatch.setattr("api.routes.incidents.fetch_nifc", stub_nifc)
    monkeypatch.setattr("api.routes.incidents.fetch_calfire", stub_calfire)

    r = client.get("/incidents/near?lat=37.5&lon=-120.0&radius_mi=15")
    assert r.json() == []


# /shelters

class _Shelter:
    def __init__(self, **kw):
        self.id = kw.get("id", "1")
        self.name = kw.get("name", "Test Centre")
        self.lat = kw.get("lat", 37.5)
        self.lon = kw.get("lon", -120.0)
        self.type = kw.get("type", "Community centre")
        self.tags = kw.get("tags", {})


class _School:
    def __init__(self, **kw):
        self.id = kw.get("id", "1")
        self.name = kw.get("name", "Test Elementary")
        self.lat = kw.get("lat", 37.501)
        self.lon = kw.get("lon", -120.001)
        self.address = kw.get("address", "123 Main St, Anytown, CA")


class _OpenShelter:
    def __init__(self, **kw):
        self.id = kw.get("id", "1001")
        self.name = kw.get("name", "Open Shelter")
        self.lat = kw.get("lat", 37.5)
        self.lon = kw.get("lon", -120.0)
        self.address = kw.get("address", "1 Main St")
        self.status = kw.get("status", "OPEN")
        self.capacity = kw.get("capacity", 200)
        self.occupancy = kw.get("occupancy", 50)
        self.pet_friendly = kw.get("pet_friendly", True)
        self.ada_accessible = kw.get("ada_accessible", True)
        self.managing_org = kw.get("managing_org", "American Red Cross")
        self.updated_at = kw.get("updated_at", "2026-06-01T00:00:00+00:00")
        self.opened_at = kw.get("opened_at", None)


async def _stub_open_empty(lat, lon, radius_mi=50):
    # No activated shelters by default. The route also hits the live FEMA NSS
    # feed now, and the merge tests need to stay network-free.
    return []


def test_shelters_merges_overpass_and_nces(monkeypatch):
    async def stub_shelters(lat, lon, radius_km=80):
        return [_Shelter()]
    async def stub_schools(lat, lon, radius_mi=50):
        return [_School(lat=37.6, lon=-120.05)]  # distinct location
    monkeypatch.setattr("api.routes.shelters.fetch_shelters", stub_shelters)
    monkeypatch.setattr("api.routes.shelters.fetch_schools", stub_schools)
    monkeypatch.setattr("api.routes.shelters.fetch_open_shelters", _stub_open_empty)

    r = client.get("/shelters?lat=37.5&lon=-120.0&radius_mi=50")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 2
    types = {row["type"] for row in rows}
    assert "Community centre" in types
    assert "Public school" in types


def test_shelters_survives_overpass_exception(monkeypatch):
    async def stub_shelters(lat, lon, radius_km=80):
        raise RuntimeError("overpass nuked")
    async def stub_schools(lat, lon, radius_mi=50):
        return [_School()]
    monkeypatch.setattr("api.routes.shelters.fetch_shelters", stub_shelters)
    monkeypatch.setattr("api.routes.shelters.fetch_schools", stub_schools)
    monkeypatch.setattr("api.routes.shelters.fetch_open_shelters", _stub_open_empty)

    r = client.get("/shelters?lat=37.5&lon=-120.0&radius_mi=50")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_shelters_dedupes_same_location(monkeypatch):
    """OSM and NCES at the exact same coords, first wins (OSM)."""
    async def stub_shelters(lat, lon, radius_km=80):
        return [_Shelter(lat=37.500, lon=-120.000)]
    async def stub_schools(lat, lon, radius_mi=50):
        return [_School(lat=37.500, lon=-120.000)]
    monkeypatch.setattr("api.routes.shelters.fetch_shelters", stub_shelters)
    monkeypatch.setattr("api.routes.shelters.fetch_schools", stub_schools)
    monkeypatch.setattr("api.routes.shelters.fetch_open_shelters", _stub_open_empty)

    r = client.get("/shelters?lat=37.5&lon=-120.0&radius_mi=50")
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["type"] == "Community centre"  # OSM wins


def test_shelters_activated_sort_first(monkeypatch):
    """An open/activated shelter sorts ahead of a closer candidate and carries
    the tier-1 fields."""
    async def stub_open(lat, lon, radius_mi=50):
        return [_OpenShelter(lat=37.55, lon=-120.02)]  # about 4 mi away
    async def stub_shelters(lat, lon, radius_km=80):
        return [_Shelter(lat=37.5, lon=-120.0)]        # closer candidate, right on the point
    async def stub_schools(lat, lon, radius_mi=50):
        return []
    monkeypatch.setattr("api.routes.shelters.fetch_open_shelters", stub_open)
    monkeypatch.setattr("api.routes.shelters.fetch_shelters", stub_shelters)
    monkeypatch.setattr("api.routes.shelters.fetch_schools", stub_schools)

    r = client.get("/shelters?lat=37.5&lon=-120.0&radius_mi=50")
    rows = r.json()
    assert len(rows) == 2
    assert rows[0]["activated"] is True       # activated first despite being farther
    assert rows[0]["status"] == "OPEN"
    assert rows[0]["capacity"] == 200
    assert rows[1]["activated"] is False


# /disasters/near

class _CountyInfo:
    def __init__(self, state="CA", county_name="Los Angeles County",
                 state_fips="06", county_fips="06037"):
        self.state = state
        self.state_fips = state_fips
        self.county_name = county_name
        self.county_fips = county_fips


class _Declaration:
    def __init__(self, **kw):
        self.disaster_number = kw.get("disaster_number", 4900)
        self.declaration_type = kw.get("declaration_type", "DR")
        self.declaration_date = kw.get("declaration_date", "2026-05-01T00:00:00.000Z")
        self.incident_type = kw.get("incident_type", "Fire")
        self.incident_begin = kw.get("incident_begin", "2026-04-20T00:00:00.000Z")
        self.incident_end = kw.get("incident_end", None)
        self.state = kw.get("state", "CA")
        self.designated_area = kw.get("designated_area", "Los Angeles (County)")
        self.title = kw.get("title", "CA Wildfires")


def test_disasters_near_outside_us(monkeypatch):
    """No county = empty result, no FEMA query."""
    async def stub_geo(lat, lon):
        return None
    monkeypatch.setattr("api.routes.disasters.reverse_geocode", stub_geo)
    r = client.get("/disasters/near?lat=0&lon=0")
    assert r.status_code == 200
    assert r.json() == {"county": None, "active": []}


def test_disasters_near_returns_active(monkeypatch):
    async def stub_geo(lat, lon):
        return _CountyInfo()
    async def stub_fema(state, county_name, is_city=False):
        return [_Declaration()]
    monkeypatch.setattr("api.routes.disasters.reverse_geocode", stub_geo)
    monkeypatch.setattr("api.routes.disasters.fetch_active_for_county", stub_fema)

    r = client.get("/disasters/near?lat=34.05&lon=-118.24")
    j = r.json()
    assert j["county"]["state"] == "CA"
    assert j["county"]["name"] == "Los Angeles County"
    assert len(j["active"]) == 1
    decl = j["active"][0]
    assert decl["disaster_number"] == 4900
    assert decl["url"] == "https://www.fema.gov/disaster/4900"


def test_openfema_area_match_distinguishes_county_from_city():
    """A county user must not match a like-named independent-city declaration
    (Fairfax County VA vs the independent city of Fairfax), and vice versa."""
    from api.services.openfema import _area_matches

    # County user (is_city=False)
    assert _area_matches("fairfax (county)", "fairfax", is_city=False) is True
    assert _area_matches("fairfax (city)", "fairfax", is_city=False) is False
    # City user (is_city=True)
    assert _area_matches("fairfax (city)", "fairfax", is_city=True) is True
    assert _area_matches("fairfax (county)", "fairfax", is_city=True) is False
    # Whole-word only, so a prefix collision must not match.
    assert _area_matches("franklinton (county)", "franklin", is_city=False) is False
    # No type qualifier falls through to the name match.
    assert _area_matches("statewide", "fairfax", is_city=False) is False


def test_disasters_is_independent_city_by_fips():
    from api.routes.disasters import _is_independent_city

    assert _is_independent_city("51600") is True   # Fairfax city VA
    assert _is_independent_city("51059") is False  # Fairfax County VA
    assert _is_independent_city("06037") is False  # Los Angeles County
    assert _is_independent_city(None) is False
    assert _is_independent_city("") is False


def test_disasters_near_filters_old_declarations(monkeypatch):
    """Declarations older than 365 days must be filtered out."""
    async def stub_geo(lat, lon):
        return _CountyInfo()
    async def stub_fema(state, county_name, is_city=False):
        return [_Declaration(incident_begin="2020-01-01T00:00:00.000Z")]
    monkeypatch.setattr("api.routes.disasters.reverse_geocode", stub_geo)
    monkeypatch.setattr("api.routes.disasters.fetch_active_for_county", stub_fema)

    r = client.get("/disasters/near?lat=34.05&lon=-118.24")
    assert r.json()["active"] == []


# Source health. A degrading route names the failed upstreams in the X-Source-Health
# header so the frontend can say "this feed is down" instead of showing an empty
# result. The response body must stay unchanged.

def _health(r) -> dict:
    return json.loads(r.headers["X-Source-Health"])


def test_fires_health_ok_on_success(monkeypatch):
    async def stub(days=1, bbox=None):
        return {"type": "FeatureCollection", "features": []}
    monkeypatch.setattr("api.routes.fires.fetch_fires_geojson", stub)
    r = client.get("/fires?days=1")
    assert r.status_code == 200
    assert _health(r) == {"firms": "ok"}


def test_fires_health_down_on_outage(monkeypatch):
    """A real FIRMS outage raises SourceUnavailable, so the route reports
    firms=down and degrades to an empty FeatureCollection."""
    from api.core.source_health import SourceUnavailable

    async def stub(days=1, bbox=None):
        raise SourceUnavailable("firms down")
    monkeypatch.setattr("api.routes.fires.fetch_fires_geojson", stub)
    r = client.get("/fires?days=1")
    assert r.status_code == 200
    assert _health(r) == {"firms": "down"}
    assert r.json() == {"type": "FeatureCollection", "features": []}


def test_incidents_health_reports_nifc_down(monkeypatch):
    async def stub_nifc():
        raise RuntimeError("WFIGS exploded")
    async def stub_calfire():
        return [_CalFire()]
    monkeypatch.setattr("api.routes.incidents.fetch_nifc", stub_nifc)
    monkeypatch.setattr("api.routes.incidents.fetch_calfire", stub_calfire)

    r = client.get("/incidents/near?lat=37.5&lon=-120.0&radius_mi=50")
    assert r.status_code == 200
    assert _health(r) == {"nifc": "down", "calfire": "ok"}
    # Body unchanged, Cal Fire result still flows through.
    assert len(r.json()) == 1


def test_shelters_health_reports_overpass_down(monkeypatch):
    async def stub_shelters(lat, lon, radius_km=80):
        raise RuntimeError("overpass nuked")
    async def stub_schools(lat, lon, radius_mi=50):
        return [_School()]
    monkeypatch.setattr("api.routes.shelters.fetch_shelters", stub_shelters)
    monkeypatch.setattr("api.routes.shelters.fetch_schools", stub_schools)
    monkeypatch.setattr("api.routes.shelters.fetch_open_shelters", _stub_open_empty)

    r = client.get("/shelters?lat=37.5&lon=-120.0&radius_mi=50")
    assert r.status_code == 200
    h = _health(r)
    assert h["shelters_osm"] == "down"
    assert h["shelters_nces"] == "ok"
    assert h["shelters_open"] == "ok"


def test_disasters_health_census_down(monkeypatch):
    """A Census outage reports both census=down and fema=down. FEMA can't be queried
    without a county. The body is the usual empty result."""
    async def stub_geo(lat, lon):
        raise SourceUnavailable("census down")
    monkeypatch.setattr("api.routes.disasters.reverse_geocode", stub_geo)
    r = client.get("/disasters/near?lat=34.05&lon=-118.24")
    assert r.status_code == 200
    assert _health(r) == {"census": "down", "fema": "down"}
    assert r.json() == {"county": None, "active": []}


def test_disasters_health_fema_down(monkeypatch):
    """County resolves but FEMA is down, so census=ok, fema=down, county present."""
    async def stub_geo(lat, lon):
        return _CountyInfo()
    async def stub_fema(state, county_name, is_city=False):
        raise SourceUnavailable("fema down")
    monkeypatch.setattr("api.routes.disasters.reverse_geocode", stub_geo)
    monkeypatch.setattr("api.routes.disasters.fetch_active_for_county", stub_fema)
    r = client.get("/disasters/near?lat=34.05&lon=-118.24")
    assert r.status_code == 200
    assert _health(r) == {"census": "ok", "fema": "down"}
    j = r.json()
    assert j["county"]["state"] == "CA"
    assert j["active"] == []


def test_disasters_health_outside_us_not_flagged(monkeypatch):
    """Outside a US county is NOT a failure, census stays ok."""
    async def stub_geo(lat, lon):
        return None
    monkeypatch.setattr("api.routes.disasters.reverse_geocode", stub_geo)
    r = client.get("/disasters/near?lat=0&lon=0")
    assert r.status_code == 200
    assert _health(r) == {"census": "ok", "fema": "ok"}


def test_risk_survives_census_outage(monkeypatch):
    """/risk stays at 200 when Census raises, falling back to the bbox and
    centroid guess."""
    async def stub_census(lat, lon):
        raise SourceUnavailable("census down")
    monkeypatch.setattr("api.routes.risk.reverse_geocode", stub_census)
    async def stub_kbdi(lat, lon):
        return None
    monkeypatch.setattr("api.routes.risk.fetch_kbdi_today", stub_kbdi)

    body = {**_RISK_BODY, "lat": 37.77, "lon": -122.42}  # SF
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    assert r.json()["regional_state"] == "CA"  # heuristic still resolves
