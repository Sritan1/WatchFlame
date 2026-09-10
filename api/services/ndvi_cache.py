"""Disk cache in front of the vegetation fetchers.

Survives restarts, so redeploying doesn't spend the free-tier budget again.
Readings keep a week, norms a month. Files live under api/cache/ndvi/, one small
JSON object each. A null means clouds left nothing usable, and those expire sooner.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from ..core.single_flight import once
from .cdse import fetch_ndvi_climatology, fetch_ndvi_current

# Anchored to the project root, so the server and the scripts share one cache.
_CACHE_DIR = Path(__file__).resolve().parents[2] / "api" / "cache" / "ndvi"

_CURRENT_TTL_S = int(os.getenv("NDVI_CURRENT_TTL_S", str(7 * 86400)))      # 7 days
_CLIMATOLOGY_TTL_S = int(os.getenv("NDVI_CLIMATOLOGY_TTL_S", str(30 * 86400)))  # 30 days
# A failed look expires much sooner, or one cloudy afternoon costs a location its
# vegetation reading for days. Four retries a day is nowhere near the throttle.
_NEGATIVE_TTL_S = int(os.getenv("NDVI_NEGATIVE_TTL_S", str(6 * 3600)))   # 6 hours

# Two years for the live path rather than the full eight. Copernicus allows one
# call every 2.5 seconds, so each year in this window puts another 2.5 seconds in
# front of anyone visiting a location for the first time. Two still averages out a
# freak season, just less well than three. The recalibration job uses the full
# window, where the wait does not matter.
_LIVE_CLIMATOLOGY_YEARS = [2024, 2025]


def _grid_key(lat: float, lon: float) -> str:
    # Two decimals is about a kilometre, roughly the sampled box, so nearby callers
    # share an entry.
    return f"{round(lat, 2):+07.2f}_{round(lon, 2):+08.2f}".replace(".", "p")


def _cache_path(kind: str, lat: float, lon: float, month: int | None = None) -> Path:
    key = _grid_key(lat, lon)
    name = f"{kind}__{key}.json" if month is None else f"{kind}__{key}__m{month:02d}.json"
    return _CACHE_DIR / name


def _read(path: Path, ttl_s: int) -> tuple[bool, float | None]:
    """Returns whether we had it, and the value. A miss covers missing, expired
    and unreadable alike."""
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        age = time.time() - float(data.get("t", 0))
        v = data.get("v")
        # A failed look expires sooner than a real reading.
        effective_ttl = _NEGATIVE_TTL_S if v is None else ttl_s
        if age > effective_ttl:
            return False, None
        return True, (float(v) if v is not None else None)
    except (FileNotFoundError, ValueError, KeyError, OSError):
        return False, None


def _write(path: Path, value: float | None) -> None:
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            json.dump({"v": value, "t": time.time()}, f)
    except OSError as e:
        print(f"[ndvi_cache] write failed for {path.name}: {e}")


async def get_current(lat: float, lon: float) -> float | None:
    """Current NDVI, cached.

    Single-flighted because /risk and /trajectory both want it and Status fires
    them together. Copernicus allows one call every 2.5 seconds, so a duplicate
    here is not wasted bandwidth, it is 2.5 seconds added to the page.
    """
    return await once(f"ndvi-cur:{_grid_key(lat, lon)}", lambda: _get_current(lat, lon))


async def _get_current(lat: float, lon: float) -> float | None:
    path = _cache_path("current", lat, lon)
    hit, value = _read(path, _CURRENT_TTL_S)
    if hit:
        return value
    fresh = await fetch_ndvi_current(lat, lon)
    _write(path, fresh)
    return fresh


async def get_climatology(lat: float, lon: float, month: int) -> float | None:
    """The monthly norm, cached, over the shorter live window above. Single-flighted
    for the same reason as get_current, and it costs a throttled call per year."""
    return await once(
        f"ndvi-clim:{_grid_key(lat, lon)}:{month}",
        lambda: _get_climatology(lat, lon, month),
    )


async def _get_climatology(lat: float, lon: float, month: int) -> float | None:
    # The window length is in the filename, so changing it retires the old entries
    # instead of serving a three-year average next to a two-year one for a month.
    path = _cache_path(f"clim{len(_LIVE_CLIMATOLOGY_YEARS)}y", lat, lon, month=month)
    hit, value = _read(path, _CLIMATOLOGY_TTL_S)
    if hit:
        return value
    fresh = await fetch_ndvi_climatology(lat, lon, month, years=_LIVE_CLIMATOLOGY_YEARS)
    _write(path, fresh)
    return fresh
