# WatchFlame

*Wildfire awareness for any location in the United States.*

[![Live demo](https://img.shields.io/badge/live_demo-online-FF7A3A?style=flat-square)](https://watchflame-wildfire.vercel.app) [![Architecture](https://img.shields.io/badge/docs-architecture-555?style=flat-square)](docs/ARCHITECTURE.md) [![License: MIT](https://img.shields.io/badge/license-MIT-555?style=flat-square)](LICENSE)

[![Next.js](https://img.shields.io/badge/Next.js_16-000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/) [![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/) [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Python](https://img.shields.io/badge/Python_3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)

Type in a location and WatchFlame tells you the current fire risk there, the active fires near you, and where you could go if you had to leave. It pulls live satellite, weather, and vegetation data to do this.

Wildfire information is scattered. Red-flag bulletins live in one place, raw satellite feeds in another, and shelter lists somewhere else. They rarely line up. WatchFlame puts them together, so one location gives you a risk tier, the fires nearby, and a basic safety plan.

**▶ Try it live: [watchflame-wildfire.vercel.app](https://watchflame-wildfire.vercel.app)**

![WatchFlame Status page: the overall wildfire risk orb, a "Heightened Risk" headline, and confidence and trajectory chips](docs/screenshots/hero.png)

---

## At a glance

- **Coverage:** any location in the United States
- **Screens:** Status, Live Map, Fire-Weather What-If, Safety, Settings
- **Scoring:** a rule-based fire-weather index plus a machine-learning ignition model
- **Calibration:** per-state tier bands, 17 states fitted to local fire history
- **Live data:** 11 upstream feeds, each with a fallback
- **Tested:** 196 backend tests plus a Python-to-TypeScript scoring-parity test

## Table of contents

- [Features](#features)
- [How the scoring works](#how-the-scoring-works)
- [Under the hood](#under-the-hood)
- [Data sources](#data-sources)
- [Run locally](#run-locally)
- [Project layout](#project-layout)
- [Testing](#testing)
- [Disclaimer](#disclaimer)
- [Credits & license](#credits--license)

---

## Features

Five screens, all built on the same calibrated scoring algorithm.

### Status

<table>
<tr>
<td width="45%">

<img src="docs/screenshots/status.png" alt="Status page Wildfire Intelligence panel showing three signals: fire weather, active fire threat, and the machine-learning ignition likelihood" width="100%">

</td>
<td width="55%">

A single overall-risk tier for your location, combining today's fire weather, how likely a fire is to start, and any active fires within 50 mi. Tap or click any part of the screen to see the math behind it. It also surfaces local drought, vegetation stress, and the nearest fire driving your risk.

</td>
</tr>
</table>

### Live Map

<table>
<tr>
<td width="38%">

NASA FIRMS satellite detections plus named incidents from NIFC and Cal Fire, each sized by acreage and colored by fire-weather risk. Click any fire to inspect it, or browse the two side tabs: named incidents and raw satellite detections.

</td>
<td width="62%">

<img src="docs/screenshots/map.png" alt="Live Map with risk-colored fire markers, filter chips, and the incident rail listing nearby fires" width="100%">

</td>
</tr>
</table>

### Fire-Weather What-If

<table>
<tr>
<td width="45%">

<img src="docs/screenshots/whatif.png" alt="Fire-Weather What-If page showing the fire-weather score and a factor breakdown of vapor pressure deficit, wind, and drought" width="100%">

</td>
<td width="55%">

A slider sandbox for temperature, humidity, wind, drought, and vegetation. Drag them to simulate any conditions and watch the fire-weather score respond, then see where that score lands across the 17 calibrated states. It runs entirely in the browser, with no backend needed.

</td>
</tr>
</table>

### Safety

<table>
<tr>
<td width="62%">

Open shelters from the live FEMA National Shelter System with status and capacity, plus backup gathering points from OpenStreetMap and the NCES school database, sorted by distance. Includes an evacuation-direction cue, a checklist that grows with the risk level, and a hand-off to your maps app for directions.

</td>
<td width="38%">

<img src="docs/screenshots/safety.png" alt="Safety page with an evacuation checklist and an open shelter tile showing occupancy and directions" width="100%">

</td>
</tr>
</table>

### Settings

Three dark themes, unit preferences (all stored in your browser, no account needed), the full disclaimer, dedicated Terms / Privacy / Accessibility pages, and complete data-source attribution.

> [!NOTE]
> Also included: **saved locations** (search and save any city) and a per-incident **Fire Detail** page. The whole app is responsive on mobile and works toward WCAG 2.1 AA (color contrast, keyboard focus management, and text alternatives for the charts).

---

## How the scoring works

The short version. The formulas, matrices, and validation method are in [ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Fire weather.** A rule-based index (no machine learning) that grades the local environment on a 0 to 1 scale, like a UV index for fire danger. It blends four ingredients: vapor pressure deficit, wind, KBDI drought, and an NDVI vegetation anomaly. Its constants aren't hand-picked. They're *fitted* to a frozen set of real historical fires, and the result out-predicts the published Hot-Dry-Windy and Fosberg indices on the same fires. ([the fire-weather index](docs/ARCHITECTURE.md#the-fire-weather-index) · [validation](docs/ARCHITECTURE.md#validation))

**Per-state calibration.** A 0.55 is a dangerous fire day in humid Florida but routine in dry Arizona, so one global cutoff would misjudge one of them. Instead, each state's tier bands (LOW / MODERATE / HIGH / EXTREME) are pegged to its own fire history. 17 states are calibrated this way, and the rest fall back to global cutoffs. ([calibration](docs/ARCHITECTURE.md#per-state-calibration))

**Ignition likelihood (machine learning).** The rule-based index answers "how bad could a fire get?" A separate machine-learning model answers a different question: "do today's conditions resemble the days fires actually start?" It's a gradient-boosted classifier trained on real ignition days, cross-validated so it can't simply memorize where fires have happened, with probability-calibrated outputs. The two run side by side: the rule-based index stays the explainable core, and the model is a learned second opinion. ([the ignition model](docs/ARCHITECTURE.md#the-ignition-model) · [model card](docs/ignition_model_card.md))

**The headline.** Fire weather, ignition likelihood, and active-fire proximity resolve into your overall-risk tier through two lookup matrices, each cell set on its own merits rather than by a hidden formula. ([the composite](docs/ARCHITECTURE.md#the-overall-risk-composite))

**By the numbers**

| What | Result |
|---|---|
| Fire-weather ranking vs. fire size | Spearman ρ +0.32, ahead of Hot-Dry-Windy (+0.30) and Fosberg (+0.28) |
| Ignition model (spatial cross-validation) | ROC-AUC 0.84, holding at 0.83 on a 2010 to 2015 out-of-time test |
| Per-state calibration | 17 states, tier bands from each state's own fire-day percentiles |
| Validation benchmark | ~500 held-out historical fires |

<table>
<tr>
<td width="50%"><img src="docs/v4_validation.png" alt="Fire-weather index validated against ~500 historical fires" width="100%"></td>
<td width="50%"><img src="docs/ignition_eval.png" alt="Ignition model: ROC curve and reliability diagram" width="100%"></td>
</tr>
</table>

> [!NOTE]
> **Honest gaps.**
> - The FPA-FOD sample skews toward human-caused spring fires that peak before green-up, which a vegetation-as-fuel proxy under-rates. Splitting natural vs. human ignition is a known next step.
> - The dataset ends in 2015, so the per-state percentile shape should be re-fit periodically against newer fire records.
> - NDVI is averaged over a 1 km buffer, so hyper-local fuel state isn't modeled. That resolution is fine for an awareness app. A fielded operational tool would want finer detail.

---

## Under the hood

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

| Layer | Stack |
|---|---|
| **Frontend** (`web/`) | Next.js 16 (App Router), React, TypeScript (strict), Tailwind v4, TanStack Query, react-leaflet on MapTiler tiles, with custom canvas/SVG rendering for the risk orb, phase-space graph, and animated backgrounds |
| **Backend** (`api/`) | FastAPI on Python 3.11+, async httpx, pydantic v2. The fire-weather index is a transparent rule-based core. A separate scikit-learn ignition model is trained offline and served from a committed artifact, with NDVI cached on disk and live feeds cached in memory |

The composite math lives in pure, testable functions ([web/lib/composite-risk.ts](web/lib/composite-risk.ts)).

> [!TIP]
> **Graceful degradation everywhere.** When an upstream returns 4xx/5xx/timeout, the route logs once and returns an empty or null payload instead of failing the request. Every feature has a fallback: regional calibration to global cutoffs, NDVI to a calendar season factor, KBDI to a days-since-rain proxy, and open shelters to candidate locations. The Fire-Weather What-If runs with no GPS and no keys at all.

Full technical detail is in [ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Data sources

| Source | Provides | Key |
|---|---|---|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | VIIRS/MODIS satellite fire detections (~1 to 4 hr latency) | Free (map key) |
| [OpenWeatherMap](https://openweathermap.org/api) | Current temperature, humidity, wind | Free tier |
| [Open-Meteo](https://open-meteo.com/) | 365-day weather history → KBDI drought | Not required |
| [Copernicus (CDSE)](https://dataspace.copernicus.eu/) | Sentinel-2 imagery → NDVI anomaly | Free (OAuth) |
| [US Census](https://geocoding.geo.census.gov/) | Reverse geocode → state + county | Not required |
| [NIFC WFIGS](https://data-nifc.opendata.arcgis.com/) | Named active wildfire incidents (national) | Not required |
| [Cal Fire](https://www.fire.ca.gov/incidents) | California-specific named incidents | Not required |
| [FEMA](https://www.fema.gov/about/openfema/api) | Disaster declarations + National Shelter System | Not required |
| [OpenStreetMap](https://overpass-api.de/) | Community centers / churches as shelter candidates | Not required |
| [NCES](https://nces.ed.gov/programs/edge/) | Public schools as shelter candidates | Not required |
| [NLCD / EnviroAtlas](https://www.epa.gov/enviroatlas) | Land cover (fuel type) for the ignition model | Not required |
| [MapTiler](https://www.maptiler.com/) | Web base-map tiles | Free (domain-locked) |
| [FPA-FOD (Kaggle)](https://www.kaggle.com/datasets/rtatman/188-million-us-wildfires) | Historical validation + calibration ground truth | Kaggle account |

The 13 rows are 11 live upstreams, plus MapTiler tiles and the offline FPA-FOD dataset (used only for validation and calibration).

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

> [!NOTE]
> On Windows, `python -m uvicorn` avoids an Application Control quirk that can block the pip-installed `uvicorn.exe` shim. Set `MOCK_OPEN_SHELTERS=1` to populate the open-shelter UI from fixtures (the live FEMA feed is usually empty for any given location).

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

> [!TIP]
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

The full backend suite is **196 tests**. Run it with:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pytest api/ -q
```

Backend coverage spans:

- algorithm correctness (factor floors, KBDI/NDVI overrides, score-bounds sweeps)
- the KBDI and NDVI math
- regional-calibration lookup (including the Reno border-overlap regression and partial-threshold fallback)
- Open-Meteo fetch resilience across 200/4xx/429 responses
- defensive parsing of malformed upstream rows
- the FEMA NSS shelter parser
- the calibration build script (circuit breaker and incremental save)
- end-to-end route tests against every endpoint with mocked upstreams
- a security suite (CORS/config fail-fast, input and bbox validation, rate limiting, safe errors)

The frontend is TypeScript strict (`tsc --noEmit`) plus a **Vitest** suite over the pure logic: the composite/threat math, the offline fire-weather scorer, confidence, and FEMA matching. It includes a **Python-to-TypeScript parity test** that asserts the in-browser scorer reproduces the backend's `compute_risk` exactly (fixture from `scripts/export_v4_fixture.py`). Run it with `cd web && npm test`.

CI gates on `ruff` and the backend tests (api), and on `tsc` + Vitest + a production `next build` (web). `eslint`, `pip-audit`, `npm audit`, and `gitleaks` run as advisory or secret-scan checks. See [SECURITY.md](SECURITY.md).

---

## Disclaimer

> [!WARNING]
> This is an informational app, not a substitute for emergency services. **Always call 911 first.** The risk score is a research-grade indicator, not a National Weather Service red-flag warning. Shelter "candidates" are general gathering points, not pre-activated emergency shelters, and even the live FEMA-reported open shelters should be confirmed by phone in a real emergency. Cross-check the [Red Cross shelter map](https://www.redcross.org/get-help/disaster-relief-and-recovery-services/find-an-open-shelter.html), [Cal Fire / Ready for Wildfire](https://readyforwildfire.org/), and your local emergency-management agency. A fuller disclaimer lives in the app under **Settings → Important notice**.

---

## Credits & license

**Algorithm references.** Fosberg (1978); Goodrick (2002, Fosberg + drought); Keetch & Byram (1968, KBDI); Noble et al. (1980, McArthur); Rothermel (1972); Srock et al. (2018, Hot-Dry-Windy); Tetens (1930).

**Data attribution.** Fire detections: NASA FIRMS (VIIRS/MODIS). Weather: OpenWeatherMap, Open-Meteo. Imagery: ESA Sentinel-2 via Copernicus. Incidents: NIFC WFIGS, Cal Fire. Shelters & declarations: FEMA. Geographies: US Census, OpenStreetMap (© OpenStreetMap contributors, ODbL), NCES. Historical fires: Karen C. Short, *Spatial wildfire occurrence data for the United States, 1992-2015* (FPA-FOD).

**License.** [MIT](LICENSE).
