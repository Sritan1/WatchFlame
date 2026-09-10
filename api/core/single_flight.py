"""Collapse concurrent identical fetches into one upstream call.

Status asks for the drought archive from three routes at once, and without this
all three miss the cache in the same instant and all three go to Open-Meteo. The
cache only ever helps the next page load, never the one being rendered.
"""
from __future__ import annotations

import asyncio
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")

# Key to the run currently in flight for it.
_inflight: dict[str, asyncio.Task] = {}


async def once(key: str, factory: Callable[[], Awaitable[T]]) -> T:
    """Await the run already in progress for `key`, or start one.

    Every waiter gets the same result, including the same exception. Shielded, so
    a caller giving up, which a disconnected browser does, cannot cancel the fetch
    the other waiters are still relying on.
    """
    task = _inflight.get(key)
    if task is None:
        # No await between the lookup and the insert, so the loop cannot
        # interleave two callers into two tasks for one key.
        task = asyncio.create_task(factory())
        _inflight[key] = task
        task.add_done_callback(lambda _t: _inflight.pop(key, None))
    return await asyncio.shield(task)


def in_flight() -> int:
    """How many fetches are running. For tests."""
    return len(_inflight)
