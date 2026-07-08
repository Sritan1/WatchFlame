"""Defensive coercion helpers for untrusted upstream feed values.

Upstream feeds (FIRMS CSV, WFIGS/ArcGIS, Cal Fire, FEMA NSS) routinely carry
null or non-numeric values in numeric fields. These helpers return None on
anything that isn't cleanly a number, so a single malformed row never raises
out of a parse loop. Previously each service kept its own near-identical copy.
"""
from __future__ import annotations

from math import isfinite
from typing import Any


def safe_float(v: Any) -> float | None:
    """float(v), or None for null / empty-string / non-numeric input.

    NaN and ±Infinity are treated as non-numeric and return None: strings like
    "NaN" / "Infinity" (which float() accepts) would otherwise poison every
    downstream calc — NaN propagates silently through distance sorts and, once
    it reaches _clamp(min/max), collapses to 0.0. The "None on anything that
    isn't cleanly a finite number" contract keeps those values out entirely.
    """
    try:
        f = float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None
    return f if (f is not None and isfinite(f)) else None


def safe_int(v: Any) -> int | None:
    """int(v), or None for null / empty / non-integer input.

    Note: does NOT coerce float-shaped strings like "12.0" (int("12.0")
    raises). Callers that need that (e.g. capacity fields reported as floats)
    should use int(float(v)) explicitly — see open_shelters._int_or_none.
    A float ±Infinity raises OverflowError from int(); caught here too.
    """
    try:
        return int(v) if v not in (None, "") else None
    except (TypeError, ValueError, OverflowError):
        return None
