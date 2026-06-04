"""Regional risk-bucket calibration.

Loads `api/data/regional_thresholds.json` (produced by
`scripts/build_regional_thresholds.py`) once at import time and exposes:

- `lookup_state(lat, lon) -> str | None`
   Maps a coordinate to a calibrated state code. Uses bbox containment with a
   nearest-centroid tiebreaker. Returns None when the point falls outside every
   calibrated state's bbox (Hawaii, Alaska's panhandle, ocean, etc.).

- `regional_level(score, lat, lon, state_hint=None) -> tuple[level, state_or_None]`
   Returns the bucket the user should see at their location. When `state_hint`
   is supplied (e.g. from an authoritative Census reverse-geocode), uses it
   directly — the right call when available because the bbox/centroid heuristic
   misclassifies border-overlap points (e.g. Reno NV falls inside both NV's
   and CA's bboxes, and CA's centroid is closer). Falls back to the global
   cutoffs when no calibrated state matches.

The algorithm itself is unchanged — calibration only re-buckets the same
0–1 score so EXTREME means "top ~3% of historical fire days for your state"
instead of "score > 0.8 globally."
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Literal

Level = Literal["LOW", "MODERATE", "HIGH", "EXTREME"]

_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "regional_thresholds.json"

_GLOBAL_FALLBACK = {
    "low": 0.3,
    "moderate": 0.6,
    # `high` is the 90th-percentile slot in the calibration schema; kept for
    # shape parity with calibrated states but NOT used as a bucket boundary
    # (see `_bucket` below — HIGH→EXT cuts at `extreme`).
    "high": 0.8,
    # Aligned with the Risk Calculator's gauge UI (which always used 0.8).
    # Was 1.0, which made the EXTREME bucket literally unreachable globally
    # (V4 raw scores rarely cross 1.0). Calibrated states still use their
    # own fitted 97th-percentile values — this only affects the fallback
    # for uncalibrated locations.
    "extreme": 0.8,
}


def _load() -> dict:
    if not _DATA_PATH.exists():
        # Calibration hasn't been run yet — fall back to globals.
        return {"version": "uncalibrated", "global": _GLOBAL_FALLBACK, "states": {}}
    return json.loads(_DATA_PATH.read_text(encoding="utf-8"))


_DATA = _load()
_STATES: dict[str, dict] = _DATA.get("states", {}) or {}
_GLOBAL: dict[str, float] = _DATA.get("global", _GLOBAL_FALLBACK)


def _bucket(score: float, t: dict[str, float]) -> Level:
    """Bucket a 0–1 score using a state's percentile-derived thresholds.

    The build script (scripts/build_regional_thresholds.py) stores four
    percentile values per state: 50 / 75 / 90 / 97. We use three of them as
    the bucket boundaries:

        LOW       : score <  t["low"]      (= 50th percentile of fire-day scores)
        MODERATE  :          t["low"]      ≤ score < t["moderate"] (75th)
        HIGH      :          t["moderate"] ≤ score < t["extreme"]  (97th)
        EXTREME   : score ≥  t["extreme"]

    `t["high"]` (the 90th percentile) is retained in the JSON for visualization
    + future re-tuning but isn't used as a bucket boundary here. The EXTREME
    bucket starts at the 97th percentile so it captures only the top ~3% of
    historical fire days for that state — matching the operational intent
    documented in the build script.
    """
    if score < t["low"]:
        return "LOW"
    if score < t["moderate"]:
        return "MODERATE"
    if score < t["extreme"]:
        return "HIGH"
    return "EXTREME"


def lookup_state(lat: float, lon: float) -> str | None:
    """Map a coordinate to a calibrated state, or None if no fit."""
    if not _STATES:
        return None

    candidates: list[tuple[str, list[float]]] = []
    for code, info in _STATES.items():
        bbox = info.get("bbox")
        if not bbox or len(bbox) != 4:
            continue
        centroid = info.get("centroid")
        if not centroid or len(centroid) != 2:
            # Defensive against stale/partial JSON (mirrors get_state_calibration)
            # — a state with a bbox but no usable centroid is skipped rather
            # than crashing the lookup with a KeyError.
            continue
        west, south, east, north = bbox
        if west <= lon <= east and south <= lat <= north:
            candidates.append((code, centroid))

    if len(candidates) == 1:
        return candidates[0][0]

    if not candidates:
        return None

    # Multiple bboxes overlap (common at the Mountain West borders).
    # Pick the state whose centroid is nearest the point in equirectangular
    # distance — adequate at CONUS scale.
    def d2(centroid: list[float]) -> float:
        clat, clon = centroid
        dx = (lon - clon) * math.cos(math.radians(lat))
        dy = lat - clat
        return dx * dx + dy * dy

    return min(candidates, key=lambda c: d2(c[1]))[0]


def regional_level(
    score: float,
    lat: float | None = None,
    lon: float | None = None,
    state_hint: str | None = None,
) -> tuple[Level, str | None]:
    """Bucket a score using the user's region.

    Returns (level, state_code) where state_code is the matched state or None
    if we're falling back to global thresholds.

    `state_hint`: when supplied (e.g. from an authoritative Census reverse-
    geocode in the route, or directly from the Risk Calculator's state
    dropdown), this is used directly instead of the bbox+centroid heuristic.
    Preferred because the heuristic misclassifies border-overlap points
    (e.g. Reno NV at 39.53,-119.81 lies inside both NV's and CA's bboxes and
    CA's centroid is closer, so the heuristic returns CA).

    lat/lon are optional — only consulted if state_hint is absent. Callers
    with neither coords nor a state hint get the global cutoffs back.
    """
    state: str | None = state_hint
    if not state and lat is not None and lon is not None:
        state = lookup_state(lat, lon)
    if state and state in _STATES:
        thresholds = _STATES[state].get("thresholds")
        if thresholds:
            return _bucket(score, thresholds), state
    return _bucket(score, _GLOBAL), None


def get_state_calibration(state: str | None) -> dict | None:
    """Return the calibration block for a state — thresholds + score_summary —
    or None if the state isn't fit (or the input is None).

    Returned shape:
        { "low": float, "moderate": float, "high": float, "extreme": float,
          "score_max": float }

    Used by the /risk route to ship the cutoffs to the frontend so the orb
    can fill by regional percentile (dial and pill agree visually) instead
    of by absolute score.
    """
    if not state or state not in _STATES:
        return None
    info = _STATES[state]
    thresholds = info.get("thresholds") or {}
    score_summary = info.get("score_summary") or {}
    # Bail if the JSON is missing the keys we need — defensive against stale
    # backup files (kbdi-10state-backup.json, etc.) that have a slightly
    # different shape.
    if not all(k in thresholds for k in ("low", "moderate", "high", "extreme")):
        return None
    if "max" not in score_summary:
        return None
    return {
        "low": float(thresholds["low"]),
        "moderate": float(thresholds["moderate"]),
        "high": float(thresholds["high"]),
        "extreme": float(thresholds["extreme"]),
        "score_max": float(score_summary["max"]),
    }


def calibration_info() -> dict:
    """Diagnostic snapshot for /healthz or a debug endpoint.

    Includes the full per-state thresholds dict so the Status calibration
    modal can render its 17-state comparison visualization without needing
    its own copy of the JSON. The frontend pulls this once per session and
    TanStack caches it; values change only when the calibration script
    re-runs (rarely).
    """
    return {
        "version": _DATA.get("version"),
        "fitted_at": _DATA.get("fitted_at"),
        "algorithm_version": _DATA.get("algorithm_version"),
        "states_calibrated": sorted(_STATES.keys()),
        "global_thresholds": _GLOBAL,
        "states": _STATES,
    }
