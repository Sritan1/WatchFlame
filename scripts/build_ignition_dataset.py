"""Build the ignition training set, one row per location and day. A 1 means a fire
really started there that day, a 0 means an ordinary day at the same place.

Fire records only give the days something happened, so negatives are manufactured
from other days at the same locations, out of the cached weather windows. Sharing
locations across both classes is the point. The model can't win by learning that
fires happen near people, it has to learn what was different about that day.

No network and a fixed seed, so re-running gives the same CSV. Run with
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

import json  # noqa: E402

import pandas as pd  # noqa: E402

from api.core.openmeteo import _key, _load_cache, summarize_window_with_kbdi  # noqa: E402
from api.core.validation import doy_to_season  # noqa: E402
from api.services.ignition import DAYS_SINCE_RAIN_CAP  # noqa: E402
from api.services.landcover import land_cover_class_cached  # noqa: E402

# Tunables
SEED = 7
WINDOW_TAG = "|365"          # cache keys for 365-day fire windows
NEG_PER_FIRE = 5             # quiet days per fire, 15% positives once the background set lands
KBDI_WARMUP_DAYS = 90        # skip first N days, the KBDI integral must warm up
AUTOCORR_BUFFER_DAYS = 21    # skip days just before the fire, weather autocorrelates
BLOCK_SIZE_DEG = 2.0         # spatial-block grid for leakage-safe CV later
CORE_WEATHER = ["temperature_c", "humidity_pct", "wind_kph", "days_since_rain"]

OUT_PATH = PROJECT_ROOT / "data" / "ignition_dataset.csv"
LC_CACHE_PATH = PROJECT_ROOT / "data" / "landcover_cache.json"  # gitignored (data/*.json)


def vpd_hpa(temp_c: float | None, humidity_pct: float | None) -> float | None:
    """Vapor pressure deficit, same formula the risk algorithm uses."""
    if temp_c is None or humidity_pct is None:
        return None
    es = 6.1078 * math.exp(17.27 * temp_c / (temp_c + 237.3))
    return es * (1.0 - humidity_pct / 100.0)


def spatial_block(lat: float, lon: float) -> str:
    """A coarse cell id, so neighbours end up in the same fold."""
    blat = int(math.floor(lat / BLOCK_SIZE_DEG) * BLOCK_SIZE_DEG)
    blon = int(math.floor(lon / BLOCK_SIZE_DEG) * BLOCK_SIZE_DEG)
    return f"{blat}_{blon}"


def feature_row(window: dict, target: date, lat: float, lon: float, label: int,
                land_cover: str):
    """One example's features on a given day, or None if the window is too thin.
    It goes through the same summarize function every other caller uses, so
    positives and negatives are defined identically. Land cover is looked up once
    per location and handed in."""
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
        "kbdi": s.get("kbdi"),  # never missing in practice, sampling clears the warmup
        "vpd_hpa": vpd_hpa(s["temperature_c"], s["humidity_pct"]),
        "season": doy_to_season(doy),
        "month": target.month,
        "land_cover": land_cover,
        "spatial_block": spatial_block(lat, lon),
    }


def parse_fire_keys(
    cache: dict, exclude_keys: frozenset = frozenset()
) -> list[tuple[float, float, date, dict]]:
    """Each cached window's key already names a fire, as location and date, so
    the cache doubles as the fire list. `exclude_keys` drops the background
    negatives, which live in the same cache."""
    fires: list[tuple[float, float, date, dict]] = []
    for k, v in cache.items():
        if v is None or not k.endswith(WINDOW_TAG) or k in exclude_keys:
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
    # Sort, so the sampling doesn't depend on dict ordering.
    fires.sort(key=lambda f: (f[0], f[1], f[2].isoformat()))
    return fires


def main() -> int:
    rng = random.Random(SEED)
    print("loading weather cache (the big ~1.1 GB file - give it a minute)...")
    cache = _load_cache()
    # The background negatives share this cache, and without excluding them we'd
    # read them back as fires.
    bg_path = PROJECT_ROOT / "data" / "background_negatives.csv"
    bg_keys: frozenset = frozenset()
    if bg_path.exists():
        _bg = pd.read_csv(bg_path)
        bg_keys = frozenset(
            _key(float(r.lat), float(r.lon), date.fromisoformat(str(r.date)), 365)
            for r in _bg.itertuples()
        )
    fires = parse_fire_keys(cache, exclude_keys=bg_keys)
    print(f"  found {len(fires):,} fire windows (excluded {len(bg_keys):,} background)")

    # One lookup per location, kept between runs.
    lc_cache: dict[str, str] = {}
    if LC_CACHE_PATH.exists():
        lc_cache = json.loads(LC_CACHE_PATH.read_text(encoding="utf-8"))
    print(f"  land-cover cache: {len(lc_cache):,} locations preloaded; enriching...")

    rows: list[dict] = []
    n_pos = n_neg = skipped = 0
    for fi, (lat, lon, fire_date, window) in enumerate(fires):
        times = (window.get("daily", {}) or {}).get("time", []) or []
        fire_iso = fire_date.isoformat()
        if fire_iso not in times:
            skipped += 1
            continue
        fire_idx = times.index(fire_iso)

        # Looked up once and reused by the fire day and all its quiet days.
        land_cover = land_cover_class_cached(lat, lon, lc_cache) or "unknown"
        if (fi + 1) % 100 == 0:
            LC_CACHE_PATH.write_text(json.dumps(lc_cache), encoding="utf-8")
            print(f"    {fi + 1}/{len(fires)} fires (land-cover cache {len(lc_cache):,})")

        # The day the fire started.
        pos = feature_row(window, fire_date, lat, lon, 1, land_cover)
        if pos is None:
            skipped += 1
            continue
        rows.append(pos)
        n_pos += 1

        # Ordinary days at the same spot, far enough back to be unrelated and
        # far enough in for the drought integrator to have settled.
        lo, hi = KBDI_WARMUP_DAYS, fire_idx - AUTOCORR_BUFFER_DAYS
        candidates = list(range(lo, hi)) if hi > lo else []
        for idx in rng.sample(candidates, min(NEG_PER_FIRE, len(candidates))):
            try:
                nd = date.fromisoformat(times[idx])
            except (ValueError, IndexError):
                continue
            neg = feature_row(window, nd, lat, lon, 0, land_cover)
            if neg is not None:
                rows.append(neg)
                n_neg += 1

    LC_CACHE_PATH.write_text(json.dumps(lc_cache), encoding="utf-8")

    # Add the negatives from places that have never burned, built by
    # scripts/build_background_negatives.py. Without them every location in the
    # set is a fire location, and land cover can't say that a city doesn't burn.
    bg_path = PROJECT_ROOT / "data" / "background_negatives.csv"
    n_bg = 0
    if bg_path.exists():
        bg = pd.read_csv(bg_path)
        n_bg = len(bg)
        # Re-categorize from the cached codes, so these rows pick up any change
        # to categorize() as well.
        bg["land_cover"] = [
            land_cover_class_cached(float(r.lat), float(r.lon), lc_cache) or "unknown"
            for r in bg.itertuples()
        ]
        LC_CACHE_PATH.write_text(json.dumps(lc_cache), encoding="utf-8")
        rows.extend(bg.to_dict("records"))
        print(f"  + {n_bg:,} background negatives (Route B, non-fire locations)")

    df = pd.DataFrame(rows)
    # Clip days since rain to the ceiling every row can actually reach. Quiet days sit
    # earlier in the window, so only the fire climbs to a full year and the model
    # would learn that gap instead of the weather. ignition.py clips the same way.
    df["days_since_rain"] = df["days_since_rain"].clip(upper=DAYS_SINCE_RAIN_CAP)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT_PATH, index=False)

    # What we ended up with
    print(f"\nsaved: {OUT_PATH}  ({len(df):,} rows)")
    print(f"  positives (fire days): {n_pos:,}")
    print(f"  negatives (typical):   {n_neg:,}")
    print(f"  class balance:         {n_pos / max(len(df), 1):.1%} positive")
    print(f"  skipped fires:         {skipped:,}")
    print(f"  kbdi coverage:         {df['kbdi'].notna().mean():.1%}")
    print(f"  spatial blocks:        {df['spatial_block'].nunique()}")
    print(f"  land-cover classes:    {df['land_cover'].nunique()}")
    print("  land-cover mix (% of fire days that are each class):")
    fire_lc = df[df.label == 1]["land_cover"].value_counts(normalize=True)
    for cls, frac in fire_lc.items():
        print(f"    {cls:11s} {frac:5.1%}")

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
