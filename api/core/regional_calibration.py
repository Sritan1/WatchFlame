"""Regional risk-bucket calibration, read once at import from
api/data/regional_thresholds.json (built by scripts/build_regional_thresholds.py).

The score never changes, only where the bucket lines fall. EXTREME means "top few
percent of fire days in your state", not "over 0.8 anywhere". No fit means the
global cutoffs.
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
    # Shape parity with the calibrated states. _bucket never reads it.
    "high": 0.8,
    # Was 1.0, which put EXTREME out of reach. Raw scores rarely get that high.
    "extreme": 0.8,
}


def _load() -> dict:
    if not _DATA_PATH.exists():
        return {"version": "uncalibrated", "global": _GLOBAL_FALLBACK, "states": {}}
    return json.loads(_DATA_PATH.read_text(encoding="utf-8"))


def _valid_thresholds(t: object) -> bool:
    """Check for the three keys _bucket reads. A half-filled block would 500."""
    return isinstance(t, dict) and all(k in t for k in ("low", "moderate", "extreme"))


_DATA = _load()
_STATES: dict[str, dict] = _DATA.get("states", {}) or {}
# Guard the loaded block too, or a malformed "global" breaks every uncalibrated
# request.
_loaded_global = _DATA.get("global", _GLOBAL_FALLBACK)
_GLOBAL: dict[str, float] = _loaded_global if _valid_thresholds(_loaded_global) else _GLOBAL_FALLBACK


def _bucket(score: float, t: dict[str, float]) -> Level:
    """Bucket a score against one state's percentile thresholds.

    The build script stores the 50th, 75th, 90th and 97th percentiles. Only three are
    bucket lines, so EXTREME starts at the 97th. The 90th ("high") is not read here,
    it feeds the frontend gauge through get_state_calibration.
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
            continue
        west, south, east, north = bbox
        if west <= lon <= east and south <= lat <= north:
            candidates.append((code, centroid))

    if len(candidates) == 1:
        return candidates[0][0]

    if not candidates:
        return None

    # Boxes overlap around the Mountain West borders, so take the nearest centroid.
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
    """Bucket a score for the user's region, returning (level, state or None).

    state_hint beats the bbox guess, which gets border towns wrong. Reno sits in both
    Nevada's and California's boxes and CA's centroid is nearer, so the guess says CA.
    """
    state: str | None = state_hint
    if not state and lat is not None and lon is not None:
        state = lookup_state(lat, lon)
    if state and state in _STATES:
        thresholds = _STATES[state].get("thresholds")
        if _valid_thresholds(thresholds):
            return _bucket(score, thresholds), state
    return _bucket(score, _GLOBAL), None


def get_state_calibration(state: str | None) -> dict | None:
    """The four cutoffs plus score_max for a state, or None if it isn't fit. /risk
    ships these so the frontend orb fills by regional percentile."""
    if not state or state not in _STATES:
        return None
    info = _STATES[state]
    thresholds = info.get("thresholds") or {}
    score_summary = info.get("score_summary") or {}
    # Old backup JSON files have a different shape, so bail on a miss.
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
    """Diagnostic snapshot with every state's thresholds, so the calibration modal
    can draw its comparison without its own copy of the JSON."""
    return {
        "version": _DATA.get("version"),
        "fitted_at": _DATA.get("fitted_at"),
        "algorithm_version": _DATA.get("algorithm_version"),
        "states_calibrated": sorted(_STATES.keys()),
        "global_thresholds": _GLOBAL,
        "states": _STATES,
    }
