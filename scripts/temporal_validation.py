"""Can the model predict forward, not just sideways?

Holding out whole regions stops it memorizing places but still lets the future leak
into the past. A model can train on 2015 and be tested on 2005, which is never how
production works. This splits strictly by date, so surviving both cuts earns the
claim that it works across space and time. Analysis only, never touches the shipped
model.

Run with python scripts/temporal_validation.py
"""
from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

# Windows consoles default to a codepage that can't print the symbols we use.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.base import clone  # noqa: E402
from sklearn.metrics import average_precision_score, roc_auc_score, roc_curve  # noqa: E402

from train_ignition_model import DATA as IGNITION_CSV  # noqa: E402
from train_ignition_model import FEATURES, TARGET, make_gbm  # noqa: E402

DOCS_OUT = PROJECT_ROOT / "docs" / "temporal_validation.png"
FIG_OUT = PROJECT_ROOT / "notebooks" / "figures" / "temporal_validation.png"

CUTOFF = 2010  # train rows < 2010, test rows >= 2010
SPATIAL_CV_REFERENCE = 0.840


def validate_ignition() -> dict:
    df = pd.read_csv(IGNITION_CSV)
    df["year"] = pd.to_datetime(df["date"]).dt.year

    past = df[df["year"] < CUTOFF]
    future = df[df["year"] >= CUTOFF]
    print(f"Ignition dataset: {len(df):,} rows ({df['year'].min()}-{df['year'].max()})")
    print(f"  TIME split @ {CUTOFF}:  "
          f"train(past)={len(past):,} ({past[TARGET].mean():.1%} pos)  "
          f"test(future)={len(future):,} ({future[TARGET].mean():.1%} pos)")

    model = clone(make_gbm()).fit(past[FEATURES], past[TARGET])
    p_future = model.predict_proba(future[FEATURES])[:, 1]
    y_future = future[TARGET].to_numpy()
    roc = roc_auc_score(y_future, p_future)
    pr = average_precision_score(y_future, p_future)
    base = future[TARGET].mean()

    print(f"\n  == Out-of-time scorecard (train<{CUTOFF}, test>={CUTOFF}) ==")
    print(f"    ROC-AUC: {roc:.3f}   (no-skill 0.500; "
          f"spatial-CV reference ~{SPATIAL_CV_REFERENCE:.3f})")
    print(f"    PR-AUC:  {pr:.3f}   (no-skill = base rate {base:.3f})")

    fpr, tpr, _ = roc_curve(y_future, p_future)
    return {"roc": roc, "pr": pr, "base": base, "fpr": fpr, "tpr": tpr,
            "n_past": len(past), "n_future": len(future)}


def make_chart(ig: dict) -> None:
    import _chart_theme as chart_theme
    pal = chart_theme.apply()
    fig, ax = plt.subplots(figsize=(5.6, 5.0))
    ax.plot(ig["fpr"], ig["tpr"], color="#F04438", lw=2.2,
            label=f"out-of-time (AUC {ig['roc']:.3f})")
    ax.plot([0, 1], [0, 1], "--", color="#9ca3af", lw=1, label="no-skill")
    ax.set_xlabel("false positive rate")
    ax.set_ylabel("true positive rate")
    ax.set_title(f"Ignition model — out-of-time ROC\n(train rows < {CUTOFF}, "
                 f"test rows ≥ {CUTOFF}, n={ig['n_future']:,})", fontsize=11)
    ax.text(0.46, 0.10,
            f"spatial-CV reference: {SPATIAL_CV_REFERENCE:.3f}\n"
            f"out-of-time:          {ig['roc']:.3f}",
            fontsize=9.5, color=pal["fg"], family="monospace",
            bbox=dict(boxstyle="round", fc=pal["bg"], ec=pal["grid"]))
    ax.legend(loc="lower right")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(alpha=0.25)
    fig.tight_layout()
    DOCS_OUT.parent.mkdir(parents=True, exist_ok=True)
    FIG_OUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(chart_theme.out_path(DOCS_OUT), dpi=160, bbox_inches="tight", facecolor=pal["bg"])
    fig.savefig(chart_theme.out_path(FIG_OUT), dpi=160, bbox_inches="tight", facecolor=pal["bg"])
    plt.close(fig)
    print(f"\nsaved: {DOCS_OUT.relative_to(PROJECT_ROOT)}")


def main() -> int:
    if not IGNITION_CSV.exists():
        print("ERROR: data/ignition_dataset.csv missing. "
              "Run build_ignition_dataset.py first.")
        return 1
    ig = validate_ignition()
    make_chart(ig)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
