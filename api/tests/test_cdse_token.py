"""cdse._get_token has to degrade to None and never raise.

The token JSON used to be parsed outside the try, so a 200 with an odd shape raised.
That escaped get_ndvi_current into /trajectory's gather, which doesn't swallow, and
500'd the route. httpx is stubbed with a canned token response.
"""
from __future__ import annotations

import asyncio

from api.core import http
from api.services import cdse


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

    async def post(self, url, data=None, **_kw):
        return _StubResp(self._payload)


def _patch(monkeypatch, payload: dict) -> None:
    # Both set, or _client_id/_client_secret raise before the POST ever happens.
    monkeypatch.setenv("CDSE_CLIENT_ID", "test-id")
    monkeypatch.setenv("CDSE_CLIENT_SECRET", "test-secret")
    # Fresh cache and lock so the fetch path runs and we don't cross event loops.
    monkeypatch.setattr(cdse, "_token_cache", {"token": "", "expires_at": 0.0})
    monkeypatch.setattr(cdse, "_token_lock", asyncio.Lock())
    monkeypatch.setattr(http, "client", lambda *a, **k: _StubAsyncClient(payload))


def test_token_missing_access_token_returns_none(monkeypatch):
    """Some gateways return an error body with a 200, so this must not KeyError."""
    _patch(monkeypatch, {"error": "invalid_client"})
    assert asyncio.run(cdse._get_token()) is None


def test_token_non_numeric_expires_in_returns_none(monkeypatch):
    """A malformed expires_in must degrade to None, not ValueError."""
    _patch(monkeypatch, {"access_token": "abc", "expires_in": "soon"})
    assert asyncio.run(cdse._get_token()) is None


def test_token_valid_response_returns_token(monkeypatch):
    """Guards the happy path against the degrade-to-None branches above."""
    _patch(monkeypatch, {"access_token": "good-token", "expires_in": 3600})
    assert asyncio.run(cdse._get_token()) == "good-token"
