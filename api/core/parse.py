"""Defensive coercion helpers for untrusted upstream feed values.

Upstream feeds (FIRMS CSV, WFIGS/ArcGIS, Cal Fire, FEMA NSS) routinely carry
null or non-numeric values in numeric fields. These helpers return None on
anything that isn't cleanly a number, so a single malformed row never raises
out of a parse loop. Previously each service kept its own near-identical copy.
"""
from __future__ import annotations

from typing import Any


def safe_float(v: Any) -> float | None:
    """float(v), or None for null / empty-string / non-numeric input."""
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def safe_int(v: Any) -> int | None:
    """int(v), or None for null / empty / non-integer input.

    Note: does NOT coerce float-shaped strings like "12.0" (int("12.0")
    raises). Callers that need that (e.g. capacity fields reported as floats)
    should use int(float(v)) explicitly — see open_shelters._int_or_none.
    """
    try:
        return int(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None
