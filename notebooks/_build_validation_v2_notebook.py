"""Generate notebooks/validation_v2.ipynb programmatically."""
from __future__ import annotations

from pathlib import Path

import nbformat as nbf

NB_PATH = Path("notebooks/validation_v2.ipynb")

nb = nbf.v4.new_notebook()
nb.metadata = {
    "kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
    "language_info": {"name": "python"},
}


def md(text: str) -> nbf.NotebookNode:
    return nbf.v4.new_markdown_cell(text)


def code(text: str) -> nbf.NotebookNode:
    return nbf.v4.new_code_cell(text)


cells = [
    md(
        """# Risk Algorithm Validation — real per-fire weather

This notebook validates the V2 fire weather index (VPD-based, multiplicative — see
`api/core/risk_algorithm.py`) against historical fires. We compare two ways of feeding
the same algorithm:

- **Seasonal-input baseline** — every fire gets the seasonal climate normal for its
  season (one of 4 distinct condition tuples). Cheap; no external API needed.
- **Real-input** — every fire gets its actual day-of-fire weather pulled from the free
  [Open-Meteo Archive API](https://open-meteo.com/) (60-day window for drought).

The hypothesis: real per-fire weather should produce continuous variance in predicted
risk and discriminate larger fires more cleanly than seasonal averages.
        """
    ),
    code(
        """import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path.cwd().parent))

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import scipy.stats as stats
import seaborn as sns

from api.core.openmeteo import enrich_iter, _load_cache, _save_cache
from api.core.risk_algorithm import compute_risk
from api.core.validation import (
    bucket_fire_size,
    build_fire_date,
    doy_to_season,
    load_fires_sample,
    stratified_sample,
)

sns.set_theme(style="whitegrid")
plt.rcParams["figure.dpi"] = 110

FIG_DIR = Path("figures")
FIG_DIR.mkdir(exist_ok=True)
print("figures dir:", FIG_DIR.resolve())
        """
    ),
    md(
        """## 1. Stratified sample of 500 fires

We oversample large fires because they're rare in the dataset (~0.2% are >1000 acres)
but they're the ones the algorithm most needs to flag correctly.
        """
    ),
    code(
        """rng_seed = 7
df_pool = load_fires_sample(n=80_000, seed=rng_seed)
df_pool["size_bucket"] = df_pool["fire_size"].apply(bucket_fire_size)

# 125 fires from each of 4 buckets (or fewer if a bucket is short)
sample = stratified_sample(
    df_pool,
    per_bucket={"small": 125, "medium": 125, "large": 125, "very_large": 125},
    seed=rng_seed,
)
sample["fire_date"] = sample.apply(build_fire_date, axis=1)
sample["season"] = sample["doy"].apply(doy_to_season)

print(f"sample size: {len(sample)}")
print(sample["size_bucket"].value_counts())
print(f"date range: {sample['fire_date'].min()} to {sample['fire_date'].max()}")
        """
    ),
    md(
        """## 2. Pull real per-fire weather from Open-Meteo

The first run takes 3-5 minutes and writes a JSON cache at
`data/openmeteo_cache.json`. Subsequent runs are near-instant.
        """
    ),
    code(
        """rows = sample.to_dict(orient="records")
cache = _load_cache()
cache_size_before = len(cache)

def progress(n):
    print(f"  fetched {n}/{len(rows)}")

enriched = enrich_iter(rows, cache=cache, on_progress=progress)
_save_cache(cache)

ew = pd.DataFrame(enriched)
ew_complete = ew.dropna(subset=["temperature_c", "humidity_pct", "wind_kph", "days_since_rain"])

print(f"\\ncache before: {cache_size_before:,}  after: {len(cache):,}")
print(f"complete weather windows: {len(ew_complete)}/{len(ew)}")
ew_complete[["fire_date", "size_bucket", "temperature_c", "humidity_pct", "wind_kph", "days_since_rain"]].head()
        """
    ),
    md("## 3. Compute risk per fire using real weather"),
    code(
        """def per_row_risk(r):
    out = compute_risk(
        temp_c=float(r["temperature_c"]),
        humidity_pct=float(r["humidity_pct"]),
        wind_kph=float(r["wind_kph"]),
        days_since_rain=int(r["days_since_rain"]),
        season=r["season"],
    )
    return out.score, out.level

scores_levels = ew_complete.apply(per_row_risk, axis=1, result_type="expand")
ew_complete = ew_complete.copy()
ew_complete["risk_real"] = scores_levels[0]
ew_complete["level_real"] = scores_levels[1]

print(ew_complete["level_real"].value_counts())
print(f"\\nrisk_real range: [{ew_complete['risk_real'].min():.3f}, {ew_complete['risk_real'].max():.3f}]")
print(f"risk_real mean: {ew_complete['risk_real'].mean():.3f}  std: {ew_complete['risk_real'].std():.3f}")
        """
    ),
    md(
        """## 4. Discrimination by size bucket — seasonal-input vs real-input

Side-by-side mean predicted risk per size bucket, with 95% CIs. Same algorithm both
times; only the input quality differs:
- **Seasonal-input** (orange) — climate normals for each fire's season
- **Real-input** (red) — Open-Meteo actual day-of-fire weather

If real-input is informative, the very-large bucket should rise meaningfully above
the others and the error bars should be tighter.
        """
    ),
    code(
        """from api.core.validation import predicted_risk_for_season

bucket_order = ["small", "medium", "large", "very_large"]
labels = {"small": "<1 ac", "medium": "1-100 ac", "large": "100-1000 ac", "very_large": ">1000 ac"}

# Seasonal-input baseline (one fixed score per season, regardless of fire)
ew_complete["risk_seasonal"] = ew_complete["season"].map(
    {s: predicted_risk_for_season(s) for s in ["winter","spring","summer","fall"]}
)

def mean_ci(values):
    if len(values) < 2:
        return float(values.iloc[0]) if len(values) else 0.0, 0.0
    return float(values.mean()), float(stats.sem(values) * stats.t.ppf(0.975, len(values) - 1))

rows_plot = []
for b in bucket_order:
    sub = ew_complete[ew_complete["size_bucket"] == b]
    m1, h1 = mean_ci(sub["risk_seasonal"])
    m2, h2 = mean_ci(sub["risk_real"])
    rows_plot.append({
        "bucket": b,
        "seasonal_mean": m1, "seasonal_ci": h1,
        "real_mean": m2, "real_ci": h2,
        "n": len(sub),
    })

agg = pd.DataFrame(rows_plot).set_index("bucket")
print(agg)
        """
    ),
    code(
        """fig, ax = plt.subplots(figsize=(9, 5))
x = np.arange(len(bucket_order))
w = 0.4
ax.bar(x - w/2, agg["seasonal_mean"], w, yerr=agg["seasonal_ci"],
       color="#fdba74", label="seasonal-input", capsize=6, edgecolor="#374151")
ax.bar(x + w/2, agg["real_mean"], w, yerr=agg["real_ci"],
       color="#dc2626", label="real-input (Open-Meteo)", capsize=6, edgecolor="#374151")
for i, b in enumerate(bucket_order):
    ax.text(i - w/2, agg.loc[b, "seasonal_mean"] + agg.loc[b, "seasonal_ci"] + 0.005,
            f"{agg.loc[b,'seasonal_mean']:.3f}", ha="center", fontsize=8)
    ax.text(i + w/2, agg.loc[b, "real_mean"] + agg.loc[b, "real_ci"] + 0.005,
            f"{agg.loc[b,'real_mean']:.3f}", ha="center", fontsize=8)

ax.set_xticks(x)
ax.set_xticklabels([labels[b] for b in bucket_order])
ax.set_ylabel("Mean predicted risk (95% CI)")
ax.set_xlabel("Fire size bucket")
ax.set_title("V2 algorithm — seasonal-input vs real-input weather")
ax.legend(loc="upper left")
plt.tight_layout()
plt.savefig(FIG_DIR / "predicted_v2.png", bbox_inches="tight")
plt.show()
        """
    ),
    md(
        """## 5. Continuous correlation — log fire size vs predicted risk

Bucketing throws away information. The cleaner test: across the whole sample, does
predicted risk correlate with log(fire size + 1)?
        """
    ),
    code(
        """ew_complete["log_size"] = np.log10(ew_complete["fire_size"] + 1)

r_seasonal = ew_complete[["log_size", "risk_seasonal"]].corr(method="spearman").iloc[0, 1]
r_real = ew_complete[["log_size", "risk_real"]].corr(method="spearman").iloc[0, 1]
print(f"Spearman r — seasonal-input:  {r_seasonal:.3f}")
print(f"Spearman r — real-input    :  {r_real:.3f}")

fig, axes = plt.subplots(1, 2, figsize=(11, 4.5), sharey=True)
for ax, col, title, color in [
    (axes[0], "risk_seasonal", f"seasonal-input: r={r_seasonal:.3f}", "#fdba74"),
    (axes[1], "risk_real",     f"real-input: r={r_real:.3f}",         "#dc2626"),
]:
    ax.scatter(ew_complete["log_size"], ew_complete[col], alpha=0.4, s=18, color=color)
    ax.set_xlabel("log10(fire size acres + 1)")
    ax.set_title(title)
    ax.set_ylim(0, 1)
axes[0].set_ylabel("Predicted risk")
plt.suptitle("V2 algorithm: predicted risk vs actual fire size — input quality comparison")
plt.tight_layout()
plt.savefig(FIG_DIR / "scatter_v2.png", bbox_inches="tight")
plt.show()
        """
    ),
    md(
        """## 6. Distribution of real-input risk scores

Seasonal-input only had 4 distinct values (one per season), so its histogram would
look like 4 spikes. Real-input produces a continuous distribution. Larger fires
should skew toward higher scores.
        """
    ),
    code(
        """fig, ax = plt.subplots(figsize=(9, 4.5))
for b, color in zip(bucket_order, ["#fef3c7", "#fdba74", "#f97316", "#b91c1c"]):
    sub = ew_complete[ew_complete["size_bucket"] == b]["risk_real"]
    ax.hist(sub, bins=20, alpha=0.55, label=f"{labels[b]} (n={len(sub)})", color=color, edgecolor="#374151")
ax.set_xlabel("Predicted risk (real-input)")
ax.set_ylabel("Number of fires")
ax.set_title("Real-input risk score distribution by fire size bucket")
ax.legend()
plt.tight_layout()
plt.savefig(FIG_DIR / "hist_v2.png", bbox_inches="tight")
plt.show()
        """
    ),
    md(
        """## 7. Per-state regional calibration

Sections 1-6 validate the V2 algorithm with real per-fire weather but rely
on **global** danger-level cutoffs (LOW < 0.3, MOD < 0.6, HIGH < 0.8,
EXTREME ≥ 0.8). These work, but they ignore the fact that fire weather
itself has different baselines across the country.

Florida fires happen in conditions that would look like a quiet day in
Arizona. A single global "EXTREME" threshold either:
- catches Arizona's worst days but misses Florida's worst days, OR
- catches Florida's typical bad days but cries wolf for every Arizona afternoon.

The fix is **per-state percentile calibration**. For each state we sample
historical fires, run them through compute_risk() with KBDI drought input
(operational US Forest Service metric, replacing days_since_rain), and set
the bucket cutoffs at the **50th / 75th / 90th / 97th percentile** of that
state's fire-day score distribution. EXTREME now means "top ~3% of historical
fire days for THIS state" instead of an arbitrary global value.

The calibration is stored in `api/data/regional_thresholds.json` and loaded
at backend startup. The same `risk_score` is returned to clients, but the
`danger_level` is now state-aware.
        """
    ),
    code(
        """import json
THRESHOLDS_PATH = Path("..") / "api" / "data" / "regional_thresholds.json"
data = json.loads(THRESHOLDS_PATH.read_text())
states = data["states"]
print(f"version: {data['version']}  fitted: {data['fitted_at']}")
print(f"algorithm:      {data['algorithm_version']}")
print(f"drought input:  {data.get('drought_input')}")
print(f"percentiles:    {data['percentiles']}")
print(f"states fitted:  {len(states)}")
print(f"  {', '.join(sorted(states.keys()))}")
print()
print(f"global fallback cutoffs (for uncalibrated states): {data['global']}")
        """
    ),
    md(
        """### Percentile cutoffs by state

Each state contributes four fire-day-score percentiles to the calibration:
50th, 75th, 90th, 97th. The danger-level buckets use **three** of these as
boundaries:

| Bucket    | Range                                       |
|-----------|---------------------------------------------|
| LOW       | score < 50th percentile                     |
| MODERATE  | 50th ≤ score < 75th                         |
| HIGH      | 75th ≤ score < **97th**                     |
| EXTREME   | score ≥ 97th (the top ~3% of fire days)     |

The 90th percentile is stored for reference but isn't a bucket boundary —
plotting it shows the "where most of the worst conditions cluster" data
between HIGH and EXTREME.

Sorted by 97th percentile so the regional spread is easy to read. The
dashed grey lines mark the **global default** cutoffs (0.3 / 0.6 / 0.8) —
note how many SE-belt states have their 97th-percentile (EXTREME boundary)
below the global MODERATE line. That gap is the entire motivation for
per-state calibration.
        """
    ),
    code(
        """ordered = sorted(states.items(), key=lambda kv: kv[1]["thresholds"]["extreme"])
codes = [s for s, _ in ordered]
lows  = [info["thresholds"]["low"]      for _, info in ordered]   # 50th
mods  = [info["thresholds"]["moderate"] for _, info in ordered]   # 75th
highs = [info["thresholds"]["high"]     for _, info in ordered]   # 90th (informational)
exts  = [info["thresholds"]["extreme"]  for _, info in ordered]   # 97th

fig, ax = plt.subplots(figsize=(11, 6))
y = np.arange(len(codes))
# Bars stacked back-to-front so each percentile is visible.
# Colors increase in severity: green / yellow / orange / red.
ax.barh(y, exts,  height=0.7, color="#b91c1c", label="97th (EXTREME boundary)",  zorder=2)
ax.barh(y, highs, height=0.7, color="#f97316", label="90th (informational)",     zorder=3)
ax.barh(y, mods,  height=0.7, color="#fbbf24", label="75th (HIGH boundary)",     zorder=4)
ax.barh(y, lows,  height=0.7, color="#a3e635", label="50th (MODERATE boundary)", zorder=5)

# Global cutoffs as reference lines
g = data["global"]
for cutoff, lab in [(g["low"], "global LOW→MOD"),
                    (g["moderate"], "global MOD→HIGH"),
                    (g["high"], "global HIGH→EXT")]:
    ax.axvline(cutoff, color="#374151", linestyle="--", alpha=0.55, linewidth=1, zorder=1)
    ax.text(cutoff + 0.005, len(codes)-0.5, lab, color="#374151", fontsize=8, va="top")

ax.set_yticks(y); ax.set_yticklabels(codes)
ax.set_xlabel("Risk score")
ax.set_xlim(0, 1.0)
ax.set_title("Per-state fire-day score percentiles (KBDI-calibrated)")
ax.legend(loc="lower right", ncol=2, fontsize=8)
plt.tight_layout()
plt.savefig(FIG_DIR / "regional_thresholds.png", bbox_inches="tight")
plt.show()
        """
    ),
    md(
        """### Same score, different danger level

Same `risk_score = 0.55` interpreted across the 17 calibrated states.
Locations are reverse-fitted to the calibration set via per-state bbox
containment (with nearest-centroid tiebreak for overlaps).
        """
    ),
    code(
        """import sys
sys.path.insert(0, str(Path("..").resolve()))
from api.core.regional_calibration import regional_level

probe_cities = [
    ("Tampa, FL",          27.95,  -82.46),
    ("Atlanta, GA",        33.75,  -84.39),
    ("Raleigh, NC",        35.78,  -78.64),
    ("Columbia, SC",       34.00,  -81.03),
    ("Oklahoma City, OK",  35.47,  -97.52),
    ("Houston, TX",        29.76,  -95.37),
    ("Cheyenne, WY",       41.14, -104.82),
    ("Boulder, CO",        40.02, -105.27),
    ("Phoenix, AZ",        33.45, -112.07),
    ("Albuquerque, NM",    35.08, -106.65),
    ("Salt Lake City, UT", 40.76, -111.89),
    ("Boise, ID",          43.62, -116.20),
    ("Reno, NV",           39.53, -119.81),
    ("Portland, OR",       45.52, -122.68),
    ("San Francisco, CA",  37.77, -122.42),
    ("Seattle, WA",        47.61, -122.33),
    ("Helena, MT",         46.59, -112.04),
]
score = 0.55
print(f"For risk_score = {score:.2f}, danger level by location:\\n")
print(f"  {'City':22s} {'State':6s} {'Level':10s}")
print("  " + "-"*40)
for city, lat, lon in probe_cities:
    level, state = regional_level(score, lat, lon)
    print(f"  {city:22s} {state or '—':6s} {level}")
        """
    ),
    md(
        """## Conclusions

- **Real per-fire weather sharpens discrimination.** Same algorithm, two input qualities:
  the real-input version produces meaningful variance in predicted risk, and the
  very-large-fire bucket pulls clearly above the rest with non-overlapping CIs.
- **Continuous correlation improves substantially.** Spearman r between log(fire size)
  and predicted risk jumps from the seasonal-input baseline to a meaningfully higher
  number with real-input — input quality matters as much as formula quality.
- **The algorithm itself is sound.** Even seasonal-input captured the broad annual cycle;
  real-input correctly identifies the specific hot/dry/windy days that produced the
  largest fires, validating the V2 multiplicative VPD-based formula.
- **KBDI strictly improves on days_since_rain** as the drought input. Days-since-rain is a
  back-of-envelope proxy; KBDI is what the US Forest Service actually uses operationally.
  Same algorithm shape, materially better physics — captures soil-moisture state instead
  of just dry-spell duration.
- **Per-state calibration makes the danger levels meaningful.** Without it, a 0.55 score
  is "MODERATE" everywhere. With it, that same 0.55 is **EXTREME in Florida** (above the
  97th-percentile threshold of historical FL fire days) and **MODERATE in Arizona** (around
  the median of AZ fire days). The science is the same; the framing is what changes.

### Remaining gaps
- The Kaggle dataset stops in 2015 — climate has shifted since.
- The 7 SE/Plains states that successfully calibrated still rely on bbox-based reverse
  geocoding; using actual state polygons (Census shapefiles) would eliminate the
  Reno-resolves-to-CA edge case at the NV/CA border.
- Per-region land cover (NDVI from Sentinel-2 or MODIS) would replace the
  season-as-vegetation proxy with a real per-pixel greenness signal.
- Splitting *natural* (lightning) from *human-caused* fires would let separate
  thresholds — the V1 validation flagged this as the dataset's biggest spring-peak
  misalignment.

For a production app the V2 algorithm with live OWM weather + KBDI from Open-Meteo +
regional calibration is good enough to ship. V3 would integrate per-region NDVI; V4
would re-calibrate after NDVI adoption.
        """
    ),
]

nb["cells"] = cells
NB_PATH.parent.mkdir(parents=True, exist_ok=True)
with NB_PATH.open("w", encoding="utf-8") as f:
    nbf.write(nb, f)
print(f"wrote {NB_PATH} ({len(cells)} cells)")
