"""Draw the validation chart and print the numbers behind it.

Runs the shipped algorithm back over the frozen 500-fire hindcast set, which carries
real per-fire weather and KBDI. Reading that CSV keeps it offline and reproducible.
Scores come from the same compute_risk the live endpoint uses. NDVI is the exception,
because replaying old satellite passes isn't practical, so the calendar stands in.
"""
from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Windows consoles default to a codepage that can't print the symbols we use.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy import stats  # noqa: E402

from api.core.risk_algorithm import compute_risk  # noqa: E402

CSV_PATH = PROJECT_ROOT / "data" / "hindcast_features.csv"
# The same split the fitting script used, so this is measured on the exact fires
# those constants never saw.
SEED = 7
TEST_FRAC = 0.30
BUCKETS = ["small", "medium", "large", "very_large"]
LABELS = {
    "small": "<1 ac",
    "medium": "1–100 ac",
    "large": "100–1,000 ac",
    "very_large": ">1,000 ac",
}
COLORS = ["#7ee787", "#fbbf24", "#fb923c", "#ef4444"]
# The same progression for dark mode, evened out so the bars sit on a dark
# background instead of glowing off it.
COLORS_DARK = ["#6FAF8E", "#C6A55E", "#C9885A", "#C56A62"]


def _heldout_test_mask(df: pd.DataFrame) -> np.ndarray:
    """Which fires are in the held-out half. Same seed, same fraction, same
    per-bucket shuffle as the fitting script, or the number isn't honest."""
    rng = np.random.default_rng(SEED)
    test_idx: list = []
    for b in BUCKETS:
        idx = np.array(df.index[df["size_bucket"] == b].to_numpy(), copy=True)
        rng.shuffle(idx)
        k = int(round(len(idx) * TEST_FRAC))
        test_idx.extend(idx[:k].tolist())
    return df.index.isin(test_idx)


def main() -> None:
    # The frozen features, so no API and no sample drift.
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

    # Score exactly as production does, KBDI where we have it and days since rain
    # where we don't, which is also what happens live when the archive is down.
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
    ew["log_size"] = np.log10(ew["fire_size"] + 1.0)

    # The constants were fit on most of these fires, so anything measured across
    # the whole set only describes it. Every number in the figure comes from the
    # held-out half instead.
    test = ew.loc[_heldout_test_mask(ew)]

    # Bucket means with their error bars.
    def mean_ci(values: pd.Series) -> tuple[float, float]:
        if len(values) < 2:
            return float(values.iloc[0]) if len(values) else 0.0, 0.0
        m = float(values.mean())
        ci = float(stats.sem(values) * stats.t.ppf(0.975, len(values) - 1))
        return m, ci

    rows_agg = []
    for b in BUCKETS:
        sub = test.loc[test["size_bucket"] == b, "risk_v4"]
        m, ci = mean_ci(sub)
        rows_agg.append({"bucket": b, "mean": m, "ci": ci, "n": int(len(sub))})
    agg = pd.DataFrame(rows_agg).set_index("bucket")

    # How well the score tracks fire size overall.
    spearman_full = float(ew[["log_size", "risk_v4"]].corr(method="spearman").iloc[0, 1])
    pearson_full = float(ew[["log_size", "risk_v4"]].corr(method="pearson").iloc[0, 1])
    spearman_test = float(test[["log_size", "risk_v4"]].corr(method="spearman").iloc[0, 1])

    print("\n-- fire-weather metrics --------------------------------")
    print(f"N (weather-complete):          {len(ew)}")
    print(f"N (with real KBDI):            {n_with_kbdi}")
    print(f"N (held-out test split):       {len(test)}")
    print(f"Spearman ρ HELD-OUT (headline):{spearman_test:+.3f}")
    print(f"Spearman ρ full-set (in-samp): {spearman_full:+.3f}")
    print(f"Pearson  r full-set:           {pearson_full:+.3f}")
    print("Per-bucket mean +/- 95% CI:")
    for b in BUCKETS:
        row = agg.loc[b]
        ascii_lbl = LABELS[b].replace("–", "-")
        print(f"  {ascii_lbl:<14} mean={row['mean']:.3f}  ci=+/-{row['ci']:.3f}  n={int(row['n'])}")

    # Do the smallest and largest buckets actually separate?
    small_hi = agg.loc["small", "mean"] + agg.loc["small", "ci"]
    vlarge_lo = agg.loc["very_large", "mean"] - agg.loc["very_large", "ci"]
    non_overlap = vlarge_lo > small_hi
    print(
        f"Mean-score CIs non-overlapping (very_large vs small): "
        f"{'YES' if non_overlap else 'NO'} "
        f"(small_hi={small_hi:.3f}, vlarge_lo={vlarge_lo:.3f})"
    )

    # The chart itself.
    import _chart_theme as chart_theme
    pal = chart_theme.apply()
    fig, ax = plt.subplots(figsize=(9.5, 5.4))
    x = np.arange(len(BUCKETS))
    ax.bar(
        x,
        agg["mean"],
        yerr=agg["ci"],
        color=(COLORS_DARK if chart_theme.is_dark() else COLORS),
        capsize=10,
        edgecolor=pal["edge"],
        ecolor=pal["fg"],
        linewidth=0.8,
        alpha=0.92,
    )
    # Numbers above the bars.
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
            color=pal["fg"],
        )
        # Positioned against the axes rather than the data, so it sits below the
        # tick labels whatever the bars do.
        ax.annotate(
            f"n={int(agg.loc[b, 'n'])}",
            xy=(i, 0),
            xycoords=("data", "axes fraction"),
            xytext=(0, -38),
            textcoords="offset points",
            ha="center",
            fontsize=9.5,
            color=pal["muted"],
        )

    ax.set_xticks(x)
    ax.set_xticklabels([LABELS[b] for b in BUCKETS], fontsize=11)
    ax.set_ylabel("Mean predicted fire-weather score (95 % CI)", fontsize=11)
    ax.set_xlabel("Fire size bucket", fontsize=11, labelpad=36)
    ax.set_title(
        f"Fire-weather algorithm on {len(test)} held-out fires\n"
        f"Spearman ρ(log size, score) = {spearman_test:+.3f}   "
        f"non-overlapping 95 % CIs between extremes: {'yes' if non_overlap else 'no'}",
        fontsize=12,
        pad=14,
    )
    ax.set_ylim(0, y_max * 1.25)
    ax.grid(axis="y", alpha=0.25, linewidth=0.6)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    fig.tight_layout()
    docs_out = PROJECT_ROOT / "docs" / "fireweather_validation.png"
    figures_out = PROJECT_ROOT / "notebooks" / "figures" / "fireweather_validation.png"
    docs_out.parent.mkdir(parents=True, exist_ok=True)
    figures_out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(chart_theme.out_path(docs_out), dpi=140, bbox_inches="tight", facecolor=pal["bg"])
    fig.savefig(chart_theme.out_path(figures_out), dpi=140, bbox_inches="tight", facecolor=pal["bg"])
    plt.close(fig)
    print(f"\nsaved charts: {docs_out}, {figures_out}")


if __name__ == "__main__":
    main()
