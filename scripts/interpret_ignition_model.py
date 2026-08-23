"""What the model is actually leaning on.

Three checks. Scramble each feature and see how far the score falls. Retrain without
the calendar, then without temperature, to find out whether the weather predicts on
its own or the model is mostly noticing that it's summer. Then a map of where it
thinks fires start. Scrambling understates overlapping features, and VPD is built
from temperature and humidity, so read the moisture ones as a group.

Run with python scripts/interpret_ignition_model.py
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
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.compose import ColumnTransformer  # noqa: E402
from sklearn.ensemble import HistGradientBoostingClassifier  # noqa: E402
from sklearn.inspection import permutation_importance  # noqa: E402
from sklearn.metrics import roc_auc_score  # noqa: E402
from sklearn.model_selection import GroupShuffleSplit  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import OneHotEncoder  # noqa: E402

from train_ignition_model import (  # noqa: E402
    CATEGORICAL, DATA, FEATURES, GROUP, NUMERIC, SEED, TARGET, make_gbm,
)

OUT = PROJECT_ROOT / "docs" / "ignition_interpret.png"
FIG = PROJECT_ROOT / "notebooks" / "figures" / "ignition_interpret.png"


def build_gbm(numeric: list[str], categorical: list[str]) -> Pipeline:
    """The same model, over whichever features you hand it."""
    if categorical:
        pre = ColumnTransformer(
            [("cat", OneHotEncoder(handle_unknown="ignore"), categorical)],
            remainder="passthrough")
    else:
        pre = "passthrough"
    return Pipeline([
        ("pre", pre),
        ("clf", HistGradientBoostingClassifier(
            learning_rate=0.08, max_iter=300, min_samples_leaf=50,
            l2_regularization=1.0, class_weight="balanced", random_state=SEED)),
    ])


def main() -> int:
    df = pd.read_csv(DATA)
    X, y, g = df[FEATURES], df[TARGET], df[GROUP]

    # Hold out whole regions, not random rows.
    gss = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=SEED)
    tr, te = next(gss.split(X, y, g))

    # What breaks when each feature is scrambled
    model = make_gbm().fit(X.iloc[tr], y.iloc[tr])
    r = permutation_importance(model, X.iloc[te], y.iloc[te], scoring="roc_auc",
                               n_repeats=10, random_state=SEED, n_jobs=-1)
    order = np.argsort(r.importances_mean)[::-1]
    print("Permutation importance (drop in held-out ROC-AUC when scrambled):")
    for i in order:
        print(f"  {FEATURES[i]:18s} {r.importances_mean[i]:+.4f} "
              f"+/- {r.importances_std[i]:.4f}")

    # Is it just reading the calendar?
    def holdout_auc(num, cat):
        cols = num + cat
        m = build_gbm(num, cat).fit(X.iloc[tr][cols], y.iloc[tr])
        return roc_auc_score(y.iloc[te], m.predict_proba(X.iloc[te][cols])[:, 1])

    full = holdout_auc(NUMERIC, CATEGORICAL)
    no_cal = holdout_auc([c for c in NUMERIC if c != "month"], [])
    no_cal_no_temp = holdout_auc(
        [c for c in NUMERIC if c not in ("month", "temperature_c")], [])
    print("\nConfound check (held-out ROC-AUC):")
    print(f"  full model:                         {full:.3f}")
    print(f"  no calendar (drop season, month):   {no_cal:.3f}")
    print(f"  no calendar + no temperature:       {no_cal_no_temp:.3f}")
    print("  -> if these stay high, day-to-day weather/drought (not the "
          "calendar) carries the signal.")

    # Where it thinks fires start. In-sample, just for the picture.
    fullmodel = make_gbm().fit(X, y)
    df = df.assign(pred=fullmodel.predict_proba(X)[:, 1])
    blk = df.groupby("spatial_block").agg(
        lat=("lat", "mean"), lon=("lon", "mean"), pred=("pred", "mean"),
        n=("pred", "size")).reset_index()

    # Charts
    import _chart_theme as chart_theme
    pal = chart_theme.apply()
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12.5, 5.0))

    imp = [(FEATURES[i], r.importances_mean[i]) for i in order]
    names = [n for n, _ in imp][::-1]
    vals = [v for _, v in imp][::-1]
    ax1.barh(names, vals, color=("#C56A62" if chart_theme.is_dark() else "#F04438"),
             alpha=0.9, edgecolor=pal["edge"], lw=0.6)
    ax1.set_xlabel("drop in ROC-AUC when scrambled")
    ax1.set_title("What the model relies on (permutation importance)")
    ax1.grid(axis="x", alpha=0.25)
    ax1.spines["top"].set_visible(False)
    ax1.spines["right"].set_visible(False)

    sc = ax2.scatter(blk.lon, blk.lat, c=blk.pred, cmap="YlOrRd",
                     s=18 + blk.n / blk.n.max() * 60, edgecolor="#4b5563", lw=0.3,
                     vmin=blk.pred.quantile(0.05), vmax=blk.pred.quantile(0.95))
    ax2.set_xlim(-125, -66)
    ax2.set_ylim(24, 50)
    ax2.set_xlabel("longitude")
    ax2.set_ylabel("latitude")
    ax2.set_title("Model-estimated regional ignition-proneness")
    fig.colorbar(sc, ax=ax2, label="mean predicted likelihood", shrink=0.85)

    fig.suptitle("Fire-ignition model - interpretability", fontsize=13)
    fig.tight_layout()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    FIG.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(chart_theme.out_path(OUT), dpi=160, bbox_inches="tight", facecolor=pal["bg"])
    fig.savefig(chart_theme.out_path(FIG), dpi=160, bbox_inches="tight", facecolor=pal["bg"])
    plt.close(fig)
    print(f"\nsaved: {OUT.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
