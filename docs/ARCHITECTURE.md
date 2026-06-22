# Architecture

A technical reference for how the scoring works. The [README](../README.md) is the overview.

Source of truth: [api/core/risk_algorithm.py](../api/core/risk_algorithm.py) (the fire-weather index) and [web/lib/composite-risk.ts](../web/lib/composite-risk.ts) (the overall-risk composite).

> A note on version numbers. The fire-weather index went through several revisions during development. "V1" was the original linear blend; the current fitted multiplicative index is "V4" in a few filenames (`fit_v4_params.py`, `v4_validation.png`). The prose just calls it the fire-weather index.

---

## The fire-weather index

A rule-based index that grades the local environment for fire ignition and growth on a 0–1 scale. Three weather factors combine multiplicatively, then a vegetation factor scales the result:

```
score = (vpd^0.45 × wind^0.43 × drought^0.12) × vegetation_factor
```

- **VPD:** vapor pressure deficit from temperature and humidity (Tetens/Magnus). The dominant driver.
- **Wind:** sustained 10-minute speed, saturating at a ~32 mph plateau, with a floor near 0.05 so calm days still register.
- **Drought:** the Keetch-Byram Drought Index (KBDI, 0–800), a soil-moisture-deficit metric computed daily from a 365-day precipitation and evapotranspiration window (Open-Meteo), keyed to a 0.1° grid cell so neighbors share one cached compute. Floored near 0.28 so days after rain still register.
- **Vegetation:** an NDVI *anomaly*, meaning current greenness minus the 3-year same-month normal over a 1 km buffer (ESA Sentinel-2 via Copernicus). Below normal raises the multiplier, above normal lowers it. When a cloud-blocked pass leaves NDVI unavailable, it falls back to a calendar season factor (winter 0.40, spring 0.80, summer 1.00, fall 0.90).

The exponents, saturation scales, and floors live in a `RiskParams` dataclass and are fitted against historical fires (see [Validation](#validation)).

## Per-state calibration

The raw 0–1 score is bucketed into LOW / MODERATE / HIGH / EXTREME. The bucket boundaries are calibrated per state. Each state's bands are pegged to the 50th / 75th / 97th percentiles of its own historical fire-day scores, so the same raw score can land at EXTREME in one state and HIGH in another.

17 states are fitted (the West, the Southeast belt, plus TX/OK), covering the highest-fire-risk regions; the rest fall back to global cutoffs of 0.3 / 0.6 / 0.8. The state is resolved at request time by the US Census reverse-geocoder, which is accurate even at border points like Reno, NV that a bounding-box heuristic would misclassify. Source data is the FPA-FOD database (~1.88M wildfires, 1992–2015), with about 500 fire-days sampled per state (roughly 8,500 across the 17). This per-state sample is separate from the frozen 500-fire benchmark used in [Validation](#validation).

![Per-state regional thresholds](regional_thresholds.png)

## Validation

The constants are fitted to maximize Spearman ρ(score, log fire size) on a 70/30 train split, and the result is reported on the held-out test split. Fitting lifts the test ρ from +0.26 (the original hand-picked constants) to **+0.32**, ahead of the raw Hot-Dry-Windy Index (+0.30) and Fosberg FFWI (+0.28) on the same fires. Only the weather-driver constants are fit; the vegetation factor and the season multipliers are held fixed, since the hindcast can't replay historical Sentinel-2. This frozen 500-fire benchmark is the validation set, distinct from the per-state calibration sample; it lives in a CSV so fitting and chart regeneration run offline and reproducibly.

Mean score rises monotonically with fire size, with non-overlapping 95% confidence intervals between the smallest and largest fire bins. The index assigns higher fire-weather severity to days that produced large fires, using only the weather inputs.

![Fire-weather index validated against the frozen benchmark](v4_validation.png)

![Fitted index vs. published indices](v4_benchmark.png)

**The drought floor.** The unconstrained fit drove the KBDI exponent toward 0.03, nearly removing it: fire *size* is dominated by spread (wind) and evaporative demand (VPD), and the hindcast correlates against size. A 0.03 weight would make the KBDI integrator cosmetic, so the exponent is floored at 0.12 to keep all three factors load-bearing, at a cost of +0.006 ρ — a deliberate choice to favor a defensible model over the last decimal of fit. The fitted exponent comes to rest exactly on the 0.12 floor, which tells us the unconstrained optimum would have been lower still.

## The ignition model

A separate gradient-boosted classifier (`HistGradientBoostingClassifier`) for a different question: do a day's conditions resemble the days fires actually start? It predicts fire *occurrence*, where the rule-based index scores *severity*. It is served at `/ignition` as a calibrated percentile and shown next to the fire-weather tier on Status.

- **Features:** dryness (VPD, humidity, temperature), drought (KBDI and days since rain), wind, time of year, and an NLCD land-cover class with a developed-intensity split. Latitude and longitude are excluded, so the model keys on conditions and fuel; it can't simply memorize where fires have happened.
- **Training data:** 32,382 examples. The 4,897 positives are real fire-ignition days (FPA-FOD + Open-Meteo); the negatives are "typical day" rows, drawn both from those same fire locations and from 3,000 non-fire background locations (`scripts/build_ignition_dataset.py`).
- **Evaluation:** leakage-safe spatial-block cross-validation against a logistic baseline gives **ROC-AUC 0.84** and PR-AUC 0.488 (no-skill baseline 0.151), isotonic-calibrated (Brier 0.163 to 0.100). A separate out-of-time test (train before 2010, test 2010–2015) holds at ROC-AUC 0.83, so a 6-year forward gap barely moves it (`scripts/temporal_validation.py`).
- **Cross-check:** permutation importance ranks VPD and KBDI on top, the same drivers the rule-based index uses.
- **Land-cover fix (v2):** the land-cover feature plus the background negatives correct v1's over-flagging of low-fuel cities. A cool, windy spring day in dense-urban Chicago drops from the 76th percentile to the 61st, while dry Phoenix stays high. See the [model card](ignition_model_card.md#addressing-the-over-flag-v2).

![Ignition model: ROC and reliability](ignition_eval.png)

## The overall-risk composite

The headline tier on Status (the user's *overall risk*) comes from two lookup matrices in series. An earlier version ran `bucketOf(0.45·W + 0.55·T)`, but those two weights existed only to cap weather-alone risk below EXTREME and were never fitted to anything, so every cell of the decision space hung on two arbitrary coefficients. A matrix lets each cell be set on its own merits and stay individually inspectable.

**Stage 1 — environment.** Fire-weather severity `W` and ignition likelihood `I` are both weather-driven, so they fuse multiplicatively into one environmental-danger tier `E = ENV[W][I]`, which reads as consequence × likelihood:

| **fire weather ↓ · ignition →** | **low** | **moderate** | **high** | **extreme** |
|:---|:---:|:---:|:---:|:---:|
| **low** | 🟢 LOW | 🟢 LOW | 🟡 MOD | 🟡 MOD |
| **moderate** | 🟢 LOW | 🟡 MOD | 🟡 MOD | 🟠 HIGH |
| **high** | 🟡 MOD | 🟡 MOD | 🟠 HIGH | 🟠 HIGH |
| **extreme** | 🟡 MOD | 🟠 HIGH | 🟠 HIGH | 🔴 EXT |

Because Stage 1 is multiplicative, a high ignition reading on a low-severity day (a cool, windy day in a dense city) can only reach moderate `E`. When `I` is unavailable, `E = W` and the headline falls back to `COMPOSITE[W][T]`.

**Stage 2 — headline.** The environment tier meets the active-fire threat `T` through a 4×5 matrix:

| **environment ↓ · active-fire threat →** | **none** | **low** | **moderate** | **high** | **extreme** |
|:---|:---:|:---:|:---:|:---:|:---:|
| **low** | 🟢 LOW | 🟢 LOW | 🟢 LOW | 🟡 MOD | 🟠 HIGH |
| **moderate** | 🟢 LOW | 🟡 MOD | 🟡 MOD | 🟠 HIGH | 🟠 HIGH |
| **high** | 🟡 MOD | 🟡 MOD | 🟠 HIGH | 🟠 HIGH | 🔴 EXT |
| **extreme** | 🟡 MOD | 🟠 HIGH | 🟠 HIGH | 🔴 EXT | 🔴 EXT |

**The threat axis.** Per-fire threat multiplies a distance factor by a size factor, so a fire is threatening only when it is both close and large. An earlier version OR-combined the two, which let a large fire 30 mi away read EXTREME on size alone; multiplying requires both, so that same fire now reads LOW.

```
base = exp(−d/τ)·taper(d) × [floor + (1 − floor)·acres/(acres + K)]
```

with τ = 21 mi, floor = 0.70, K = 300 ac. Hill saturation on size has no hard ceiling, so a megafire still separates from a merely-large fire; a FIRMS pixel of unknown size takes size-factor 1.0, staying distance-only. Smooth multiplicative modifiers then apply for wind alignment (×1.20 blowing toward the user down to ×0.80 away, eased by the cosine of the angle), containment (toward ×0.6 past ~75%), and detection age (toward ×0.6 past ~24 h). The 50 mi eligibility edge tapers smoothly between 46 and 50 mi. Threat is aggregated across every fire within range.

## Trajectory

A 6-hour fire-weather projection, surfaced as a RISING / STEADY / FALLING chip and an interactive phase-space graph (time × fire-weather). It projects the score forward hour by hour from Open-Meteo's forecast, then anchors the curve to the Status orb's current score: absolute level comes from OpenWeatherMap so the graph agrees with the cards, and the hour-to-hour deltas come from Open-Meteo. See [api/core/trajectory.py](../api/core/trajectory.py).

---

For limitations and planned work, see the README's [Honest gaps](../README.md#honest-gaps) and [Roadmap](../README.md#roadmap).
