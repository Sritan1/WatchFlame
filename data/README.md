# Data

This folder holds the datasets and caches the offline scripts use to fit the
fire-weather constants, calibrate the per-state thresholds, and train the
ignition model. None of it is needed to run the site. The live backend reads
only the committed `api/data/regional_thresholds.json` and
`api/models/ignition_model.joblib`.

Everything else is gitignored because it is large and can be rebuilt from the
scripts. The biggest files, the raw FPA-FOD wildfire database and a cached
weather pull, are large enough to exceed GitHub's file size limit. That is why
the folder looks empty on GitHub apart from this note.

## What lives here

- `FPA_FOD_20170508.sqlite`: the raw FPA-FOD historical wildfire records from
  Kaggle, the ground truth for validation and calibration.
- `hindcast_features.csv`: the frozen 498-fire benchmark used to fit and score
  the fire-weather index.
- `fitted_params.json`: the fitted constants and their held-out correlation
  scores.
- `ignition_dataset.csv` and `background_negatives.csv`: the assembled training
  set for the ignition model.
- `landcover_cache.json` and `openmeteo_cache.json`: cached upstream responses so
  reruns stay offline and within quota.

## Regenerating

These rebuild from the scripts in `scripts/`. The fire-weather side runs
`freeze_hindcast_dataset.py`, `fit_fireweather_params.py`, and
`build_regional_thresholds.py`. The full ignition-model pipeline (background
negatives, dataset build, train, evaluate, final artifact) is listed step by step
in the "Reproduce" section of `docs/IGNITION_MODEL_CARD.md`. The raw FPA-FOD
sqlite comes from Kaggle, linked in the data-sources table in the main
`README.md`. Some steps call live weather APIs and are quota-limited.
