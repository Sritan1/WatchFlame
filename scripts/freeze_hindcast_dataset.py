"""Freeze the fire-weather hindcast feature set to data/hindcast_features.csv.

The fire-weather constants we want to fit (VPD/wind scales, multiplicative
exponents, floors) are applied INSIDE compute_risk — they do not affect the
per-fire weather features themselves. So once we've pulled each fire's real
day-of-fire weather + KBDI from Open-Meteo, that feature table is immutable
and every downstream step (fitting, benchmarking, chart regen) can run
offline and reproducibly against this CSV — no Open-Meteo quota, no cache
drift.

This also permanently fixes the "validation cache instability" bug: the
sample is now deterministic (api.core.validation.load_fires_sample uses a
stable OBJECTID ordering + seeded down-sample), so re-runs hit the cache
instead of re-fetching 500 new fires every time.

Usage:
    python scripts/freeze_hindcast_dataset.py

Re-runnable: enrichment is cache-first, so a second run after a quota refresh
fills any gaps left by 429s without re-fetching what already landed.
"""
from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd  # noqa: E402

from api.core.openmeteo import _load_cache, _save_cache, enrich_iter_kbdi  # noqa: E402
from api.core.validation import (  # noqa: E402
    bucket_fire_size,
    build_fire_date,
    doy_to_season,
    load_fires_sample,
    stratified_sample,
)

SEED = 7
BUCKETS = ["small", "medium", "large", "very_large"]
PER_BUCKET = 125  # 4 * 125 = 500-fire stratified sample (matches validate_fireweather_chart)

OUT_PATH = PROJECT_ROOT / "data" / "hindcast_features.csv"

# Columns persisted to the frozen CSV. Everything compute_risk needs, plus
# identity/label columns for reproducibility and per-bucket analysis.
FEATURE_COLS = [
    "objectid",
    "lat",
    "lon",
    "fire_date",
    "season",
    "fire_size",
    "size_bucket",
    "temperature_c",
    "humidity_pct",
    "wind_kph",
    "days_since_rain",
    "kbdi",
]


def main() -> int:
    # 1. Deterministic stratified 500-fire sample (125 per bucket).
    print("loading FPA-FOD pool (deterministic, OBJECTID-ordered)…")
    pool = load_fires_sample(n=80_000, seed=SEED)
    pool["size_bucket"] = pool["fire_size"].apply(bucket_fire_size)
    sample = stratified_sample(
        pool,
        per_bucket={b: PER_BUCKET for b in BUCKETS},
        seed=SEED,
    )
    sample["fire_date"] = sample.apply(build_fire_date, axis=1)
    sample["season"] = sample["doy"].apply(doy_to_season)
    print(f"  sampled {len(sample)} fires")
    print(sample["size_bucket"].value_counts().to_string())

    # 2. Enrich with real per-fire weather + KBDI (cache-first; 365-day window).
    print("\nenriching with weather + KBDI (cache-first)…")
    cache = _load_cache()
    cache_size_before = len(cache)
    rows = sample.to_dict(orient="records")

    def progress(n: int) -> None:
        print(f"  enriched {n}/{len(rows)}")

    enriched = enrich_iter_kbdi(rows, cache=cache, on_progress=progress)
    _save_cache(cache)
    print(f"  cache: {cache_size_before:,} -> {len(cache):,} entries "
          f"(+{len(cache) - cache_size_before:,})")

    # 3. Assemble the feature frame. Keep only fires with complete weather —
    #    a fire missing temp/humidity/wind/days_since_rain can't be scored.
    ew = pd.DataFrame(enriched)
    ew["fire_date"] = ew["fire_date"].apply(lambda d: d.isoformat())
    before = len(ew)
    ew = ew.dropna(
        subset=["temperature_c", "humidity_pct", "wind_kph", "days_since_rain"]
    )
    n_with_kbdi = int(ew["kbdi"].notna().sum())
    print(f"\n  weather-complete: {len(ew)}/{before}; with real KBDI: {n_with_kbdi}")

    missing = [c for c in FEATURE_COLS if c not in ew.columns]
    if missing:
        print(f"  ERROR: enriched frame missing expected columns: {missing}")
        return 1

    out = ew[FEATURE_COLS].sort_values("objectid").reset_index(drop=True)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT_PATH, index=False)
    print(f"\nsaved frozen feature set: {OUT_PATH}  ({len(out)} fires)")

    # Coverage warning: if a quota lockout left gaps, the CSV is still usable
    # but smaller than 500. A re-run after the quota refresh fills it in.
    if len(out) < PER_BUCKET * len(BUCKETS):
        print(
            f"  NOTE: {PER_BUCKET * len(BUCKETS) - len(out)} fires lack complete "
            f"weather (likely Open-Meteo quota). Re-run after the daily quota "
            f"refresh to fill the gaps — enrichment is cache-first so what "
            f"already landed won't be re-fetched."
        )
    if n_with_kbdi < len(out):
        print(
            f"  NOTE: {len(out) - n_with_kbdi} fires have weather but no KBDI "
            f"(short/empty 365-day window). They'll fall back to "
            f"days_since_rain in scoring."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
