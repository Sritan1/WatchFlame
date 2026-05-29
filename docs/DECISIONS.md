# Design decisions

These are the eight choices that shaped the algorithm and the scoring architecture most. Each entry names the decision, why it was made, what it costs, and (where applicable) what would replace it in a production version of this system. Not a complete inventory of every design call — just the load-bearing ones that come up in conversations about the project.

For the full mathematical formulation see the [risk algorithm section in the README](../README.md#the-risk-algorithm) and [api/core/risk_algorithm.py](../api/core/risk_algorithm.py). For the personal-threat composite (which combines fire weather with active-fire proximity), see [web/lib/composite-risk.ts](../web/lib/composite-risk.ts).

---

## 1. Two-axis decomposition: Environment vs Threat

**Decision.** The user-facing personal-risk number is computed from two orthogonal inputs — environmental fire weather (`W`) and active-fire proximity (`T`) — that stay visible as separate component scores throughout the UI rather than getting collapsed at the source.

**Why.** Conflating "the air is dangerous" and "a fire is close" hides which signal is driving the decision. The Forest Service's NFDRS, the Canadian CFFWI, and the Australian McArthur FFDI all keep their component scores separately exposed for the same reason. A user near an active fire on a calm humid day faces different choices than a user in extreme fire weather with no nearby fire — collapsing both situations to one number erases information the user actually needs.

**Cost.** Two component scores require two explanations and two visualizations. UX has to surface both meaningfully rather than reduce to a single headline.

**Where it could go.** A third axis — Trajectory: short-term forecast deltas in VPD, wind, and RH — is the obvious next addition. Real fire forecasts model trajectory; this system currently only knows "now."

---

## 2. Multiplicative VPD × wind × drought

**Decision.** The fire-weather raw score is the multiplicative product of three factors with log-space exponents that sum to 1.0:

```
raw = vpd_factor^0.5 × wind_factor^0.3 × drought_factor^0.2
```

See [api/core/risk_algorithm.py](../api/core/risk_algorithm.py).

**Why.** Multiplicative combination captures the well-established "hot AND dry AND windy" non-linearity — any single mild input pulls the whole score down. This mirrors the structure of the Fosberg Fire Weather Index (Goodrick 2002), the Hot-Dry-Windy Index (Srock et al. 2018), and the Australian McArthur FFDI. Linear/weighted-sum combination (V1's original approach) effectively treats high wind as a substitute for high VPD, which the physics doesn't support — a high wind without dry air doesn't make a wet day combustible.

**Cost.** Multiplicative formulas collapse to zero on any one calm/wet input. Mitigated with empirical floors on wind (0.2) and drought (0.1) — fires still happen on calm days and after rain, and the floors prevent the formula from declaring otherwise.

---

## 3. Regional percentile calibration

**Decision.** Tier boundaries (LOW / MOD / HIGH / EXT) are fitted per state from historical fire-day score distributions rather than set globally. Per-state 50th / 75th / 97th percentiles of fire-day V4 scores become the bucket boundaries. 17 states fitted; the rest fall back to global cutoffs of 0.3 / 0.6 / 0.8. See [api/data/regional_thresholds.json](../api/data/regional_thresholds.json) and [scripts/build_regional_thresholds.py](../scripts/build_regional_thresholds.py).

**Why.** A score of 0.55 in Florida (humid) is a high fire-risk day; the same 0.55 in Arizona (dry) is routine. A single global threshold would consistently understate risk in fire-prone states and overstate it in wetter ones. NFDRS, McArthur FFDI, and the European EFFIS all use regionally-fitted cutoffs for this reason. Source data: USDA's FPA-FOD database (~1.88M wildfires 1992–2015).

**Cost.** Only 17 states fitted, covering the highest-fire-risk regions (the West + Southeast belt + TX/OK). Outside those, users fall back to global cutoffs and lose the regional precision. The 97th-percentile cutoff is statistically fragile per state — ~500 calibrated fire days means roughly 15 data points in the EXT tail, so bootstrap CIs would be meaningfully wide.

**Where it could go.** Weight fire days by severity (acres burned, structures lost — both fields exist in FPA-FOD) so calibration reflects consequential fire days, not all fire days. Surface bootstrap confidence intervals on each cutoff in the UI to communicate the underlying uncertainty.

---

## 4. NDVI anomaly over raw NDVI

**Decision.** The vegetation multiplier on the live data path uses NDVI *anomaly* (current value minus the 3-year same-month average for the cell), not raw NDVI. Sign convention: negative anomaly → drier than normal → higher risk multiplier. See [api/core/ndvi.py](../api/core/ndvi.py).

**Why.** Raw NDVI is mostly biome detection. The Pacific Northwest is always ~0.8; the Arizona desert always ~0.2. That's a constant, not a fire-risk signal. Anomaly is biome-agnostic and captures fire-relevant deviation from local norm — which is the variable USFS WFAS and similar operational fuel-state systems actually use. Data source: ESA Sentinel-2 via the Copernicus Data Space Ecosystem, 1 km buffer around the user's coordinate.

**Cost.** Cloud-blocked satellite passes leave the anomaly unavailable; the algorithm then falls back to a calendar-based season multiplier (winter 0.4 / spring 0.8 / summer 1.0 / fall 0.9). The fallback is silent — the user can't tell from the score whether they got the satellite-derived value or the coarser proxy without opening the calibration modal. A future revision should surface a confidence indicator that exposes this directly.

---

## 5. No machine learning

**Decision.** The algorithm is entirely rule-based. No learned weights, no neural networks, no gradient-boosted classifiers, no embeddings. Every output is a deterministic function of inputs through formulas published in peer-reviewed fire-science literature.

**Why.** For this product specifically, rule-based wins on five axes that matter:

1. **Explainability.** Any user can trace a score back to its inputs through the formula. The Risk Calculator screen literally lets them move the inputs and watch the output change.
2. **No training drift.** The formula is stable across years. A model trained on 2015 fire data would already be stale.
3. **No labeling problem.** Fire occurrence is sparse, confounded by ignition source (lightning vs human), and the "would there have been a fire if conditions were like X" counterfactual is unanswerable from the data.
4. **Fast iteration.** Tunables are named constants, not retrained models. Changing the V4 wind exponent from 0.3 to 0.35 is a one-line edit; the equivalent in a learned model requires re-training, validation, and deployment.
5. **Deployment simplicity.** No model serving, no versioning, no inference latency. Stateless functions in a Python module.

NFDRS, CFFWI, McArthur FFDI, and the European EFFIS are all rule-based, for variants of these reasons.

**Where ML would actually help.** Per-fire severity prediction conditional on weather + fuel state + topography (a labeled problem); fuel-state inference from Sentinel-2 imagery (NDVI is a weak proxy for actual fuel load); smoke-plume forecasting. Those are different problems than what this score tries to answer.

---

## 6. The composite weights (0.45 weather + 0.55 threat) are a political knob

**Decision.** The Personal Threat composite combines environment and active-fire threat as `composite = 0.45 × W + 0.55 × T`. See [web/lib/composite-risk.ts](../web/lib/composite-risk.ts).

**Why.** The weights were chosen so that "dangerous weather, no active fire" caps at 0.45 — mid-MODERATE on the composite — and the headline never escalates to EXTREME from environment alone. This is a design constraint about not crying wolf on a hot dry day with no nearby fire, not an empirical derivation. The 0.55/0.45 split is not fitted to anything.

**Cost.** The composite collapses operationally-different situations to the same number. A `composite = 0.50` (HIGH bucket boundary) can be reached by `W=0, T=0.91` (close fire, no environmental risk) or `W=0.55, T=0.46` (mid-tier weather, weak threat). Those situations warrant different actions, but the composite tier doesn't differentiate.

**Where it could go.** Replace the linear combination with a `(W_tier, T_tier) → headline_tier` lookup matrix. The matrix is explainable cell-by-cell ("we set the W=EXTREME, T=NONE cell to AWARE because environment-alone shouldn't push to WATCH") and lives in one published table, not split across two coefficients that need to be defended individually. This is the single highest-impact algorithmic improvement on the deferred list.

---

## 7. The threat formula treats distance and size as OR-combined

**Decision.** Per-fire threat is computed as `base = 1 − (1 − dist) × (1 − size)`, where each factor lives in [0, 1]. Probabilistic OR — either factor approaching 1.0 pulls the result toward 1.0 even when the other is small.

**Why.** Intent was "a very close fire OR a very large fire is a threat, regardless of the other." Distance decay alone misses a 5,000-acre wildfire 30 mi away; size alone misses a 50-acre flare-up 0.1 mi from the user. OR-combination encodes "either condition alone is sufficient."

**Cost.** Saturates too aggressively. With `size = clamp((acres − 50) / 4,950)`, a 5,000-acre fire at 30 mi produces `size = 1.0`, which OR-combines with `dist = exp(−30/21) = 0.24` to give `base = 1.0` — regardless of containment. That's not credible. A 5,000-acre fire 30 mi away is a smoke and ember-shower risk, not a run-now situation.

**Where it could go.** Multiplicative combination with Hill saturation on size:

```
threat = exp(−d/τ) × (acres / (acres + K))^p
```

A 5,000-acre fire at 30 mi then gets roughly `0.24 × 0.95 ≈ 0.23`, properly small. Multiplicative form encodes the right physics — a fire is threatening if it is *both* close AND large — and the Hill saturation removes the hard ceiling at 5,000 acres so a 50,000-ac megafire keeps differentiating.

---

## 8. Hard 50 mi cutoff on threat eligibility

**Decision.** Fires beyond `THREAT_RADIUS_MI = 50` are excluded from the threat aggregation. See [web/lib/composite-risk.ts](../web/lib/composite-risk.ts).

**Why.** With distance decay `exp(−d/21)`, a fire at 50 mi contributes `< 0.10` to the OR — below the level that meaningfully shifts the user's bucket. The cutoff also matches operational evacuation-zone thinking: 50 mi is roughly the outer ring of regional smoke advisories and the upper end of where most counties would issue evacuation guidance. Cutting off there keeps the per-render aggregation loop tight.

**Cost.** Hard cliff at exactly 50 mi. A fire at 49.9 mi is in; at 50.1 mi is out. The user's status changes catastrophically based on whether the fire moved 1/4 mile — exactly the kind of discontinuous behavior that erodes trust in scores. Same shape of bug appears at three other operational boundaries in the threat formula (75% containment, 24 hr FIRMS staleness, ±30° wind cone).

**Where it could go.** Drop the cutoff entirely; let the exponential decay handle attenuation naturally. The cost is `O(n)` per render where `n` includes all fires in the upstream feed instead of the 50 mi subset, but in practice the upstream is already bbox-filtered to ~250 mi anyway. All four cliffs should be smoothed in the same pass — once the smoothing rule is written, the change is mechanical.

---

## What this document is not

This isn't a critique of the work — it's an inventory of choices made on purpose, with the costs explicitly named so future-me (or anyone interviewing me on this project) can see that the costs were considered, not missed. Several of the "Where it could go" sections are on the deferred-work list because the current behavior is good enough for a portfolio system that exposes its own seams.

For a more comprehensive limitations + roadmap, see the [Honest gaps section of the README](../README.md#honest-gaps).
