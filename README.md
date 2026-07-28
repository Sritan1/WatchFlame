# WatchFlame

*Wildfire awareness for any location in the United States.*

[![Live demo](https://img.shields.io/badge/live_demo-online-FF7A3A?style=flat-square)](https://watchflame-wildfire.vercel.app) [![Architecture](https://img.shields.io/badge/docs-architecture-555?style=flat-square)](docs/ARCHITECTURE.md) [![License: MIT](https://img.shields.io/badge/license-MIT-555?style=flat-square)](LICENSE)

[![Next.js](https://img.shields.io/badge/Next.js_16-000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/) [![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/) [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Python](https://img.shields.io/badge/Python_3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)

Type in a location and WatchFlame tells you the current fire risk there, the active fires near you, and nearby shelters and a direction to evacuate. It pulls live satellite, weather, and vegetation data to do this.

Wildfire information is scattered. Red-flag bulletins live in one place, raw satellite feeds in another, and shelter lists somewhere else. They rarely line up. WatchFlame puts them together, so one location gives you a risk tier, the fires nearby, and a basic safety plan.

**▶ Try it live: [watchflame-wildfire.vercel.app](https://watchflame-wildfire.vercel.app)**

![WatchFlame Status page: the overall wildfire risk orb, a "Heightened Risk" headline, and confidence and trajectory chips](docs/screenshots/hero.png)

<br>

---

<br>

# At a glance

- **Coverage:** any location in the United States
- **Screens:** Status, Live Map, Fire-Weather What-If, Safety, Settings
- **Scoring:** a rule-based fire-weather index plus a machine-learning ignition model
- **Calibration:** per-state tier bands, 17 states fitted to local fire history (the rest use global cutoffs)
- **Live data:** 11 upstream feeds, each with a fallback
- **Tested:** 196 backend tests plus a Python-to-TypeScript scoring-parity test
- **Accessible:** responsive on mobile, built toward WCAG 2.1 AA (contrast, keyboard focus, chart text alternatives)

<br>

---

<br>

# Table of contents

- [Features](#features)
- [How the scoring works](#how-the-scoring-works)
- [Architecture and Tech Stack](#architecture-and-tech-stack)
- [Data sources](#data-sources)
- [Run locally](#run-locally)
- [Project layout](#project-layout)
- [Testing](#testing)
- [Disclaimer](#disclaimer)
- [Credits & license](#credits--license)

<br>

---

<br>

# Features

The four main screens, all built on the same calibrated scoring algorithm.

### Status

<table>
<tr>
<td width="45%">

<img src="docs/screenshots/status.png" alt="Status page Wildfire Intelligence panel showing three signals: fire weather, active fire threat, and the machine-learning ignition likelihood" width="100%">

</td>
<td width="55%">

A single overall-risk tier for your location, combining today's fire weather, how likely a fire is to start, and any active fires within 50 mi. It also shows local drought, vegetation stress, the nearest fire driving your risk, and a trajectory for where things are headed.

</td>
</tr>
</table>

### Live Map

<table>
<tr>
<td width="38%">

See what is burning around you at a glance. Fires are sized by acreage and colored by risk, drawn from NASA FIRMS satellites and named NIFC and Cal Fire incidents. Click any fire for the full breakdown, or use the side tabs to sort by named incidents or raw satellite detections.

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

A sandbox for the scoring model. Set your own temperature, humidity, wind, drought, and vegetation, and see the fire-weather score react instantly, then how the same conditions would rate in each of the 17 calibrated states. Runs fully in the browser with no backend needed.

</td>
</tr>
</table>

### Safety

<table>
<tr>
<td width="62%">

Open shelters from the live FEMA National Shelter System with status and capacity, and backup gathering points from OpenStreetMap and the NCES school database, sorted by distance. Includes a suggested direction to head, a checklist, and a button that opens directions in your maps app.

</td>
<td width="38%">

<img src="docs/screenshots/safety.png" alt="Safety page with an evacuation checklist and an open shelter tile showing occupancy and directions" width="100%">

</td>
</tr>
</table>

<br>

---

<br>

# How the scoring works

Every location resolves to one of four tiers: LOW, MODERATE, HIGH, or EXTREME. That single label comes from three things the site measures separately: how dangerous the weather is, how likely a fire is to start, and whether anything is already burning nearby.


1. **Fire weather.** A rule-based index that grades environmental fire-weather severity on a 0-to-1 scale. It uses four inputs: vapor pressure deficit, wind, KBDI drought, and an NDVI vegetation anomaly. The formula is fitted to a set of real historical fires, and the result beats the published Hot-Dry-Windy and Fosberg indices on the same fires. ([the fire-weather index](docs/ARCHITECTURE.md#the-fire-weather-index) · [validation](docs/ARCHITECTURE.md#validation))

2. **Ignition likelihood (machine learning).** A gradient-boosted model that asks whether today looks like the days fires actually start. It looks at temperature, humidity, wind, drought, days since rain, the time of year, and the local fuel type. It's deliberately not given the location, so it can't just learn that certain regions burn and has to read the conditions instead. It's also spatially cross-validated, so its accuracy reflects regions it never trained on, and its outputs are probability-calibrated. ([the ignition model](docs/ARCHITECTURE.md#the-ignition-model) · [model card](docs/ignition_model_card.md))

3. **Active-fire threat.** The first two signals are about conditions. This one is about fires that are already burning. For each active fire within 50 miles, it weighs the distance, size, containment, and whether the wind is pushing it toward you. A fire counts as a real threat only when it's both close and large.

**The headline.** The three signals combine into your overall-risk tier through two lookup matrices, with each cell set on its own merits. ([the composite](docs/ARCHITECTURE.md#the-overall-risk-composite))

<br>

### Per-state calibration

The tier cutoffs aren't the same everywhere. A 0.55 is a dangerous fire day in humid Florida but routine in dry Arizona, so one global cutoff would misjudge one of them. Instead, each state's tier bands (LOW / MODERATE / HIGH / EXTREME) are based on that state's own fire history. 17 states are calibrated this way, and the rest fall back to global cutoffs. ([calibration](docs/ARCHITECTURE.md#per-state-calibration))

<br>

### Performance and validation

Both parts of the score were validated against real historical fires it wasn't fitted to.

<table width="100%">
<tr>
<td width="68%" valign="middle"><img src="docs/v4_benchmark.png" alt="Fire-weather index beats Hot-Dry-Windy and Fosberg on the same held-out fires" width="100%"></td>
<td width="32%" valign="middle"><em>The fire-weather index predicts fire size better than the published Hot-Dry-Windy and Fosberg indices (Spearman ρ +0.32).</em></td>
</tr>
<tr>
<td width="68%" valign="middle"><img src="docs/ignition_eval.png" alt="Ignition model: ROC curve and reliability diagram" width="100%"></td>
<td width="32%" valign="middle"><em>The ignition model ranks a real fire day above an ordinary one about 84% of the time (0.84 ROC-AUC) and stays well-calibrated.</em></td>
</tr>
</table>

> [!NOTE]
> **Known limitations.**
> - The historical fire record leans toward human-caused spring fires, which burn before the landscape greens up. The vegetation signal treats greenness as fuel, so it under-rates that kind of fire.
> - The dataset ends in 2015, so the per-state percentile shape should be re-fit periodically against newer fire records.
> - NDVI is averaged over a 1 km buffer, so hyper-local fuel state isn't modeled. That resolution is fine for an awareness tool. A fielded operational tool would want finer detail.

For full details on the formulas, matrices, machine-learning model, and validation method, see [ARCHITECTURE.md](docs/ARCHITECTURE.md).

<br>

---

<br>

# Architecture and Tech Stack

```
                    ┌───────────────────────────────────┐
                    │   Website · Next.js (web/)        │
                    │   Status · Live Map · What-If ·   │
                    │   Safety · Settings               │
                    └──────────────────┬────────────────┘
                                       │ TanStack Query · HTTPS
                                       ▼
                    ┌───────────────────────────────────┐
                    │      FastAPI backend (uvicorn)    │
                    │  /healthz /fires /risk /weather   │
                    │  /ignition /trajectory /geocode   │
                    │  /shelters /incidents/near        │
                    │  /disasters/near /risk/calibration│
                    └──────────────────┬────────────────┘
                                       │ async fan-out (httpx),
                                       │ per-upstream fallbacks
                                       ▼
        ┌──────────────────────────────────────────────────────────┐
        │ FIRMS · OWM · Open-Meteo · Copernicus · Census · NIFC ·  │
        │ Cal Fire · FEMA · OpenStreetMap · NCES · NLCD            │
        └──────────────────────────────────────────────────────────┘
```

| Layer | Stack |
|---|---|
| **Frontend** (`web/`) | Next.js 16 (App Router), React, TypeScript (strict), Tailwind v4, TanStack Query, react-leaflet on MapTiler tiles, with custom canvas/SVG rendering for the risk orb, phase-space graph, and animated backgrounds |
| **Backend** (`api/`) | FastAPI on Python 3.11+, async httpx, pydantic v2. The fire-weather index is a transparent rule-based core. A separate scikit-learn ignition model is trained offline and served from a committed artifact, with NDVI cached on disk and live feeds cached in memory |

The composite math lives in pure, testable functions ([web/lib/composite-risk.ts](web/lib/composite-risk.ts)).

**Graceful degradation.** When an upstream returns 4xx/5xx/timeout, the route logs once and returns an empty or null payload instead of failing the request. Every feature has a fallback: regional calibration to global cutoffs, NDVI to a calendar season factor, KBDI to a days-since-rain proxy, and open shelters to candidate locations. The Fire-Weather What-If runs with no GPS and no keys at all.

<br>

---

<br>

# Data sources

| Source | Provides |
|---|---|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | VIIRS/MODIS satellite fire detections (~1 to 4 hr latency) |
| [OpenWeatherMap](https://openweathermap.org/api) | Current temperature, humidity, wind |
| [Open-Meteo](https://open-meteo.com/) | 365-day weather history → KBDI drought |
| [Copernicus (CDSE)](https://dataspace.copernicus.eu/) | Sentinel-2 imagery → NDVI anomaly |
| [US Census](https://geocoding.geo.census.gov/) | Reverse geocode → state + county |
| [NIFC WFIGS](https://data-nifc.opendata.arcgis.com/) | Named active wildfire incidents (national) |
| [Cal Fire](https://www.fire.ca.gov/incidents) | California-specific named incidents |
| [FEMA](https://www.fema.gov/about/openfema/api) | Disaster declarations + National Shelter System |
| [OpenStreetMap](https://overpass-api.de/) | Community centers / churches as shelter candidates |
| [NCES](https://nces.ed.gov/programs/edge/) | Public schools as shelter candidates |
| [NLCD / EnviroAtlas](https://www.epa.gov/enviroatlas) | Land cover (fuel type) for the ignition model |
| [MapTiler](https://www.maptiler.com/) | Web base-map tiles |
| [FPA-FOD (Kaggle)](https://www.kaggle.com/datasets/rtatman/188-million-us-wildfires) | Historical validation + calibration ground truth |

The 13 rows are 11 live upstreams, plus MapTiler tiles and the offline FPA-FOD dataset (used only for validation and calibration). Only NASA FIRMS, OpenWeatherMap, and MapTiler need a key to run the site, and all three are free. Copernicus is an optional free key that unlocks the live vegetation signal. Without it, the score uses a seasonal fallback.

<br>

---

<br>

# Run locally

The commands below are PowerShell (Windows). On macOS or Linux, activate the virtual environment with `source .venv/bin/activate` and use `cp` in place of `copy`.

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

### Frontend

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

<br>

---

<br>

# Project layout

```
.
├── api/                      # FastAPI backend
│   ├── core/                 # Pure-Python algorithm + calibration
│   │   ├── risk_algorithm.py #   Multiplicative fire-weather index (RiskParams)
│   │   ├── kbdi.py           #   Keetch-Byram Drought Index
│   │   ├── ndvi.py           #   NDVI anomaly → vegetation factor
│   │   ├── trajectory.py     #   6-hour fire-weather projection
│   │   └── regional_calibration.py
│   ├── routes/               # Endpoint handlers
│   ├── services/             # Async clients per upstream (firms, owm, cdse, ignition, landcover, …)
│   ├── models/               # Committed ignition-model artifact (joblib)
│   ├── data/                 # regional_thresholds.json + backups
│   └── tests/                # Backend test suite
├── web/                      # Next.js 16 site
│   ├── app/                  #   App Router pages
│   ├── components/           #   Screen + UI components
│   └── lib/                  #   Hooks, API client, composite-risk math, theme
├── scripts/                  # Fitting, calibration, chart generation
├── docs/                     # ARCHITECTURE.md + validation charts
└── notebooks/                # Validation + calibration analysis
```

<br>

---

<br>

# Testing

The full backend suite is **196 tests**. Run it with:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pytest api/ -q
```

The backend tests cover:

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

CI must pass `ruff` and the backend tests (api), plus `tsc`, Vitest, and a production `next build` (web). `eslint`, `pip-audit`, `npm audit`, and `gitleaks` run as advisory or secret-scan checks. See [SECURITY.md](SECURITY.md).

<br>

---

<br>

# Disclaimer

> [!WARNING]
> This is an informational tool, not a substitute for emergency services. **Always call 911 first.** The risk score is a research-grade indicator, not a National Weather Service red-flag warning. Shelter "candidates" are general gathering points, not pre-activated emergency shelters, and even the live FEMA-reported open shelters should be confirmed by phone in a real emergency. Cross-check the [Red Cross shelter map](https://www.redcross.org/get-help/disaster-relief-and-recovery-services/find-an-open-shelter.html), [Cal Fire / Ready for Wildfire](https://readyforwildfire.org/), and your local emergency-management agency. A fuller disclaimer lives on the site under **Settings → Important notice**.

<br>

---

<br>

# Credits & license

**Algorithm references.** Fosberg (1978); Goodrick (2002, Fosberg + drought); Keetch & Byram (1968, KBDI); Noble et al. (1980, McArthur); Rothermel (1972); Srock et al. (2018, Hot-Dry-Windy); Tetens (1930).

**Data attribution.** Fire detections: NASA FIRMS (VIIRS/MODIS). Weather: OpenWeatherMap, Open-Meteo. Imagery: ESA Sentinel-2 via Copernicus. Incidents: NIFC WFIGS, Cal Fire. Shelters & declarations: FEMA. Geographies: US Census, OpenStreetMap (© OpenStreetMap contributors, ODbL), NCES. Historical fires: Karen C. Short, *Spatial wildfire occurrence data for the United States, 1992-2015* (FPA-FOD).

**License.** [MIT](LICENSE).
