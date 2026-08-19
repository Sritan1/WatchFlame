"""Generate docs/regional_thresholds.png — the README's regional calibration chart.

Reads api/data/regional_thresholds.json and renders each fitted state as a
horizontal 4-segment bar (LOW / MOD / HIGH / EXT bands). Drops a vertical
probe line at score 0.45 to drive the headline insight: the same fire-weather score
maps to materially different danger tiers depending on the state.

Standalone script (no notebook dependency); regenerate with:

    python scripts/build_regional_calibration_chart.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = PROJECT_ROOT / "api" / "data" / "regional_thresholds.json"
DOCS_OUT = PROJECT_ROOT / "docs" / "regional_thresholds.png"
FIGURES_OUT = PROJECT_ROOT / "notebooks" / "figures" / "regional_thresholds.png"

# Tier colors. Match the app's RISK_LEVELS palette so the chart and the UI
# read as one design system.
import _chart_theme as chart_theme  # noqa: E402

_PAL = chart_theme.palette()

COLOR_LOW = chart_theme.data_color("#3FB68B")   # green-teal
COLOR_MOD = chart_theme.data_color("#E8B339")   # amber
COLOR_HIGH = chart_theme.data_color("#FF7A3A")  # orange
COLOR_EXT = chart_theme.data_color("#F04438")   # red
COLOR_PROBE = _PAL["fg"] if chart_theme.is_dark() else "#0B0E12"
COLOR_AXIS = _PAL["muted"] if chart_theme.is_dark() else "#374151"
COLOR_LABEL = _PAL["fg"]
COLOR_MUTED = _PAL["muted"]

# Probe score — drives the "same score, different tier" callout.
# Picked at 0.45 because it sits in distinct tiers across the spread:
#   - LOW in fire-prone West (CA, AZ, NV — their LOW band extends further)
#   - MOD/HIGH in the Mountain West (CO, ID, UT, MT, WY)
#   - HIGH/EXT in the Southeast belt (FL, GA, NC, SC)
PROBE_SCORE = 0.45


def main() -> None:
    data = json.loads(DATA_PATH.read_text())
    states = data["states"]
    global_t = data["global"]

    # Sort ascending by EXT threshold so the visual gradient runs from
    # "easiest state to hit EXT" (humid SE) up to "hardest" (fire-prone West).
    ordered = sorted(states.items(), key=lambda kv: kv[1]["thresholds"]["extreme"])
    codes = [s for s, _ in ordered]
    lows = np.array([info["thresholds"]["low"] for _, info in ordered])
    mods = np.array([info["thresholds"]["moderate"] for _, info in ordered])
    exts = np.array([info["thresholds"]["extreme"] for _, info in ordered])

    n = len(codes)
    y = np.arange(n)
    bar_h = 0.72

    chart_theme.apply()
    fig, ax = plt.subplots(figsize=(11.5, 7.5))

    # Per-state 4-segment bars (side-by-side, not stacked — each segment
    # spans its own tier so the band widths are directly visible).
    # Use explicit lefts so segments butt against each other cleanly.
    ax.barh(y, lows,                left=0,    height=bar_h, color=COLOR_LOW,  edgecolor=_PAL["bg"], linewidth=0.6, zorder=2)
    ax.barh(y, mods - lows,         left=lows, height=bar_h, color=COLOR_MOD,  edgecolor=_PAL["bg"], linewidth=0.6, zorder=2)
    ax.barh(y, exts - mods,         left=mods, height=bar_h, color=COLOR_HIGH, edgecolor=_PAL["bg"], linewidth=0.6, zorder=2)
    ax.barh(y, 1.0 - exts,          left=exts, height=bar_h, color=COLOR_EXT,  edgecolor=_PAL["bg"], linewidth=0.6, zorder=2)

    # Vertical probe line at PROBE_SCORE — the visual hook for the
    # "same score, different danger" story.
    ax.axvline(
        PROBE_SCORE,
        color=COLOR_PROBE,
        linewidth=2.2,
        linestyle="-",
        zorder=4,
        alpha=0.85,
    )
    ax.text(
        PROBE_SCORE,
        n + 0.15,
        f"score = {PROBE_SCORE:.2f}",
        ha="center",
        va="bottom",
        fontsize=10.5,
        fontweight="bold",
        color=COLOR_PROBE,
        bbox=dict(
            facecolor=_PAL["bg"],
            edgecolor=COLOR_PROBE,
            linewidth=1.2,
            boxstyle="round,pad=0.35",
        ),
        zorder=5,
    )

    # Per-state tier-at-probe-score labels next to the bar.
    def tier_at(score: float, low: float, mod: float, ext: float) -> str:
        if score < low: return "LOW"
        if score < mod: return "MOD"
        if score < ext: return "HIGH"
        return "EXT"

    for i, (lo, mo, ex) in enumerate(zip(lows, mods, exts)):
        tier = tier_at(PROBE_SCORE, lo, mo, ex)
        color = {
            "LOW": COLOR_LOW, "MOD": COLOR_MOD, "HIGH": COLOR_HIGH, "EXT": COLOR_EXT
        }[tier]
        ax.text(
            1.025, i,
            tier,
            ha="left", va="center",
            fontsize=9, fontweight="bold",
            color=color,
        )

    # Tick configuration.
    ax.set_yticks(y)
    ax.set_yticklabels(codes, fontsize=11, color=COLOR_LABEL)
    ax.set_xlim(0, 1.12)
    ax.set_xticks(np.arange(0, 1.01, 0.1))
    ax.set_xlabel("Fire-weather score", fontsize=11, color=COLOR_LABEL, labelpad=10)
    ax.tick_params(axis="x", colors=COLOR_LABEL)
    ax.tick_params(axis="y", colors=COLOR_LABEL)
    ax.set_ylim(-0.7, n + 0.4)

    # Hide the chart-junk spines; keep bottom axis.
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(COLOR_AXIS)
    ax.spines["bottom"].set_linewidth(0.8)
    ax.grid(axis="x", color=COLOR_AXIS, linewidth=0.4, alpha=0.18, zorder=0)

    # Title + subtitle stacked, framing the takeaway.
    fig.suptitle(
        "Same fire-weather score, different danger level",
        fontsize=15,
        fontweight="bold",
        x=0.5,
        y=0.98,
        ha="center",
        color=COLOR_LABEL,
    )
    ax.set_title(
        "Each state's LOW / MOD / HIGH / EXT bands are pegged to its own historical fire-day distribution\n"
        f"(FPA-FOD, 1992–2015; 50 / 75 / 97th percentiles). A score of {PROBE_SCORE:.2f} lands in the labeled tier per state.",
        fontsize=10.5,
        color=COLOR_MUTED,
        pad=20,
        loc="left",
    )

    # Legend (top-right, inside the plot area).
    handles = [
        mpatches.Patch(color=COLOR_LOW,  label="LOW"),
        mpatches.Patch(color=COLOR_MOD,  label="MOD"),
        mpatches.Patch(color=COLOR_HIGH, label="HIGH"),
        mpatches.Patch(color=COLOR_EXT,  label="EXT"),
    ]
    ax.legend(
        handles=handles,
        loc="upper right",
        bbox_to_anchor=(1.0, 1.0),
        frameon=False,
        ncols=4,
        fontsize=10,
        handlelength=1.4,
        columnspacing=1.2,
        bbox_transform=ax.transAxes,
    )

    # Bottom-left footer w/ source.
    ax.text(
        0.0, -0.12,
        f"17 fitted states - global fallback cutoffs: LOW <{global_t['low']:.1f} / MOD <{global_t['moderate']:.1f} / HIGH <{global_t['extreme']:.1f} / EXT >={global_t['extreme']:.1f}",
        transform=ax.transAxes,
        fontsize=9, color=COLOR_MUTED,
    )

    plt.subplots_adjust(left=0.07, right=0.93, top=0.86, bottom=0.13)

    DOCS_OUT.parent.mkdir(parents=True, exist_ok=True)
    FIGURES_OUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(chart_theme.out_path(DOCS_OUT), dpi=160, bbox_inches="tight", facecolor=_PAL["bg"])
    fig.savefig(chart_theme.out_path(FIGURES_OUT), dpi=160, bbox_inches="tight", facecolor=_PAL["bg"])
    plt.close(fig)

    print(f"saved: {DOCS_OUT.relative_to(PROJECT_ROOT)}")
    print(f"saved: {FIGURES_OUT.relative_to(PROJECT_ROOT)}")
    print()
    print("Per-state tier at probe score:")
    for code, lo, mo, ex in zip(codes, lows, mods, exts):
        tier = tier_at(PROBE_SCORE, lo, mo, ex)
        print(f"  {code:>3}  LOW<{lo:.3f}  MOD<{mo:.3f}  EXT>={ex:.3f}  ->  score {PROBE_SCORE:.2f} = {tier}")


if __name__ == "__main__":
    main()
