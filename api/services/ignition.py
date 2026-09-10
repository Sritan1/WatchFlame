"""Serve the ignition-likelihood model.

The whole thing rests on building features the same way training did. Same
aggregation function, same archive, same window. The archive lags about 6 days,
which is fine for something drought-dominated. Failures return None and hide the chip.
"""
from __future__ import annotations

import math
import os
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import pandas as pd

import asyncio

from ..core import http
from ..core.openmeteo import summarize_window_with_kbdi
from ..core.single_flight import once
from ..core.validation import doy_to_season
from .landcover import land_cover_class

_MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "ignition_model.joblib"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
WINDOW_DAYS = 365
ARCHIVE_LAG_DAYS = 6
_CORE = ("temperature_c", "humidity_pct", "wind_kph", "days_since_rain")

# Ceiling on days_since_rain. build_ignition_dataset.py imports this, so training
# clips the same way. Negatives sit earlier in the window than the fire, so they cap
# out lower while the fire and this server reach a full year. Left alone the model
# learns that gap as a tell and over-flags dry places.
DAYS_SINCE_RAIN_CAP = 90

_cache: dict[str, tuple[float, dict[str, Any] | None]] = {}
_artifact: dict[str, Any] | None = None


def _ttl() -> int:
    return int(os.getenv("IGNITION_CACHE_TTL_SECONDS", str(6 * 3600)))


def _fail_ttl() -> int:
    # Brief, so one bad fetch doesn't hide the chip for the six hours a success gets.
    return int(os.getenv("IGNITION_FAIL_CACHE_TTL_SECONDS", "60"))


def _grid_key(lat: float, lon: float) -> str:
    return f"{round(lat, 1)}|{round(lon, 1)}"


def _vpd(temp_c: float, humidity_pct: float) -> float:
    es = 6.1078 * math.exp(17.27 * temp_c / (temp_c + 237.3))
    return es * (1.0 - humidity_pct / 100.0)


def _level(percentile: float) -> str:
    if percentile >= 90:
        return "extreme"
    if percentile >= 75:
        return "high"
    if percentile >= 50:
        return "moderate"
    return "low"


def _load_artifact() -> dict[str, Any] | None:
    """Load the model on first use, or None if the file isn't there."""
    global _artifact
    if _artifact is None and _MODEL_PATH.exists():
        import joblib
        _artifact = joblib.load(_MODEL_PATH)
    return _artifact


async def warm_model() -> None:
    """Load the model and push one row through it, off the event loop.

    joblib's load costs about 2 seconds and scikit-learn's first predict another
    2, both of them synchronous. Paying that inside the first request blocks the
    whole loop, so every other call on the page waits behind it. Later predicts
    run in single-digit milliseconds. Called from the app lifespan.
    """
    def _warm() -> None:
        art = _load_artifact()
        if art is None:
            return
        # Built from the model's own feature list so it cannot drift out of sync.
        row: dict[str, Any] = dict.fromkeys(art["features"], 0.0)
        row.update({
            "temperature_c": 20.0, "humidity_pct": 40.0, "wind_kph": 10.0,
            "days_since_rain": 5, "kbdi": 300.0,
            "season": "fall", "month": 9, "land_cover": "unknown",
        })
        score_features(row)

    try:
        await asyncio.to_thread(_warm)
    except Exception as e:  # noqa: BLE001 - warming is best effort, never fatal
        print(f"[ignition] model warm-up skipped ({type(e).__name__}: {e})")


def score_features(row: dict[str, Any]) -> dict[str, Any] | None:
    """Score one feature dict, no network. VPD and land cover default when absent,
    but the caller has to supply season and month."""
    art = _load_artifact()
    if art is None:
        return None
    if any(row.get(c) is None for c in _CORE):
        return None
    # Every training row had a KBDI, so a missing one arrives at the trees as a NaN
    # they have never seen and gets routed at random.
    if row.get("kbdi") is None:
        return None
    feat = dict(row)
    feat["days_since_rain"] = min(feat["days_since_rain"], DAYS_SINCE_RAIN_CAP)
    feat.setdefault("vpd_hpa", _vpd(feat["temperature_c"], feat["humidity_pct"]))
    # The model saw "unknown" land cover in training, so a failed lookup scores on
    # weather alone rather than erroring.
    feat.setdefault("land_cover", "unknown")
    X = pd.DataFrame([feat])[art["features"]]
    # A booster plus a calibrator fitted on out-of-fold scores, grouped by location.
    # In-sample would let a location's own rows flatter its probability.
    raw = float(art["base_model"].predict_proba(X)[0, 1])
    prob = float(art["calibrator"].transform([raw])[0])
    ref = art["ref_scores"]
    pct = float(np.searchsorted(ref, prob) / len(ref) * 100.0)
    return {"percentile": round(pct, 1), "probability": round(prob, 4),
            "level": _level(pct)}


async def _fetch_window(lat: float, lon: float) -> dict[str, Any] | None:
    """Single-flighted so two callers for one cell make one archive request. The
    window is deliberately not shared with openmeteo_history, which rounds to 2
    decimals over 365 days where training used 3 over 366."""
    return await once(f"ign-window:{round(lat, 3)}|{round(lon, 3)}", lambda: _fetch_window_uncached(lat, lon))


async def _fetch_window_uncached(lat: float, lon: float) -> dict[str, Any] | None:
    """Fetch the daily weather window for a location. The span and the coordinate
    rounding both copy training. Get either wrong and the served KBDI comes from a
    different window or grid cell than every row the model learned from."""
    end = date.today() - timedelta(days=ARCHIVE_LAG_DAYS)
    start = end - timedelta(days=WINDOW_DAYS)
    params = {
        "latitude": round(lat, 3),
        "longitude": round(lon, 3),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "daily": "temperature_2m_max,wind_speed_10m_max,precipitation_sum",
        "hourly": "relative_humidity_2m",
        "timezone": "auto",
    }
    try:
        resp = await http.get(ARCHIVE_URL, params=params, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except (
        httpx.HTTPStatusError,
        httpx.TimeoutException,
        httpx.TransportError,
        ValueError,  # a 200 carrying something that isn't JSON
    ) as e:
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(f"[ignition] upstream {status} for {lat},{lon} "
              f"({type(e).__name__}); returning None")
        return None
    # A 200 carrying a list, or an error page dressed as success, would break the
    # dict access below.
    if not isinstance(data, dict):
        print(f"[ignition] non-object body for {lat},{lon}; returning None")
        return None
    return data


async def ignition_for_location(lat: float, lon: float) -> dict[str, Any] | None:
    """The ignition index for a location, or None if anything went wrong."""
    # Off the loop like the scoring below. Warm it is a dict lookup, but if the
    # lifespan warm-up did not run this is the joblib load, and doing that here
    # would stall every other request on the page.
    if await asyncio.to_thread(_load_artifact) is None:
        return None
    key = _grid_key(lat, lon)
    now = time.time()
    cached = _cache.get(key)
    if cached:
        ttl = _ttl() if cached[1] is not None else _fail_ttl()
        if now - cached[0] < ttl:
            return cached[1]

    raw = await _fetch_window(lat, lon)
    result: dict[str, Any] | None = None
    # `daily` can come back null on a thin response.
    times = (raw.get("daily") or {}).get("time", []) if isinstance(raw, dict) else []
    try:
        target = date.fromisoformat(times[-1]) if times else None  # last archived day
    except (TypeError, ValueError):
        target = None
    if raw is not None and target is not None:
        s = summarize_window_with_kbdi(raw, target)  # the function training used
        if all(s.get(c) is not None for c in _CORE):
            doy = target.timetuple().tm_yday
            # A failed lookup becomes "unknown" inside score_features.
            land_cover = await land_cover_class(lat, lon) or "unknown"
            # Off the loop. Warm it is single-digit milliseconds, but an unwarmed
            # first predict costs about two seconds and would stall every other
            # request on the page behind it.
            scored = await asyncio.to_thread(score_features, {
                "temperature_c": s["temperature_c"],
                "humidity_pct": s["humidity_pct"],
                "wind_kph": s["wind_kph"],
                "days_since_rain": s["days_since_rain"],
                "kbdi": s.get("kbdi"),
                "month": target.month,
                "season": doy_to_season(doy),
                "land_cover": land_cover,
            })
            if scored is not None:
                result = {**scored, "as_of": target.isoformat()}

    _cache[key] = (now, result)
    return result
