"""Phase 1 of the ML feature - baseline ignition classifier + leakage-safe eval.

Trains a logistic-regression baseline on data/ignition_dataset.csv and evaluates
it three ways, to make the methodology visible:

  1. no-skill reference (DummyClassifier)          -> what "no signal" looks like
  2. logistic reg, RANDOM split (StratifiedKFold)  -> the naive, LEAKY way
  3. logistic reg, SPATIAL split (GroupKFold on    -> the honest way; whole
     spatial_block)                                    regions held out at once

The gap between (2) and (3) is the leakage the dataset was designed to expose:
a fire and its own typical-day negatives share a location, so a random split can
put near-identical rows on both sides of train/test and inflate the score.

Usage:
    python scripts/train_ignition_model.py
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
from sklearn.dummy import DummyClassifier  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import average_precision_score, roc_auc_score  # noqa: E402
from sklearn.model_selection import GroupKFold, StratifiedKFold  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import OneHotEncoder, StandardScaler  # noqa: E402

DATA = PROJECT_ROOT / "data" / "ignition_dataset.csv"

NUMERIC = ["temperature_c", "humidity_pct", "wind_kph", "days_since_rain",
           "kbdi", "vpd_hpa", "month"]
CATEGORICAL = ["season"]
FEATURES = NUMERIC + CATEGORICAL
TARGET = "label"
GROUP = "spatial_block"
N_SPLITS = 5
SEED = 7


def make_logreg() -> Pipeline:
    """Logistic regression with scaling + one-hot encoding. Scaling matters
    because logistic regression is sensitive to feature magnitude (KBDI runs
    0-800, humidity 0-100); the scaler puts every feature on equal footing."""
    pre = ColumnTransformer([
        ("num", StandardScaler(), NUMERIC),
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
    ])
    return Pipeline([
        ("pre", pre),
        ("clf", LogisticRegression(max_iter=1000, class_weight="balanced")),
    ])


def cv_scores(model, X, y, splitter, groups=None):
    """Train on each fold's training rows, score on its held-out rows. The
    model is never scored on data it trained on - that's the whole point."""
    roc, pr = [], []
    for tr, te in splitter.split(X, y, groups):
        m = clone(model).fit(X.iloc[tr], y.iloc[tr])
        p = m.predict_proba(X.iloc[te])[:, 1]
        roc.append(roc_auc_score(y.iloc[te], p))
        pr.append(average_precision_score(y.iloc[te], p))
    return np.array(roc), np.array(pr)


def report(name, roc, pr):
    print(f"  {name:34s} ROC-AUC {roc.mean():.3f} +/- {roc.std():.3f}   "
          f"PR-AUC {pr.mean():.3f} +/- {pr.std():.3f}")


def main() -> int:
    df = pd.read_csv(DATA)
    X, y, g = df[FEATURES], df[TARGET], df[GROUP]
    base_rate = y.mean()
    print(f"dataset: {len(df):,} rows, {int(y.sum()):,} positives "
          f"({base_rate:.1%}), {g.nunique()} spatial blocks\n")
    print(f"reference points: no-skill ROC-AUC = 0.500, "
          f"no-skill PR-AUC = base rate = {base_rate:.3f}\n")

    strat = StratifiedKFold(n_splits=N_SPLITS, shuffle=True, random_state=SEED)
    group = GroupKFold(n_splits=N_SPLITS)

    print("Baseline (logistic regression):")
    roc, pr = cv_scores(
        DummyClassifier(strategy="stratified", random_state=SEED), X, y, group, g)
    report("no-skill (dummy)", roc, pr)
    roc, pr = cv_scores(make_logreg(), X, y, strat)
    report("logreg - RANDOM split (leaky)", roc, pr)
    roc_h, pr_h = cv_scores(make_logreg(), X, y, group, g)
    report("logreg - SPATIAL split (honest)", roc_h, pr_h)

    # Which features does the baseline lean on? Fit on all data for a peek.
    m = make_logreg().fit(X, y)
    names = (NUMERIC + list(
        m.named_steps["pre"].named_transformers_["cat"]
        .get_feature_names_out(CATEGORICAL)))
    coefs = m.named_steps["clf"].coef_[0]
    print("\nWhat the baseline leans on (standardized coefficients, |biggest| first):")
    for i in np.argsort(np.abs(coefs))[::-1]:
        sign = "raises" if coefs[i] > 0 else "lowers"
        print(f"  {names[i]:22s} {coefs[i]:+.2f}  ({sign} ignition likelihood)")

    print(f"\nHonest headline: ROC-AUC {roc_h.mean():.3f}, "
          f"PR-AUC {pr_h.mean():.3f}  (no-skill = 0.500 / {base_rate:.3f}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
