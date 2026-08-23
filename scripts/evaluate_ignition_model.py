"""The honest scorecard, plus the calibration charts.

Every probability comes from a model that never trained on that row's region. Shows
the raw probabilities are skewed and that calibration straightens them out. Those
probabilities are calibrated against this dataset's positive rate, not the rate
fires start in the world, which is why the app shows a percentile and not a percent.

Run with python scripts/evaluate_ignition_model.py
"""
from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.calibration import CalibratedClassifierCV, calibration_curve  # noqa: E402
from sklearn.metrics import (  # noqa: E402
    average_precision_score, brier_score_loss, roc_auc_score, roc_curve,
)
from sklearn.model_selection import GroupKFold, cross_val_predict  # noqa: E402

from train_ignition_model import (  # noqa: E402
    DATA, FEATURES, GROUP, N_SPLITS, TARGET, make_gbm,
)

DOCS_OUT = PROJECT_ROOT / "docs" / "ignition_eval.png"
FIG_OUT = PROJECT_ROOT / "notebooks" / "figures" / "ignition_eval.png"


def main() -> int:
    df = pd.read_csv(DATA)
    X, y, g = df[FEATURES], df[TARGET], df[GROUP]
    base = y.mean()
    cv = GroupKFold(n_splits=N_SPLITS)

    print("computing out-of-fold predictions (spatial CV) - a minute or so...")
    raw = cross_val_predict(make_gbm(), X, y, cv=cv, groups=g,
                            method="predict_proba", n_jobs=-1)[:, 1]
    cal_model = CalibratedClassifierCV(make_gbm(), method="isotonic", cv=3)
    cal = cross_val_predict(cal_model, X, y, cv=cv, groups=g,
                            method="predict_proba", n_jobs=-1)[:, 1]

    roc_auc = roc_auc_score(y, raw)          # ranking, which calibration preserves
    pr_auc = average_precision_score(y, raw)
    brier_raw = brier_score_loss(y, raw)
    brier_cal = brier_score_loss(y, cal)

    print("\n=== Honest scorecard (out-of-fold, spatial CV) ===")
    print(f"  ROC-AUC: {roc_auc:.3f}   (no-skill 0.500)")
    print(f"  PR-AUC:  {pr_auc:.3f}   (no-skill = base rate {base:.3f})")
    print(f"  Brier (raw):        {brier_raw:.4f}")
    print(f"  Brier (calibrated): {brier_cal:.4f}   (lower = better)")
    gate = roc_auc > 0.70 and pr_auc > 2 * base
    print(f"  Decision gate: {'PASS' if gate else 'REVIEW'}")

    # Charts
    import _chart_theme as chart_theme
    pal = chart_theme.apply()
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.6))

    fpr, tpr, _ = roc_curve(y, raw)
    ax1.plot(fpr, tpr, color="#F04438", lw=2, label=f"model (AUC {roc_auc:.3f})")
    ax1.plot([0, 1], [0, 1], "--", color="#9ca3af", lw=1, label="no-skill")
    ax1.set_xlabel("false positive rate")
    ax1.set_ylabel("true positive rate")
    ax1.set_title("ROC curve - fire-day vs typical-day")
    ax1.legend(loc="lower right")

    for name, p, color in [("raw", raw, "#9ca3af"), ("calibrated", cal, "#F04438")]:
        frac, mean = calibration_curve(y, p, n_bins=10, strategy="quantile")
        ax2.plot(mean, frac, "o-", color=color, lw=1.8, label=name)
    ax2.plot([0, 1], [0, 1], "--", color="#cbd5e1", lw=1, label="perfect")
    ax2.set_xlabel("predicted probability")
    ax2.set_ylabel("observed fire fraction")
    ax2.set_title("Reliability - calibration fixes the raw scores")
    ax2.legend(loc="upper left")

    for ax in (ax1, ax2):
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.grid(alpha=0.25)
    fig.suptitle(f"Fire-ignition Model - leakage-safe out-of-fold evaluation "
                 f"(ROC-AUC {roc_auc:.3f}, PR-AUC {pr_auc:.3f})", fontsize=12)
    fig.tight_layout()
    DOCS_OUT.parent.mkdir(parents=True, exist_ok=True)
    FIG_OUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(chart_theme.out_path(DOCS_OUT), dpi=160, bbox_inches="tight", facecolor=pal["bg"])
    fig.savefig(chart_theme.out_path(FIG_OUT), dpi=160, bbox_inches="tight", facecolor=pal["bg"])
    plt.close(fig)
    print(f"\nsaved: {DOCS_OUT.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
