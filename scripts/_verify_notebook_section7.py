"""Verify the new section-7 logic in validation_v2.ipynb runs cleanly.

Doesn't import nbformat or run the full notebook (which would re-fire
Open-Meteo calls). Just exercises the same code-cell logic so we know the
notebook will execute when a user opens it.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import matplotlib
matplotlib.use("Agg")  # don't open windows in CI
import matplotlib.pyplot as plt
import numpy as np

from api.core.regional_calibration import regional_level

FIG_DIR = Path(__file__).resolve().parents[1] / "notebooks" / "figures"
FIG_DIR.mkdir(exist_ok=True)

THRESHOLDS_PATH = Path(__file__).resolve().parents[1] / "api" / "data" / "regional_thresholds.json"
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

# --- Cell N3 logic: threshold bars ---
ordered = sorted(states.items(), key=lambda kv: kv[1]["thresholds"]["extreme"])
codes = [s for s, _ in ordered]
lows  = [info["thresholds"]["low"]      for _, info in ordered]
mods  = [info["thresholds"]["moderate"] for _, info in ordered]
highs = [info["thresholds"]["high"]     for _, info in ordered]
exts  = [info["thresholds"]["extreme"]  for _, info in ordered]

fig, ax = plt.subplots(figsize=(11, 6))
y = np.arange(len(codes))
ax.barh(y, exts,  height=0.7, color="#b91c1c", label="97th (EXTREME boundary)",  zorder=2)
ax.barh(y, highs, height=0.7, color="#f97316", label="90th (informational)",     zorder=3)
ax.barh(y, mods,  height=0.7, color="#fbbf24", label="75th (HIGH boundary)",     zorder=4)
ax.barh(y, lows,  height=0.7, color="#a3e635", label="50th (MODERATE boundary)", zorder=5)
g = data["global"]
for cutoff, lab in [(g["low"], "global LOW→MOD"),
                    (g["moderate"], "global MOD→HIGH"),
                    (g["high"], "global HIGH→EXT")]:
    ax.axvline(cutoff, color="#374151", linestyle="--", alpha=0.55, linewidth=1, zorder=1)
    ax.text(cutoff + 0.005, len(codes)-0.5, lab, color="#374151", fontsize=8, va="top")
ax.set_yticks(y); ax.set_yticklabels(codes)
ax.set_xlabel("Risk score cutoff")
ax.set_xlim(0, 1.0)
ax.set_title("Per-state danger-level cutoffs (KBDI-calibrated, 50/75/90/97 percentile)")
ax.legend(loc="lower right", ncol=4, fontsize=8)
plt.tight_layout()
out = FIG_DIR / "regional_thresholds.png"
plt.savefig(out, bbox_inches="tight")
print(f"wrote {out}")

# --- Cell N5 logic: probe cities ---
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
print(f"\nFor risk_score = {score:.2f}, danger level by location:\n")
print(f"  {'City':22s} {'State':6s} {'Level':10s}")
print("  " + "-"*40)
for city, lat, lon in probe_cities:
    level, state = regional_level(score, lat, lon)
    print(f"  {city:22s} {state or '—':6s} {level}")
