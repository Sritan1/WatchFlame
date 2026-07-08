"""Phase 5a - train + persist the final calibrated ignition model.

Ships the production model to api/models/ignition_model.joblib (committed, so the
deployed backend loads it without retraining). Two pieces are fit WITHOUT the
same-location sibling leakage the honest scorecard (evaluate_ignition_model.py)
guards against:

  * base model      - a GBM trained on ALL rows (production predictor).
  * calibrator      - isotonic, fit on GROUPED out-of-fold raw scores. Every
                      score it calibrates came from a model that never trained on
                      that row's 2-degree region, so a fire's positive and its
                      near-duplicate same-location negatives can't leak across the
                      calibration fit (a plain CalibratedClassifierCV(cv=3) splits
                      them randomly and does leak).
  * ref_scores      - the sorted CALIBRATED out-of-fold scores, so the live
                      percentile index maps against an honest (not in-sample,
                      overconfident) reference distribution.

At serve time (api/services/ignition.py): prob = calibrator(base.predict_proba),
percentile = searchsorted(ref_scores, prob).

Usage:
    python scripts/train_final_ignition_model.py
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

import joblib  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.isotonic import IsotonicRegression  # noqa: E402
from sklearn.model_selection import GroupKFold, cross_val_predict  # noqa: E402

from train_ignition_model import (  # noqa: E402
    CATEGORICAL, DATA, FEATURES, GROUP, N_SPLITS, NUMERIC, TARGET, make_gbm,
)

OUT = PROJECT_ROOT / "api" / "models" / "ignition_model.joblib"


def main() -> int:
    df = pd.read_csv(DATA)
    X, y, groups = df[FEATURES], df[TARGET], df[GROUP]

    print(f"training on {len(df):,} rows, {groups.nunique()} spatial blocks...")

    # Out-of-fold RAW probabilities via spatial GroupKFold: each row is scored by
    # a model that never trained on its region, so the calibrator + reference
    # built from these are free of same-location sibling leakage.
    gkf = GroupKFold(n_splits=N_SPLITS)
    oof_raw = cross_val_predict(
        make_gbm(), X, y, cv=gkf, groups=groups,
        method="predict_proba", n_jobs=-1,
    )[:, 1]

    # Isotonic calibrator fit on the out-of-fold raw scores (NOT in-sample).
    calibrator = IsotonicRegression(out_of_bounds="clip").fit(oof_raw, y)

    # Production base model: train on ALL rows (the calibrator stays separate).
    base = make_gbm().fit(X, y)

    # Reference distribution = sorted CALIBRATED out-of-fold scores. A score's
    # percentile at serve = fraction of these below it. Out-of-fold (not
    # in-sample) so the mapping isn't skewed by training-set overconfidence.
    ref = np.sort(calibrator.transform(oof_raw))

    artifact = {
        "base_model": base,
        "calibrator": calibrator,
        "ref_scores": ref,
        "features": FEATURES,
        "numeric": NUMERIC,
        "categorical": CATEGORICAL,
        "trained_at": date.today().isoformat(),
        "n_train": int(len(df)),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, OUT)
    print(f"saved {OUT.relative_to(PROJECT_ROOT)} "
          f"({OUT.stat().st_size / 1e6:.1f} MB), n_train={len(df):,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
