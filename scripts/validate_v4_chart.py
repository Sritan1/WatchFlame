"""Generate notebooks/figures/v4_validation.png + print current-V4 metrics.

Hindcasts the production V4 fire-weather algorithm (multiplicative VPD × wind ×
KBDI × vegetation, with constants fit in scripts/fit_v4_params.py) against the
frozen 500-fire FPA-FOD hindcast set (data/hindcast_features.csv, built by
scripts/freeze_hindcast_dataset.py from real per-fire Open-Meteo weather + KBDI).

Reading the frozen CSV makes this fully offline and reproducible — no
Open-Meteo calls, no sample drift. Scores come from the same `compute_risk`
the live `/risk` endpoint runs (NDVI substitution isn't applied — historical
Sentinel-2 replay isn't tractable — so the calendar season multiplier stands
in, matching the live fallback when an NDVI fetch fails).

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

from api.core.risk_algorithm import compute_risk

CSV_PATH = PROJECT_ROOT / "data" / "hindcast_features.csv"
BUCKETS = ["small", "medium", "large", "very_large"]
LABELS = {
    "small": "<1 ac",
    "medium": "1–100 ac",
    "large": "100–1,000 ac",
    "very_large": ">1,000 ac",
}
COLORS = ["#7ee787", "#fbbf24", "#fb923c", "#ef4444"]


def main() -> None:
    # 1. Load the frozen feature set (offline; no API, no sample drift).
    if not CSV_PATH.exists():
        raise SystemExit(
            f"{CSV_PATH} not found — run scripts/freeze_hindcast_dataset.py first."
        )
    ew = pd.read_csv(CSV_PATH).dropna(
        subset=["temperature_c", "humidity_pct", "wind_kph", "days_since_rain"]
    )
    n_with_kbdi = int(ew["kbdi"].notna().sum())
    print(f"loaded {len(ew)} fires from {CSV_PATH.name}; with real KBDI: {n_with_kbdi}")
    print(ew["size_bucket"].value_counts().reindex(BUCKETS).to_string())

    # 2. Score with the production V4 path (fitted constants via DEFAULT_PARAMS).
    #    Real KBDI where available; days_since_rain fallback otherwise — the
    #    documented live behavior when Open-Meteo Archive is unavailable.
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
