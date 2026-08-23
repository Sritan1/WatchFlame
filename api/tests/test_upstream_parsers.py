"""Defensive parsing of the upstream feeds.

One row with null geometry used to raise out of the whole parse loop, and the routes
swallow service exceptions, so a single bad row dropped the entire feed. The parser
skips that row instead. httpx is stubbed with a canned ArcGIS payload.
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
    """Coordinates of [null, null] must not abort the parse. The good rows
    survive, and the bad one either falls back or gets skipped."""
    payload = {
        "features": [
            {  # clean geometry, kept
                "geometry": {"coordinates": [-120.0, 38.0]},
                "properties": {"IncidentName": "Good Fire", "IrwinID": "A1"},
            },
            {  # no geometry, but the fallback fields carry it
                "geometry": {"coordinates": [None, None]},
                "properties": {
                    "IncidentName": "Fallback Fire",
                    "IrwinID": "A2",
                    "InitialLatitude": 39.5,
                    "InitialLongitude": -121.0,
                },
            },
            {  # nothing at all, so skipped rather than crashing
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
    """An absurd epoch must not abort the parse. datetime.fromtimestamp raises
    on Windows for a value that far out, so the converter returns None instead
    of raising or leaking the raw milliseconds as a timestamp."""
    # A valid epoch-ms still converts.
    assert nifc._iso_from_arcgis(0) == "1970-01-01T00:00:00+00:00"
    # An out-of-range epoch degrades to None, with no crash and no raw-ms leak.
    assert nifc._iso_from_arcgis(10**23) is None
    # A pre-formatted ISO string still passes through unchanged.
    assert nifc._iso_from_arcgis("2024-01-01T00:00:00Z") == "2024-01-01T00:00:00Z"
    assert nifc._iso_from_arcgis(None) is None


def test_nifc_non_json_200_degrades_to_outage(monkeypatch):
    """A 200 whose body isn't JSON is a real upstream problem, not an empty
    feed, so nifc raises and the route says down instead of "no fires nearby"."""

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


# FIRMS multi-source merge, dedup and hardening

_FIRMS_HEADER = (
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,"
    "satellite,instrument,confidence,version,bright_ti5,frp,daynight"
)


def _firms_row(lat: float, lon: float, bright: float) -> str:
    return f"{lat},{lon},{bright},0.4,0.4,2026-07-12,1000,N,VIIRS,n,2,290,5,D"


def _firms_client(bodies: dict[str, str]):
    """Fake httpx.AsyncClient factory. `bodies` maps a FIRMS source name to the
    body it returns. A source missing from the map raises a connect error,
    which stands in for that satellite being down."""

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
            # The source name is the third-from-last path segment.
            source = url.split("/csv/")[1].split("/")[1]
            if source not in bodies:
                raise httpx.ConnectError(f"simulated {source} outage")
            return _Resp(bodies[source])

    return lambda *a, **k: _Client()


def test_firms_non_csv_200_body_reports_down(monkeypatch):
    """FIRMS answers a bad key or a blown quota with a 200 and a plaintext
    error. That has to read as an outage, not parse to zero rows and look like
    a genuine map-wide "no fires"."""
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
    """The two satellites merge, and a fire both of them saw collapses into one
    feature. The brighter pixel wins so the brightest-first cap downstream still
    surfaces the strongest detection."""
    monkeypatch.setenv("NASA_FIRMS_API_KEY", "test-key")
    monkeypatch.setenv("FIRMS_SOURCES", "VIIRS_NOAA20_NRT,VIIRS_SNPP_NRT")
    firms._CACHE.clear()
    firms._FAIL_CACHE.clear()
    n20 = "\n".join([_FIRMS_HEADER, _firms_row(38.0, -120.0, 300), _firms_row(39.0, -121.0, 310)])
    # SNPP sees the same fire about 14 m away and brighter.
    snpp = "\n".join([_FIRMS_HEADER, _firms_row(38.0001, -120.0001, 330)])
    monkeypatch.setattr(
        firms.httpx, "AsyncClient",
        _firms_client({"VIIRS_NOAA20_NRT": n20, "VIIRS_SNPP_NRT": snpp}),
    )
    fc = asyncio.run(firms.fetch_fires_geojson(days=1, bbox="-121,37,-119,40"))
    feats = fc["features"]
    assert len(feats) == 2  # three raw, and the two near 38,-120 collapse to one
    near = [f for f in feats if round(f["properties"]["lat"], 3) == 38.0]
    assert len(near) == 1
    assert near[0]["properties"]["brightness"] == 330.0  # kept the brighter pixel


def test_firms_partial_success_is_not_an_outage(monkeypatch):
    """One satellite down while another returns data is not an outage. The available
    detections are returned (partial coverage beats a false all-clear)."""
    monkeypatch.setenv("NASA_FIRMS_API_KEY", "test-key")
    monkeypatch.setenv("FIRMS_SOURCES", "VIIRS_NOAA20_NRT,VIIRS_SNPP_NRT")
    firms._CACHE.clear()
    firms._FAIL_CACHE.clear()
    n20 = "\n".join([_FIRMS_HEADER, _firms_row(38.0, -120.0, 300)])
    # Only one satellite answers. The fake client fails the other.
    monkeypatch.setattr(firms.httpx, "AsyncClient", _firms_client({"VIIRS_NOAA20_NRT": n20}))
    fc = asyncio.run(firms.fetch_fires_geojson(days=1, bbox="-121,37,-119,40"))
    assert len(fc["features"]) == 1
    assert fc["features"][0]["properties"]["brightness"] == 300.0
