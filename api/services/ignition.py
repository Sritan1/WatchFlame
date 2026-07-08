"""Serve the fire-ignition-likelihood model.

Two halves:
  * score_features(row)        - pure: run the trained model on a feature dict,
                                 return a percentile index (no network).
  * ignition_for_location(...)  - async: fetch a fresh weather window and build
                                 that feature dict with PARITY to training.

Training/serving parity is the load-bearing part: the live features are computed
with the SAME daily-aggregate logic used to build the training set (the pure
function summarize_window_with_kbdi), from the SAME Open-Meteo archive source.
The archive lags ~6 days - acceptable for a drought-dominated ignition index.

Graceful degradation: returns None if the model artifact is missing, the upstream
fetch fails, or the window is too sparse - the route then serves null and the UI
hides the chip, matching the rest of the API.
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

from ..core.openmeteo import summarize_window_with_kbdi
from ..core.validation import doy_to_season
from .landcover import land_cover_class

_MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "ignition_model.joblib"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
WINDOW_DAYS = 365
ARCHIVE_LAG_DAYS = 6
_CORE = ("temperature_c", "humidity_pct", "wind_kph", "days_since_rain")

# Symmetric days_since_rain ceiling. In training, a fire's same-location
# negatives sit EARLIER in the shared 365-day window than the fire day, so their
# days_since_rain is structurally capped at their window position (min 90 =
# KBDI warm-up), while the positive — and this live server, which always scores
# the window END — can reach ~365. Left unclipped, the model separates the two
# classes partly on that positional artifact and then, because serving always
# presents the positive-like ceiling, over-flags arid locations. Clipping every
# example (training rows AND this serve path) to the common reachable ceiling
# removes the artifact. Must stay in sync with build_ignition_dataset.py.
DAYS_SINCE_RAIN_CAP = 90

_cache: dict[str, tuple[float, dict[str, Any] | None]] = {}
_artifact: dict[str, Any] | None = None


def _ttl() -> int:
    return int(os.getenv("IGNITION_CACHE_TTL_SECONDS", str(6 * 3600)))


def _fail_ttl() -> int:
    # A None result (transient fetch failure or too-sparse window) is cached only
    # briefly, so a blip doesn't hide the chip for the full 6h success TTL — the
    # next request re-probes once the upstream/quota recovers.
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
    """Load the trained model once (lazy). Returns None if it isn't present."""
    global _artifact
    if _artifact is None and _MODEL_PATH.exists():
        import joblib
        _artifact = joblib.load(_MODEL_PATH)
    return _artifact


def score_features(row: dict[str, Any]) -> dict[str, Any] | None:
    """Score a single feature dict. Pure (no network). The dict must carry the
    core weather fields; vpd/season/month are derived here if absent."""
    art = _load_artifact()
    if art is None:
        return None
    if any(row.get(c) is None for c in _CORE):
        return None
    feat = dict(row)
    # Parity with training: clip days_since_rain to the common ceiling so the
    # serve-time value can't exceed what a negative example could express.
    feat["days_since_rain"] = min(feat["days_since_rain"], DAYS_SINCE_RAIN_CAP)
    feat.setdefault("vpd_hpa", _vpd(feat["temperature_c"], feat["humidity_pct"]))
    # land_cover is a model feature; when a caller can't supply it (lookup failed,
    # offshore, older test fixture) fall back to "unknown" — a class the model saw
    # in training — so scoring degrades to weather-only instead of erroring.
    feat.setdefault("land_cover", "unknown")
    X = pd.DataFrame([feat])[art["features"]]
    # Production model = base GBM (trained on all rows) + an isotonic calibrator
    # fit on GROUPED out-of-fold scores, so the calibrated probability + the
    # percentile below are free of the same-location sibling leakage a single
    # in-sample CalibratedClassifierCV(cv=3) would bake in.
    raw = float(art["base_model"].predict_proba(X)[0, 1])
    prob = float(art["calibrator"].transform([raw])[0])
    ref = art["ref_scores"]
    pct = float(np.searchsorted(ref, prob) / len(ref) * 100.0)
    return {"percentile": round(pct, 1), "probability": round(prob, 4),
            "level": _level(pct)}


async def _fetch_window(lat: float, lon: float) -> dict[str, Any] | None:
    """Fetch a 365-day daily window (parity vars) for the location."""
    end = date.today() - timedelta(days=ARCHIVE_LAG_DAYS)
    start = end - timedelta(days=WINDOW_DAYS - 1)
    params = {
        "latitude": round(lat, 2),
        "longitude": round(lon, 2),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "daily": "temperature_2m_max,wind_speed_10m_max,precipitation_sum",
        "hourly": "relative_humidity_2m",
        "timezone": "auto",
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(ARCHIVE_URL, params=params)
            resp.raise_for_status()
            return resp.json()
    except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.TransportError) as e:
        status = getattr(getattr(e, "response", None), "status_code", "n/a")
        print(f"[ignition] upstream {status} for {lat},{lon} "
              f"({type(e).__name__}); returning None")
        return None


async def ignition_for_location(lat: float, lon: float) -> dict[str, Any] | None:
    """Live ignition-likelihood index for a location, or None on any failure."""
    if _load_artifact() is None:
        return None
    key = _grid_key(lat, lon)
    now = time.time()
    cached = _cache.get(key)
    if cached:
        # Successes persist for the full TTL; a cached None recovers quickly.
        ttl = _ttl() if cached[1] is not None else _fail_ttl()
        if now - cached[0] < ttl:
            return cached[1]

    raw = await _fetch_window(lat, lon)
    result: dict[str, Any] | None = None
    times = (raw or {}).get("daily", {}).get("time", []) if raw else []
    try:
        target = date.fromisoformat(times[-1]) if times else None  # latest archived day
    except (TypeError, ValueError):
        target = None  # malformed time entry → degrade to null, per contract
    if raw is not None and target is not None:
        s = summarize_window_with_kbdi(raw, target)  # SAME function as training
        if all(s.get(c) is not None for c in _CORE):
            doy = target.timetuple().tm_yday
            # Land cover is static per place → parity with training. None (lookup
            # failed / offshore) becomes "unknown" inside score_features.
            land_cover = await land_cover_class(lat, lon) or "unknown"
            scored = score_features({
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
