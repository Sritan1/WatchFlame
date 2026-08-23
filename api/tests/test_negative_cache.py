"""The short-lived negative cache in census and openfema.

During an outage, repeated calls inside the failure window raise straight out of the
cache without touching the dead endpoint, then recover. The failure marker stays
separate from the success cache, where None or [] is a real answer.
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
    """httpx.AsyncClient stand-in that counts calls and either raises or returns
    a canned payload, switched through `mode`."""
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


# census

def test_census_negative_cache_bounds_upstream_calls(monkeypatch):
    """The second failure raises out of the cache, not the upstream."""
    calls: list = []
    _patch(monkeypatch, census, calls, {"fail": True}, {})

    with pytest.raises(SourceUnavailable):
        asyncio.run(census.reverse_geocode(38.0, -120.0))
    with pytest.raises(SourceUnavailable):
        asyncio.run(census.reverse_geocode(38.0, -120.0))

    assert len(calls) == 1  # second call short-circuited by the negative cache


def test_census_negative_cache_recovers_after_ttl(monkeypatch):
    """A recovered upstream clears the marker on the next lookup."""
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


# openfema

def test_openfema_negative_cache_bounds_upstream_calls(monkeypatch):
    calls: list = []
    _patch(monkeypatch, openfema, calls, {"fail": True}, {})

    with pytest.raises(SourceUnavailable):
        asyncio.run(openfema.fetch_active_for_county("CA", "Los Angeles County"))
    with pytest.raises(SourceUnavailable):
        asyncio.run(openfema.fetch_active_for_county("CA", "Los Angeles County"))

    assert len(calls) == 1


# firms

def test_firms_negative_cache_bounds_upstream_calls(monkeypatch):
    """FIRMS only catches httpx errors, so the stub has to raise one."""
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
    after_first = len(calls)
    with pytest.raises(SourceUnavailable):
        asyncio.run(firms.fetch_fires_geojson(days=1, bbox=bbox))

    # The first call tries every source once and they all fail. The second
    # comes out of the cache and adds no upstream calls at all.
    assert after_first == len(firms._sources())
    assert len(calls) == after_first
