"""Generate docs/v4_benchmark.png — fitted index vs published fire-weather indices.

Reads the held-out test-split Spearman ρ values that scripts/fit_v4_params.py
persisted to data/fitted_params.json and renders a single horizontal bar chart
comparing:

    Fosberg FFWI            — Fosberg (1978)
    Hot-Dry-Windy           — Srock et al. (2018)
    Fire weather (fitted)   — this project's fitted constants  ← highlighted

All three ρ values are computed on the SAME held-out fires, so the comparison
is apples-to-apples. Offline; no API, no recompute.

NOTE: the fitted bar reads `rho_fitted_test`, the fresh fit's held-out score.
It deliberately does NOT plot a separate "original hand-picked constants" bar:
once the fit was adopted, `rho_current_test` (spearman on DEFAULT_PARAMS) became
the fitted constants too, so a "before vs after fitting" chart is no longer
reproducible — re-running the pipeline would compare the fitted set against
itself. The before/after improvement is reported in fit_v4_params.py's stdout;
this chart makes the reproducible claim: the fitted index beats the published
benchmarks on held-out fires.

Usage:
    python scripts/build_benchmark_chart.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import matplotlib.pyplot as plt  # noqa: E402

PARAMS_PATH = PROJECT_ROOT / "data" / "fitted_params.json"
DOCS_OUT = PROJECT_ROOT / "docs" / "v4_benchmark.png"
FIGURES_OUT = PROJECT_ROOT / "notebooks" / "figures" / "v4_benchmark.png"


def main() -> int:
    if not PARAMS_PATH.exists():
        print(f"ERROR: {PARAMS_PATH} not found — run scripts/fit_v4_params.py first.")
        return 1
    m = json.loads(PARAMS_PATH.read_text(encoding="utf-8"))["metrics"]

    # Ascending so the fitted bar lands on top as the clear winner.
    bars = [
        ("Fosberg FFWI (1978)", m["rho_ffwi_test"], "#E8B339"),
        ("Hot-Dry-Windy (2018)", m["rho_hdw_test"], "#4FA8FF"),
        ("Fire weather — fitted", m["rho_fitted_test"], "#F04438"),
    ]
    bars.sort(key=lambda b: b[1])
    labels = [b[0] for b in bars]
    values = [b[1] for b in bars]
    colors = [b[2] for b in bars]

    fig, ax = plt.subplots(figsize=(9.0, 4.2))
    y = range(len(bars))
    ax.barh(list(y), values, color=colors, edgecolor="#1f2937",
            linewidth=0.8, alpha=0.92, height=0.62)

    for i, v in enumerate(values):
        ax.text(v + 0.004, i, f"{v:+.3f}", va="center", ha="left",
                fontsize=11, fontweight="bold", color="#111827")

    ax.set_yticks(list(y))
    ax.set_yticklabels(labels, fontsize=11)
    ax.set_xlabel("Spearman ρ (predicted score vs log fire size), held-out test fires",
                  fontsize=10.5)
    ax.set_xlim(0, max(values) * 1.18)
    ax.set_title(
        "Fitted fire-weather index discriminates fire size better than published indices\n"
        "— same held-out fires, apples-to-apples —",
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
    fig.savefig(DOCS_OUT, dpi=160, bbox_inches="tight", facecolor="white")
    fig.savefig(FIGURES_OUT, dpi=160, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"saved: {DOCS_OUT.relative_to(PROJECT_ROOT)}")
    print(f"saved: {FIGURES_OUT.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
