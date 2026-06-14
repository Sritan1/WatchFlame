"""Temporal (out-of-time) validation for the ignition model.

The spatial-block CV already reported holds out whole regions, but it still lets
the *future* leak into the *past*: a model can train on a 2015 fire-day and be
tested on a 2005 one. In production the model never has that luxury — it only
has the past to predict the future. This script splits strictly by TIME instead,
so the test set is always "later than" everything the model trained on. A model
that still holds up earns the stronger claim: validated across SPACE *and* TIME.

    data/ignition_dataset.csv (rows 1991-2015):
    train rows < 2010, test rows >= 2010. Retrain the same HistGradientBoosting
    pipeline on the past, report ROC-AUC / PR-AUC on the future rows, next to
    the spatial-CV reference (~0.840).

Pure analysis: writes docs/temporal_validation.png + stdout only. Touches no
production code and never loads or modifies the live model artifact.

Usage:
    python scripts/temporal_validation.py
"""
from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

# Windows consoles default to cp1252, which can't encode +- in our output.
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
            fontsize=9.5, color="#374151", family="monospace",
            bbox=dict(boxstyle="round", fc="white", ec="#cbd5e1"))
    ax.legend(loc="lower right")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(alpha=0.25)
    fig.tight_layout()
    DOCS_OUT.parent.mkdir(parents=True, exist_ok=True)
    FIG_OUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(DOCS_OUT, dpi=160, bbox_inches="tight", facecolor="white")
    fig.savefig(FIG_OUT, dpi=160, bbox_inches="tight", facecolor="white")
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
