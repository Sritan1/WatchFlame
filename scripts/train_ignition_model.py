"""Compare a logistic-regression baseline against the boosted model.

Each runs twice, once on a random split, which leaks, and once holding out whole
regions at a time, which doesn't. Printing both makes the size of the leak
obvious. Train and test scores print side by side to show up memorization.

Run with python scripts/train_ignition_model.py
"""
from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.base import clone  # noqa: E402
from sklearn.compose import ColumnTransformer  # noqa: E402
from sklearn.ensemble import HistGradientBoostingClassifier  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import average_precision_score, roc_auc_score  # noqa: E402
from sklearn.model_selection import GroupKFold, StratifiedKFold  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import OneHotEncoder, StandardScaler  # noqa: E402

DATA = PROJECT_ROOT / "data" / "ignition_dataset.csv"

NUMERIC = ["temperature_c", "humidity_pct", "wind_kph", "days_since_rain",
           "kbdi", "vpd_hpa", "month"]
CATEGORICAL = ["season", "land_cover"]
FEATURES = NUMERIC + CATEGORICAL
TARGET = "label"
GROUP = "spatial_block"
N_SPLITS = 5
SEED = 7


def make_logreg() -> Pipeline:
    """The baseline. Needs its features scaled, unlike the trees."""
    pre = ColumnTransformer([
        ("num", StandardScaler(), NUMERIC),
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
    ])
    return Pipeline([
        ("pre", pre),
        ("clf", LogisticRegression(max_iter=1000, class_weight="balanced")),
    ])


def make_gbm() -> Pipeline:
    """The real model. Trees split on thresholds, so scaling is pointless. The
    categoricals get one-hot encoded and the numbers pass straight through.
    Held back a bit with big leaves and some regularization."""
    pre = ColumnTransformer(
        [("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL)],
        remainder="passthrough",
    )
    return Pipeline([
        ("pre", pre),
        ("clf", HistGradientBoostingClassifier(
            learning_rate=0.08, max_iter=300, min_samples_leaf=50,
            l2_regularization=1.0, class_weight="balanced", random_state=SEED)),
    ])


def cv_scores(model, X, y, splitter, groups=None):
    """Scores per fold, including the training score. The gap between the two is what
    tells you a model memorized."""
    roc_te, pr_te, roc_tr = [], [], []
    for tr, te in splitter.split(X, y, groups):
        m = clone(model).fit(X.iloc[tr], y.iloc[tr])
        p_te = m.predict_proba(X.iloc[te])[:, 1]
        roc_te.append(roc_auc_score(y.iloc[te], p_te))
        pr_te.append(average_precision_score(y.iloc[te], p_te))
        roc_tr.append(roc_auc_score(y.iloc[tr], m.predict_proba(X.iloc[tr])[:, 1]))
    return np.array(roc_te), np.array(pr_te), np.array(roc_tr)


def report(name, roc_te, pr_te, roc_tr):
    gap = roc_tr.mean() - roc_te.mean()
    print(f"  {name:26s} test ROC {roc_te.mean():.3f}  PR {pr_te.mean():.3f}"
          f"   | train ROC {roc_tr.mean():.3f}  (train-test gap {gap:+.3f})")


def main() -> int:
    df = pd.read_csv(DATA)
    X, y, g = df[FEATURES], df[TARGET], df[GROUP]
    base_rate = y.mean()
    print(f"dataset: {len(df):,} rows, {int(y.sum()):,} positives "
          f"({base_rate:.1%}), {g.nunique()} spatial blocks")
    print(f"no-skill reference: ROC-AUC 0.500, PR-AUC {base_rate:.3f}\n")

    strat = StratifiedKFold(n_splits=N_SPLITS, shuffle=True, random_state=SEED)
    group = GroupKFold(n_splits=N_SPLITS)

    for label, factory in [("Logistic regression (baseline)", make_logreg),
                           ("Gradient-boosted trees", make_gbm)]:
        print(f"{label}:")
        report("RANDOM split (leaky)", *cv_scores(factory(), X, y, strat))
        report("SPATIAL split (honest)", *cv_scores(factory(), X, y, group, g))
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
