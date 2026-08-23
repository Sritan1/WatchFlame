"""Tests for fetch_window's caching across success, failure and rate-limit.

A 200 caches the response. A network error or a non-429 4xx caches None, that failure
is permanent. Exhausting retries on 429 caches nothing, so a later run retries. That
last one silently wiped out six states in the first KBDI calibration run.
"""
from __future__ import annotations

from datetime import date

import httpx

from api.core import openmeteo


class _StubResponse:
    def __init__(self, status_code: int, payload: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


class _StubClient:
    """Drop-in replacement for httpx.Client used inside fetch_window."""
    def __init__(self, responses: list[_StubResponse]):
        # Each .get() consumes the next item and raises once they run out, so
        # an unexpected extra call fails loudly.
        self._responses = list(responses)
        self.call_count = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get(self, url, params=None):
        if not self._responses:
            raise AssertionError("StubClient ran out of canned responses")
        self.call_count += 1
        return self._responses.pop(0)


def _patch_client(monkeypatch, responses: list[_StubResponse]) -> _StubClient:
    stub = _StubClient(responses)
    def factory(*args, **kwargs):
        return stub
    monkeypatch.setattr(openmeteo.httpx, "Client", factory)
    # Eliminate sleeps so retry tests are fast.
    monkeypatch.setattr(openmeteo.time, "sleep", lambda *_: None)
    return stub


def test_fetch_window_200_caches_data(monkeypatch):
    payload = {"daily": {"time": ["2020-06-01"], "temperature_2m_max": [25.0]}}
    _patch_client(monkeypatch, [_StubResponse(200, payload)])
    cache: dict = {}
    result = openmeteo.fetch_window(
        37.0, -120.0, date(2020, 6, 1), days=60, cache=cache, polite_delay=0,
    )
    assert result == payload
    # Cache key includes lat|lon|date|days
    assert len(cache) == 1
    assert next(iter(cache.values())) == payload


def test_fetch_window_4xx_caches_none(monkeypatch):
    """A 4xx other than 429 is permanent, so it caches."""
    _patch_client(monkeypatch, [_StubResponse(400, text="bad coords")])
    cache: dict = {}
    result = openmeteo.fetch_window(
        37.0, -120.0, date(2020, 6, 1), days=60, cache=cache, polite_delay=0, retries=3,
    )
    assert result is None
    assert len(cache) == 1
    assert next(iter(cache.values())) is None


def test_fetch_window_network_error_caches_none(monkeypatch):
    class _ExplodingClient:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def get(self, *a, **k):
            raise httpx.ConnectError("boom")
    monkeypatch.setattr(openmeteo.httpx, "Client", lambda *a, **k: _ExplodingClient())
    monkeypatch.setattr(openmeteo.time, "sleep", lambda *_: None)
    cache: dict = {}
    result = openmeteo.fetch_window(
        37.0, -120.0, date(2020, 6, 1), days=60, cache=cache, polite_delay=0, retries=3,
    )
    assert result is None
    assert len(cache) == 1
    assert next(iter(cache.values())) is None


def test_fetch_window_exhausted_429_does_not_cache(monkeypatch, capsys):
    """A rate limit must not poison the cache, and must log."""
    stub = _patch_client(
        monkeypatch,
        [_StubResponse(429), _StubResponse(429), _StubResponse(429)],
    )
    cache: dict = {}
    result = openmeteo.fetch_window(
        37.0, -120.0, date(2020, 6, 1), days=365, cache=cache, polite_delay=0, retries=3,
    )
    assert result is None
    assert stub.call_count == 3, "should have used all 3 retries"
    assert cache == {}, "exhausted 429 must NOT cache anything (transient failure)"
    captured = capsys.readouterr().out
    assert "rate-limited" in captured
    assert "37.000,-120.000" in captured


def test_fetch_window_429_then_200_succeeds(monkeypatch):
    payload = {"daily": {"time": ["2020-06-01"], "temperature_2m_max": [25.0]}}
    stub = _patch_client(
        monkeypatch,
        [_StubResponse(429), _StubResponse(200, payload)],
    )
    cache: dict = {}
    result = openmeteo.fetch_window(
        37.0, -120.0, date(2020, 6, 1), days=60, cache=cache, polite_delay=0, retries=3,
    )
    assert result == payload
    assert stub.call_count == 2
    assert len(cache) == 1


def test_fetch_window_uses_existing_cache_first(monkeypatch):
    """A cached key skips the network even when its value is None."""
    cache = {"37.0|-120.0|2020-06-01|60": None}
    # Patch with no responses available, any HTTP attempt would fail loudly.
    _patch_client(monkeypatch, [])
    result = openmeteo.fetch_window(
        37.0, -120.0, date(2020, 6, 1), days=60, cache=cache, polite_delay=0,
    )
    assert result is None  # the cached None passes through
