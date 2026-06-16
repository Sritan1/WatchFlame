"""Regression tests for defensive parsing of upstream feeds.

Pins the fix where a single malformed row (present-but-null geometry) used to
raise out of the whole parse loop. Because /incidents/near and /shelters
swallow service exceptions via gather(return_exceptions=True), one bad row
silently dropped the ENTIRE feed. The parser must skip the bad row instead.

Network-free: we stub httpx.AsyncClient with a canned ArcGIS payload.
"""
from __future__ import annotations

import asyncio

from api.services import nifc


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
