"""Keetch-Byram Drought Index (KBDI) — operational drought metric used by the
US Forest Service for fire-danger ratings.

Reference: Keetch & Byram (1968), "A Drought Index for Forest Fire Control."

KBDI is a running daily integral. Each day:

1. Net precipitation reduces Q.
   Antecedent-rainfall rule: the first 0.20" of rain within a "wet event"
   (consecutive rainy days) is intercepted by canopy and does NOT reduce Q.
   All rain above 0.20" of cumulative event total reaches the soil and
   reduces Q one-for-one.

2. Evapotranspiration adds to Q.
       dQ = ((800 - Q) * (0.968 * exp(0.0486 * T_F) - 8.30) * dt)
            / (1 + 10.88 * exp(-0.0441 * R))
            * 0.001
   where T_F = daily max temperature in °F, R = mean annual precip (inches),
   dt = 1 day. The drying term is set to zero below the temperature where
   the parenthesized term goes negative (~50°F).

Q is bounded to [0, 800] in 0.01-inch units. Operational Forest Service
ranges: 0–200 wet, 200–400 dry, 400–600 high, 600–800 extreme.

This module is pure math — no I/O, no dependencies beyond `math.exp`.
"""
from __future__ import annotations

from math import exp

KBDI_MIN = 0.0
KBDI_MAX = 800.0
INTERCEPTION_IN = 0.20
MM_PER_IN = 25.4


def compute_kbdi_series(
    daily_max_temp_c: list[float],
    daily_precip_mm: list[float],
    mean_annual_precip_mm: float,
    initial_q: float = 0.0,
) -> list[float]:
    """Run the daily KBDI update over a contiguous time series.

    All inputs SI; output is the canonical 0–800 KBDI scale (0.01-inch units).
    The two input lists must have the same length and represent consecutive
    days in chronological order.

    `initial_q` defaults to 0 (saturated soil). For a cold-start estimate,
    pass enough leading days that the initial value washes out — ~30 days of
    real history is usually sufficient.
    """
    if len(daily_max_temp_c) != len(daily_precip_mm):
        raise ValueError("temperature and precipitation lists must be the same length")

    R_in = max(mean_annual_precip_mm / MM_PER_IN, 1.0)  # avoid singular denominator
    Q = max(KBDI_MIN, min(KBDI_MAX, initial_q))

    series: list[float] = []
    event_total_in = 0.0  # cumulative rain within the current "wet event"

    for t_c, p_mm in zip(daily_max_temp_c, daily_precip_mm):
        # 1. Net precipitation after canopy interception
        p_in = max(0.0, p_mm) / MM_PER_IN
        if p_in > 0.0:
            prev_total = event_total_in
            event_total_in += p_in
            if event_total_in > INTERCEPTION_IN:
                # Net = today's contribution above the 0.20" interception line
                net_in = event_total_in - max(INTERCEPTION_IN, prev_total)
            else:
                net_in = 0.0
        else:
            event_total_in = 0.0
            net_in = 0.0

        # KBDI is in 0.01-inch units; net precip in inches reduces Q by 100×
        Q = max(KBDI_MIN, Q - net_in * 100.0)

        # 2. Evapotranspiration / drying term
        t_f = t_c * 9.0 / 5.0 + 32.0
        et = 0.968 * exp(0.0486 * t_f) - 8.30
        if et < 0.0:
            # Below ~50°F the published curve goes negative; clamp to zero
            # (no drying when cold).
            et = 0.0
        dq = (KBDI_MAX - Q) * et / (1.0 + 10.88 * exp(-0.0441 * R_in)) * 0.001
        Q = max(KBDI_MIN, min(KBDI_MAX, Q + dq))

        series.append(Q)

    return series


def kbdi_drought_factor(kbdi: float, floor: float = 0.1) -> float:
    """Map a KBDI value (0–800) onto a 0–1 drought factor for the risk
    algorithm. Linear with a configurable floor so a wet day still
    contributes a baseline drought weight (matches the existing
    days_since_rain factor's 0.1 floor — fires happen even after rain).
    """
    q = max(KBDI_MIN, min(KBDI_MAX, kbdi))
    base = q / KBDI_MAX
    return floor + (1.0 - floor) * base
