"""Helpers for validating the risk algorithm against the Kaggle 188M Wildfires dataset.

This module is import-safe (no side effects) and used both from the validation
notebook and from a future CLI. Kept separate from `risk_algorithm.py` so the
production codepath has no pandas/sqlite dependency in its import graph.
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import Literal

import pandas as pd

from .risk_algorithm import Season, compute_risk

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
KAGGLE_SQLITE_PATH = _PROJECT_ROOT / "data" / "FPA_FOD_20170508.sqlite"


def doy_to_season(doy: int) -> Season:
    """Map day-of-year (1-366) to a meteorological season.

    Northern Hemisphere convention:
      winter = Dec, Jan, Feb   (DOY 335-366, 1-59)
      spring = Mar, Apr, May   (60-151)
      summer = Jun, Jul, Aug   (152-243)
      fall   = Sep, Oct, Nov   (244-334)
    """
    if doy <= 59 or doy >= 335:
        return "winter"
    if doy <= 151:
        return "spring"
    if doy <= 243:
        return "summer"
    return "fall"


def doy_to_month(doy: int, year: int) -> int:
    """Day-of-year to calendar month (1-12)."""
    return (date(year, 1, 1) + timedelta(days=int(doy) - 1)).month


def load_fires_sample(
    n: int = 50_000,
    sqlite_path: Path = KAGGLE_SQLITE_PATH,
    min_size_acres: float = 0.0,
    seed: int = 42,
) -> pd.DataFrame:
    """Load a deterministic sample of fires from the Kaggle SQLite for analysis.

    Returns a DataFrame with columns: objectid, fire_year, doy, month, season,
    state, fire_size, size_class, lat, lon, cause.

    Determinism matters: the Open-Meteo weather cache is keyed by
    (lat, lon, fire_date, window) — see openmeteo._key — so a sample that
    changes across runs forces a re-fetch of every fire's window and never
    benefits from the cache. SQLite's `ORDER BY RANDOM()` ignores Python
    seeds, so we instead pull a stable-ordered window (by OBJECTID, the table
    PK) and down-sample it with pandas using `seed`. Identical inputs across
    runs then yield identical fire selections. This mirrors the approach
    proven in scripts/build_regional_thresholds.load_state_pool.
    """
    if not sqlite_path.exists():
        raise FileNotFoundError(
            f"Kaggle SQLite not found at {sqlite_path}. "
            "Download from kaggle.com/datasets/rtatman/188-million-us-wildfires "
            "and place the .sqlite file in data/."
        )

    import sqlite3

    # Pull more rows than we need (stable-ordered) so the pandas down-sample
    # has a real pool to draw from. 4× headroom matches load_state_pool.
    pool_limit = int(n) * 4

    con = sqlite3.connect(str(sqlite_path))
    try:
        query = f"""
        SELECT
            OBJECTID         AS objectid,
            FIRE_YEAR        AS fire_year,
            DISCOVERY_DOY    AS doy,
            STAT_CAUSE_DESCR AS cause,
            FIRE_SIZE        AS fire_size,
            FIRE_SIZE_CLASS  AS size_class,
            LATITUDE         AS lat,
            LONGITUDE        AS lon,
            STATE            AS state
        FROM Fires
        WHERE FIRE_SIZE >= {min_size_acres}
          AND DISCOVERY_DOY IS NOT NULL
          AND LATITUDE IS NOT NULL
          AND LONGITUDE IS NOT NULL
        ORDER BY OBJECTID
        LIMIT {pool_limit}
        """
        df = pd.read_sql(query, con)
    finally:
        con.close()

    # Deterministic down-sample so the pool isn't biased to the lowest
    # OBJECTIDs (which cluster by year + agency in FPA-FOD).
    take = min(int(n), len(df))
    df = df.sample(n=take, random_state=seed).reset_index(drop=True)

    df["season"] = df["doy"].apply(doy_to_season)
    df["month"] = df.apply(lambda r: doy_to_month(r["doy"], r["fire_year"]), axis=1)
    return df


# Approximate climate normals for the contiguous US (degC, %, kph), per season.
# Source: rough regional averages from NOAA monthly normals, used purely for the
# baseline validation in section 2 of the notebook. Replace with per-state values
# for tighter validation if desired.
SEASONAL_CLIMATE: dict[Season, dict[str, float]] = {
    "winter": {"temp": 2.0,  "humidity": 70.0, "wind": 16.0, "days_since_rain": 5},
    "spring": {"temp": 14.0, "humidity": 60.0, "wind": 18.0, "days_since_rain": 8},
    "summer": {"temp": 26.0, "humidity": 55.0, "wind": 12.0, "days_since_rain": 18},
    "fall":   {"temp": 16.0, "humidity": 60.0, "wind": 14.0, "days_since_rain": 14},
}


def predicted_risk_for_season(season: Season) -> float:
    """Run compute_risk against the seasonal climate normal — the baseline prediction."""
    n = SEASONAL_CLIMATE[season]
    return compute_risk(
        temp_c=n["temp"],
        humidity_pct=n["humidity"],
        wind_kph=n["wind"],
        days_since_rain=int(n["days_since_rain"]),
        season=season,
    ).score


SizeBucket = Literal["small", "medium", "large", "very_large"]


def bucket_fire_size(acres: float) -> SizeBucket:
    """Group raw acreage into 4 interpretable buckets for plotting."""
    if acres < 1:
        return "small"
    if acres < 100:
        return "medium"
    if acres < 1000:
        return "large"
    return "very_large"


def stratified_sample(
    df: pd.DataFrame,
    per_bucket: dict[SizeBucket, int],
    seed: int = 42,
) -> pd.DataFrame:
    """Pick `per_bucket[b]` rows from each size bucket, falling back to all
    available rows if a bucket has fewer."""
    if "size_bucket" not in df.columns:
        df = df.copy()
        df["size_bucket"] = df["fire_size"].apply(bucket_fire_size)

    pieces = []
    for bucket, n in per_bucket.items():
        sub = df[df["size_bucket"] == bucket]
        take = sub.sample(n=min(n, len(sub)), random_state=seed) if len(sub) else sub
        pieces.append(take)
    return pd.concat(pieces).reset_index(drop=True)


def build_fire_date(row: pd.Series) -> date:
    """fire_year + day-of-year → calendar date."""
    return date(int(row["fire_year"]), 1, 1) + timedelta(days=int(row["doy"]) - 1)
