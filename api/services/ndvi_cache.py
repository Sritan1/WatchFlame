"""Disk cache wrapping the CDSE NDVI fetchers.

Persistent across server restarts so the CDSE free-tier rate budget isn't
re-spent every time we redeploy or reload uvicorn. Two JSON-on-disk caches:

  - current NDVI keyed by (round(lat, 2), round(lon, 2))
    TTL: 7 days (vegetation changes slowly + Sentinel-2 revisit is ~5 days)
  - climatology keyed by (round(lat, 2), round(lon, 2), month)
    TTL: 30 days (only meaningfully shifts month-to-month)

Cache files live in api/cache/ndvi/. Each file holds a single JSON object
`{"v": <float>, "t": <epoch_seconds>}`. v=null means a recent fetch
returned no usable observations (cloudy window) — we cache the negative for
a shorter window so we retry sooner.

On any cache read error (corrupted file, missing dir) we fall through to a
live fetch, so the cache is purely an optimization — never load-bearing.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from .cdse import fetch_ndvi_climatology, fetch_ndvi_current

# Project-root-relative so the same cache works from `uvicorn api.main:app`
# and from `python -m scripts._smoke_xxx`.
_CACHE_DIR = Path(__file__).resolve().parents[2] / "api" / "cache" / "ndvi"

_CURRENT_TTL_S = int(os.getenv("NDVI_CURRENT_TTL_S", str(7 * 86400)))      # 7 days
_CLIMATOLOGY_TTL_S = int(os.getenv("NDVI_CLIMATOLOGY_TTL_S", str(30 * 86400)))  # 30 days
# Negative results (cloudy / no obs / transient CDSE error) get a much
# shorter TTL so a transient failure doesn't block the location's NDVI for
# multiple days. 6 hours = 4 retries per day per stuck location, well under
# CDSE's per-minute throttle, and roughly the cadence at which cloud cover
# meaningfully shifts. Applies retroactively to existing cached negatives
# the next time they're read.
_NEGATIVE_TTL_S = int(os.getenv("NDVI_NEGATIVE_TTL_S", str(6 * 3600)))   # 6 hours

# Live-path climatology window. Three years (2023–2025) instead of the full
# 2018–2025 cuts cold-cache latency by ~60% (3 CDSE calls vs. 8, each gated
# by the 2.5s throttle) while still averaging out single-year anomalies.
# The full 8-year window is reserved for the one-time re-calibration job
# which can take its time — see scripts/build_regional_thresholds.py.
_LIVE_CLIMATOLOGY_YEARS = [2023, 2024, 2025]


def _grid_key(lat: float, lon: float) -> str:
    # 2 decimal places ≈ 1.1 km at the equator — well below our 1 km buffer
    # bbox, so adjacent callers share cache entries.
    return f"{round(lat, 2):+07.2f}_{round(lon, 2):+08.2f}".replace(".", "p")


def _cache_path(kind: str, lat: float, lon: float, month: int | None = None) -> Path:
    key = _grid_key(lat, lon)
    name = f"{kind}__{key}.json" if month is None else f"{kind}__{key}__m{month:02d}.json"
    return _CACHE_DIR / name


def _read(path: Path, ttl_s: int) -> tuple[bool, float | None]:
    """Return (hit, value). hit=False means missing/expired/corrupt."""
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        age = time.time() - float(data.get("t", 0))
        v = data.get("v")
        # Negative results (v is None) use a shorter TTL.
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
    """Cached wrapper around cdse.fetch_ndvi_current."""
    path = _cache_path("current", lat, lon)
    hit, value = _read(path, _CURRENT_TTL_S)
    if hit:
        return value
    fresh = await fetch_ndvi_current(lat, lon)
    _write(path, fresh)
    return fresh


async def get_climatology(lat: float, lon: float, month: int) -> float | None:
    """Cached wrapper around cdse.fetch_ndvi_climatology. Uses the 3-year
    live-path window (2023–2025) — see _LIVE_CLIMATOLOGY_YEARS for why."""
    path = _cache_path("clim", lat, lon, month=month)
    hit, value = _read(path, _CLIMATOLOGY_TTL_S)
    if hit:
        return value
    fresh = await fetch_ndvi_climatology(lat, lon, month, years=_LIVE_CLIMATOLOGY_YEARS)
    _write(path, fresh)
    return fresh
