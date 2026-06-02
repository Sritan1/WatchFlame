"""End-to-end route tests using FastAPI's TestClient.

Strategy:
- Each route's upstream service function is monkey-patched at the *route
  module* import location (where it's actually called from), not at the
  service module — that's how Python imports + monkeypatch work.
- Success path + at-least-one upstream-failure path per route.
- /risk and /healthz exercise real code (pure functions, no upstream).
- Mocked stubs are tiny async functions, not unittest.mock.AsyncMock —
  shorter and easier to read in the asserts.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


# --- /healthz ----------------------------------------------------------------

def test_healthz():
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


# --- /fires ------------------------------------------------------------------

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
    """days param has ge=1 le=10 — 100 must fail Pydantic validation."""
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
    assert seen == {"days": 3, "bbox": "-122,37,-121,38"}


# --- /risk -------------------------------------------------------------------

_RISK_BODY = {
    "temperature": 30.0,
    "humidity": 25.0,
    "wind_speed": 20.0,
    "days_since_rain": 14,
    "season": "summer",
}


@pytest.fixture(autouse=True)
def _stub_ndvi(monkeypatch):
    """Default NDVI stubs return None so /risk tests don't hit the live CDSE
    Statistical API. compute_risk falls back to season_mult when both NDVI
    fetches return None — preserves the pre-V4 behavior for existing tests.
    Individual tests can override these patches to exercise the NDVI path."""
    async def _none(*_args, **_kwargs):
        return None
    monkeypatch.setattr("api.routes.risk.get_ndvi_current", _none)
    monkeypatch.setattr("api.routes.risk.get_ndvi_climatology", _none)


@pytest.fixture(autouse=True)
def _stub_census(monkeypatch):
    """Default Census reverse-geocode stub returns None so /risk tests don't
    hit the live Census endpoint. None means regional_level falls back to its
    bbox/centroid heuristic — preserves pre-fix behavior for existing tests.
    Individual tests can override with a real CountyInfo to exercise the
    authoritative state-lookup path."""
    async def _none(*_args, **_kwargs):
        return None
    monkeypatch.setattr("api.routes.risk.reverse_geocode", _none)


def test_risk_basic_no_location():
    """Without lat/lon AND without state hint, every regional/satellite/kbdi
    field should be None — pure what-if path."""
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
    bad = {**_RISK_BODY, "humidity": 150}  # > 100
    r = client.post("/risk", json=bad)
    assert r.status_code == 422


def test_risk_validates_season():
    bad = {**_RISK_BODY, "season": "monsoon"}  # not in Literal
    r = client.post("/risk", json=bad)
    assert r.status_code == 422


def test_risk_with_location_returns_regional(monkeypatch):
    """When lat/lon is in a calibrated state, regional_state must be set."""
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
    """When fetch_kbdi_today returns data, kbdi propagates to the response."""
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
    """Body-supplied kbdi takes precedence over the archive fetch."""
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
    bad = {**_RISK_BODY, "kbdi": 1000}  # > 800
    r = client.post("/risk", json=bad)
    assert r.status_code == 422


def test_risk_calibration_endpoint():
    r = client.get("/risk/calibration")
    assert r.status_code == 200
    j = r.json()
    assert "version" in j and "states_calibrated" in j
    assert isinstance(j["states_calibrated"], list)


# --- /risk NDVI integration --------------------------------------------------

def test_risk_with_ndvi_propagates_to_response(monkeypatch):
    """When CDSE returns usable current + climatology, ndvi_anomaly appears
    in the response and the score reflects ndvi_factor in place of season_mult."""
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
    """Body-supplied ndvi_anomaly takes precedence; the CDSE fetchers must
    not be called."""
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
    """Pydantic should reject |anomaly| > 1."""
    bad = {**_RISK_BODY, "ndvi_anomaly": 1.5}
    r = client.post("/risk", json=bad)
    assert r.status_code == 422


def test_risk_census_state_used_for_regional_lookup(monkeypatch):
    """When Census reverse-geocode returns a state, it must be passed as
    state_hint to regional_level so the authoritative state wins over the
    bbox+centroid heuristic. Pins the Reno NV border-overlap fix."""
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
    # Census said NV; route must surface NV, NOT CA (which the bbox heuristic
    # would have picked because CA's centroid is closer to Reno).
    assert j["regional_state"] == "NV"


def test_risk_census_unavailable_falls_back_to_heuristic(monkeypatch):
    """When Census returns None (rate-limited, network error, point not in
    US), the route falls back to the bbox+centroid heuristic — which is
    imperfect at borders but better than no calibration at all."""
    # _stub_census already makes reverse_geocode return None.
    body = {**_RISK_BODY, "lat": 37.77, "lon": -122.42}  # SF
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    j = r.json()
    # SF is squarely inside CA's bbox, so the heuristic correctly returns CA
    # even without Census help.
    assert j["regional_state"] == "CA"


def test_risk_state_body_field_without_coords_returns_regional():
    """Risk Calculator's state-dropdown path: a state hint in the body alone
    (no lat/lon) must still trigger regional bucketing using that state's
    thresholds. Pre-fix, regional_level was only computed when have_coords."""
    body = {**_RISK_BODY, "state": "CA"}
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    j = r.json()
    assert j["regional_state"] == "CA"
    assert j["regional_level"] in ("LOW", "MODERATE", "HIGH", "EXTREME")
    # No coords means no upstream fetches; kbdi must remain None.
    assert j["kbdi"] is None


def test_risk_state_body_field_skips_census_when_provided(monkeypatch):
    """When the body supplies an explicit `state`, reverse_geocode must not
    be called. Saves a round-trip and honors the explicit user choice over
    the Census/heuristic chain."""
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
    """The Status orb's percentile-fill mapping needs the per-state cutoffs +
    score_max in the response. Pin the shape so a future schema change can't
    silently drop the fields the frontend depends on."""
    body = {**_RISK_BODY, "state": "FL"}
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    t = r.json().get("regional_thresholds")
    assert t is not None, "regional_thresholds must be present when state is calibrated"
    for k in ("low", "moderate", "high", "extreme", "score_max"):
        assert k in t, f"missing key: {k}"
        assert isinstance(t[k], (int, float))
    # Monotonic ordering — guards against accidentally swapping fields.
    assert t["low"] < t["moderate"] < t["extreme"] <= t["score_max"]


def test_risk_regional_thresholds_absent_for_unknown_state():
    """state="XX" (unfit / unknown) must NOT crash; route falls back to
    global cutoffs and leaves regional_thresholds unset."""
    body = {**_RISK_BODY, "state": "XX"}
    r = client.post("/risk", json=body)
    assert r.status_code == 200
    j = r.json()
    # regional_state is None because the unknown code doesn't map to a fit;
    # the response stays well-formed (no crash) and falls back to globals.
    assert j["regional_state"] is None
    assert j["regional_thresholds"] is None


def test_risk_ndvi_partial_failure_falls_back_to_season(monkeypatch):
    """If only one of {current, climatology} returns a value, anomaly cannot
    be computed — route must leave ndvi_anomaly=None and fall back to
    season_mult silently."""
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
    assert j["ndvi_anomaly"] is None  # partial data → no anomaly surfaced


# --- /weather ----------------------------------------------------------------

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


# --- /geocode ----------------------------------------------------------------

def test_geocode_passthrough(monkeypatch):
    async def stub(q, limit=5):
        return [{"name": q, "state": "CA", "country": "US", "lat": 37.0, "lon": -120.0}]
    monkeypatch.setattr("api.routes.geocode.geocode_city", stub)
    r = client.get("/geocode?q=fresno")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["name"] == "fresno"


def test_geocode_empty_on_failure(monkeypatch):
    """owm-geocode now returns [] on upstream failure rather than raising."""
    async def stub(q, limit=5):
        return []
    monkeypatch.setattr("api.routes.geocode.geocode_city", stub)
    r = client.get("/geocode?q=anything")
    assert r.status_code == 200
    assert r.json() == []


def test_geocode_validates_query_length():
    r = client.get("/geocode?q=a")  # min_length=2
    assert r.status_code == 422


# --- /incidents/near ---------------------------------------------------------

# Helper: minimal NIFC + Cal Fire dataclass-shaped stubs that the route can iterate.

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
    """Both feeds return the same incident — the merge keeps Cal Fire (richer)
    as base and fills personnel/cause from NIFC."""
    async def stub_nifc():
        return [_NIFC(personnel=120, cause="Powerline", acres=None)]
    async def stub_calfire():
        return [_CalFire()]  # has acres + url, no personnel/cause
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
    """asyncio.gather(return_exceptions=True) means a raising service
    doesn't kill the route — the Cal Fire result still flows through."""
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
    """Incidents outside the radius must be excluded."""
    async def stub_nifc():
        return [_NIFC(lat=40.0, lon=-122.0)]  # ~180mi from query point
    async def stub_calfire():
        return []
    monkeypatch.setattr("api.routes.incidents.fetch_nifc", stub_nifc)
    monkeypatch.setattr("api.routes.incidents.fetch_calfire", stub_calfire)

    r = client.get("/incidents/near?lat=37.5&lon=-120.0&radius_mi=15")
    assert r.json() == []


# --- /shelters ---------------------------------------------------------------

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
    # Default: no activated shelters. Keeps the candidate-merge tests network-free
    # now that the route also queries the live FEMA NSS feed.
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
    """Same as /incidents/near — gather(return_exceptions=True) keeps the route alive."""
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
    """OSM and NCES at the exact same coords — first wins (OSM)."""
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
        return [_OpenShelter(lat=37.55, lon=-120.02)]  # ~4 mi away
    async def stub_shelters(lat, lon, radius_km=80):
        return [_Shelter(lat=37.5, lon=-120.0)]        # closer candidate (~0 mi)
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


# --- /disasters/near ---------------------------------------------------------

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
    async def stub_fema(state, county_name):
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


def test_disasters_near_filters_old_declarations(monkeypatch):
    """Declarations older than 365 days must be filtered out."""
    async def stub_geo(lat, lon):
        return _CountyInfo()
    async def stub_fema(state, county_name):
        return [_Declaration(incident_begin="2020-01-01T00:00:00.000Z")]
    monkeypatch.setattr("api.routes.disasters.reverse_geocode", stub_geo)
    monkeypatch.setattr("api.routes.disasters.fetch_active_for_county", stub_fema)

    r = client.get("/disasters/near?lat=34.05&lon=-118.24")
    assert r.json()["active"] == []
