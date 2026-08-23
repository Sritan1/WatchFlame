"""Train the shipped ignition model into api/models/, where it is committed so the
deployed backend never retrains.

The artifact holds a base booster trained on every row, a calibrator fitted on
out-of-fold scores grouped by region, and ref_scores, that same distribution sorted,
which turns a probability into the percentile people see. Grouping matters. A fire
day and its own quiet days are near-duplicates, and random folds split them apart.

Run with python scripts/train_final_ignition_model.py
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

    # Score every row with a model that never saw its region.
    gkf = GroupKFold(n_splits=N_SPLITS)
    oof_raw = cross_val_predict(
        make_gbm(), X, y, cv=gkf, groups=groups,
        method="predict_proba", n_jobs=-1,
    )[:, 1]

    # Calibrate on those, never on in-sample scores.
    calibrator = IsotonicRegression(out_of_bounds="clip").fit(oof_raw, y)

    # The shipped predictor sees everything. The calibrator stays separate.
    base = make_gbm().fit(X, y)

    # A live score's percentile is just how many of these fall below it.
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
