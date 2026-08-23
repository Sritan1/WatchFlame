"""Fit each state's risk thresholds against its real fire history.

For each state, sample fires from FPA-FOD, fetch the weather on the day each one
started, score them, and take percentiles as that state's tier cutoffs. The bbox and
centroid come from the fire coordinates. Writes api/data/regional_thresholds.json.

Re-run with python -m scripts.build_regional_thresholds when the algorithm changes.
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

# Chosen on total fire activity from 1992 to 2015, so the fire-prone West, plus the
# southeastern belt where prescribed burning makes fire weather behave very
# differently. Everywhere else falls back to the global cutoffs.
CALIBRATED_STATES = [
    "CA", "OR", "WA", "ID", "MT", "WY", "NV", "UT", "AZ", "NM", "CO",
    "TX", "OK", "FL", "GA", "NC", "SC",
]

FIRES_PER_STATE = 100
SAMPLE_POOL_PER_STATE = 5_000  # rows pulled from SQLite before stratification
# An even split across size buckets, not the natural mix. Huge fires are 1-2% of
# records but burn on the worst weather, so a quarter of the sample holds the cutoffs
# up. Real proportions drop high and extreme by 0.04 to 0.08, and the app reads High
# on mild days.
SIZE_BUCKETS_RATIO = {"small": 25, "medium": 25, "large": 25, "very_large": 25}
KBDI_WINDOW_DAYS = 365  # mirrors the enrich_iter_kbdi default, used for cache-key probing

# Where the tier lines fall in each state's fire-day scores. Set high so EXTREME
# stays rare, meaning the worst few percent of days this state has ever seen.
PERCENTILES = {"low": 50, "moderate": 75, "high": 90, "extreme": 97}

# Give up after this many states in a row come back empty for a real reason.
# Running out of quota doesn't count. That just means try again tomorrow.
CIRCUIT_BREAKER_THRESHOLD = 3
# Spotted when this share of a state's fires still have no cache entry after
# enrichment. fetch_window declines to cache a rate-limited miss, so a pile of
# missing keys is the fingerprint of a blown quota.
QUOTA_EXHAUSTED_RATIO = 0.5

OUTPUT_PATH = Path(__file__).resolve().parents[1] / "api" / "data" / "regional_thresholds.json"


def load_state_pool(state: str, n: int, seed: int) -> pd.DataFrame:
    """Deterministic fire sample from the FPA-FOD SQLite, filtered to one state.

    ORDER BY RANDOM() ignores the Python seed, so every re-run would draw different
    fires and blow through the weather cache. Pull a stable window ordered by
    primary key and let pandas do the seeded sampling instead.
    """
    import sqlite3

    if not KAGGLE_SQLITE_PATH.exists():
        raise FileNotFoundError(f"Kaggle SQLite not found at {KAGGLE_SQLITE_PATH}")

    # Pull 4x what we need, so even a rare size bucket has something to draw from.
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
    # Shuffle, or we'd be stuck with the lowest ids, which cluster by year and
    # agency.
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
    # A zero NDVI anomaly calibrates against neutral vegetation, so a real reading at
    # request time shifts the score relative to that baseline. Looking up each fire's
    # actual NDVI costs thousands of calls, and older fires predate usable coverage.
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
    """Fit one state, returning a dict that says how it went.

    `outcome` separates a state with no fires from one whose weather fetches got
    rate-limited. Only the first counts toward the circuit breaker.
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

    # A fire has a cache entry whether its fetch worked or failed for good. Only a
    # rate-limited one leaves nothing behind.
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
    # The cutoffs have to climb.
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
        # 0.8 rather than 1.0, which put EXTREME out of reach anywhere we have no
        # fit. Fitted states use their own cutoffs and ignore this.
        "global": {"low": 0.3, "moderate": 0.6, "high": 0.8, "extreme": 0.8},
        "states": merged_states,
    }


def write_progress(state_results: dict[str, dict], output_path: Path = OUTPUT_PATH) -> None:
    """Fold this run's states into whatever is already on disk. Old states stay and
    re-fit ones win, so killing the run halfway keeps what landed before it."""
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
    # Write beside it and swap, so a crash can't truncate the real file.
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
    """Walk the states, saving as it goes and stopping if things go badly wrong.

    Separate from main() so the breaker can be tested without a database, a network
    or a filesystem. Only genuine data holes move it, meaning a state whose weather
    arrived fine but scored nothing.
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
        # Every other outcome leaves the counter alone.

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
        # Save the weather cache after every state. Those fetches cost quota.
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
