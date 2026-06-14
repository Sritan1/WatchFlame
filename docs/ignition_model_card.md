# Model card — Fire-Ignition-Likelihood Model

A small, interpretable machine-learning model that estimates how much a
location's current conditions **resemble the days wildfires have actually
started**. It complements (does not replace) the rule-based V4 fire-weather
index — see [DECISIONS §10](DECISIONS.md).

## Overview

| | |
|---|---|
| **Task** | Binary classification: "fire-start day" vs "typical day" at a location |
| **Output** | A calibrated **ignition-likelihood percentile (0–100)** + a `low/moderate/high/extreme` level |
| **Question it answers** | *Do today's conditions look like a day fires start?* (occurrence) — distinct from V4's *how bad could a fire get?* (severity) |
| **Model** | Gradient-boosted decision trees (`HistGradientBoostingClassifier`) + isotonic calibration |
| **Served at** | `GET /ignition?lat=&lon=`, surfaced as a card on the Status screen |

## Training data

Built offline + reproducibly (`scripts/build_ignition_dataset.py`):

- **Positives (4,897):** the conditions on the day a real fire ignited, from the federal **FPA-FOD** database (1992–2015), enriched with day-of-fire weather + KBDI drought from the **Open-Meteo** archive.
- **Same-location negatives (24,485):** "typical days" sampled from the *same* locations on other days (from each fire's cached 365-day weather window). Sharing locations between the two classes controls for the spatial reporting bias in fire data **by construction**.
- **Background negatives (3,000):** typical days at **genuinely non-fire** locations across CONUS (`scripts/build_background_negatives.py`). These break the "every location is a fire location" structure, so the model can learn that low-fuel/developed areas ignite less often regardless of weather (see *Addressing the over-flag* below).
- **32,382 examples total, 15.1% positive.** Features are computed by the same function used at serve time (training/serving parity).

**Features:** daily-max temperature, mean humidity, VPD, daily-max wind, days-since-rain, KBDI (drought), season, month, and **land cover** (NLCD class — water / developed-open/low/med/high / forest / shrub / grassland / cropland / wetland / barren). Developed intensity is kept **split** (open-space 21 vs. dense-urban 24) so grassy parks separate from downtown. Location (lat/lon) is deliberately **excluded** so the model learns conditions + fuel, not geography.

## Evaluation

Leakage-safe **spatial-block cross-validation** (whole 2° regions held out at once) — so a fire and its own negatives can never straddle the train/test split — plus a logistic-regression baseline for comparison.

| metric (out-of-fold, spatial CV) | model | no-skill |
|---|---|---|
| ROC-AUC | **0.840** | 0.500 |
| PR-AUC | **0.488** | 0.151 (base rate) |
| Brier (raw → calibrated) | 0.163 → **0.100** | — |

It beats the logistic baseline (0.798 ROC-AUC) and is well-calibrated after isotonic calibration. Charts: [`docs/ignition_eval.png`](ignition_eval.png) (ROC + reliability), [`docs/ignition_interpret.png`](ignition_interpret.png) (importance + regional map).

**Validated across time, not just space.** Spatial CV holds out whole regions but still mixes years, so it can train on a 2015 fire-day and test on a 2005 one. A stricter **out-of-time** holdout — train on every row before 2010, test on 2010–2015 (n=4,893) — matches what the model actually faces in production (only the past is available). ROC-AUC is essentially unchanged: **0.832 out-of-time vs 0.840 spatial-CV**, PR-AUC 0.481 (base rate 0.149). The drivers are stable enough that a 6-year forward gap barely moves discrimination. Reproduce with `scripts/temporal_validation.py`; chart [`docs/temporal_validation.png`](temporal_validation.png).

**Interpretability (permutation importance):** the model independently puts **VPD and KBDI on top** — the same drivers the physics-based V4 index relies on. A confound check confirms it holds at ~0.83 ROC-AUC on weather/drought features *with the calendar removed*, so it reads conditions, not just "it's summer."

### Addressing the over-flag (v2)

The first version was **weather-only** and trained **exclusively on fire-prone locations**, so it over-flagged low-fire places: a cool, windy, low-drought spring day in **dense-urban Chicago** scored **76th percentile ("high")** purely on the dry-spell-plus-wind pattern, with nothing to encode "there's no wildland fuel here." v2 fixes this at the source with two changes:

1. **A land-cover feature with developed intensity split** — collapsing NLCD developed classes 21–24 into one "developed" bucket hid that dense-urban (24) is only **0.6%** of fire days while grassy open-space developed (21) is **5.3%**. Splitting them lets the model separate downtown from parks.
2. **Background negatives from non-fire locations** — so "developed/urban" is no longer always a fire location, and the model can learn it ignites less.

Result: **Chicago drops 76 → 61 (now "moderate")** for that scenario, while genuinely fire-prone **Phoenix stays high (80)** — the model now distinguishes "no fuel" from real fire weather. Overall discrimination held (ROC-AUC 0.834 → 0.840). The residual elevation is partly *real* (developed areas do see human-caused ignitions), and the two-stage composite further tempers it at the headline (see [DECISIONS §6](DECISIONS.md)).

## Serving

- **Training/serving parity:** live features are computed by the same `summarize_window_with_kbdi` function used in training, from the same Open-Meteo archive source.
- The raw probability is mapped to a **percentile** against the training-score distribution, so the UI shows a relative index.
- **Graceful degradation:** returns `null` (UI hides the card) if the model or upstream weather is unavailable.

## Intended use & interpretation

- A **relative likelihood index**, not an absolute "% chance of a fire today" — it's calibrated to the training set's prevalence, so it answers *how fire-start-like are these conditions* relative to history.
- Conditions are sourced from the Open-Meteo archive, which **lags ~6 days** (surfaced as the `as_of` date).
- Informational only — not an emergency or operational tool (see the app disclaimer).

## Reproduce

```
python scripts/build_background_negatives.py     # non-fire background negatives (quota-limited; resumes)
python scripts/build_ignition_dataset.py        # dataset (fire + background, land-cover enriched)
python scripts/train_ignition_model.py          # baseline + GBM + spatial-CV scores
python scripts/evaluate_ignition_model.py        # calibration + ROC/reliability chart
python scripts/temporal_validation.py            # out-of-time holdout (train<2010, test>=2010)
python scripts/interpret_ignition_model.py       # permutation importance + regional map
python scripts/train_final_ignition_model.py     # final calibrated artifact -> api/models/
```
