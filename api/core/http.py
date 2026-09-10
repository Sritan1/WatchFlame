"""One pooled HTTP client per event loop, shared by every upstream service.

Building a client per call, which is what the services used to do, throws away the
connection after one request. Every call then pays a DNS lookup, a TCP handshake
and a TLS negotiation again, measured here at 450 to 650 ms each. A cold page load
makes about a dozen calls across eight hosts, several of them to the same host one
after another, so nearly all of that is avoidable.

Keyed by event loop on purpose. A client binds its connection pool to the loop it
first runs on, and the tests create a fresh loop per `asyncio.run`, so a single
module-level client would carry connections from a closed loop into the next test.
"""
from __future__ import annotations

import asyncio
from typing import Any

import httpx

# Generous, because every call passes its own. This only covers a caller that
# forgets, and it should not be shorter than the slowest real timeout.
DEFAULT_TIMEOUT = 60.0

# The loop is kept alongside its client, not just its id. Ids get recycled once a
# loop is collected, and the tests build a fresh loop per asyncio.run, so keying on
# the id alone can hand a new loop a client wired to a dead one.
_clients: dict[int, tuple[asyncio.AbstractEventLoop, httpx.AsyncClient]] = {}


def client() -> httpx.AsyncClient:
    """The pooled client for the running loop, created on first use.

    This is the seam the tests patch, so anything routed through get() or post()
    below can be stubbed by replacing this one function.
    """
    loop = asyncio.get_running_loop()
    key = id(loop)
    existing = _clients.get(key)
    if existing is not None and existing[0] is loop and not existing[1].is_closed:
        return existing[1]
    # follow_redirects stays off, matching what the per-call clients did. Turning
    # it on here would quietly change every upstream at once.
    fresh = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=False)
    _clients[key] = (loop, fresh)
    return fresh


# A pooled connection the server has already closed fails on next use. Retrying
# once costs nothing and avoids reporting a healthy source as down, which is what
# the source-health system would otherwise do. Timeouts are deliberately not in
# here, since retrying one doubles the wait before a failure the caller expects.
_STALE = (httpx.RemoteProtocolError, httpx.ReadError)


async def get(url: str, **kwargs: Any) -> httpx.Response:
    """GET through the pooled client. Pass timeout= per call.

    Retried once on a stale connection. Safe here because a GET can be repeated
    without changing anything upstream.
    """
    for attempt in (0, 1):
        try:
            return await client().get(url, **kwargs)
        except _STALE:
            if attempt:
                raise
    raise AssertionError("unreachable")


async def post(url: str, **kwargs: Any) -> httpx.Response:
    """POST through the pooled client. Pass timeout= per call.

    Deliberately not retried. Copernicus and Overpass are reached by POST, and
    both sit behind their own pacing, so a silent second send would skip the wait
    and count against the rate limit twice.
    """
    return await client().post(url, **kwargs)


async def close_all() -> None:
    """Shut every pooled client down. Called from the app lifespan."""
    for _loop, c in list(_clients.values()):
        try:
            await c.aclose()
        except Exception as e:  # noqa: BLE001 - shutdown must not raise
            print(f"[http] client close failed ({type(e).__name__}: {e})")
    _clients.clear()
