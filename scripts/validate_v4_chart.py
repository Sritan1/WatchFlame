"""Generate notebooks/figures/v4_validation.png + print current-V4 metrics.

Hindcasts the current V4 fire-weather algorithm (multiplicative VPD × wind ×
KBDI × season) against a deterministic stratified 500-fire sample from the
USDA FPA-FOD dataset, using real per-fire weather + KBDI pulled from
Open-Meteo Archive.

This is the production fire-weather path: same `compute_risk` the live `/risk`
endpoint runs. NDVI anomaly substitution isn't applied (historical Sentinel-2
replay across all sample years isn't tractable); the season multiplier is used
in its place, matching what live users see when their NDVI fetch fails.

Outputs:
  - notebooks/figures/v4_validation.png (chart for README)
  - stdout summary with Spearman r, per-bucket means, sample sizes
"""
from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats

from api.core.openmeteo import _load_cache, _save_cache, enrich_iter_kbdi
from api.core.risk_algorithm import compute_risk
from api.core.validation import (
    bucket_fire_size,
    build_fire_date,
    doy_to_season,
    load_fires_sample,
    stratified_sample,
)

SEED = 7
BUCKETS = ["small", "medium", "large", "very_large"]
LABELS = {
    "small": "<1 ac",
    "medium": "1–100 ac",
    "large": "100–1,000 ac",
    "very_large": ">1,000 ac",
}
COLORS = ["#7ee787", "#fbbf24", "#fb923c", "#ef4444"]


def main() -> None:
    # 1. Stratified 500-fire sample (125 per bucket, deterministic).
    print("loading FPA-FOD pool…")
    pool = load_fires_sample(n=80_000, seed=SEED)
    pool["size_bucket"] = pool["fire_size"].apply(bucket_fire_size)
    sample = stratified_sample(
        pool,
        per_bucket={b: 125 for b in BUCKETS},
        seed=SEED,
    )
    sample["fire_date"] = sample.apply(build_fire_date, axis=1)
    sample["season"] = sample["doy"].apply(doy_to_season)
    print(f"  sampled {len(sample)} fires")
    print(sample["size_bucket"].value_counts().to_string())

    # 2. Enrich with real per-fire weather + KBDI. Uses 365-day windows so
    #    the KBDI integrator has enough warmup. Pulls from the local cache
    #    first; only hits Open-Meteo for misses.
    print("\nenriching with weather + KBDI (cache-first)…")
    cache = _load_cache()
    cache_size_before = len(cache)
    rows = sample.to_dict(orient="records")

    def progress(n: int) -> None:
        print(f"  enriched {n}/{len(rows)}")

    enriched = enrich_iter_kbdi(rows, cache=cache, on_progress=progress)
    _save_cache(cache)
    print(f"  cache: {cache_size_before:,} -> {len(cache):,} entries")

    ew = pd.DataFrame(enriched).dropna(
        subset=["temperature_c", "humidity_pct", "wind_kph", "days_since_rain"]
    )
    n_with_kbdi = ew["kbdi"].notna().sum()
    print(f"  weather-complete: {len(ew)}/{len(rows)}; with KBDI: {n_with_kbdi}")

    # 3. Run current V4 compute_risk. Use real KBDI where available; fall
    #    back to days_since_rain otherwise (this IS the live behavior when
    #    Open-Meteo Archive fails — the algorithm's documented fallback).
    def per_row_score(r: pd.Series) -> float:
        kbdi_val = r["kbdi"] if pd.notna(r["kbdi"]) else None
        out = compute_risk(
            temp_c=float(r["temperature_c"]),
            humidity_pct=float(r["humidity_pct"]),
            wind_kph=float(r["wind_kph"]),
            days_since_rain=int(r["days_since_rain"]),
            season=r["season"],
            kbdi=float(kbdi_val) if kbdi_val is not None else None,
        )
        return out.score

    ew = ew.copy()
    ew["risk_v4"] = ew.apply(per_row_score, axis=1)

    # 4. Per-bucket discrimination + 95% CIs.
    def mean_ci(values: pd.Series) -> tuple[float, float]:
        if len(values) < 2:
            return float(values.iloc[0]) if len(values) else 0.0, 0.0
        m = float(values.mean())
        ci = float(stats.sem(values) * stats.t.ppf(0.975, len(values) - 1))
        return m, ci

    rows_agg = []
    for b in BUCKETS:
        sub = ew.loc[ew["size_bucket"] == b, "risk_v4"]
        m, ci = mean_ci(sub)
        rows_agg.append({"bucket": b, "mean": m, "ci": ci, "n": int(len(sub))})
    agg = pd.DataFrame(rows_agg).set_index("bucket")

    # 5. Continuous correlation (log size vs predicted score).
    ew["log_size"] = np.log10(ew["fire_size"] + 1.0)
    spearman_r = float(ew[["log_size", "risk_v4"]].corr(method="spearman").iloc[0, 1])
    pearson_r = float(ew[["log_size", "risk_v4"]].corr(method="pearson").iloc[0, 1])

    print("\n-- current V4 metrics ----------------------------------")
    print(f"N (weather-complete):       {len(ew)}")
    print(f"N (with real KBDI):         {n_with_kbdi}")
    print(f"Spearman r (log size, V4):  {spearman_r:+.3f}")
    print(f"Pearson  r (log size, V4):  {pearson_r:+.3f}")
    print("Per-bucket mean +/- 95% CI:")
    for b in BUCKETS:
        row = agg.loc[b]
        ascii_lbl = LABELS[b].replace("–", "-")
        print(f"  {ascii_lbl:<14} mean={row['mean']:.3f}  ci=+/-{row['ci']:.3f}  n={int(row['n'])}")

    # CIs non-overlap test for the headline claim
    small_hi = agg.loc["small", "mean"] + agg.loc["small", "ci"]
    vlarge_lo = agg.loc["very_large", "mean"] - agg.loc["very_large", "ci"]
    non_overlap = vlarge_lo > small_hi
    print(
        f"Mean-V4 CIs non-overlapping (very_large vs small): "
        f"{'YES' if non_overlap else 'NO'} "
        f"(small_hi={small_hi:.3f}, vlarge_lo={vlarge_lo:.3f})"
    )

    # 6. Chart — single panel, bar means + CI whiskers, color-coded.
    fig, ax = plt.subplots(figsize=(9.5, 5.4))
    x = np.arange(len(BUCKETS))
    ax.bar(
        x,
        agg["mean"],
        yerr=agg["ci"],
        color=COLORS,
        capsize=10,
        edgecolor="#1f2937",
        linewidth=0.8,
        alpha=0.92,
    )
    # Value labels above each bar
    y_max = float((agg["mean"] + agg["ci"]).max())
    for i, b in enumerate(BUCKETS):
        m = float(agg.loc[b, "mean"])
        ci = float(agg.loc[b, "ci"])
        ax.text(
            i,
            m + ci + y_max * 0.035,
            f"{m:.3f}",
            ha="center",
            fontsize=11,
            fontweight="bold",
            color="#111827",
        )
        # n=125 caption — positioned in axes-fraction coords so it sits
        # cleanly below the x-tick labels regardless of the data y_max.
        ax.annotate(
            f"n={int(agg.loc[b, 'n'])}",
            xy=(i, 0),
            xycoords=("data", "axes fraction"),
            xytext=(0, -38),
            textcoords="offset points",
            ha="center",
            fontsize=9.5,
            color="#6b7280",
        )

    ax.set_xticks(x)
    ax.set_xticklabels([LABELS[b] for b in BUCKETS], fontsize=11)
    ax.set_ylabel("Mean predicted V4 fire-weather score (95 % CI)", fontsize=11)
    ax.set_xlabel("Fire size bucket", fontsize=11, labelpad=36)
    ax.set_title(
        f"V4 algorithm — validated against {len(ew)} historical fires\n"
        f"Spearman ρ(log size, predicted V4) = {spearman_r:+.2f}   "
        f"non-overlapping 95 % CIs between extremes: {'yes' if non_overlap else 'no'}",
        fontsize=12,
        pad=14,
    )
    ax.set_ylim(0, y_max * 1.25)
    ax.grid(axis="y", alpha=0.25, linewidth=0.6)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    fig.tight_layout()
    out_path = PROJECT_ROOT / "notebooks" / "figures" / "v4_validation.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=140, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"\nsaved chart: {out_path}")


if __name__ == "__main__":
    main()
