# Ember Watch

[![Architecture](https://img.shields.io/badge/docs-architecture-FF7A3A?style=flat-square)](docs/ARCHITECTURE.md) [![License: MIT](https://img.shields.io/badge/license-MIT-555?style=flat-square)](LICENSE)

A wildfire-awareness web app for the US. Type in a location and it tells you the current fire risk there, the active fires near you, and where you could go if you had to leave. It pulls live satellite, weather, and vegetation data to do this.

Wildfire information is scattered. Red-flag bulletins live in one place, raw satellite feeds in another, and shelter lists somewhere else. They rarely line up. Ember Watch puts them together. One location gives you a risk tier, the fires nearby, and a basic safety plan.

> The app is **Ember Watch**. The repository is `wildfire-app`. The frontend is a Next.js web app (`web/`). The backend is a typed FastAPI service (`api/`).

## Highlights

- **The fire-weather index is fitted to real fires.** Spearman ρ **+0.32**, ahead of Hot-Dry-Windy (+0.30) and Fosberg (+0.28) on the same fires. [Details](#3-validation)
- **Machine-learning ignition model.** ROC-AUC **0.84**, spatially cross-validated and probability-calibrated. [Details](#a-learned-second-opinion-ignition-likelihood)
- **Per-state calibration across 17 states.** The same score reads as a different tier depending on your state's fire history. [Details](#2-per-state-calibration)
- **Handles upstream outages.** Every external feed degrades gracefully. Plus 153 backend tests and a Python-to-TypeScript scorer-parity test. [Details](#testing)

---

## Table of contents

- [What it does](#what-it-does)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [The fire-weather model](#the-fire-weather-model)
- [A learned second opinion: ignition likelihood](#a-learned-second-opinion-ignition-likelihood)
- [The overall-risk composite](#the-overall-risk-composite)
- [Full technical detail & design decisions](docs/ARCHITECTURE.md) (external)
- [Data sources](#data-sources)
- [Run locally](#run-locally)
- [Project layout](#project-layout)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Disclaimer](#disclaimer)
- [Credits & license](#credits--license)

---

## What it does

The app has five screens. Each one runs on the same backend and the same calibrated algorithm.

**Status.** A live risk tier for your location. It comes from three independent signals:

- **Fire weather:** the calibration-aware index (VPD × wind × KBDI drought × NDVI vegetation anomaly), graded against your state's own fire history.
- **Ignition likelihood:** a machine-learning model's read on how much today's conditions resemble the days fires have actually started.
- **Active-fire threat:** proximity, size, wind alignment, containment, and detection age of any fire within 50 mi.

These don't get averaged together. They run through two lookup matrices in series. Fire weather and ignition likelihood combine first into an environmental-danger tier. That tier then meets the active-fire threat to set the headline. Four tap-to-open modals show the math:

- a **calibration ladder** showing where your score lands across all 17 fitted states,
- a two-stage **"Why this score?"** matrix explainer,
- an **ignition-model** explainer,
- a **confidence breakdown** rating the freshness of every upstream signal.

Also on screen: drought (KBDI), live vegetation stress (NDVI), a 6-hour fire-weather trajectory, nearby fires, and a FEMA advisory when one is active.

**Live Map.** NASA FIRMS satellite detections plus named incidents from NIFC and Cal Fire, sized by acreage and tinted by fire-weather risk. Zoom-aware hit testing, click-to-inspect, and one rail with two tabs: named incidents and browsable satellite detections.

**Fire-Weather What-If.** A slider sandbox over temperature, humidity, wind, KBDI, and vegetation. It runs the validated fire-weather index. This is the environment axis of the Status composite, not a standalone risk score. You can simulate any conditions, watch each factor move the score, and see where that score lands across the 17 calibrated states. It works fully offline. No GPS, no keys.

**Safety Plan.** Open shelters from the live **FEMA National Shelter System**, with status and capacity. Plus potential evacuation points from OpenStreetMap and the NCES school database, sorted by distance. There's a direction-of-evacuation cue, an evacuation checklist that scales with risk, and a maps hand-off for directions.

**Settings.** Three dark themes, unit preferences (all browser-local, no account), a full disclaimer, dedicated Terms / Privacy / Accessibility pages, and the full data-source attribution.

Plus **saved locations** (Home / Work, swappable from the rail) and a per-incident **Fire Detail** page. The whole web app is **responsive on mobile** and built to **WCAG 2.1 AA** (contrast, focus management, chart text alternatives).

---

## Screenshots

<!-- Drop UI captures here. Suggested set:
     1. Status hero — orb + headline + confidence chip + trajectory chip
     2. Live Map — markers + incident rail open
     3. Fire-Weather What-If — sliders + score gauge
     4. Safety Plan — open shelter tile + checklist
     5. "Why this score?" matrix modal -->

_App UI captures are kept out of version control. The validation figures below are generated from the committed pipeline._

---

## Architecture

```
                    ┌───────────────────────────────────┐
                    │   Web app · Next.js (web/)         │
                    │   Status · Live Map · What-If ·    │
                    │   Safety · Settings                │
                    └──────────────────┬────────────────┘
                                       │ TanStack Query · HTTPS
                                       ▼
                    ┌───────────────────────────────────┐
                    │      FastAPI backend (uvicorn)     │
                    │  /healthz /fires /risk /weather    │
                    │  /ignition /trajectory /geocode    │
                    │  /shelters /incidents/near         │
                    │  /disasters/near /risk/calibration │
                    └──────────────────┬────────────────┘
                                       │ async fan-out (httpx),
                                       │ graceful degradation per upstream
                                       ▼
        ┌──────────────────────────────────────────────────────────┐
        │ FIRMS · OWM · Open-Meteo · Copernicus · Census · NIFC ·   │
        │ Cal Fire · FEMA · OpenStreetMap · NCES · NLCD             │
        └──────────────────────────────────────────────────────────┘
```

**Frontend (`web/`).** Next.js 16 (App Router) + React + TypeScript (strict), Tailwind v4, TanStack Query, react-leaflet on MapTiler tiles, with custom canvas/SVG rendering for the hero orb, phase-space graph, and animated backgrounds. The composite math lives in pure, testable functions ([`web/lib/composite-risk.ts`](web/lib/composite-risk.ts)).

**Backend (`api/`).** FastAPI on Python 3.11+ (3.14 in development), async `httpx`, pydantic v2. The fire-weather index is a transparent, rule-based core (no ML, by design), complemented by a separate scikit-learn ignition model trained offline and served from a committed artifact. There is JSON-on-disk caching for NDVI (per-coordinate, with separate TTLs for current vs. climatology) and in-memory caching for the live feeds.

**Design principle: graceful degradation everywhere.** When an upstream returns 4xx/5xx/timeout, the route logs once and returns an empty or null payload instead of failing the request. Every feature has a fallback: regional calibration falls back to global cutoffs, NDVI to a calendar season factor, KBDI to a days-since-rain proxy, and open shelters to candidate locations. The Fire-Weather What-If runs with no GPS and no keys at all.

Full technical detail and the load-bearing design decisions (with their costs) live in [ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## The fire-weather model

A rule-based fire-weather index in [`api/core/risk_algorithm.py`](api/core/risk_algorithm.py). No machine learning. It grades the local environment for fire ignition and growth on a 0–1 scale, like a UV index for fire danger. It does **not** predict that a fire *will* start, and it does not describe an existing fire's behavior.

### 1. The fire-weather index

Three meteorological factors combine **multiplicatively**, then a vegetation factor scales the result:

```
VPD            vapor pressure deficit from temperature + humidity (Tetens/Magnus)
wind           sustained 10-min wind, saturating at a ~32 mph plateau
drought        Keetch-Byram Drought Index (KBDI, 0–800)
vegetation     NDVI anomaly vs. the same-month 3-year normal (fallback: season factor)

score = (vpd^a × wind^b × drought^c) × vegetation_factor
```

_Fitted exponents: vpd **0.45**, wind **0.43**, drought **0.12**. They sum to 1.0. The 0.12 is a deliberate floor. Full fit in [ARCHITECTURE.md §2](docs/ARCHITECTURE.md)._

Multiplicative combination captures the "hot **and** dry **and** windy" non-linearity. Any single mild factor pulls the whole score down. The structure follows the Fosberg, Hot-Dry-Windy, and McArthur indices.

<details>
<summary><strong>Why each input, and what it really measures</strong></summary>

- **NDVI anomaly over raw NDVI.** Raw NDVI is mostly biome detection (PNW forests are always ~0.8, Arizona desert ~0.2). The *anomaly* (current vs. the same-month normal over a 1 km buffer) is biome-agnostic. It captures how much drier or sparser the vegetation is *right now* versus its seasonal baseline. This is the fuel-load proxy that operational systems like USFS WFAS rely on. When Sentinel-2 is unavailable (cloud cover, or the Fire-Weather What-If with no GPS), the score falls back to a calendar season factor.
- **KBDI for drought.** The operational soil-moisture-deficit metric (Keetch & Byram 1968). It's computed daily from a 365-day precipitation and evapotranspiration window via the free Open-Meteo archive, keyed to a 0.1° grid cell so neighbors share one cached compute. Two dry weeks in Florida humidity is not the same drought as two dry weeks in Arizona. KBDI captures both. A "days since rain" proxy does not.

</details>

### 2. Per-state calibration

A 0.55 in Florida is a dangerous fire day. The same 0.55 in Arizona is routine. A single global cutoff would cry wolf in one place and miss real danger in the other.

The calibration script samples about 500 historical fire days **per state** (roughly 8,500 across the 17 fitted states) from the federal FPA-FOD database (~1.88M wildfires, 1992–2015). It pulls real day-of-fire weather, scores each with the same fire-weather algorithm, and stores the **50th / 75th / 97th percentiles** of the resulting distribution as that state's tier boundaries. This per-state sampling is separate from the held-out benchmark used for validation in §3.

```
LOW       score < 50th pctile of the state's fire-day scores
MODERATE  50th – 75th
HIGH      75th – 97th
EXTREME   ≥ 97th    (top ~3% of historically observed fire days)
```

**17 states are fitted** (the entire West, the Southeast belt, plus TX/OK). The rest fall back to global cutoffs. State membership is resolved at request time via the **US Census reverse-geocoder**. It's accurate even for border points like Reno, NV that a bounding-box heuristic would misclassify.

![Per-state regional thresholds](docs/regional_thresholds.png)

_Same raw score, different tier by state. A probe at **0.45** reads **EXTREME** in NC/GA/FL, **HIGH** across the middle cluster, and **MODERATE** in NM/AZ/UT/NV/CA._

### 3. Validation

The constants are fitted, not hand-picked. They're fit to maximize Spearman ρ(score, log fire size) on a train split and reported on a held-out test split. There the index reaches **ρ = +0.32**, ahead of Hot-Dry-Windy (+0.30) and Fosberg FFWI (+0.28) on the same fires. Neither of those carries the per-state calibration on top; this index does. Mean score rises monotonically with fire size, with non-overlapping 95% CIs between the smallest and largest fire bins. Full methodology is in [ARCHITECTURE.md §2](docs/ARCHITECTURE.md): the train/test split, the deliberate drought-floor tradeoff, and the confidence intervals.

![Fire-weather index validated against a held-out benchmark](docs/v4_validation.png)

![Fitted index vs. published fire-weather indices](docs/v4_benchmark.png)

### Honest gaps

- KBDI's fitted exponent wanted to drop near zero (fire *size* is spread- and VPD-driven), so it's floored at 0.12 to keep drought load-bearing. That costs only +0.006 ρ. Rationale in [ARCHITECTURE.md §2](docs/ARCHITECTURE.md).
- The FPA-FOD sample skews toward human-caused spring fires that peak before green-up, which a vegetation-as-fuel proxy under-rates. Splitting natural vs. human ignition is on the roadmap.
- The dataset ends in 2015, so the per-state percentile shape should be re-fit periodically against newer fire records.
- NDVI is averaged over a 1 km buffer, so hyper-local fuel state isn't modeled. That resolution is fine for an awareness app. A fielded operational tool would want finer detail.

---

## A learned second opinion: ignition likelihood

The rule-based index above asks *how bad could a fire get?* A separate **gradient-boosted machine-learning model** answers a different question: *do today's conditions resemble the days fires actually start?* They capture different things. One measures severity, the other measures occurrence. Both show on the Status screen side by side.

- **What it reads:** dryness (VPD, humidity, temperature), drought (KBDI and days since rain), wind, time of year, and **land cover**, the fuel actually on the ground. Location itself (lat/lon) is left out on purpose, so the model learns conditions and fuel instead of geography.
- **Trained** on 32,382 examples: 4,897 real fire-ignition days (FPA-FOD + Open-Meteo) against "typical day" negatives. The negatives come from those same fire locations and from 3,000 genuinely non-fire background locations (`scripts/build_ignition_dataset.py`).
- **Evaluated** with leakage-safe **spatial-block cross-validation** plus a logistic baseline. **ROC-AUC 0.840:** given a real fire day and a random typical day, the model ranks the fire day higher about 84% of the time. **PR-AUC 0.488** (no-skill baseline 0.151). Well-calibrated after isotonic calibration (Brier 0.163 down to 0.100).
- **Validated across time too:** a stricter out-of-time holdout (train on everything before 2010, test on 2010–2015) holds at **ROC-AUC 0.832**, against 0.840 for spatial CV. A 6-year forward gap barely moves it (`scripts/temporal_validation.py`).
- **Rediscovers the physics on its own:** permutation importance puts **VPD and drought (KBDI) on top**, the same drivers the hand-built index uses.
- **Knows where there's nothing to burn (v2):** a land-cover feature (NLCD, with developed-intensity split) plus the background negatives fix the v1 over-flagging of low-fuel cities. A cool, windy spring day in dense-urban **Chicago** dropped from the 76th percentile ("high") to the 61st ("moderate"). Genuinely dry **Phoenix** stays high. See the [model card](docs/ignition_model_card.md#addressing-the-over-flag-v2).
- **Served live** at `/ignition` as a calibrated percentile index, with training/serving parity (the same feature function runs in training and at request time).

![Ignition model: ROC and reliability](docs/ignition_eval.png)

Full write-up: [model card](docs/ignition_model_card.md). The design rationale for keeping the core rule-based while adding this learned model is in [ARCHITECTURE.md §10](docs/ARCHITECTURE.md).

---

## The overall-risk composite

The headline tier on Status (shown in-app as your **overall risk**) combines three signals. It runs them through two lookup matrices in series. It does not average them. Fire-weather severity and the ignition model combine first into an environmental-danger tier, so a high ignition reading on a mild day can't escalate the headline on its own. That environment tier then meets the active-fire threat to set the final tier. The threat is distance × size, with smoothed wind, containment, and staleness modifiers.

The matrices and the full rationale for using matrices instead of weights are in [ARCHITECTURE.md §6](docs/ARCHITECTURE.md). The threat math is in §7–§8.

---

## Data sources

| Source | Provides | Key |
|---|---|---|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | VIIRS/MODIS satellite fire detections (~1–4 hr latency) | Free (map key) |
| [OpenWeatherMap](https://openweathermap.org/api) | Current temperature, humidity, wind | Free tier |
| [Open-Meteo](https://open-meteo.com/) | 365-day weather history → KBDI drought | None |
| [Copernicus (CDSE)](https://dataspace.copernicus.eu/) | Sentinel-2 imagery → NDVI anomaly | Free (OAuth) |
| [US Census](https://geocoding.geo.census.gov/) | Reverse geocode → state + county | None |
| [NIFC WFIGS](https://data-nifc.opendata.arcgis.com/) | Named active wildfire incidents (national) | None |
| [Cal Fire](https://www.fire.ca.gov/incidents) | California-specific named incidents | None |
| [FEMA](https://www.fema.gov/about/openfema/api) | Disaster declarations + National Shelter System | None |
| [OpenStreetMap](https://overpass-api.de/) | Community centers / churches as shelter candidates | None |
| [NCES](https://nces.ed.gov/programs/edge/) | Public schools as shelter candidates | None |
| [NLCD / EnviroAtlas](https://www.epa.gov/enviroatlas) | Land cover (fuel type) for the ignition model | None |
| [MapTiler](https://www.maptiler.com/) | Web base-map tiles | Free (domain-locked) |
| [FPA-FOD (Kaggle)](https://www.kaggle.com/datasets/rtatman/188-million-us-wildfires) | Historical validation + calibration ground truth | Kaggle account |

The 13 rows are 11 live upstreams, plus MapTiler tiles and the offline FPA-FOD dataset (used only for validation and calibration).

Of the live upstreams, only **NASA FIRMS** and **OpenWeatherMap** need backend API keys, plus a free **MapTiler** key for the web base map. CDSE needs a free OAuth account, but skip it and NDVI falls back to the season factor. The rest are keyless.

---

## Run locally

### Prerequisites

- **Python 3.11+** (3.14 in development): use the [python.org](https://www.python.org/downloads/) installer, not the Microsoft Store stub.
- **Node.js 20.9+** (required by Next.js 16).
- API keys (all free): [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/), [OpenWeatherMap](https://openweathermap.org/api), and optionally [CDSE](https://dataspace.copernicus.eu/) for NDVI.

### Backend

```powershell
# from repo root
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r api/requirements-dev.txt   # prod deps + tests/lint/notebooks

copy api\.env.example api\.env     # fill in OWM_API_KEY, FIRMS_API_KEY, CDSE_*

python -m pytest api/ -q           # run the full backend suite
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
# → http://localhost:8000/docs   (Swagger UI)
```

> On Windows, `python -m uvicorn` avoids an Application Control quirk that can block the pip-installed `uvicorn.exe` shim.

> Set `MOCK_OPEN_SHELTERS=1` to populate the open-shelter UI from fixtures (the live FEMA feed is usually empty for any given location).

### Web app (primary)

```powershell
cd web
# .env.local needs:
#   NEXT_PUBLIC_API_URL=http://localhost:8000
#   NEXT_PUBLIC_USE_MOCKS=false
#   NEXT_PUBLIC_MAPTILER_KEY=<key>
npm install
npm run dev
# → http://localhost:3000
```

> Set `NEXT_PUBLIC_USE_MOCKS=true` to run the entire UI against bundled fixtures with no backend. The MapTiler key is inlined into the browser bundle by design, so **domain-lock it in the MapTiler dashboard before any public deploy.**

---

## Project layout

```
.
├── api/                      # FastAPI backend
│   ├── core/                 # Pure-Python algorithm + calibration
│   │   ├── risk_algorithm.py #   Multiplicative fire-weather index (RiskParams)
│   │   ├── kbdi.py           #   Keetch-Byram Drought Index
│   │   ├── ndvi.py           #   NDVI anomaly → vegetation factor
│   │   ├── trajectory.py     #   6-hour fire-weather projection
│   │   └── regional_calibration.py
│   ├── routes/               # Endpoint handlers (11 routes)
│   ├── services/             # Async clients per upstream (firms, owm, cdse, ignition, landcover, …)
│   ├── models/               # Committed ignition-model artifact (joblib)
│   ├── data/                 # regional_thresholds.json + backups
│   └── tests/                # Backend test suite
├── web/                      # Next.js 16 web app (primary surface)
│   ├── app/                  #   App Router pages
│   ├── components/           #   Screen + UI components
│   └── lib/                  #   Hooks, API client, composite-risk math, theme
├── scripts/                  # Fitting, calibration, chart generation
├── docs/                     # ARCHITECTURE.md + validation charts
└── notebooks/                # Validation + calibration analysis
```

---

## Testing

The full backend suite is **153 tests**. Run it with:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pytest api/ -q
```

Backend coverage spans:

- algorithm correctness (factor floors, KBDI/NDVI overrides, score-bounds sweeps);
- the KBDI and NDVI math;
- regional-calibration lookup (including the Reno border-overlap regression and partial-threshold fallback);
- Open-Meteo fetch resilience across 200/4xx/429 responses;
- defensive parsing of malformed upstream rows;
- the FEMA NSS shelter parser;
- the calibration build script (circuit breaker and incremental save);
- end-to-end route tests against every endpoint with mocked upstreams;
- a security suite (CORS/config fail-fast, input and bbox validation, rate limiting, safe errors).

The frontend is TypeScript strict (`tsc --noEmit`) plus a **Vitest** suite over the pure logic: the composite/threat math, the offline fire-weather scorer, confidence, and FEMA matching. It includes a **Python-to-TypeScript parity test** that asserts the in-browser scorer reproduces the backend's `compute_risk` exactly (fixture from `scripts/export_v4_fixture.py`). Run it with `cd web && npm test`.

CI gates on `ruff` and the backend tests (api), and on `tsc` + Vitest + a production `next build` (web). `eslint`, `pip-audit`, `npm audit`, and `gitleaks` run as advisory or secret-scan checks. See [SECURITY.md](SECURITY.md).

---

## Roadmap

**Done**

- ✅ Multiplicative fire-weather index with **fitted** constants (`RiskParams`), validated and benchmarked against Hot-Dry-Windy and Fosberg
- ✅ KBDI drought (Open-Meteo) and NDVI vegetation anomaly (Copernicus Sentinel-2)
- ✅ 17-state percentile calibration plus Census state lookup
- ✅ **Machine-learning ignition model:** gradient-boosted, leakage-safe spatial cross-validation (ROC-AUC 0.84), isotonic-calibrated, served live at `/ignition`
- ✅ Three-signal overall-risk composite (fire weather, ignition likelihood, and active-fire threat) resolved through two lookup matrices, with the threat axis as multiplicative distance × size and smoothed wind / containment / staleness modifiers
- ✅ 6-hour fire-weather trajectory plus an atmospheric "risk strata" phase-space graph
- ✅ Live FEMA National Shelter System open-shelter layer, integrated into the Safety UI
- ✅ Full Next.js web app: all five screens, plus Fire Detail and saved locations
- ✅ Security hardening: CORS allowlist with prod fail-fast, per-IP rate limiting, input/bbox validation, security headers and CSP, secret-redacting logging, CI audits (`pip-audit` / `npm audit` / `gitleaks`)
- ✅ Responsive mobile web and a **WCAG 2.1 AA** accessibility pass, plus Terms / Privacy / Accessibility pages

**Deferred**

- Public deploy (web to Vercel, API to Railway) plus a custom domain
- Lightning vs. human-caused ignition split (separate fitted thresholds)
- Push notifications when a fire is detected near a saved location

---

## Disclaimer

This is an informational app, not a substitute for emergency services. **Always call 911 first.** The risk score is a research-grade indicator, not a National Weather Service red-flag warning. Shelter "candidates" are general gathering points, not pre-activated emergency shelters, and even the live FEMA-reported open shelters should be confirmed by phone in a real emergency. Cross-check the [Red Cross shelter map](https://www.redcross.org/get-help/disaster-relief-and-recovery-services/find-an-open-shelter.html), [Cal Fire / Ready for Wildfire](https://readyforwildfire.org/), and your local emergency-management agency. A fuller disclaimer lives in the app under **Settings → Important notice**.

---

## Credits & license

**Algorithm references.** Fosberg (1978); Goodrick (2002, Fosberg + drought); Keetch & Byram (1968, KBDI); Noble et al. (1980, McArthur); Rothermel (1972); Srock et al. (2018, Hot-Dry-Windy); Tetens (1930).

**Data attribution.** Fire detections: NASA FIRMS (VIIRS/MODIS). Weather: OpenWeatherMap, Open-Meteo. Imagery: ESA Sentinel-2 via Copernicus. Incidents: NIFC WFIGS, Cal Fire. Shelters & declarations: FEMA. Geographies: US Census, OpenStreetMap (© OpenStreetMap contributors, ODbL), NCES. Historical fires: Karen C. Short, *Spatial wildfire occurrence data for the United States, 1992–2015* (FPA-FOD).

**License.** [MIT](LICENSE).
