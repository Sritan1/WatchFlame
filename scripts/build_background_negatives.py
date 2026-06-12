"""Route B — background negatives from genuinely non-fire US locations.

Adds label=0 examples at random CONUS points that did NOT have a recorded fire.
With these, the model finally has examples of "developed/urban/water/barren place
that doesn't ignite," so it learns those areas fire far less than wildland for the
SAME weather — fixing the v1 over-flagging of low-fire regions (e.g. Chicago).

Why the existing same-location negatives can't do this: every fire location is, by
definition, a place that burned, so land_cover there carries no "won't burn" signal.
Background points break that — many are developed/water with no positive at all.

Sampling: uniform over CONUS (representative land-cover mix) + targeted points around
major metros (guarantees developed coverage, where the over-flag lives). Land cover is
looked up first (free); only valid US-land points spend an Open-Meteo weather pull.

Quota-aware + incremental, like the original fire enrichment: weather is cache-first
and backs off on 429, so re-run across days to accumulate more as quota refreshes.

Output: data/background_negatives.csv — appended into the training set by
build_ignition_dataset.py.

Usage (re-runnable):
    python scripts/build_background_negatives.py
"""
from __future__ import annotations

import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

import pandas as pd  # noqa: E402

from api.core.openmeteo import (  # noqa: E402
    _load_cache, _save_cache, fetch_window, summarize_window_with_kbdi,
)
from api.core.validation import doy_to_season  # noqa: E402
from api.services.landcover import land_cover_class_cached  # noqa: E402
from build_ignition_dataset import (  # noqa: E402
    CORE_WEATHER, LC_CACHE_PATH, spatial_block, vpd_hpa,
)

SEED = 11
TARGET = 3000                      # background negatives to gather (total, across runs)
N_CITY = 1000                      # of TARGET, sampled around metros (developed coverage)
DATE_MIN, DATE_MAX = date(1994, 1, 1), date(2014, 12, 31)  # match the fire era
CONUS = (24.6, 49.0, -124.6, -67.0)  # lat_min, lat_max, lon_min, lon_max

OUT_PATH = PROJECT_ROOT / "data" / "background_negatives.csv"

# Major US metro centers — targeted points get small random offsets so they land
# on developed pixels (the classes the over-flag mis-reads).
CITIES = [
    (40.71, -74.01), (34.05, -118.24), (41.88, -87.63), (29.76, -95.37),
    (33.45, -112.07), (39.95, -75.17), (29.42, -98.49), (32.72, -117.16),
    (32.78, -96.80), (37.34, -121.89), (30.27, -97.74), (30.33, -81.66),
    (32.76, -97.33), (39.96, -82.99), (35.23, -80.84), (39.10, -84.51),
    (47.61, -122.33), (39.74, -104.99), (42.36, -71.06), (38.90, -77.04),
    (36.17, -86.78), (35.47, -97.52), (45.51, -122.68), (36.16, -115.14),
    (35.15, -90.05), (39.77, -86.16), (38.63, -90.20), (43.04, -87.91),
    (25.76, -80.19), (44.98, -93.27), (33.75, -84.39), (40.44, -79.99),
]


def candidate_locations(rng: random.Random, n: int) -> list[tuple[float, float]]:
    """Oversampled candidate points (city-targeted + uniform CONUS)."""
    lat0, lat1, lon0, lon1 = CONUS
    pts: list[tuple[float, float]] = []
    n_city = int(n * N_CITY / TARGET)
    for _ in range(n_city):
        clat, clon = rng.choice(CITIES)
        pts.append((clat + rng.uniform(-0.12, 0.12), clon + rng.uniform(-0.12, 0.12)))
    for _ in range(n - n_city):
        pts.append((rng.uniform(lat0, lat1), rng.uniform(lon0, lon1)))
    rng.shuffle(pts)
    return pts


def main() -> int:
    rng = random.Random(SEED)
    print("loading weather cache (the big ~1.1 GB file)...")
    cache = _load_cache()
    lc_cache: dict[str, str] = {}
    if LC_CACHE_PATH.exists():
        lc_cache = json.loads(LC_CACHE_PATH.read_text(encoding="utf-8"))

    # Resume: skip locations already in the frozen background CSV.
    done: set[str] = set()
    rows: list[dict] = []
    if OUT_PATH.exists():
        prev = pd.read_csv(OUT_PATH)
        rows = prev.to_dict("records")
        done = {f"{round(r['lat'], 3)}|{round(r['lon'], 3)}" for r in rows}
    print(f"  resuming with {len(rows):,} background negatives already gathered")

    needed = TARGET - len(rows)
    if needed <= 0:
        print(f"  already at target ({len(rows):,}); nothing to do.", flush=True)
        return 0
    span = (DATE_MAX - DATE_MIN).days
    # INTERLEAVED: for each candidate, land cover -> (if valid US land) weather -> row.
    # Writes the CSV every 25 rows so progress is visible immediately. Oversample
    # candidates to cover ocean / non-US rejections.
    candidates = candidate_locations(rng, needed * 5)
    print(f"  enriching toward {needed:,} more rows (interleaved; watch "
          f"data/background_negatives.csv)...", flush=True)

    added = failed = skipped = consec_fail = 0
    for lat, lon in candidates:
        if added >= needed:
            break
        key = f"{round(lat, 3)}|{round(lon, 3)}"
        if key in done:
            continue
        lc = land_cover_class_cached(lat, lon, lc_cache)
        if lc is None:  # ocean / outside-US / no-data — skip before spending a weather pull
            skipped += 1
            if skipped % 200 == 0:
                LC_CACHE_PATH.write_text(json.dumps(lc_cache), encoding="utf-8")
            continue
        d = DATE_MIN + timedelta(days=rng.randint(0, span))
        window = fetch_window(lat, lon, d, days=365, cache=cache, polite_delay=0.3)
        s = summarize_window_with_kbdi(window, d) if window else None
        if not s or any(s.get(c) is None for c in CORE_WEATHER):
            failed += 1
            consec_fail += 1
            # ~40 misses in a row = Open-Meteo quota hit (individual sparse-window
            # failures are random, not consecutive). Stop cleanly instead of
            # grinding ~30s/point through the rest of the candidate list.
            if consec_fail >= 40:
                print(f"  stopping: {consec_fail} consecutive weather failures = "
                      f"Open-Meteo quota hit. Re-run after the daily refresh "
                      f"(resumes from the CSV).", flush=True)
                break
            continue
        consec_fail = 0
        done.add(key)
        rows.append({
            "lat": lat, "lon": lon, "date": d.isoformat(), "label": 0,
            "temperature_c": s["temperature_c"], "humidity_pct": s["humidity_pct"],
            "wind_kph": s["wind_kph"], "days_since_rain": s["days_since_rain"],
            "kbdi": s.get("kbdi"), "vpd_hpa": vpd_hpa(s["temperature_c"], s["humidity_pct"]),
            "season": doy_to_season(d.timetuple().tm_yday), "month": d.month,
            "land_cover": lc, "spatial_block": spatial_block(lat, lon),
        })
        added += 1
        if added % 25 == 0:
            pd.DataFrame(rows).to_csv(OUT_PATH, index=False)
            _save_cache(cache)
            LC_CACHE_PATH.write_text(json.dumps(lc_cache), encoding="utf-8")
            print(f"    added={added}/{needed}  (skipped {skipped} non-US, "
                  f"failed {failed}, total {len(rows)})", flush=True)

    pd.DataFrame(rows).to_csv(OUT_PATH, index=False)
    _save_cache(cache)
    LC_CACHE_PATH.write_text(json.dumps(lc_cache), encoding="utf-8")

    df = pd.DataFrame(rows)
    print(f"\nsaved: {OUT_PATH}  ({len(df):,} background negatives; +{added} this run, {failed} failed)")
    if len(df):
        print("  land-cover mix:")
        for cls, frac in df["land_cover"].value_counts(normalize=True).items():
            print(f"    {cls:11s} {frac:5.1%}")
    if len(rows) < TARGET:
        print(f"  NOTE: {TARGET - len(rows)} short of target (likely Open-Meteo quota). "
              f"Re-run after the daily refresh — cache-first, so it resumes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
