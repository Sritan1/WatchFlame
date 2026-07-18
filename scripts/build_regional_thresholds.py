"""One-off CLI: fit per-state risk thresholds against historical fires.

Pipeline:
1. Pull a stratified sample of fires per state from the FPA_FOD SQLite.
2. Fetch each fire's day-of-fire weather from Open-Meteo (cached).
3. Run compute_risk() on each fire's real weather → score distribution.
4. Per state, set 4-bucket cutoffs at fire-day score percentiles.
5. Derive per-state bbox + centroid from the fire coordinates themselves.
6. Write everything to api/data/regional_thresholds.json.

The output JSON is loaded at backend startup by regional_calibration.py.
Re-run this script when the algorithm or sample changes.

Usage:
    python -m scripts.build_regional_thresholds
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.core.openmeteo import (  # noqa: E402
    _key,
    _load_cache,
    _save_cache,
    enrich_iter_kbdi,
)
from api.core.risk_algorithm import compute_risk  # noqa: E402
from api.core.validation import (  # noqa: E402
    KAGGLE_SQLITE_PATH,
    bucket_fire_size,
    build_fire_date,
    doy_to_season,
)

# States selected for per-state calibration. Picked by total fire activity
# 1992-2015 in FPA_FOD: every Western fire-prone state, plus the SE belt
# (FL/GA/NC/SC) where prescribed-burn-driven fire weather differs sharply.
# Other states fall back to global thresholds.
CALIBRATED_STATES = [
    "CA", "OR", "WA", "ID", "MT", "WY", "NV", "UT", "AZ", "NM", "CO",
    "TX", "OK", "FL", "GA", "NC", "SC",
]

FIRES_PER_STATE = 100
SAMPLE_POOL_PER_STATE = 5_000  # rows pulled from SQLite before stratification
# Even split across the four size buckets, not the natural mix, and it's on
# purpose. Very-large fires are under 1-2% of records but they burn on the worst
# weather (the highest scores), so taking a quarter of the sample from them holds
# the tier cutoffs up. If we sampled fires in their real proportions instead
# (mostly small ones, which often start on ordinary weather) the high and extreme
# cutoffs would fall by roughly 0.04 to 0.08 and the app would read High on
# milder days. For a safety tool that over-flagging is worse than being a bit
# conservative, so we keep the even split. (Checked with a reweighting diagnostic
# on the cached fires. See the calibration note in handoff.md.)
SIZE_BUCKETS_RATIO = {"small": 25, "medium": 25, "large": 25, "very_large": 25}
KBDI_WINDOW_DAYS = 365  # mirrors enrich_iter_kbdi default; used for cache-key probing

# Percentile cutoffs of fire-day scores. Shifted high so EXTREME is rare:
# only the top ~3% of historical fire days in this state qualify.
PERCENTILES = {"low": 50, "moderate": 75, "high": 90, "extreme": 97}

# Stop the run if this many states in a row return 0 fires-with-complete-weather
# from a real (non-quota) cause. Quota-exhausted states are excluded — those
# are a transient signal that should be retried tomorrow, not a reason to bail.
CIRCUIT_BREAKER_THRESHOLD = 3
# A state counts as "quota-exhausted" (and so does NOT count toward the breaker)
# if at least this fraction of its sample's cache keys are still missing after
# enrichment — i.e. fetch_window returned None without caching, which is the
# fingerprint of an exhausted-429 from openmeteo.fetch_window.
QUOTA_EXHAUSTED_RATIO = 0.5

OUTPUT_PATH = Path(__file__).resolve().parents[1] / "api" / "data" / "regional_thresholds.json"


def load_state_pool(state: str, n: int, seed: int) -> pd.DataFrame:
    """Deterministic fire sample from the FPA_FOD SQLite filtered to one state.

    SQLite's `ORDER BY RANDOM()` ignores Python seeds, so re-runs would sample
    different fires every time and burn through the Open-Meteo cache. Instead
    we pull a stable-ordered window (by OBJECTID, the table PK) and sample it
    with pandas using the Python seed — so identical inputs across runs
    produce identical fire selections, and the weather cache actually helps.
    """
    import sqlite3

    if not KAGGLE_SQLITE_PATH.exists():
        raise FileNotFoundError(f"Kaggle SQLite not found at {KAGGLE_SQLITE_PATH}")

    # Pull more rows than we need so the pandas down-sample has a real pool
    # to work with after stratification — 4× the target gives every size
    # bucket enough headroom even when the bucket is rare.
    pool_limit = int(n) * 4

    con = sqlite3.connect(str(KAGGLE_SQLITE_PATH))
    try:
        df = pd.read_sql(
            f"""
            SELECT
                OBJECTID         AS objectid,
                FIRE_YEAR        AS fire_year,
                DISCOVERY_DOY    AS doy,
                FIRE_SIZE        AS fire_size,
                LATITUDE         AS lat,
                LONGITUDE        AS lon,
                STATE            AS state
            FROM Fires
            WHERE STATE = ?
              AND DISCOVERY_DOY IS NOT NULL
              AND LATITUDE IS NOT NULL
              AND LONGITUDE IS NOT NULL
            ORDER BY OBJECTID
            LIMIT {pool_limit}
            """,
            con,
            params=(state,),
        )
    finally:
        con.close()
    if df.empty:
        return df
    # Deterministic shuffle so the pool isn't biased to the lowest OBJECTIDs
    # (which tend to cluster by year + agency in FPA_FOD).
    take = min(int(n), len(df))
    return df.sample(n=take, random_state=seed).reset_index(drop=True)


def stratified_pick(df: pd.DataFrame, per_bucket: dict[str, int], seed: int) -> pd.DataFrame:
    df = df.copy()
    df["size_bucket"] = df["fire_size"].apply(bucket_fire_size)
    pieces = []
    for b, n in per_bucket.items():
        sub = df[df["size_bucket"] == b]
        take = sub.sample(n=min(n, len(sub)), random_state=seed) if len(sub) else sub
        pieces.append(take)
    return pd.concat(pieces).reset_index(drop=True)


def per_row_score(r: dict) -> float | None:
    # KBDI is the preferred drought input; days_since_rain is kept as a
    # fallback only because compute_risk's signature still requires it (it's
    # ignored when kbdi is supplied).
    #
    # V4: explicitly pass ndvi_anomaly=0.0 so calibration baselines against
    # the "neutral vegetation" multiplier (ndvi_factor(0)=0.80), matching the
    # live /risk path's scoring path. Real NDVI deviations at request time
    # then shift scores up (stressed) or down (greener) RELATIVE to this
    # calibrated baseline. Historical per-fire NDVI lookups would be more
    # rigorous but cost thousands of CDSE calls + Sentinel-2 coverage is
    # too sparse for older fires.
    required = ("temperature_c", "humidity_pct", "wind_kph", "kbdi")
    if any(r.get(k) is None for k in required):
        return None
    return compute_risk(
        temp_c=float(r["temperature_c"]),
        humidity_pct=float(r["humidity_pct"]),
        wind_kph=float(r["wind_kph"]),
        days_since_rain=int(r.get("days_since_rain") or 0),
        season=r["season"],
        kbdi=float(r["kbdi"]),
        ndvi_anomaly=0.0,
    ).score


def fit_state(state: str, cache: dict, seed: int) -> dict:
    """Fit one state.

    Returns a diagnostic dict, never raises for the routine "no data" cases.
    Shape:
        {"outcome": "ok" | "no_pool" | "thin_pool"
                  | "data_poverty"     # 0 with complete weather, NOT quota
                  | "quota_exhausted"  # 0 with complete weather, due to 429s
                  | "thin_data",       # >0 but <30 with complete weather
         "result": dict | None,        # only set when outcome == "ok"
         "n_sample": int,
         "n_with_weather": int,
         "n_quota_exhausted": int}     # cache keys still missing after enrich
    """
    pool = load_state_pool(state, SAMPLE_POOL_PER_STATE, seed)
    if pool.empty:
        print(f"  [{state}] no fires in pool; skipping")
        return {"outcome": "no_pool", "result": None,
                "n_sample": 0, "n_with_weather": 0, "n_quota_exhausted": 0}

    sample = stratified_pick(pool, SIZE_BUCKETS_RATIO, seed)
    if len(sample) < 40:
        print(f"  [{state}] only {len(sample)} fires after stratification; skipping")
        return {"outcome": "thin_pool", "result": None,
                "n_sample": len(sample), "n_with_weather": 0, "n_quota_exhausted": 0}

    sample["fire_date"] = sample.apply(build_fire_date, axis=1)
    sample["season"] = sample["doy"].apply(doy_to_season)

    enriched = enrich_iter_kbdi(sample.to_dict(orient="records"), cache=cache)

    # Quota-vs-data-poverty diagnostic: a fire's window key is in the cache
    # iff fetch_window either succeeded (cached the JSON) or hit a permanent
    # failure (cached None). Exhausted-429 deliberately does NOT cache, so
    # missing keys = the quota-exhausted signal we want to distinguish.
    n_quota_exhausted = sum(
        1 for r in enriched
        if _key(r["lat"], r["lon"], r["fire_date"], KBDI_WINDOW_DAYS) not in cache
    )

    scores = [per_row_score(r) for r in enriched]
    valid_scores = [s for s in scores if s is not None]
    n_with_weather = len(valid_scores)
    n_sample = len(sample)

    if n_with_weather < 30:
        if n_with_weather == 0:
            quota_dominant = n_quota_exhausted >= QUOTA_EXHAUSTED_RATIO * n_sample
            outcome = "quota_exhausted" if quota_dominant else "data_poverty"
        else:
            outcome = "thin_data"
        print(
            f"  [{state}] only {n_with_weather}/{n_sample} fires with complete weather "
            f"(quota_missing={n_quota_exhausted}); skipping [{outcome}]"
        )
        return {"outcome": outcome, "result": None,
                "n_sample": n_sample, "n_with_weather": n_with_weather,
                "n_quota_exhausted": n_quota_exhausted}

    arr = np.asarray(valid_scores, dtype=float)
    thresholds = {
        bucket: float(round(np.percentile(arr, p), 4))
        for bucket, p in PERCENTILES.items()
    }
    # Sanity: cutoffs must be monotone non-decreasing.
    last = -1.0
    for bucket in ("low", "moderate", "high", "extreme"):
        if thresholds[bucket] < last:
            thresholds[bucket] = last
        last = thresholds[bucket]

    lats = sample["lat"].astype(float)
    lons = sample["lon"].astype(float)
    bbox = [
        float(round(lons.min(), 4)),
        float(round(lats.min(), 4)),
        float(round(lons.max(), 4)),
        float(round(lats.max(), 4)),
    ]
    centroid = [float(round(lats.mean(), 4)), float(round(lons.mean(), 4))]

    result = {
        "n_fires": n_with_weather,
        "bbox": bbox,
        "centroid": centroid,
        "thresholds": thresholds,
        "score_summary": {
            "min": float(round(arr.min(), 4)),
            "median": float(round(np.median(arr), 4)),
            "mean": float(round(arr.mean(), 4)),
            "max": float(round(arr.max(), 4)),
        },
    }
    return {"outcome": "ok", "result": result,
            "n_sample": n_sample, "n_with_weather": n_with_weather,
            "n_quota_exhausted": n_quota_exhausted}


def _build_output_doc(merged_states: dict[str, dict]) -> dict:
    return {
        "version": "v4",
        "fitted_at": datetime.now().date().isoformat(),
        "algorithm_version": "v4-ndvi-anomaly-baseline-neutral",
        "drought_input": "kbdi",
        "vegetation_input": "ndvi-anomaly-baseline-neutral",
        "percentiles": PERCENTILES,
        # `extreme: 0.8` (was 1.0) aligns with the Risk Calculator gauge UI
        # and makes the EXTREME bucket actually reachable for uncalibrated
        # locations. Calibrated states still use their fitted 97th-percentile
        # cutoffs — this only governs the fallback path.
        "global": {"low": 0.3, "moderate": 0.6, "high": 0.8, "extreme": 0.8},
        "states": merged_states,
    }


def write_progress(state_results: dict[str, dict], output_path: Path = OUTPUT_PATH) -> None:
    """Merge newly-fit states into whatever's on disk and write atomically.

    Existing on-disk states are kept, but any state that was re-fit in this run
    overrides the older entry. This way a killed mid-run preserves the 10
    states that landed before, and a successful state's progress survives an
    interruption later in the loop.
    """
    existing_states: dict[str, dict] = {}
    if output_path.exists():
        try:
            existing = json.loads(output_path.read_text(encoding="utf-8"))
            existing_states = existing.get("states", {}) or {}
        except (json.JSONDecodeError, OSError):
            existing_states = {}
    merged = {**existing_states, **state_results}
    out = _build_output_doc(merged)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    # Write to a sibling tmp + replace so a crash mid-write can't truncate the
    # canonical file.
    tmp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    tmp_path.replace(output_path)


def run_calibration(
    states: list[str],
    fit_fn: Callable[[str], dict],
    write_progress_fn: Callable[[dict[str, dict]], None],
    breaker_threshold: int = CIRCUIT_BREAKER_THRESHOLD,
    on_state_done: Callable[[str, dict], None] | None = None,
) -> dict:
    """Drive the per-state loop with circuit-breaker + incremental write.

    Pulled out of main() so the breaker logic is unit-testable without
    needing a real SQLite, the network, or the filesystem.

    The breaker counts only `data_poverty` outcomes — states whose sample
    came back from Open-Meteo with weather but produced 0 valid scores
    anyway (rare; usually a coordinate or date-range data hole). Quota-
    exhausted states are explicitly skipped over: 429 lockout is what the
    pre-run probe is for, not what the breaker is for.
    """
    state_results: dict[str, dict] = {}
    consecutive_data_poverty = 0
    breaker_tripped = False
    breaker_at: str | None = None
    states_attempted: list[str] = []

    for state in states:
        states_attempted.append(state)
        diag = fit_fn(state)
        outcome = diag.get("outcome")
        if outcome == "ok" and diag.get("result") is not None:
            state_results[state] = diag["result"]
            consecutive_data_poverty = 0
        elif outcome == "data_poverty":
            consecutive_data_poverty += 1
        # Other outcomes (no_pool, thin_pool, thin_data, quota_exhausted) do
        # not move the breaker counter in either direction.

        write_progress_fn(state_results)
        if on_state_done is not None:
            on_state_done(state, diag)

        if consecutive_data_poverty >= breaker_threshold:
            breaker_tripped = True
            breaker_at = state
            print(
                f"[circuit-breaker] {breaker_threshold} consecutive states "
                f"with 0 fires + complete weather (last: {state}); aborting run"
            )
            break

    return {
        "state_results": state_results,
        "breaker_tripped": breaker_tripped,
        "breaker_at": breaker_at,
        "states_attempted": states_attempted,
    }


def main() -> int:
    seed = 7
    cache = _load_cache()
    cache_size_before = len(cache)

    print(f"FPA_FOD: {KAGGLE_SQLITE_PATH}")
    print(f"Open-Meteo cache: {len(cache):,} entries before run")
    print(f"States to calibrate: {len(CALIBRATED_STATES)}")
    print()

    def _fit(state: str) -> dict:
        print(f"[{state}] fitting…")
        try:
            diag = fit_state(state, cache, seed)
        except Exception as e:
            print(f"  [{state}] failed: {type(e).__name__}: {e}")
            return {"outcome": "error", "result": None,
                    "n_sample": 0, "n_with_weather": 0, "n_quota_exhausted": 0}
        if diag["outcome"] == "ok":
            r = diag["result"]
            print(
                f"  [{state}] n={r['n_fires']:>3}  "
                f"thresholds={r['thresholds']}  "
                f"bbox={r['bbox']}"
            )
        # Persist the weather cache after every state so a kill mid-run
        # doesn't lose hard-won fetches.
        _save_cache(cache)
        return diag

    summary = run_calibration(
        CALIBRATED_STATES,
        fit_fn=_fit,
        write_progress_fn=write_progress,
    )

    state_results = summary["state_results"]
    print()
    print(f"Wrote {OUTPUT_PATH} ({len(state_results)} states calibrated this run)")
    if summary["breaker_tripped"]:
        print(f"  (run halted by circuit breaker after {summary['breaker_at']})")
    print(f"Open-Meteo cache: {len(cache):,} entries after run "
          f"(+{len(cache) - cache_size_before:,})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
