# Wildfire App — Session Handoff

Last updated: 2026-05-19

## The goal

A mobile wildfire app testable in Expo Go on a real phone, eventually App-Store-ready. Portfolio-grade. Expo + React Native + TypeScript frontend, FastAPI on Python 3.14 backend. The "story" the portfolio tells: real per-fire calibrated risk algorithm (V4 multiplicative VPD + KBDI + NDVI anomaly + per-state percentile thresholds), live data fusion across NASA FIRMS / NIFC / Cal Fire / OWM / OpenFEMA / NCES / OSM / Census / Sentinel-2 (CDSE), mobile-native interactions (map, persistent tabs, intent-based cross-screen flows), and a cohesive premium-feel UI.

## Current state

### Algorithm

- **V4 fire-weather index** (multiplicative VPD-based + KBDI + NDVI) in [api/core/risk_algorithm.py](api/core/risk_algorithm.py). `score = vpd^0.5 × wind^0.3 × drought^0.2 × veg_multiplier`. The veg multiplier is `ndvi_factor(anomaly)` when satellite NDVI is available, else the legacy `_season_multiplier(season)`.
- **KBDI integration** in [api/core/kbdi.py](api/core/kbdi.py) + [api/services/openmeteo_history.py](api/services/openmeteo_history.py). Replaces the crude `days_since_rain` proxy; fetched server-side when `/risk` has lat/lon.
- **NDVI anomaly** in [api/core/ndvi.py](api/core/ndvi.py) + [api/services/cdse.py](api/services/cdse.py) + [api/services/ndvi_cache.py](api/services/ndvi_cache.py). CDSE Sentinel Hub Statistical API client (OAuth2 client_credentials, 2.5s throttle, exponential 429 backoff). Disk cache keyed on `round(lat, 2)` (~1.1 km cell); 7d positive TTL, 6h negative TTL. Anomaly = `current_ndvi − climatology_ndvi (last 3 years, same calendar month)`. Factor = `clamp(0.80 − anomaly, 0.40, 1.00)` — sign convention: negative anomaly (drier than normal) → higher factor → higher risk.
- **Per-state regional calibration** in [api/data/regional_thresholds.json](api/data/regional_thresholds.json). 17 states fitted under V4 (`v4-ndvi-anomaly-baseline-neutral`). Loader at [api/core/regional_calibration.py](api/core/regional_calibration.py) — `lookup_state(lat,lon)`, `regional_level(score, lat, lon, state_hint)`, `get_state_calibration(state)`. Bucket boundaries: LOW < 50th, MODERATE = 50–75th, HIGH = 75–97th, EXTREME ≥ 97th.
- **Validation** in [notebooks/validation_v2.ipynb](notebooks/validation_v2.ipynb) — V2 baseline. V4 chart regeneration is on the TODO list; the V4 thresholds are ~0.80× the V2 ones in summer-dominated states (matches the algorithm change exactly — see `ndvi_factor(0) = 0.80` vs `season_mult(summer) = 1.00`).

### Backend

- **Services** ([api/services/](api/services/)): FIRMS, OWM, Open-Meteo (60-day current + 365-day archive), Overpass (OSM), NCES Public Schools, NIFC WFIGS, Cal Fire, OpenFEMA, Census Geocoder (reverse-geocode), CDSE Sentinel-2 Statistical API.
- **Graceful-fail upstream-error handling** everywhere — one-line print log + safe empty return, no naked tracebacks. Pattern matches [api/services/firms.py](api/services/firms.py). Don't reintroduce `raise_for_status()` without a try/except.
- **Routes** in [api/main.py](api/main.py): `/healthz`, `/fires`, `/risk`, `/risk/calibration`, `/weather`, `/geocode`, `/incidents/near`, `/shelters`, `/disasters/near`.
- `/risk` POST handles three modes in one endpoint:
  1. Coords-only → server fetches KBDI + NDVI + Census state via `asyncio.gather`, returns `regional_level` + `regional_state` + `regional_thresholds`.
  2. `state` field only (Risk Calculator dropdown) → skips Census, uses state directly for regional bucketing, no upstream fetches.
  3. Manual values (kbdi, ndvi_anomaly, season) → pure what-if mode.
- **109 backend tests passing** (`api/tests/`): risk_algorithm (19+) · kbdi (9) · regional_calibration (15) · openmeteo_fetch (6) · build_regional_thresholds (8) · routes (45+ including state-field, regional_thresholds, NDVI, Census paths).

### Calibration data

- [api/data/regional_thresholds.json](api/data/regional_thresholds.json) — 17 states, **V4** (`v4-ndvi-anomaly-baseline-neutral`).
- Backup at [api/data/regional_thresholds.kbdi-pre-v4-backup.json](api/data/regional_thresholds.kbdi-pre-v4-backup.json) — V2/KBDI run; useful for diffing V2 vs V4.
- Backup at [api/data/regional_thresholds.kbdi-10state-backup.json](api/data/regional_thresholds.kbdi-10state-backup.json) — even earlier 10-state version.
- Build script at [scripts/build_regional_thresholds.py](scripts/build_regional_thresholds.py) has incremental save + 429 circuit breaker + deterministic sampling (re-runs reuse the Open-Meteo cache). Passes `ndvi_anomaly=0.0` for baseline-neutral fitting (avoids needing 3400+ CDSE calls during calibration).

### Frontend ([app/](app/))

Stack: Expo SDK 54 + Expo Router + NativeWind v4 + TanStack Query (with AsyncStorage persistence). Reanimated v4 for animations.

**Five tabs**: Status, Map, Safety, Risk Calculator. Plus modal routes for fire-detail / settings / locations.

- **Status** ([app/app/(tabs)/index.tsx](app/app/(tabs)/index.tsx)): HeroOrb dial fills by **regional percentile** (not raw score) so the dial agrees visually with the regional pill — score 0.42 in FL fills to ~97% because that's where it sits in FL's distribution. Headline gating: "Evacuate Immediately" requires fire within 10 mi AND EXTREME weather; "Fire Detected Nearby" for any fire within 20 mi; weather-only copy otherwise. LocalKbdiCard + LocalNdviCard with skeleton + unavailable states.
- **Map** ([app/app/(tabs)/map.tsx](app/app/(tabs)/map.tsx)): react-native-maps with NIFC/Cal Fire named incidents (red Circle overlays), FIRMS satellite dots, bottom sheets, refresh + recenter, counter pills.
- **Safety** ([app/app/(tabs)/safety.tsx](app/app/(tabs)/safety.tsx)): **fully redesigned**. Section ribbons anchor each block. Dynamic hero: when FEMA is active → DisasterBanner is premium hero + WarningBanner is compact; when FEMA absent → WarningBanner promotes itself to premium (`premium={true}`). Closest Active Fire card always shows (proximity meter — left bar lit when far, right bar lit when close, no bars lit when no fire). Numbered preparation checklist with index badges + thicker glowing checkboxes + ProgressArc semicircle. Evacuation Routes section with GlassSegmented toggle (Away From Fire / Nearest Shelter), CompassRose (full 360° precision, not snap-to-8), and premium Suggested Direction / Nearest Shelter cards.
- **Risk Calculator** ([app/app/(tabs)/risk.tsx](app/app/(tabs)/risk.tsx)): **fully redesigned**. PremiumCard score block (slate gradient + level-tinted border + top stripe + grid texture + corner halo + RadialGlow + textShadow on the score). ScoreGauge segmented meter with SCORE marker, ThresholdLine with active bucket emphasized on its own line, RiskLevelButton premium pill. StatePicker as first input. Numbered slider cards in InputCard chrome. Vegetation Signal nested card with Season ↔ NDVI GlassSegmented, 4-season GlassSegmented (when Season mode) + multiplier helper line, Fallback signal panel. Factor Breakdown card with numbered FactorBars (stacked label/meta + bar). "How is this calculated?" link opens ExplainerModal (long-form algorithm walkthrough, preserved verbatim from original).
- **Fire detail** ([app/app/fire-detail.tsx](app/app/fire-detail.tsx)): full incident card with cluster size, NIFC/Cal Fire metadata, named-incident skeleton during isLoading.
- **Saved locations** ([app/app/locations.tsx](app/app/locations.tsx)): SavedLocationsProvider context, persisted to AsyncStorage, swappable from Settings.
- **Cross-screen intent**: IntentProvider for FEMA banner's "Show on map" → Map auto-selects closest incident or FIRMS detection. Reactive context-based.
- **Units**: UnitsProvider for distance/temperature; persisted.
- **Apple Maps universal URLs** for all map deep-links, wrapped in `openExternalUrl` ([app/lib/openUrl.ts](app/lib/openUrl.ts)) which retries once on transient failure + falls back to an Alert.

## Design system

A slate-toned aesthetic that runs across all screens. Shared primitives in [app/components/ui/](app/components/ui/):

### Palette tokens (use these, not custom colors)
- `bg: '#0B0E12'` (screen background, tab bar)
- `surface: '#10141B'` (card surface, slate bottom of gradient)
- `surface2: '#161B24'` (slate top of gradient)
- `text: '#f8fafc'` · `textDim: '#9ca3af'` · `textMute: '#6b7280'`
- `line: 'rgba(255,255,255,0.07–0.09)'` (hairline borders, always 0.5px)
- Risk-level colors: LOW `#7ee787` · MODERATE `#e8b339` · HIGH `#fb923c` · EXTREME `#ef4444`

### Card chrome primitives
- **`PremiumCard`** ([PremiumCard.tsx](app/components/ui/PremiumCard.tsx)) — hero cards. Slate gradient + level-tinted border + top accent stripe + texture (`'grid' | 'stripe'`) + corner `RadialGlow`. Used by: Score block (Risk), AwayCard (Safety), ShelterCard (Safety), DisasterBanner (FEMA), WarningBanner premium variant. Props: `rgb`, `accentColor`, `padding`, `glowPosition`, `glowIntensity`, `textureOpacity`, `texture`.
- **`InputCard`** ([InputCard.tsx](app/components/ui/InputCard.tsx)) — quieter cousin of PremiumCard for inputs. Slate gradient + 0.5px hairline border + inset top hairline highlight. No stripe, no glow, no texture. Used by: every SliderRow, StatePicker, Vegetation Signal wrapper, Factor Breakdown card.

### Layout / display primitives
- **`SectionRibbon`** — colored dot + uppercase mono eyebrow + hairline-to-edge gradient. Optional `action` slot for right-side buttons (Reset to my area, How is this calculated?). Used to anchor every major section on Safety + Risk.
- **`RadialGlow`** — SVG radial gradient circle, soft halo for corner glows + score backdrop. `react-native-svg`-based (CSS `filter: blur` doesn't exist in RN).
- **`StripePattern` / `GridPattern`** (exported from PremiumCard.tsx) — onLayout-measured + explicit Line elements (RN-svg `<Pattern>` doesn't reliably tile).
- **`ScoreGauge`** — horizontal segmented bar (LOW/MOD/HIGH/EXT zones from regional cutoffs) + white SCORE marker. Risk screen hero.
- **`ProgressArc`** — semicircle progress meter, count overlay. Safety's Immediate Preparation.
- **`CompassRose`** — N/E/S/W labels + arrow needle that takes raw `bearingDeg` (full 360° precision). Safety's evac/shelter cards.
- **`GlassSegmented`** — generic segmented control with gradient-filled active option. Used for: Safety mode (away/shelter), Season ↔ NDVI, 4-season chips.
- **`SliderRow`** — wrapped in InputCard. Props: `index` (numbered badge), `bigValue` (hero number), `resetKey` (force remount on seed; bypasses `@react-native-community/slider`'s initial-value-only behavior), `isLoading` skeleton.
- **`StatePicker`** — calibration scope dropdown (Global + 17 fitted states). Wrapped in InputCard.
- **`HelperText`** — inline note with leading hairline bar. Replaces loose gray text under inputs.
- **`SectionRibbon` / `ChecklistCard` / `RiskLevelButton`** / etc — see source for details.

### Status-aware tabs
Tab bar ([app/app/(tabs)/_layout.tsx](app/app/(tabs)/_layout.tsx)) uses slate `#0B0E12` + 0.5px top hairline + per-icon shadow glow on the focused tab.

## Recently modified files (last session bundle)

Massive UI overhaul + algorithm bumps. Highlights:

### New shared primitives (added since last handoff)
- [app/components/ui/PremiumCard.tsx](app/components/ui/PremiumCard.tsx) — hero card chrome
- [app/components/ui/InputCard.tsx](app/components/ui/InputCard.tsx) — input card chrome
- [app/components/ui/SectionRibbon.tsx](app/components/ui/SectionRibbon.tsx) — section dividers
- [app/components/ui/RadialGlow.tsx](app/components/ui/RadialGlow.tsx) — soft halo primitive
- [app/components/ui/ScoreGauge.tsx](app/components/ui/ScoreGauge.tsx) — Risk score gauge
- [app/components/ui/ProgressArc.tsx](app/components/ui/ProgressArc.tsx) — Safety checklist arc
- [app/components/ui/CompassRose.tsx](app/components/ui/CompassRose.tsx) — evac compass
- [app/components/ui/GlassSegmented.tsx](app/components/ui/GlassSegmented.tsx) — generic segmented control
- [app/components/ui/StatePicker.tsx](app/components/ui/StatePicker.tsx) — calibration scope dropdown
- [app/components/ui/StaticGlow.tsx](app/components/ui/StaticGlow.tsx) — multi-palette radial-gradient bg
- [app/lib/openUrl.ts](app/lib/openUrl.ts) — `openExternalUrl` with retry + Alert fallback

### Screens
- [app/app/(tabs)/risk.tsx](app/app/(tabs)/risk.tsx) — full redesign
- [app/app/(tabs)/safety.tsx](app/app/(tabs)/safety.tsx) — full redesign
- [app/app/(tabs)/_layout.tsx](app/app/(tabs)/_layout.tsx) — tab bar slate aesthetic + active-tab glow
- [app/app/(tabs)/index.tsx](app/app/(tabs)/index.tsx) — HeroOrb percentile mapping, NDVI card, headline gating, score block consistency

### Backend
- [api/core/regional_calibration.py](api/core/regional_calibration.py) — `get_state_calibration` helper, `regional_level` lat/lon optional
- [api/routes/risk.py](api/routes/risk.py) — `state` field on RiskRequest, `regional_thresholds` in RiskResponse, asyncio.gather across KBDI/NDVI/Census, state-only path
- [api/services/ndvi_cache.py](api/services/ndvi_cache.py) — 6h negative TTL (was 2d), 3-year climatology window for live path
- [api/services/cdse.py](api/services/cdse.py) — full Sentinel Hub Statistical API client
- [api/core/ndvi.py](api/core/ndvi.py) — anomaly + factor math

### Tests
- [api/tests/test_regional_calibration.py](api/tests/test_regional_calibration.py) — added 7 tests for `get_state_calibration` + state-only `regional_level` path
- [api/tests/test_routes.py](api/tests/test_routes.py) — added 5 tests for `state` body field, `regional_thresholds` shape, Census skip when state hint supplied
- Total: **109 backend tests passing** (was 75; added 34)

## What's done that was previously "still open"

(Crossing items off the prior handoff so a fresh session doesn't redo them.)

- ✅ **V4 NDVI integration** (was deferred). CDSE + cache + algorithm + recalibration all done.
- ✅ **NDVI anomaly** (was deferred). Same.
- ✅ **Re-calibration after NDVI**. Done (`v4-ndvi-anomaly-baseline-neutral`).
- ✅ **Frontend integration of regional_level**. Status pill + dial percentile mapping + Risk Calculator state dropdown all wired.
- ✅ **Show KBDI value somewhere**. LocalKbdiCard on Status.
- ✅ **Border-overlap state lookup** (Reno NV). Fixed via Census reverse-geocode as authoritative source.
- ✅ **Calibration meta on Risk Calc**. ExplainerModal updated.
- ✅ **Animated background revisit**. WavesBackground on Status at 30fps with focus pause; StaticGlow on Risk + Safety.

## Still open

### Polish for portfolio readiness
- **README at repo root** — needs full rewrite reflecting V4, the redesign, the cohesive aesthetic. Should include: architecture diagram, 3-command "how to run", data sources table with attribution, fresh screenshots, link to validation chart, disclaimer block.
- **Fresh screenshots + GIF demo** — the existing screenshots predate the entire UI overhaul. All 4 tabs need new caps.
- **Regenerate V4 validation chart** at [notebooks/figures/regional_thresholds.png](notebooks/figures/regional_thresholds.png) — current chart is V2. The validation notebook needs a V4 rerun pass.
- **Disclaimer screen** on first launch — Apple Dev review will flag any weather/safety app without one. Hasn't been built.

### App Store on-ramp (none started)
- App icon (1024×1024).
- Splash screen via `expo-splash-screen`.
- `eas build:configure` + EAS Build setup.
- Apple Developer account ($99/yr).
- TestFlight → App Store review.
- Privacy policy (required since the app uses location).

### Backend / infrastructure
- **Security review** — never done. Audit: API key handling in env files (currently OK), CORS settings (currently `*`), rate limiting (none), Pydantic input validation (decent but unaudited), the OAuth token cache in `cdse.py`.
- **Deploy to Railway** — API currently only runs from the laptop, so the phone needs the dev server up. Live deploy unblocks demos. Railway free tier has 15-min cold start; show skeleton state on the frontend.
- **Custom domain** + HTTPS + production env vars.

### Deferred features
- **Web app port** (Expo for Web). Main blocker: `react-native-maps` doesn't work on web; need react-leaflet or @react-google-maps/api swapped via `.native.tsx`/`.web.tsx` files. ~1–2 weeks. Sequenced after Railway.
- **Further phone-heat reduction** (already did 30fps + focus-pause + AppState gating). Next-level options: react-native-skia migration for GPU rendering, "Reduce Motion" accessibility respect, iOS `ProcessInfo.thermalState` adaptive degradation.
- **Push notifications** when a fire is detected near you — needs development build (not Expo Go) + scheduled backend job.
- **Activated-shelter feed (real shelters during a real emergency).** Today the Safety screen only shows "potential" shelters (OSM community-tagged + NCES schools); the [ShelterInfoModal](app/app/(tabs)/safety.tsx) explains the distinction and promises "activated shelters in a future release." Three candidate sources, in order of cleanliness: (1) Red Cross Open Shelters — recommended V1; they publish a public map and the underlying JSON is workable though not officially documented as a stable API. (2) FEMA NSS — official but access is restricted to government partners (would need to apply). (3) State/county emergency-management offices — fragmented across PDFs and social posts, not realistic as a feed. Backend work: new service `red_cross.py` parsing the feed, new route `/shelters/activated`, frontend overlays the layer on Safety with a distinct "ACTIVATED" badge.
- **Safety Action Plan / evacuation routing** — currently just shelter list; could add routing API integration.
- **Analytics dashboard** (fires per month/region over time) — out of scope so far.

### Algorithm V5 work (deferred)
- **Lightning vs human-caused fire split** — V1 validation flagged the dataset's biggest spring-peak misalignment here; would need separate thresholds per ignition source.

### Frontend bugs to revisit
- **Map circle hit-test at zoom extremes** — circles smaller than `MIN_INCIDENT_RADIUS_M=500` may not register taps reliably. Consider invisible marker overlay for accessibility.
- **Show-on-map cold-start fragility** — consolidated effect uses `intentJustHandledRef`; works in testing but the pattern is fragile if more intent flows get added.

## Don't break

- **The algorithm** ([api/core/risk_algorithm.py](api/core/risk_algorithm.py) + [api/core/ndvi.py](api/core/ndvi.py) + [api/core/kbdi.py](api/core/kbdi.py)) — pure functions, well-tested, intentionally simple. The `ndvi_factor` clamps at `[0.40, 1.00]`, so anomaly inputs past ±~0.40 just saturate the factor; safe to feed wide ranges.
- **The 17-state regional calibration** ([api/data/regional_thresholds.json](api/data/regional_thresholds.json)) — re-running it costs Open-Meteo quota + ~30+ min wall time on a cached run. Backups at `regional_thresholds.kbdi-pre-v4-backup.json` and `regional_thresholds.kbdi-10state-backup.json`.
- **The graceful-fail pattern** in services — don't reintroduce `raise_for_status()` without try/except.
- **The Context providers** (`UnitsProvider`, `SavedLocationsProvider`, `IntentProvider`) — load-bearing for cross-screen state.
- **The slider remount key pattern** (`resetKey={seedNonce}` on every SliderRow on Risk) — `@react-native-community/slider` treats `value` as initial-only; without the keyed remount on seed, the thumb sticks at its last drag position when applyLocal runs.
- **The `risk.dataUpdatedAt > transitionAnchor` pattern** for Risk score transition loading — handles the "stale cache hit while debounce is pending" case where `risk.isFetching` is briefly false but the data is for the previous location.
- **The slate `#10141B` / `#161B24` color tokens** — every card surface uses these. Don't introduce custom backgrounds.

## How to run locally

```powershell
# Backend (from project root)
.\.venv\Scripts\Activate.ps1
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
# Verify: http://localhost:8000/docs

# Frontend (separate terminal)
cd app
npx expo start
# Scan QR with Expo Go on phone (same Wi-Fi)
# If different Wi-Fi: npx expo start --tunnel

# Tests
.\.venv\Scripts\Activate.ps1
python -m pytest api/
# 109 tests should pass
```

Notes:
- `uvicorn` invoked via `python -m uvicorn` rather than `uvicorn.exe` because Windows Application Control blocks the `.exe` shim. Same workaround applies to any pip-installed CLI tool.
- For typechecking the frontend: `cd app; npx tsc --noEmit` from the repo root after activating any nothing-special PS session.
- For the CDSE NDVI integration, `api/.env` needs `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET` (free Copernicus Data Space Ecosystem account).
