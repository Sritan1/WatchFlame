"""Chart the fitted index against Fosberg and Hot-Dry-Windy. The metrics come from
data/fitted_params.json, where all three were scored on the same held-out fires.
Nothing is rescored here.

There is no "before fitting" bar. Adopting the fit removed the old constants, so
that comparison can't be regenerated from a fresh run. This chart claims only the
reproducible part.

Run with python scripts/build_benchmark_chart.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import matplotlib.pyplot as plt  # noqa: E402

import _chart_theme as chart_theme  # noqa: E402

PARAMS_PATH = PROJECT_ROOT / "data" / "fitted_params.json"
DOCS_OUT = PROJECT_ROOT / "docs" / "fireweather_benchmark.png"
FIGURES_OUT = PROJECT_ROOT / "notebooks" / "figures" / "fireweather_benchmark.png"


def main() -> int:
    if not PARAMS_PATH.exists():
        print(f"ERROR: {PARAMS_PATH} not found — run scripts/fit_fireweather_params.py first.")
        return 1
    m = json.loads(PARAMS_PATH.read_text(encoding="utf-8"))["metrics"]
    pal = chart_theme.apply()

    # Ascending, so ours ends up on top.
    bars = [
        ("Fosberg FFWI (1978)", m["rho_ffwi_test"], "#E8B339"),
        ("Hot-Dry-Windy (2018)", m["rho_hdw_test"], "#4FA8FF"),
        ("Fire weather (fitted)", m["rho_fitted_test"], "#F04438"),
    ]
    bars.sort(key=lambda b: b[1])
    labels = [b[0] for b in bars]
    values = [b[1] for b in bars]
    # Dark-mode tones, keyed on the light color so sort order doesn't matter.
    dark_map = {"#E8B339": "#9A8348", "#4FA8FF": "#52739C", "#F04438": "#9B564F"}
    colors = [dark_map[b[2]] if chart_theme.is_dark() else b[2] for b in bars]

    fig, ax = plt.subplots(figsize=(9.0, 4.2))
    y = range(len(bars))
    ax.barh(list(y), values, color=colors, edgecolor=pal["edge"],
            linewidth=0.8, alpha=0.92, height=0.62)

    for i, v in enumerate(values):
        ax.text(v + 0.004, i, f"{v:+.3f}", va="center", ha="left",
                fontsize=11, fontweight="bold", color=pal["fg"])

    ax.set_yticks(list(y))
    ax.set_yticklabels(labels, fontsize=11)
    ax.set_xlabel("Spearman ρ (predicted score vs log fire size), held-out test fires",
                  fontsize=10.5)
    ax.set_xlim(0, max(values) * 1.18)
    ax.set_title(
        "Fitted fire-weather index vs. published indices\n"
        "Spearman ρ on the same held-out fires",
        fontsize=12, pad=12,
    )
    ax.grid(axis="x", alpha=0.25, linewidth=0.6)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_visible(False)
    ax.tick_params(axis="y", length=0)

    fig.tight_layout()
    DOCS_OUT.parent.mkdir(parents=True, exist_ok=True)
    FIGURES_OUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(chart_theme.out_path(DOCS_OUT), dpi=160, bbox_inches="tight", facecolor=pal["bg"])
    fig.savefig(chart_theme.out_path(FIGURES_OUT), dpi=160, bbox_inches="tight", facecolor=pal["bg"])
    plt.close(fig)
    print(f"saved: {chart_theme.out_path(DOCS_OUT).relative_to(PROJECT_ROOT)}")
    print(f"saved: {chart_theme.out_path(FIGURES_OUT).relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
