"""Regression tests for cdse._get_token — auth must degrade to None, never raise.

Pins the fix where the token JSON was parsed OUTSIDE the try/except, so a 200
response with an unexpected shape (an OAuth error object returned with status
200, a proxy/captive-portal JSON page, or a non-numeric expires_in) raised
KeyError/ValueError. That escaped get_ndvi_current into /trajectory's gather
(which does not swallow exceptions) and 500-ed the route. _get_token must return
None on ANY auth failure so /risk and /trajectory fall back to the season
multiplier instead.

Network-free: we stub httpx.AsyncClient with a canned token response.
"""
from __future__ import annotations

import asyncio

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

    async def post(self, url, data=None):
        return _StubResp(self._payload)


def _patch(monkeypatch, payload: dict) -> None:
    # Real credentials so _client_id/_client_secret don't raise before the POST.
    monkeypatch.setenv("CDSE_CLIENT_ID", "test-id")
    monkeypatch.setenv("CDSE_CLIENT_SECRET", "test-secret")
    # Fresh cache + lock so the fetch path runs and we don't cross event loops.
    monkeypatch.setattr(cdse, "_token_cache", {"token": "", "expires_at": 0.0})
    monkeypatch.setattr(cdse, "_token_lock", asyncio.Lock())
    monkeypatch.setattr(
        cdse.httpx, "AsyncClient", lambda *a, **k: _StubAsyncClient(payload)
    )


def test_token_missing_access_token_returns_none(monkeypatch):
    """A 200 whose JSON lacks access_token (e.g. {"error": "invalid_client"}
    some gateways return with status 200) must degrade to None, not KeyError."""
    _patch(monkeypatch, {"error": "invalid_client"})
    assert asyncio.run(cdse._get_token()) is None


def test_token_non_numeric_expires_in_returns_none(monkeypatch):
    """A malformed expires_in must degrade to None, not ValueError."""
    _patch(monkeypatch, {"access_token": "abc", "expires_in": "soon"})
    assert asyncio.run(cdse._get_token()) is None


def test_token_valid_response_returns_token(monkeypatch):
    """A well-formed response still yields the token (guards against the fix
    over-degrading the happy path)."""
    _patch(monkeypatch, {"access_token": "good-token", "expires_in": 3600})
    assert asyncio.run(cdse._get_token()) == "good-token"
