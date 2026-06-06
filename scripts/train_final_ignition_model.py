"""Phase 5a - train + persist the final calibrated ignition model.

Fits CalibratedClassifierCV(GBM, isotonic) on ALL of data/ignition_dataset.csv
(no held-out split - this is the production model, and we already measured its
honest performance in Phase 3). Stores a sorted reference score distribution so
the live service can convert a raw probability into a percentile index. Saves
to api/models/ignition_model.joblib - committed, so the deployed backend loads
it without retraining.

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
from sklearn.calibration import CalibratedClassifierCV  # noqa: E402

from train_ignition_model import (  # noqa: E402
    CATEGORICAL, DATA, FEATURES, NUMERIC, TARGET, make_gbm,
)

OUT = PROJECT_ROOT / "api" / "models" / "ignition_model.joblib"


def main() -> int:
    df = pd.read_csv(DATA)
    X, y = df[FEATURES], df[TARGET]

    print(f"training on {len(df):,} rows...")
    model = CalibratedClassifierCV(make_gbm(), method="isotonic", cv=3)
    model.fit(X, y)

    # Reference distribution of calibrated scores -> percentile mapping at serve
    # time. (A score's percentile = fraction of these reference scores below it.)
    ref = np.sort(model.predict_proba(X)[:, 1])

    artifact = {
        "model": model,
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
