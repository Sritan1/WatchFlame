"""Coercion helpers for upstream feed values we don't trust.

FIRMS, WFIGS, Cal Fire and FEMA NSS all put nulls and junk strings in numeric
fields. These return None so one bad row can't raise out of a parse loop.
"""
from __future__ import annotations

from math import isfinite
from typing import Any


def safe_float(v: Any) -> float | None:
    """float(v), or None for null, empty or non-numeric input.

    NaN and infinity count as non-numeric. float() accepts "NaN" and "Infinity" as
    strings, and a NaN rides straight through distance sorts.
    """
    try:
        f = float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None
    return f if (f is not None and isfinite(f)) else None


def safe_int(v: Any) -> int | None:
    """int(v), or None for null, empty or non-integer input.

    A string like "12.0" comes back None because int() refuses it. Callers that want
    those should do int(float(v)). See open_shelters._int_or_none.
    """
    try:
        return int(v) if v not in (None, "") else None
    except (TypeError, ValueError, OverflowError):
        return None
