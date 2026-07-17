"""Regression tests for defensive parsing of upstream feeds.

Pins the fix where a single malformed row (present-but-null geometry) used to
raise out of the whole parse loop. Because /incidents/near and /shelters
swallow service exceptions via gather(return_exceptions=True), one bad row
silently dropped the ENTIRE feed. The parser must skip the bad row instead.

Network-free: we stub httpx.AsyncClient with a canned ArcGIS payload.
"""
from __future__ import annotations

import asyncio

import httpx
import pytest

from api.core.source_health import SourceUnavailable
from api.services import firms, nifc


class _StubResp:
    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


class _StubAsyncClient:
    """Async-context-manager drop-in for httpx.AsyncClient."""
    def __init__(self, payload: dict):
        self._payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, params=None):
        return _StubResp(self._payload)


def _patch_client(monkeypatch, payload: dict) -> None:
    monkeypatch.setattr(nifc, "_CACHE", {"ts": 0.0, "data": []})
    monkeypatch.setattr(
        nifc.httpx, "AsyncClient", lambda *a, **k: _StubAsyncClient(payload)
    )


def test_nifc_skips_null_geometry_row_keeps_the_rest(monkeypatch):
    """A WFIGS feature with coordinates [null, null] must not abort the parse;
    the good rows survive and the null-geometry row falls back to / is skipped
    rather than raising TypeError out of the whole feed."""
    payload = {
        "features": [
            {  # 1. clean geometry → kept
                "geometry": {"coordinates": [-120.0, 38.0]},
                "properties": {"IncidentName": "Good Fire", "IrwinID": "A1"},
            },
            {  # 2. null geometry but Initial lat/lon present → kept via fallback
                "geometry": {"coordinates": [None, None]},
                "properties": {
                    "IncidentName": "Fallback Fire",
                    "IrwinID": "A2",
                    "InitialLatitude": 39.5,
                    "InitialLongitude": -121.0,
                },
            },
            {  # 3. null geometry, no fallback fields → skipped, not a crash
                "geometry": {"coordinates": [None, None]},
                "properties": {"IncidentName": "Ghost Fire", "IrwinID": "A3"},
            },
        ]
    }
    _patch_client(monkeypatch, payload)

    incidents = asyncio.run(nifc.fetch_all_incidents(force=True))

    names = {i.name for i in incidents}
    assert names == {"Good Fire", "Fallback Fire"}  # ghost row skipped, no raise
    good = next(i for i in incidents if i.name == "Good Fire")
    assert (good.lat, good.lon) == (38.0, -120.0)
    fallback = next(i for i in incidents if i.name == "Fallback Fire")
    assert (fallback.lat, fallback.lon) == (39.5, -121.0)


def test_iso_from_arcgis_handles_out_of_range_epoch():
    """A garbage/out-of-range epoch must not abort the feed parse. On some
    platforms (notably Windows) datetime.fromtimestamp raises OSError/
    OverflowError for an absurd value; the converter degrades to None instead of
    raising, and does not leak the raw millisecond integer as the timestamp."""
    # A valid epoch-ms still converts.
    assert nifc._iso_from_arcgis(0) == "1970-01-01T00:00:00+00:00"
    # An out-of-range epoch degrades to None (no crash, no raw-ms leak).
    assert nifc._iso_from_arcgis(10**23) is None
    # A pre-formatted ISO string still passes through unchanged.
    assert nifc._iso_from_arcgis("2024-01-01T00:00:00Z") == "2024-01-01T00:00:00Z"
    assert nifc._iso_from_arcgis(None) is None


def test_nifc_non_json_200_degrades_to_outage(monkeypatch):
    """A 200 whose body is not JSON (resp.json() raises ValueError) is a real
    upstream problem, not a silently-empty feed: nifc raises SourceUnavailable so
    the route reports `down` rather than "no fires nearby"."""

    class _BadJsonResp:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            raise ValueError("Expecting value: line 1 column 1 (char 0)")

    class _BadJsonClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, params=None):
            return _BadJsonResp()

    monkeypatch.setattr(nifc, "_CACHE", {"ts": 0.0, "data": [], "fail_ts": 0.0})
    monkeypatch.setattr(nifc.httpx, "AsyncClient", lambda *a, **k: _BadJsonClient())

    with pytest.raises(SourceUnavailable):
        asyncio.run(nifc.fetch_all_incidents(force=True))


# ─── FIRMS multi-source merge / dedup / hardening ────────────────────────────

_FIRMS_HEADER = (
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,"
    "satellite,instrument,confidence,version,bright_ti5,frp,daynight"
)


def _firms_row(lat: float, lon: float, bright: float) -> str:
    return f"{lat},{lon},{bright},0.4,0.4,2026-07-12,1000,N,VIIRS,n,2,290,5,D"


def _firms_client(bodies: dict[str, str]):
    """Fake httpx.AsyncClient factory. `bodies` maps a FIRMS source name to the
    CSV/text body it should return; a source absent from the map raises a
    connect error (simulating that one satellite being down)."""

    class _Resp:
        def __init__(self, text: str) -> None:
            self.text = text

        def raise_for_status(self) -> None:
            return None

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url):
            # url = https://.../api/area/csv/<key>/<SOURCE>/<area>/<days>
            source = url.split("/csv/")[1].split("/")[1]
            if source not in bodies:
                raise httpx.ConnectError(f"simulated {source} outage")
            return _Resp(bodies[source])

    return lambda *a, **k: _Client()


def test_firms_non_csv_200_body_reports_down(monkeypatch):
    """FIRMS returns HTTP 200 with a plaintext error ('Invalid MAP_KEY.', quota
    exceeded) for a bad key / blown quota. That must surface as an outage
    (SourceUnavailable → firms=down), NOT parse to zero rows and read as a
    genuine map-wide 'no fires'."""
    monkeypatch.setenv("NASA_FIRMS_API_KEY", "test-key")
    monkeypatch.setenv("FIRMS_SOURCES", "VIIRS_NOAA20_NRT,VIIRS_SNPP_NRT")
    firms._CACHE.clear()
    firms._FAIL_CACHE.clear()
    bodies = {
        "VIIRS_NOAA20_NRT": "Invalid MAP_KEY.",
        "VIIRS_SNPP_NRT": "You have exceeded your allocated transaction limit.",
    }
    monkeypatch.setattr(firms.httpx, "AsyncClient", _firms_client(bodies))
    with pytest.raises(SourceUnavailable):
        asyncio.run(firms.fetch_fires_geojson(days=1, bbox="-121,37,-119,40"))


def test_firms_merges_sources_and_dedups_keeping_brightest(monkeypatch):
    """The two satellites are merged, and the same fire seen by both (near-equal
    coords) collapses to a single feature — keeping the brighter pixel so the
    downstream brightest-first cap still surfaces the strongest detection."""
    monkeypatch.setenv("NASA_FIRMS_API_KEY", "test-key")
    monkeypatch.setenv("FIRMS_SOURCES", "VIIRS_NOAA20_NRT,VIIRS_SNPP_NRT")
    firms._CACHE.clear()
    firms._FAIL_CACHE.clear()
    n20 = "\n".join([_FIRMS_HEADER, _firms_row(38.0, -120.0, 300), _firms_row(39.0, -121.0, 310)])
    # SNPP sees the SAME 38,-120 fire ~11 m away and BRIGHTER (330).
    snpp = "\n".join([_FIRMS_HEADER, _firms_row(38.0001, -120.0001, 330)])
    monkeypatch.setattr(
        firms.httpx, "AsyncClient",
        _firms_client({"VIIRS_NOAA20_NRT": n20, "VIIRS_SNPP_NRT": snpp}),
    )
    fc = asyncio.run(firms.fetch_fires_geojson(days=1, bbox="-121,37,-119,40"))
    feats = fc["features"]
    assert len(feats) == 2  # 3 raw → the two at ~38,-120 collapse to one
    near = [f for f in feats if round(f["properties"]["lat"], 3) == 38.0]
    assert len(near) == 1
    assert near[0]["properties"]["brightness"] == 330.0  # kept the brighter pixel


def test_firms_partial_success_is_not_an_outage(monkeypatch):
    """One satellite down + one returning data is NOT an outage: the available
    detections are returned (partial coverage beats a false all-clear)."""
    monkeypatch.setenv("NASA_FIRMS_API_KEY", "test-key")
    monkeypatch.setenv("FIRMS_SOURCES", "VIIRS_NOAA20_NRT,VIIRS_SNPP_NRT")
    firms._CACHE.clear()
    firms._FAIL_CACHE.clear()
    n20 = "\n".join([_FIRMS_HEADER, _firms_row(38.0, -120.0, 300)])
    # SNPP omitted → the fake client raises a connect error for it (down).
    monkeypatch.setattr(firms.httpx, "AsyncClient", _firms_client({"VIIRS_NOAA20_NRT": n20}))
    fc = asyncio.run(firms.fetch_fires_geojson(days=1, bbox="-121,37,-119,40"))
    assert len(fc["features"]) == 1
    assert fc["features"][0]["properties"]["brightness"] == 300.0
