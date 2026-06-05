"""Phase 0 of the ML feature — assemble the fire-ignition training dataset.

Builds data/ignition_dataset.csv: one row per (location, day) example, labeled
    1 = a real fire ignited that day at that location
    0 = a typical (non-fire) day at the SAME location
See ML.md for the full design + rationale.

The "fire-day vs typical-day" trick: fire records only give us positives (days
fires happened). We manufacture negatives from the SAME locations on other days,
using the 365-day weather windows already cached in data/openmeteo_cache.json
(each cached fire window's key is lat|lon|fire_date|365, so the key itself
identifies the fire). Sharing locations between the two classes means the model
can't cheat by learning "fires happen near roads/people" — it must learn what's
different about the conditions on the day a fire actually started.

Offline + reproducible: no network, fixed SEED. Re-running yields the same CSV.

Usage:
    python scripts/build_ignition_dataset.py
"""
from __future__ import annotations

import math
import random
import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd  # noqa: E402

from api.core.openmeteo import _load_cache, summarize_window_with_kbdi  # noqa: E402
from api.core.validation import doy_to_season  # noqa: E402

# ── Tunables (mirrored in ML.md "open decisions") ────────────────────────────
SEED = 7
WINDOW_TAG = "|365"          # cache keys for 365-day fire windows
NEG_PER_FIRE = 5             # typical days sampled per fire (→ ~17% positive)
KBDI_WARMUP_DAYS = 90        # skip first N days: the KBDI integral must warm up
AUTOCORR_BUFFER_DAYS = 21    # skip days just before the fire: weather autocorrelates
BLOCK_SIZE_DEG = 2.0         # spatial-block grid for leakage-safe CV later
CORE_WEATHER = ["temperature_c", "humidity_pct", "wind_kph", "days_since_rain"]

OUT_PATH = PROJECT_ROOT / "data" / "ignition_dataset.csv"


def vpd_hpa(temp_c: float | None, humidity_pct: float | None) -> float | None:
    """Vapor pressure deficit (hPa) — same Tetens form the V4 algorithm uses."""
    if temp_c is None or humidity_pct is None:
        return None
    es = 6.1078 * math.exp(17.27 * temp_c / (temp_c + 237.3))
    return es * (1.0 - humidity_pct / 100.0)


def spatial_block(lat: float, lon: float) -> str:
    """Coarse grid-cell id so nearby examples land in the same CV fold."""
    blat = int(math.floor(lat / BLOCK_SIZE_DEG) * BLOCK_SIZE_DEG)
    blon = int(math.floor(lon / BLOCK_SIZE_DEG) * BLOCK_SIZE_DEG)
    return f"{blat}_{blon}"


def feature_row(window: dict, target: date, lat: float, lon: float, label: int):
    """Compute one example's features at `target` date, or None if incomplete.
    Reuses summarize_window_with_kbdi so positives + negatives are byte-for-byte
    the same feature definitions (feature parity)."""
    s = summarize_window_with_kbdi(window, target)
    if any(s.get(c) is None for c in CORE_WEATHER):
        return None
    doy = target.timetuple().tm_yday
    return {
        "lat": lat,
        "lon": lon,
        "date": target.isoformat(),
        "label": label,
        "temperature_c": s["temperature_c"],
        "humidity_pct": s["humidity_pct"],
        "wind_kph": s["wind_kph"],
        "days_since_rain": s["days_since_rain"],
        "kbdi": s.get("kbdi"),  # may be None → NaN; gradient-boosted trees handle it
        "vpd_hpa": vpd_hpa(s["temperature_c"], s["humidity_pct"]),
        "season": doy_to_season(doy),
        "month": target.month,
        "spatial_block": spatial_block(lat, lon),
    }


def parse_fire_keys(cache: dict) -> list[tuple[float, float, date, dict]]:
    """Every cached 365-day window's key encodes a fire: lat|lon|firedate|365."""
    fires: list[tuple[float, float, date, dict]] = []
    for k, v in cache.items():
        if v is None or not k.endswith(WINDOW_TAG):
            continue
        parts = k.split("|")
        if len(parts) != 4:
            continue
        try:
            lat, lon = float(parts[0]), float(parts[1])
            fire_date = date.fromisoformat(parts[2])
        except ValueError:
            continue
        fires.append((lat, lon, fire_date, v))
    # Deterministic order regardless of dict load order → reproducible sampling.
    fires.sort(key=lambda f: (f[0], f[1], f[2].isoformat()))
    return fires


def main() -> int:
    rng = random.Random(SEED)
    print("loading weather cache (the big ~1.1 GB file - give it a minute)...")
    cache = _load_cache()
    fires = parse_fire_keys(cache)
    print(f"  found {len(fires):,} cached fire windows")

    rows: list[dict] = []
    n_pos = n_neg = skipped = 0
    for lat, lon, fire_date, window in fires:
        times = (window.get("daily", {}) or {}).get("time", []) or []
        fire_iso = fire_date.isoformat()
        if fire_iso not in times:
            skipped += 1
            continue
        fire_idx = times.index(fire_iso)

        # Positive: the fire day itself.
        pos = feature_row(window, fire_date, lat, lon, 1)
        if pos is None:
            skipped += 1
            continue
        rows.append(pos)
        n_pos += 1

        # Negatives: typical days at the same location (warmed-up, buffered).
        lo, hi = KBDI_WARMUP_DAYS, fire_idx - AUTOCORR_BUFFER_DAYS
        candidates = list(range(lo, hi)) if hi > lo else []
        for idx in rng.sample(candidates, min(NEG_PER_FIRE, len(candidates))):
            try:
                nd = date.fromisoformat(times[idx])
            except (ValueError, IndexError):
                continue
            neg = feature_row(window, nd, lat, lon, 0)
            if neg is not None:
                rows.append(neg)
                n_neg += 1

    df = pd.DataFrame(rows)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT_PATH, index=False)

    # ── Summary + a first look at the signal ─────────────────────────────────
    print(f"\nsaved: {OUT_PATH}  ({len(df):,} rows)")
    print(f"  positives (fire days): {n_pos:,}")
    print(f"  negatives (typical):   {n_neg:,}")
    print(f"  class balance:         {n_pos / max(len(df), 1):.1%} positive")
    print(f"  skipped fires:         {skipped:,}")
    print(f"  kbdi coverage:         {df['kbdi'].notna().mean():.1%}")
    print(f"  spatial blocks:        {df['spatial_block'].nunique()}")

    print("\nMean conditions - fire days vs typical days (is the signal real?):")
    cmp_cols = ["vpd_hpa", "kbdi", "wind_kph", "humidity_pct",
                "temperature_c", "days_since_rain"]
    means = df.groupby("label")[cmp_cols].mean()
    for c in cmp_cols:
        typ, fire = means.loc[0, c], means.loc[1, c]
        arrow = "higher on fire days" if fire > typ else "lower on fire days"
        print(f"  {c:16s} typical={typ:8.2f}   fire={fire:8.2f}   -> {arrow}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
