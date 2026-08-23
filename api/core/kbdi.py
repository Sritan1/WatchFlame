"""Keetch-Byram Drought Index, the Forest Service's drought metric. Pure math.

Keetch & Byram (1968), "A Drought Index for Forest Fire Control." Q is a running
daily integral in hundredths of an inch. Rain pulls it down, heat pushes it up.
0-200 is wet, 200-400 dry, 400-600 high, 600-800 extreme.
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
    """Daily KBDI over a contiguous series. SI in, 0-800 out.

    initial_q of 0 assumes saturated soil. Pass about 30 days of leading history to
    let that wash out.
    """
    if len(daily_max_temp_c) != len(daily_precip_mm):
        raise ValueError("temperature and precipitation lists must be the same length")

    R_in = max(mean_annual_precip_mm / MM_PER_IN, 1.0)  # avoid singular denominator
    Q = max(KBDI_MIN, min(KBDI_MAX, initial_q))

    series: list[float] = []
    event_total_in = 0.0  # rain so far in this wet spell

    for t_c, p_mm in zip(daily_max_temp_c, daily_precip_mm):
        # Net precipitation. The canopy catches the first 0.20" of a wet spell and
        # it never reaches the soil.
        p_in = max(0.0, p_mm) / MM_PER_IN
        if p_in > 0.0:
            prev_total = event_total_in
            event_total_in += p_in
            if event_total_in > INTERCEPTION_IN:
                net_in = event_total_in - max(INTERCEPTION_IN, prev_total)
            else:
                net_in = 0.0
        else:
            event_total_in = 0.0
            net_in = 0.0

        # KBDI counts in hundredths of an inch, so an inch of rain drops Q by 100.
        Q = max(KBDI_MIN, Q - net_in * 100.0)

        # Drying term.
        t_f = t_c * 9.0 / 5.0 + 32.0
        et = 0.968 * exp(0.0486 * t_f) - 8.30
        if et < 0.0:
            # Below about 50F the published curve goes negative.
            et = 0.0
        dq = (KBDI_MAX - Q) * et / (1.0 + 10.88 * exp(-0.0441 * R_in)) * 0.001
        Q = max(KBDI_MIN, min(KBDI_MAX, Q + dq))

        series.append(Q)

    return series


def kbdi_drought_factor(kbdi: float, floor: float = 0.1) -> float:
    """KBDI (0-800) to a 0-1 drought factor, linear. The floor stops a wet day
    zeroing the term."""
    q = max(KBDI_MIN, min(KBDI_MAX, kbdi))
    base = q / KBDI_MAX
    return floor + (1.0 - floor) * base
