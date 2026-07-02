# Ember Watch

[![Architecture](https://img.shields.io/badge/docs-architecture-FF7A3A?style=flat-square)](docs/ARCHITECTURE.md) [![License: MIT](https://img.shields.io/badge/license-MIT-555?style=flat-square)](LICENSE)

A wildfire-awareness web app for the US. Type in a location and it tells you the current fire risk there, the active fires near you, and where you could go if you had to leave. It pulls live satellite, weather, and vegetation data to do this.

Wildfire information is scattered. Red-flag bulletins live in one place, raw satellite feeds in another, and shelter lists somewhere else. They rarely line up. Ember Watch puts them together. One location gives you a risk tier, the fires nearby, and a basic safety plan.

> The app is **Ember Watch**. The repository is `wildfire-app`. The frontend is a Next.js web app (`web/`). The backend is a typed FastAPI service (`api/`).

## Highlights

- **The fire-weather index is fitted to real fires.** Spearman ρ **+0.32**, ahead of Hot-Dry-Windy (+0.30) and Fosberg (+0.28) on the same fires. [Details](#how-the-scoring-works)
- **Machine-learning ignition model.** ROC-AUC **0.84**, spatially cross-validated and probability-calibrated. [Details](#how-the-scoring-works)
- **Per-state calibration across 17 states.** The same score reads as a different tier depending on your state's fire history. [Details](#how-the-scoring-works)
- **Handles upstream outages.** Every external feed has a fallback, so one provider going down doesn't take the page with it. Plus 161 backend tests and a Python-to-TypeScript scorer-parity test. [Details](#testing)

---

## Table of contents

- [What it does](#what-it-does)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [How the scoring works](#how-the-scoring-works)
- [Data sources](#data-sources)
- [Run locally](#run-locally)
- [Project layout](#project-layout)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Disclaimer](#disclaimer)
- [Credits & license](#credits--license)

Deep dive: [full technical detail](docs/ARCHITECTURE.md).

---

## What it does

Five screens, all running on the same backend and the same calibrated algorithm.

**Status.** A live overall-risk tier for your location, built from three signals: the rule-based fire-weather index, a machine-learning ignition-likelihood model, and the proximity of active fires within 50 mi. Several tap-to-open modals open up the math behind it: a calibration ladder, the two-stage "Score Breakdown" explainer, the ignition model, a 6-hour forecast, and a confidence breakdown. The screen also shows drought, vegetation stress, and the active fire driving your threat.

**Live Map.** NASA FIRMS satellite detections plus named incidents from NIFC and Cal Fire, sized by acreage and tinted by fire-weather risk. Zoom-aware hit testing, click-to-inspect, and one rail with two tabs: named incidents and browsable satellite detections.

**Fire-Weather What-If.** A slider sandbox over temperature, humidity, wind, KBDI, and vegetation that runs the validated fire-weather index. It's the environment half of the Status score on its own. Drag the sliders to simulate any conditions, watch each factor move the score, and see where that score lands across the 17 calibrated states. It works fully offline.

**Safety.** Open shelters from the live **FEMA National Shelter System**, with status and capacity, plus potential evacuation points from OpenStreetMap and the NCES school database, sorted by distance. There's a direction-of-evacuation cue, an evacuation checklist that scales with risk, and a maps hand-off for directions.

**Settings.** Three dark themes, unit preferences (all browser-local, no account), a full disclaimer, dedicated Terms / Privacy / Accessibility pages, and the full data-source attribution.

Plus **saved locations** (search and save any city, swappable from the rail) and a per-incident **Fire Detail** page. The whole web app is **responsive on mobile** and meets **WCAG 2.1 AA** (color contrast, keyboard focus management, and text alternatives for the charts).

---

## Screenshots

<!-- Drop UI captures here. Suggested set:
     1. Status hero — orb + headline + confidence chip + trajectory chip
     2. Live Map — markers + incident rail open
     3. Fire-Weather What-If — sliders + score gauge
     4. Safety — open shelter tile + checklist
     5. "Score Breakdown" matrix modal -->

_App UI captures aren't committed yet._

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
                                       │ per-upstream fallbacks
                                       ▼
        ┌──────────────────────────────────────────────────────────┐
        │ FIRMS · OWM · Open-Meteo · Copernicus · Census · NIFC ·   │
        │ Cal Fire · FEMA · OpenStreetMap · NCES · NLCD             │
        └──────────────────────────────────────────────────────────┘
```

**Frontend (`web/`).** Next.js 16 (App Router) + React + TypeScript (strict), Tailwind v4, TanStack Query, react-leaflet on MapTiler tiles, with custom canvas/SVG rendering for the hero orb, phase-space graph, and animated backgrounds. The composite math lives in pure, testable functions ([`web/lib/composite-risk.ts`](web/lib/composite-risk.ts)).

**Backend (`api/`).** FastAPI on Python 3.11+ (3.14 in development), async `httpx`, pydantic v2. The fire-weather index is a transparent, rule-based core; a separate scikit-learn ignition model is trained offline and served from a committed artifact. NDVI results are cached on disk per coordinate (with separate TTLs for current vs. climatology), and the live feeds are cached in memory.

**Design principle: graceful degradation everywhere.** When an upstream returns 4xx/5xx/timeout, the route logs once and returns an empty or null payload instead of failing the request. Every feature has a fallback: regional calibration falls back to global cutoffs, NDVI to a calendar season factor, KBDI to a days-since-rain proxy, and open shelters to candidate locations. The Fire-Weather What-If runs with no GPS and no keys at all.

Full technical detail is in [ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## How the scoring works

The short version. The formulas, matrices, and validation method are in [ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Fire weather.** A rule-based index (no machine learning) grades the local environment on a 0–1 scale from VPD, wind, KBDI drought, and an NDVI vegetation anomaly, like a UV index for fire danger. Its constants are *fitted* to a frozen set of ~500 historical fires, not hand-picked. It reaches Spearman **ρ +0.32** against log fire size on held-out fires, ahead of the published Hot-Dry-Windy (+0.30) and Fosberg (+0.28) indices. ([the fire-weather index](docs/ARCHITECTURE.md#the-fire-weather-index) · [validation](docs/ARCHITECTURE.md#validation))

**Per-state calibration.** A 0.55 is a dangerous fire day in humid Florida but routine in dry Arizona, so a single global cutoff would misjudge one of them. Tier bands (LOW / MODERATE / HIGH / EXTREME) are instead pegged to each state's own history: the 50th / 75th / 97th percentiles of its historical fire-day scores. 17 states are calibrated; the rest use global cutoffs. ([calibration](docs/ARCHITECTURE.md#per-state-calibration))

**Ignition likelihood (machine learning).** The rule-based index answers "how bad could a fire get?" A separate gradient-boosted model answers "do today's conditions resemble the days fires actually start?" It scores **ROC-AUC 0.84** under leakage-safe spatial cross-validation, holds at 0.83 on a separate out-of-time test (train before 2010, test 2010–2015), and its outputs are probability-calibrated. The two run side by side: the rule-based index stays the explainable core, and the model is a learned second opinion. ([the ignition model](docs/ARCHITECTURE.md#the-ignition-model) · [model card](docs/ignition_model_card.md))

**The headline.** Fire weather, ignition likelihood, and active-fire proximity resolve into your overall-risk tier through two published lookup matrices in series. ([the composite](docs/ARCHITECTURE.md#the-overall-risk-composite))

![Fire-weather index validated against ~500 historical fires](docs/v4_validation.png)

![Ignition model: ROC and reliability](docs/ignition_eval.png)

### Honest gaps

- The FPA-FOD sample skews toward human-caused spring fires that peak before green-up, which a vegetation-as-fuel proxy under-rates. Splitting natural vs. human ignition is on the roadmap.
- The dataset ends in 2015, so the per-state percentile shape should be re-fit periodically against newer fire records.
- NDVI is averaged over a 1 km buffer, so hyper-local fuel state isn't modeled. That resolution is fine for an awareness app. A fielded operational tool would want finer detail.

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

The full backend suite is **161 tests**. Run it with:

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
