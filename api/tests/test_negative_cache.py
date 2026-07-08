"""Regression tests for the short-lived negative cache in census + openfema.

Pins the anti-hammer guard: during an upstream outage, repeated calls within the
failure-TTL window are served from the negative cache (raising SourceUnavailable)
WITHOUT re-hitting the failing endpoint, then recover once the upstream comes
back. The failure marker is kept distinct from the success cache, whose None /
[] means a real "not in the US" / "no active declarations" answer.

Network-free: we stub httpx.AsyncClient with a call-counting client that can be
flipped between failing and succeeding mid-test.
"""
from __future__ import annotations

import asyncio
import time

import httpx
import pytest

from api.core.source_health import SourceUnavailable
from api.services import census, firms, openfema


class _Resp:
    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


class _CountingClient:
    """Async-context-manager drop-in that counts upstream calls and either
    raises (outage) or returns a canned payload, switchable via `mode`."""
    def __init__(self, calls: list, mode: dict, payload: dict):
        self._calls = calls
        self._mode = mode
        self._payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, params=None):
        self._calls.append(1)
        if self._mode["fail"]:
            raise RuntimeError("simulated upstream outage")
        return _Resp(self._payload)


_CENSUS_OK = {
    "result": {
        "geographies": {
            "Counties": [
                {
                    "STATE": "06",
                    "STUSAB": "CA",
                    "BASENAME": "Los Angeles",
                    "GEOID": "06037",
                }
            ]
        }
    }
}


def _patch(monkeypatch, mod, calls, mode, payload):
    mod._CACHE.clear()
    mod._FAIL_CACHE.clear()
    monkeypatch.setattr(
        mod.httpx, "AsyncClient", lambda *a, **k: _CountingClient(calls, mode, payload)
    )


# --- census ------------------------------------------------------------------

def test_census_negative_cache_bounds_upstream_calls(monkeypatch):
    """Two failing lookups for the same point hit the upstream only once; the
    second is served from the negative cache and still raises."""
    calls: list = []
    _patch(monkeypatch, census, calls, {"fail": True}, {})

    with pytest.raises(SourceUnavailable):
        asyncio.run(census.reverse_geocode(38.0, -120.0))
    with pytest.raises(SourceUnavailable):
        asyncio.run(census.reverse_geocode(38.0, -120.0))

    assert len(calls) == 1  # second call short-circuited by the negative cache


def test_census_negative_cache_recovers_after_ttl(monkeypatch):
    """Once the failure entry ages past the TTL and the upstream recovers, the
    next lookup fetches fresh data and clears the failure marker."""
    calls: list = []
    mode = {"fail": True}
    _patch(monkeypatch, census, calls, mode, _CENSUS_OK)

    with pytest.raises(SourceUnavailable):
        asyncio.run(census.reverse_geocode(38.0, -120.0))

    # Age the failure past _fail_ttl(), then let the upstream come back.
    key = "38.0|-120.0"
    census._FAIL_CACHE[key] = time.time() - 3600
    mode["fail"] = False

    info = asyncio.run(census.reverse_geocode(38.0, -120.0))
    assert info is not None
    assert info.state == "CA"
    assert info.county_fips == "06037"
    assert key not in census._FAIL_CACHE  # cleared on success


# --- openfema ----------------------------------------------------------------

def test_openfema_negative_cache_bounds_upstream_calls(monkeypatch):
    """Two failing county queries hit the upstream only once."""
    calls: list = []
    _patch(monkeypatch, openfema, calls, {"fail": True}, {})

    with pytest.raises(SourceUnavailable):
        asyncio.run(openfema.fetch_active_for_county("CA", "Los Angeles County"))
    with pytest.raises(SourceUnavailable):
        asyncio.run(openfema.fetch_active_for_county("CA", "Los Angeles County"))

    assert len(calls) == 1


# --- firms -------------------------------------------------------------------

def test_firms_negative_cache_bounds_upstream_calls(monkeypatch):
    """Two failing FIRMS fetches for the same query hit the upstream once; the
    second is served from the negative cache and still raises (which /fires
    turns into a firms=down header). FIRMS only catches httpx errors, so the
    stub raises one."""
    monkeypatch.setenv("NASA_FIRMS_API_KEY", "test-key")
    firms._CACHE.clear()
    firms._FAIL_CACHE.clear()
    calls: list = []

    class _FailingClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url):
            calls.append(1)
            raise httpx.ConnectError("simulated firms outage")

    monkeypatch.setattr(firms.httpx, "AsyncClient", lambda *a, **k: _FailingClient())

    bbox = "-121,37,-120,38"
    with pytest.raises(SourceUnavailable):
        asyncio.run(firms.fetch_fires_geojson(days=1, bbox=bbox))
    with pytest.raises(SourceUnavailable):
        asyncio.run(firms.fetch_fires_geojson(days=1, bbox=bbox))

    assert len(calls) == 1
