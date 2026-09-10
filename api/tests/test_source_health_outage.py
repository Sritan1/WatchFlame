"""The outage signal on the incident and shelter feeds.

These services used to swallow upstream errors and return []. The routes read down
off an exception, so an outage looked exactly like an empty feed and got reported as
ok, the one thing source health exists to prevent. Now each service raises and leaves
a short-lived marker.
"""
from __future__ import annotations

import asyncio
import time

import httpx
import pytest

from api.core import http
from api.core.source_health import SourceUnavailable
from api.services import calfire, nces, nifc, open_shelters, overpass


class _Resp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return self._payload


class _FlipClient:
    """httpx.AsyncClient stand-in that counts calls and either raises or returns
    a canned payload, flipped mid-test through the shared `mode` dict."""

    def __init__(self, calls: list, mode: dict, payload):
        self._calls = calls
        self._mode = mode
        self._payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def _call(self):
        self._calls.append(1)
        if self._mode["fail"]:
            raise httpx.ConnectError("simulated upstream outage")
        return _Resp(self._payload)

    async def get(self, *a, **k):
        return await self._call()

    async def post(self, *a, **k):
        return await self._call()


def _patch(monkeypatch, calls, mode, payload):
    monkeypatch.setattr(
        http, "client", lambda *a, **k: _FlipClient(calls, mode, payload)
    )


# nifc, global cache

def test_nifc_outage_raises_and_backs_off(monkeypatch):
    nifc._CACHE.update(ts=0.0, data=[], fail_ts=0.0)
    calls: list = []
    _patch(monkeypatch, calls, {"fail": True}, {})

    with pytest.raises(SourceUnavailable):
        asyncio.run(nifc.fetch_all_incidents())
    with pytest.raises(SourceUnavailable):
        asyncio.run(nifc.fetch_all_incidents())

    assert len(calls) == 1  # second call served from the negative cache


def test_nifc_recovers_after_fail_ttl(monkeypatch):
    nifc._CACHE.update(ts=0.0, data=[], fail_ts=0.0)
    calls: list = []
    mode = {"fail": True}
    _patch(monkeypatch, calls, mode, {"features": []})

    with pytest.raises(SourceUnavailable):
        asyncio.run(nifc.fetch_all_incidents())

    nifc._CACHE["fail_ts"] = time.time() - 3600  # age past _fail_ttl()
    mode["fail"] = False
    assert asyncio.run(nifc.fetch_all_incidents()) == []
    assert nifc._CACHE["fail_ts"] == 0.0  # cleared on success


# calfire, global cache

def test_calfire_outage_raises_and_backs_off(monkeypatch):
    calfire._CACHE.update(ts=0.0, data=[], fail_ts=0.0)
    calls: list = []
    _patch(monkeypatch, calls, {"fail": True}, [])

    with pytest.raises(SourceUnavailable):
        asyncio.run(calfire.fetch_active_incidents())
    with pytest.raises(SourceUnavailable):
        asyncio.run(calfire.fetch_active_incidents())

    assert len(calls) == 1


def test_calfire_non_list_body_raises(monkeypatch):
    """A 200 with an unexpected (non-list) shape is a real upstream problem, not
    a silently-empty feed."""
    calfire._CACHE.update(ts=0.0, data=[], fail_ts=0.0)
    calls: list = []
    _patch(monkeypatch, calls, {"fail": False}, {"error": "maintenance"})

    with pytest.raises(SourceUnavailable):
        asyncio.run(calfire.fetch_active_incidents())


def test_calfire_skips_non_dict_rows(monkeypatch):
    """A null / non-object element must be skipped, not abort the whole feed."""
    calfire._CACHE.update(ts=0.0, data=[], fail_ts=0.0)
    calls: list = []
    good = {"Latitude": 37.5, "Longitude": -120.0, "Name": "Test Fire"}
    _patch(monkeypatch, calls, {"fail": False}, [good, None, "junk"])

    rows = asyncio.run(calfire.fetch_active_incidents())
    assert len(rows) == 1
    assert rows[0].name == "Test Fire"


# overpass, per-key cache, POST

def test_overpass_outage_raises_and_backs_off(monkeypatch):
    """A cold cache with a dead upstream reports down, and only probes once
    inside the backoff window."""
    overpass._CACHE.clear()
    overpass._FAIL_CACHE.clear()
    calls: list = []
    _patch(monkeypatch, calls, {"fail": True}, {})

    with pytest.raises(SourceUnavailable):
        asyncio.run(overpass.fetch_shelters(38.0, -120.0))
    with pytest.raises(SourceUnavailable):
        asyncio.run(overpass.fetch_shelters(38.0, -120.0))

    assert len(calls) == 1


def test_overpass_serves_stale_cache_on_failure(monkeypatch):
    """With a warm cache, a later failure serves the last good result instead of
    raising. These mapped shelters barely change, so a stale list is fine and
    /shelters should not claim the feed is down."""
    overpass._CACHE.clear()
    overpass._FAIL_CACHE.clear()
    calls: list = []
    mode = {"fail": False}
    payload = {
        "elements": [
            {
                "type": "node",
                "id": 1,
                "lat": 38.0,
                "lon": -120.0,
                "tags": {"amenity": "community_centre", "name": "Test Center"},
            }
        ]
    }
    _patch(monkeypatch, calls, mode, payload)

    # Warm the cache.
    first = asyncio.run(overpass.fetch_shelters(38.0, -120.0))
    assert [s.name for s in first] == ["Test Center"]

    # Make any cache entry look stale so the next call tries to refresh, then
    # take the upstream down.
    monkeypatch.setattr(overpass, "_ttl", lambda: 0)
    mode["fail"] = True

    # The refresh fails, but the warm cache is served, so nothing raises.
    stale = asyncio.run(overpass.fetch_shelters(38.0, -120.0))
    assert [s.name for s in stale] == ["Test Center"]

    # Inside the backoff window it serves stale without touching the upstream.
    calls_before = len(calls)
    stale2 = asyncio.run(overpass.fetch_shelters(38.0, -120.0))
    assert [s.name for s in stale2] == ["Test Center"]
    assert len(calls) == calls_before


# nces, per-key cache

def test_nces_outage_raises_and_backs_off(monkeypatch):
    nces._CACHE.clear()
    nces._FAIL_CACHE.clear()
    calls: list = []
    _patch(monkeypatch, calls, {"fail": True}, {})

    with pytest.raises(SourceUnavailable):
        asyncio.run(nces.fetch_schools(38.0, -120.0))
    with pytest.raises(SourceUnavailable):
        asyncio.run(nces.fetch_schools(38.0, -120.0))

    assert len(calls) == 1


# open_shelters, per-key cache

def test_open_shelters_outage_raises_and_backs_off(monkeypatch):
    monkeypatch.setenv("MOCK_OPEN_SHELTERS", "0")
    open_shelters._CACHE.clear()
    open_shelters._FAIL_CACHE.clear()
    calls: list = []
    _patch(monkeypatch, calls, {"fail": True}, {})

    with pytest.raises(SourceUnavailable):
        asyncio.run(open_shelters.fetch_open_shelters(38.0, -120.0))
    with pytest.raises(SourceUnavailable):
        asyncio.run(open_shelters.fetch_open_shelters(38.0, -120.0))

    assert len(calls) == 1
