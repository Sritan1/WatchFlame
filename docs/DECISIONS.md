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

## 2. Multiplicative VPD × wind × drought, with fitted exponents

**Decision.** The fire-weather raw score is the multiplicative product of three factors with log-space exponents that sum to 1.0:

```
raw = vpd_factor^0.45 × wind_factor^0.43 × drought_factor^0.12
```

The exponents, the VPD/wind saturation scales, and the floors are **fit, not hand-picked** — they live in a `RiskParams` dataclass in [api/core/risk_algorithm.py](../api/core/risk_algorithm.py) and were fit against a 500-fire FPA-FOD hindcast ([scripts/fit_v4_params.py](../scripts/fit_v4_params.py)).

**Why multiplicative.** Multiplicative combination captures the well-established "hot AND dry AND windy" non-linearity — any single mild input pulls the whole score down. This mirrors the structure of the Fosberg Fire Weather Index (Goodrick 2002), the Hot-Dry-Windy Index (Srock et al. 2018), and the Australian McArthur FFDI. Linear/weighted-sum combination (V1's original approach) effectively treats high wind as a substitute for high VPD, which the physics doesn't support — a high wind without dry air doesn't make a wet day combustible.

**Why fit.** The original exponents (0.5 / 0.3 / 0.2) were "defensible defaults." Fitting them against real fire outcomes turns a guess into a measurement: a coordinate search maximizing Spearman ρ(score, log fire size) on a 70/30 train split lifts the held-out **test ρ from +0.26 to +0.32**, which **edges out the raw Hot-Dry-Windy Index (+0.30) and Fosberg FFWI (+0.28) on the same fires**. Only the weather-driver constants are fit; the NDVI/vegetation factor and the calendar season multipliers are held fixed (the hindcast can't replay historical Sentinel-2, and season is a sampling proxy, not a weather driver).

**The honest part — drought was floored on purpose.** The *unconstrained* fit drove the drought (KBDI) exponent to ~0.03, nearly eliminating it. That's a real empirical signal: fire **size** is dominated by spread (wind) and evaporative demand (VPD), whereas drought governs *ignition* more than final size, and the hindcast correlates against size. But a ~0.03 drought weight would make the KBDI integrator (a genuine engineering investment) cosmetic and shift the index to effectively VPD × wind. So the exponents are constrained to a 0.12 floor, keeping all three factors load-bearing — at a cost of only **+0.006 ρ** versus the degenerate solution. The fit landing exactly on that floor is the tell that the data wanted it lower; this is a deliberate science-vs-overfit tradeoff, not an accident.

**Cost.** Multiplicative formulas collapse to zero on any one calm/wet input. Mitigated with fitted floors on wind (~0.05) and drought (~0.28) — fires still happen on calm days and after rain, and the floors prevent the formula from declaring otherwise. Re-fitting requires re-running the per-state calibration (§3), since its percentile cutoffs are derived from the score distribution the constants produce.

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
4. **Fast iteration.** Tunables are named fields on a `RiskParams` dataclass, not retrained models. Re-fitting them (§2) is a coordinate search over a frozen CSV that runs in seconds offline; the equivalent in a learned model requires re-training, validation, and deployment.
5. **Deployment simplicity.** No model serving, no versioning, no inference latency. Stateless functions in a Python module.

NFDRS, CFFWI, McArthur FFDI, and the European EFFIS are all rule-based, for variants of these reasons.

**Where ML would actually help.** Per-fire severity prediction conditional on weather + fuel state + topography (a labeled problem); fuel-state inference from Sentinel-2 imagery (NDVI is a weak proxy for actual fuel load); smoke-plume forecasting. Those are different problems than what this score tries to answer.

---

## 6. From political weights to a published tier matrix

**Decision.** The headline tier on Status comes from a `(weather_tier, threat_tier) → headline_tier` lookup matrix, not from `bucketOf(0.45 × W + 0.55 × T)`. See `COMPOSITE_MATRIX` in [web/lib/composite-risk.ts](../web/lib/composite-risk.ts).

```
                T=none     T=low      T=mod      T=high     T=ext
W=low           LOW        LOW        LOW        MOD        HIGH
W=mod           LOW        MOD        MOD        HIGH       HIGH
W=high          MOD        MOD        HIGH       HIGH       EXT
W=ext           MOD        HIGH       HIGH       EXT        EXT
```

**Why.** The earlier version used `0.45 × W + 0.55 × T` and bucketed the result by quartile. The weights were chosen for one reason — *"weather alone caps at 0.45, so the headline never escalates to EXTREME from environment alone"* — and were not fitted to anything. That made every cell of the implied decision space derived through two arbitrary coefficients instead of being argued on its own merits. The matrix encodes each cell's intent directly: `W=ext × T=none → MOD` is the same "don't cry wolf on hot dry days without an active fire" constraint, now visible and editable as a single cell. Cells on the corners agree with the prior linear blend (e.g. `W=ext × T=ext → EXT` both ways); cells in the middle now reflect operational intent rather than arithmetic accident (e.g. `W=high × T=mod` is now HIGH instead of the linear blend's ~0.48 → MOD).

**Cost.** The composite-as-a-single-number disappears as a tier source — there's no longer one scalar that summarizes the whole picture. The orb's arc fill still uses the linear blend as a visual position cue (so the orb moves continuously as inputs change), but that number is decorative; the tier label is authoritative. In a handful of edge cells the arc position and the tier color can visually disagree by one band — acceptable since users read the tier label, not the precise arc position.

**Where it could go.** The 4×4 grid still produces only 4 output tiers (LOW / MOD / HIGH / EXT). A 5-state action vocabulary (STAND DOWN / STANDBY / AWARE / WATCH / ACTION) would map decisions to behaviors instead of adjectives — the same change operational systems like NWS Storm Prediction Center make when they cascade Fire Weather Watch → Red Flag Warning. Out of scope for this revision; would touch the orb palette, headline copy, Safety banner styling, and the calibration ladder color scheme simultaneously.

---

## 7. Threat = distance × size, multiplicative with Hill saturation

**Decision.** Per-fire threat multiplies a distance factor by a size factor (it was previously OR-combined):

```
base = exp(−d/τ)·taper(d) × [floor + (1 − floor)·acres/(acres + K)]
```

with τ = 21 mi, floor = 0.70, K = 300 ac. A fire is threatening only if it is *both* close AND large. A FIRMS pixel (size unknown) takes size-factor 1.0, so it stays distance-only — preserving the satellite path's long-standing behavior. See [web/lib/composite-risk.ts](../web/lib/composite-risk.ts).

**Why.** The earlier form OR-combined the two factors (`base = 1 − (1 − dist)(1 − size)`), which let *either* one saturate the score on its own. With `size = clamp((acres − 50)/4,950)`, a 5,000-acre fire 30 mi away produced `size = 1.0` → `base = 1.0` (EXTREME) regardless of distance — not credible; that's a smoke/ember risk, not run-now. Multiplicative combination encodes the right physics: the same fire now scores `exp(−30/21) × ~0.98 ≈ 0.24` (LOW). Hill saturation on size has no hard ceiling, so a 50,000-ac megafire still separates from a merely-large fire.

**Cost.** Size now matters at every range, so a known *small* fire reads lower than before even when close (a 50-ac fire 0.5 mi away is HIGH, not EXT). The `[floor, 1]` size band (0.70–1.0) keeps distance the dominant axis so the de-escalation stays modest, but it is deliberate and visible — overall threat reads gentler across the board, correcting the old formula's over-alarming.

**Where it could go.** Replace the FIRMS size-factor (a flat 1.0) with a typical-detection prior; weight by structures-threatened, not just acreage.

---

## 8. Smoothed threat cliffs (distance, containment, staleness, wind)

**Decision.** The four operational boundaries in the per-fire threat are now continuous transitions instead of hard steps. See [web/lib/composite-risk.ts](../web/lib/composite-risk.ts):

- **50 mi eligibility** — the distance factor tapers smoothly to 0 between 46 and 50 mi (smoothstep), so a fire crossing the boundary fades out rather than dropping off a cliff. Fires past 50 mi are still skipped for loop tightness, but contribute ~0 by then anyway.
- **75% containment** — a logistic ramp from ×1.0 (uncontained) toward ×0.6, centered at 75%, instead of a step at exactly 75%.
- **24 hr FIRMS staleness** — a logistic ramp from ×1.0 (fresh) toward ×0.6, centered at 24 hr. The per-fire function now takes the detection's *age in hours* rather than a stale boolean.
- **±30° wind cone** — the wind bump scales as `WIND_BUMP × cos(angle)`: +0.15 blowing toward, 0 at crosswind, −0.15 away. No cone edges.

**Why.** A fire at 49.9 vs 50.1 mi, or 74% vs 76% contained, used to flip the user's status discontinuously — the kind of knife-edge that erodes trust in a score. It's the same artifact the V4 *fire-weather* index already removed for wind via a power law; this brings the *threat* side to parity.

**Cost.** The smooth ramps engage a little earlier (a 60%-contained fire gets a small damp; a 12 hr-old detection a slight one) — arguably more honest, but it does lower some mid-range threats. The ramp widths are hand-chosen, not fit: unlike fire weather, there's no labeled personal-threat outcome dataset to calibrate against.

**Where it could go.** Fit the ramp widths and the size floor/K against a labeled proximity-outcome set if one becomes available; until then they're defensible defaults.

---

## What this document is not

This isn't a critique of the work — it's an inventory of choices made on purpose, with the costs explicitly named so future-me (or anyone interviewing me on this project) can see that the costs were considered, not missed. Several of the "Where it could go" sections are on the deferred-work list because the current behavior is good enough for a portfolio system that exposes its own seams.

For a more comprehensive limitations + roadmap, see the [Honest gaps section of the README](../README.md#honest-gaps).
