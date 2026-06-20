'use client';

// Risk Forecast orchestrator. Owns: input state (temp/humidity/wind/kbdi/season/ndvi),
// region selection, vegetation mode. Computes the what-if score LOCALLY via
// computeRiskLocal (offline, no /risk round-trip) and renders the hero + factor
// breakdown + inputs grid + insights rail. Only the location seeding below
// ("reset to my area") hits the backend.
//
// Two seeding flows:
//   1. AUTO-SEED — on first load (and whenever the user's location changes),
//      if the user hasn't touched any slider yet, swap the hardcoded
//      placeholder values for real local readings (mirrors mobile's seed effect).
//   2. RESET TO MY AREA — manual button that always reseeds + clears the
//      "user touched" flag so subsequent location changes auto-seed again.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@/components/Icon';
import { FactorBreakdown } from '@/components/risk/FactorBreakdown';
import {
  HeroScorePanel,
  regionName,
  type RegionCode,
} from '@/components/risk/HeroScorePanel';
import { DroughtPanel, type DroughtMode } from '@/components/risk/DroughtPanel';
import { InputPanel } from '@/components/risk/InputPanel';
import { InsightsRail } from '@/components/risk/InsightsRail';
import { VegetationPanel, type VegMode } from '@/components/risk/VegetationPanel';
import { PageSection } from '@/components/ui/PageSection';
import { SectionEyebrow } from '@/components/ui/SectionEyebrow';
import { useAesthetic } from '@/lib/aesthetic';
import { dangerToRisk, type RiskRequest, type Season } from '@/lib/api';
import { useRiskFromWeather, useWeather } from '@/lib/queries';
import { lookupStateLocal } from '@/lib/regional-thresholds';
import { computeRiskLocal } from '@/lib/risk-local';
import { floorLow, getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { useUserLocation } from '@/lib/use-location';
import { useUnits } from '@/lib/use-units';
import { V4_WEIGHTS } from '@/lib/v4-weights';

// Defaults match the reference Risk Forecast screenshot so the
// computed score lands at ~0.33 with FL calibration ("Risk Level: Extreme" —
// FL's fitted EXT cutoff is ~0.32).
// Wind default is in **km/h** because the backend's `wind_speed` field
// (api/routes/risk.py) is documented as km/h, and weather.wind_speed from
// /weather is returned in km/h. 15 kph ≈ 9.3 mph — matches mobile's default
// in app/(tabs)/risk.tsx so first-paint risk scores agree across platforms.
const DEFAULTS = {
  temperature: 33,
  humidity: 38,
  wind: 15,
  // 400 is roughly midway through KBDI's "moderate" band (200-500); a neutral
  // starting point when the user hasn't yet seeded from local drought data.
  kbdi: 400,
  // Default days-since-rain when the user toggles to the days mode without
  // seeded data. 7 is the same default used by useRiskFromWeather as a
  // neutral mid-band value for the exponential drying proxy.
  daysSinceRain: 7,
  season: 'spring' as Season,
  ndvi: 0,
  // Default to Global (null) — matches mobile (app/(tabs)/risk.tsx defaults
  // selectedState to null). applyLocal flips this to the user's actual state
  // once /risk's regional_state lands, mirroring mobile's seed behavior.
  region: null as RegionCode,
  // Default to NDVI mode so both vegetation AND drought signals open on
  // their satellite/measured-data tracks (NDVI + KBDI) for a consistent
  // "real-data first" initial state. User can still toggle to the season
  // proxy via the segmented control.
  vegMode: 'ndvi' as VegMode,
  droughtMode: 'kbdi' as DroughtMode,
};

const SEASON_LABEL: Record<Season, string> = {
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
};

/** Qualitative interpretation of an NDVI anomaly value for the Factor
 *  Breakdown's vegetation-factor context line. Bands match the bucketed
 *  labels in the mobile Risk Calculator's ndviLabel() — same semantic
 *  ranges, slightly different copy phrased for the parenthetical context. */
function ndviQualitative(anomaly: number): string {
  if (anomaly <= -0.10) return 'much drier than 3-yr norm — more fire risk';
  if (anomaly <= -0.03) return 'drier than 3-yr norm';
  if (anomaly <   0.03) return 'near 3-yr norm';
  if (anomaly <   0.10) return 'greener than 3-yr norm';
  return 'much greener than 3-yr norm — less fire risk';
}

function currentSeason(): Season {
  const m = new Date().getMonth();
  if (m < 2 || m === 11) return 'winter';
  if (m < 5) return 'spring';
  if (m < 8) return 'summer';
  return 'fall';
}

export function RiskScreen() {
  const { accent } = useAesthetic();
  const units = useUnits();

  const [temperature, setTemperatureRaw] = useState(DEFAULTS.temperature);
  const [humidity, setHumidityRaw] = useState(DEFAULTS.humidity);
  const [wind, setWindRaw] = useState(DEFAULTS.wind);
  const [kbdi, setKbdiRaw] = useState(DEFAULTS.kbdi);
  const [daysSinceRain, setDaysSinceRainRaw] = useState(DEFAULTS.daysSinceRain);
  const [season, setSeasonRaw] = useState<Season>(DEFAULTS.season);
  const [ndvi, setNdviRaw] = useState(DEFAULTS.ndvi);
  const [region, setRegion] = useState<RegionCode>(DEFAULTS.region);
  const [vegMode, setVegMode] = useState<VegMode>(DEFAULTS.vegMode);
  const [droughtMode, setDroughtMode] = useState<DroughtMode>(DEFAULTS.droughtMode);

  // "User has manually moved a slider" — once true, the auto-seed effect
  // stops overwriting their values when fresh local data arrives. Reset to
  // my area clears it so subsequent location changes auto-seed again.
  const userTouchedRef = useRef(false);
  // Region (calibration state) auto-follows the active location. Tracked
  // SEPARATELY from slider seeding because the region only needs coordinates (a
  // client-side lookup), so it must update even OFFLINE when the backend seed
  // fails. `regionManualRef` guards a user's explicit pick from being
  // overridden by the backend value until the location next changes.
  const regionLocKeyRef = useRef<string | null>(null);
  const regionManualRef = useRef(false);
  // Per-slider "user touched" flags for KBDI + NDVI specifically — used to
  // hide the "Couldn't fetch" warning once the user supplies their own value.
  // The warning reappears after Reset to my area (which clears these flags).
  const [kbdiUserSet, setKbdiUserSet] = useState(false);
  const [ndviUserSet, setNdviUserSet] = useState(false);
  const markTouched = () => {
    userTouchedRef.current = true;
  };
  const setTemperature = (v: number) => { markTouched(); setTemperatureRaw(v); };
  const setHumidity    = (v: number) => { markTouched(); setHumidityRaw(v); };
  const setWind        = (v: number) => { markTouched(); setWindRaw(v); };
  const setKbdi        = (v: number) => { markTouched(); setKbdiUserSet(true); setKbdiRaw(v); };
  const setDaysSinceRain = (v: number) => { markTouched(); setKbdiUserSet(true); setDaysSinceRainRaw(Math.round(v)); };
  const setSeason      = (v: Season) => { markTouched(); setSeasonRaw(v); };
  const setNdvi        = (v: number) => { markTouched(); setNdviUserSet(true); setNdviRaw(v); };
  // Wrap the region picker so an explicit pick (e.g. user choosing "Global")
  // marks the screen as user-touched. Without this, the auto-seed effect
  // would silently re-set region back to the user's local state when /risk
  // refetches — overriding their pick.
  const pickRegion = (v: RegionCode) => { regionManualRef.current = true; markTouched(); setRegion(v); };

  // Local readings — re-uses Status's cached queries (same coords) so this
  // is usually free. KBDI is the gate; NDVI is allowed to fail and falls back
  // to the season multiplier.
  const loc = useUserLocation();
  const localWeather = useWeather(loc.coords);
  const localRisk = useRiskFromWeather(localWeather.data, loc.coords);
  const localTemp = localWeather.data?.temperature ?? null;
  const localHumidity = localWeather.data?.humidity ?? null;
  const localWind = localWeather.data?.wind_speed ?? null;
  const localKbdi = localRisk.data?.kbdi ?? null;
  // Real backend-computed days-since-rain from the Open-Meteo precip pull
  // (api/routes/risk.py:days_since_rain_observed). Replaces the previous
  // KBDI/100 proxy — accurate when available, null when the archive fetch
  // failed (in which case applyLocal falls back to the Status-style days=7).
  const localDays = localRisk.data?.days_since_rain_observed ?? null;
  const localNdvi = localRisk.data?.ndvi_anomaly ?? null;
  // Mirror mobile's gate (app/(tabs)/risk.tsx): require the /risk response to
  // have resolved, but DON'T require KBDI to be populated. Backend can return
  // a partial /risk (kbdi: null) when Open-Meteo's drought-history fetch fails
  // or hits its quota. Requiring kbdi !== null here would otherwise leave the
  // sliders stuck on hardcoded defaults and disable "Reset to my area" — the
  // exact symptom Bronson FL hit on a day Open-Meteo was rate-limited.
  // `applyLocal` already skips any field that's null, so partial seeding is
  // safe.
  const localReady =
    localTemp != null &&
    localHumidity != null &&
    localWind != null &&
    localRisk.data !== undefined;
  const localFailed = localWeather.isError || localRisk.isError;

  const applyLocal = useCallback((seedMode: 'auto' | 'reset' = 'auto') => {
    if (localTemp != null) setTemperatureRaw(Math.round(localTemp));
    if (localHumidity != null) setHumidityRaw(Math.round(localHumidity));
    if (localWind != null) setWindRaw(Math.round(localWind));
    // Drought + NDVI seeding strategy depends on WHY we're seeding:
    //   - seedMode='auto' (location change / first load): full refresh.
    //     If fetch failed, fall back to the neutral DEFAULTS so we don't
    //     leak the PREVIOUS location's value across a location switch.
    //   - seedMode='reset' (user clicked Reset to my area): preserve the
    //     user's manual value when the fetch failed — they intentionally
    //     set it knowing data was missing, so don't clobber it.
    // The *UserSet flags are cleared unconditionally so the warning
    // re-displays after a Reset on a still-failing upstream.
    if (localKbdi != null) {
      setKbdiRaw(Math.round(localKbdi));
    } else if (seedMode === 'auto') {
      setKbdiRaw(DEFAULTS.kbdi);
    }
    if (localDays != null) {
      setDaysSinceRainRaw(Math.max(0, localDays));
    } else if (seedMode === 'auto') {
      setDaysSinceRainRaw(DEFAULTS.daysSinceRain);
    }
    setSeasonRaw(currentSeason());
    if (localNdvi != null) {
      setNdviRaw(Number(localNdvi.toFixed(3)));
    } else if (seedMode === 'auto') {
      setNdviRaw(DEFAULTS.ndvi);
    }
    // (Calibration region is auto-selected by the dedicated effect below — it
    // only needs coordinates, so it must follow the location even offline when
    // this backend seed fails.)
    // Clear the per-slider "user supplied this value" flags so the
    // KBDI / NDVI fetch-failed warnings reappear if those upstreams are
    // still down. Matches mobile applyLocal behavior.
    setKbdiUserSet(false);
    setNdviUserSet(false);
  }, [localTemp, localHumidity, localWind, localKbdi, localDays, localNdvi]);

  // Upstream failure flags — `localRisk.data !== undefined` means the /risk
  // call resolved; within that, kbdi/ndvi_anomaly being null means the
  // specific upstream (Open-Meteo / CDSE Sentinel-2) failed for the user's
  // coords. The warnings are gated on these + the user not having already
  // supplied a value (matches mobile).
  const localFetchComplete = localRisk.data !== undefined;
  const localKbdiFailed = localFetchComplete && localKbdi == null;
  const localNdviFailed = localFetchComplete && localNdvi == null;

  /** Reset button — re-seeds every input from the user's location and snaps the
   *  calibration region back to the location's state, clearing the user-touched
   *  + manual-region flags so subsequent location changes auto-seed again.
   *  Matches mobile's "Reset to my area" behavior. */
  const resetToLocal = useCallback(() => {
    applyLocal('reset');
    userTouchedRef.current = false;
    regionManualRef.current = false;
    setRegion(
      localRisk.data?.regional_state ?? lookupStateLocal(loc.coords.lat, loc.coords.lon),
    );
  }, [applyLocal, localRisk.data?.regional_state, loc.coords.lat, loc.coords.lon]);

  // Auto-seed: on first load (and whenever the location's local readings
  // change), if the user hasn't manually edited anything, swap the placeholder
  // defaults for real local values. Tracks the seeded snapshot so location
  // changes always reseed, and content updates only reseed when untouched.
  //
  // `appliedLocKey` (state, not ref — needs to drive re-render of the
  // skeletons) tracks the locKey we've LAST successfully seeded for. When
  // `appliedLocKey !== locKey`, the screen is in "about to be seeded" state:
  // slider values are stale (the previous location's), so we render skeletons
  // until the new seed lands. Mirrors mobile (app/(tabs)/risk.tsx:177).
  const seededLocKeyRef = useRef<string | null>(null);
  const seededContentRef = useRef<string | null>(null);
  const [appliedLocKey, setAppliedLocKey] = useState<string | null>(null);
  const locKey = `${loc.coords.lat.toFixed(3)},${loc.coords.lon.toFixed(3)}`;
  const contentKey = `${localTemp}|${localHumidity}|${localWind}|${localKbdi}|${localNdvi}`;
  useEffect(() => {
    if (!localReady) return;
    const locChanged = seededLocKeyRef.current !== locKey;
    const contentChanged = seededContentRef.current !== contentKey;
    if (!locChanged && !contentChanged) return;
    if (!locChanged && userTouchedRef.current) return;
    applyLocal();
    if (locChanged) userTouchedRef.current = false;
    seededLocKeyRef.current = locKey;
    seededContentRef.current = contentKey;
    setAppliedLocKey(locKey);
  }, [localReady, locKey, contentKey, applyLocal]);

  // Calibration region auto-follows the active location — even OFFLINE, since it
  // only needs coordinates (lookupStateLocal mirrors the backend's lookup_state
  // bbox/centroid logic). On a location change it re-selects from the client
  // lookup immediately; when the backend's authoritative reverse-geocoded state
  // resolves it upgrades to that — unless the user has manually picked a region
  // since the location last changed.
  useEffect(() => {
    if (regionLocKeyRef.current !== locKey) {
      regionLocKeyRef.current = locKey;
      regionManualRef.current = false;
      setRegion(
        localRisk.data?.regional_state ?? lookupStateLocal(loc.coords.lat, loc.coords.lon),
      );
      return;
    }
    if (!regionManualRef.current && localRisk.data?.regional_state != null) {
      setRegion(localRisk.data.regional_state);
    }
  }, [locKey, localRisk.data?.regional_state, loc.coords.lat, loc.coords.lon]);

  // If local data outright failed, drop the skeletons — show the hardcoded
  // defaults so the user can still play with the calculator (and the
  // FetchErrorBanner above explains why).
  useEffect(() => {
    if (localFailed) setAppliedLocKey(locKey);
  }, [localFailed, locKey]);

  // Slider skeleton gate. True on first mount (appliedLocKey is null) AND
  // for the brief window after a saved-location switch (locKey changed but
  // the auto-seed effect hasn't run for the new key yet). False once we've
  // applied the seed for the current location, even if the user has since
  // manually adjusted a slider — user-supplied values aren't a loading state.
  const inputsLoading = appliedLocKey !== locKey;

  const req: RiskRequest = useMemo(
    () => ({
      temperature,
      humidity,
      wind_speed: wind,
      // days_since_rain is required by the backend schema (api/routes/risk.py)
      // even when KBDI is supplied. When droughtMode === 'kbdi' we send the
      // proxy as filler (the backend ignores it once kbdi is set). When
      // 'days', we send the actual user-controlled days value and OMIT kbdi
      // so the algorithm uses the 1 - exp(-days/15) drying proxy.
      days_since_rain: droughtMode === 'days' ? daysSinceRain : Math.round(kbdi / 100),
      season,
      ...(droughtMode === 'kbdi' ? { kbdi } : {}),
      ...(vegMode === 'ndvi' ? { ndvi_anomaly: ndvi } : {}),
      // null region = Global cutoffs (don't send `state` to backend)
      ...(region ? { state: region } : {}),
    }),
    [temperature, humidity, wind, kbdi, daysSinceRain, droughtMode, season, ndvi, vegMode, region],
  );

  // The what-if score is a pure function of the slider inputs — compute it
  // LOCALLY (offline, instant, no per-keystroke /risk round-trip). The backend
  // stays the authority for the live Status/Safety flows; the calculator only
  // needs the V4 formula + the bundled per-state calibration cutoffs. This also
  // removes the old "fake placeholder on error" behavior — there's no request
  // to fail. See web/lib/risk-local.ts. (Seeding from the user's real location
  // — localWeather/localRisk above — still uses the backend.)
  const risk = useMemo(() => computeRiskLocal(req), [req]);

  const score = risk.risk_score;
  const level: RiskLevel = risk.regional_level
    ? dangerToRisk(risk.regional_level)
    : dangerToRisk(risk.danger_level);
  const factors = risk.factors;

  // Dominant driver — pick the largest WEIGHTED contribution. Weights mirror
  // the fitted V4 exponents (api/core/risk_algorithm.py RiskParams).
  const contrib = {
    vpd: factors.vpd * V4_WEIGHTS.vpd,
    wind: factors.wind * V4_WEIGHTS.wind,
    drought: factors.drought * V4_WEIGHTS.drought,
  };
  const dominant: 'vpd' | 'wind' | 'drought' = ((['vpd', 'wind', 'drought'] as const) as ('vpd' | 'wind' | 'drought')[])
    .reduce<'vpd' | 'wind' | 'drought'>((acc, k) => (contrib[k] > contrib[acc] ? k : acc), 'vpd');
  const dominantLabel = {
    vpd: 'Vapor Pressure Deficit',
    wind: 'Wind',
    drought: 'Drought',
  }[dominant];
  const dominantDescription = {
    vpd: 'Dry, hot air pulls moisture out of fuels faster than wind alone.',
    wind: 'Sustained wind drives spread rate and makes containment harder.',
    drought: 'Soil moisture deficit primes fuels for rapid ignition.',
  }[dominant];

  // `sr` drives the ambient accent across the inputs grid (slider track, glow
  // ring, section eyebrow). Floor 'low' to 'moderate' so the whole page stays
  // warm/amber instead of going green/muted when conditions are calm.
  const sr = getRisk(floorLow(level), accent);
  const regionDisplay = regionName(region);

  return (
    <>
      {/* ───── HERO ────────────────────────────────────────────────── */}
      <PageSection top={36} bottom={28}>
        <SectionEyebrow
          color="#E8B339"
          right={`Calibrated for ${regionDisplay}${region ? ` · Global: ${capitalize(risk.danger_level)}` : ''}`}
        >
          Fire-Weather What-If
        </SectionEyebrow>

        <div
          className="app-stack"
          style={{
            // Asymmetric editorial split — the score panel reads as the
            // headline, the factor breakdown as a side caption. Pushing the
            // ratio past 1.5 stops it feeling like a balanced 50/50 grid.
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)',
            gap: 24,
          }}
        >
          <HeroScorePanel
            score={score}
            level={level}
            region={region}
            onRegionChange={pickRegion}
            thresholds={risk.regional_thresholds ?? null}
            isLoading={inputsLoading}
          />
          <FactorBreakdown
            vpd={factors.vpd}
            wind={factors.wind}
            drought={factors.drought}
            season={factors.season}
            seasonLabel={vegMode === 'season' ? SEASON_LABEL[season] : 'NDVI'}
            caption={{
              vpd: `${
                units.temp === 'F'
                  ? Math.round((temperature * 9) / 5 + 32)
                  : Math.round(temperature)
              }°${units.temp} · ${humidity}% RH`,
              wind: `${
                units.speed === 'mph' ? Math.round(wind * 0.621371) : Math.round(wind)
              } ${units.speed}`,
              drought: `${kbdi} KBDI`,
            }}
            vegetationDetail={
              vegMode === 'ndvi'
                ? `NDVI anomaly: ${ndvi >= 0 ? '+' : ''}${ndvi.toFixed(2)} (${ndviQualitative(ndvi)})`
                : `Estimated from the season. No recent satellite reading for this spot.`
            }
          />
        </div>
      </PageSection>

      {/* Local-fetch status — only shown if the weather/risk lookup actually
       *  failed for the user's current location. Lets them know the inputs
       *  below are hardcoded defaults, not their real conditions. */}
      {localFailed ? (
        <PageSection top={0} bottom={0}>
          <FetchErrorBanner
            locLabel={loc.label}
            onRetry={() => { localWeather.refetch(); localRisk.refetch(); }}
          />
        </PageSection>
      ) : null}

      {/* ───── INPUTS + INSIGHTS ───────────────────────────────────── */}
      <PageSection top={20} bottom={56}>
        <SectionEyebrow
          color={sr.color}
          right={
            <ResetButton
              onClick={resetToLocal}
              ready={localReady}
              loading={localWeather.isLoading || localRisk.isLoading}
              locLabel={loc.label}
            />
          }
        >
          Inputs · Adjust to Compare
        </SectionEyebrow>

        {/* Three stacked rows — 3-up numeric sliders, 2-up qualitative panels,
         *  then a full-width Dominant Driver hero. Replaces the prior
         *  1.4fr/1fr split that crammed the dominant-driver card into a
         *  sticky side rail. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Row 1: three numeric sliders side-by-side */}
          <div className="app-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            {/* Slider state is stored in °C/mph (backend's expected units).
             *  Display-only conversion: when units.temp === 'F' the slider's
             *  value, min, max are converted to °F and reads of onChange are
             *  converted back. Same pattern for wind/mph→kph. */}
            <InputPanel
              label="Temperature"
              value={units.temp === 'F' ? (temperature * 9) / 5 + 32 : temperature}
              unit={`°${units.temp}`}
              min={units.temp === 'F' ? 14 : -10}
              max={units.temp === 'F' ? 113 : 45}
              color={sr.color}
              glowRgb={sr.glow}
              index={1}
              caption="Hotter air pulls moisture from fuels faster. Combined with humidity, it sets how drying the air is."
              onChange={(v) => setTemperature(units.temp === 'F' ? ((v - 32) * 5) / 9 : v)}
              isLoading={inputsLoading}
            />
            <InputPanel
              label="Humidity"
              value={humidity}
              unit="%"
              min={0}
              max={100}
              color={sr.color}
              glowRgb={sr.glow}
              index={2}
              caption="Lower humidity means drier fuels that ignite and spread more easily."
              onChange={setHumidity}
              isLoading={inputsLoading}
            />
            <InputPanel
              label="Wind Speed"
              value={units.speed === 'mph' ? wind * 0.621371 : wind}
              unit={` ${units.speed}`}
              min={0}
              max={units.speed === 'mph' ? 37 : 60}
              color={sr.color}
              glowRgb={sr.glow}
              index={3}
              caption="Sustained 10-minute average. Faster wind spreads fire quicker and makes it harder to predict."
              onChange={(v) => setWind(units.speed === 'mph' ? v / 0.621371 : v)}
              isLoading={inputsLoading}
            />
          </div>

          {/* Row 2: vegetation (left) + drought (right) — order matches the
           *  reference. Both have segmented mode toggles + amber callouts. */}
          <div className="app-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <VegetationPanel
              mode={vegMode}
              onModeChange={setVegMode}
              season={season}
              onSeasonChange={setSeason}
              ndvi={ndvi}
              onNdviChange={setNdvi}
              color={sr.color}
              glowRgb={sr.glow}
              isLoading={inputsLoading}
              ndviFooter={
                !inputsLoading && localNdviFailed && !ndviUserSet ? (
                  <WarningInline
                    bold="Couldn't fetch your area's NDVI."
                    rest="Likely cloud cover over the last several Sentinel-2 passes, or outside coverage. Slide it manually for a what-if."
                  />
                ) : null
              }
            />
            <DroughtPanel
              mode={droughtMode}
              onModeChange={setDroughtMode}
              kbdi={kbdi}
              onKbdiChange={setKbdi}
              daysSinceRain={daysSinceRain}
              onDaysChange={setDaysSinceRain}
              color={sr.color}
              glowRgb={sr.glow}
              isLoading={inputsLoading}
              footer={
                !inputsLoading && localKbdiFailed && !kbdiUserSet ? (
                  <WarningInline
                    bold="Couldn't fetch your area's drought signal."
                    rest="Open-Meteo Archive didn't respond, so Reset to my area can't fill this with your real value. Slide it manually for a what-if."
                  />
                ) : null
              }
            />
          </div>

          {/* Row 3: full-width Dominant Driver hero with VPD/Wind/Drought
           *  share strip on the right. */}
          <InsightsRail
            dominantLabel={dominantLabel}
            dominantDescription={dominantDescription}
            shares={{ vpd: factors.vpd, wind: factors.wind, drought: factors.drought }}
            isLoading={inputsLoading}
          />
        </div>
      </PageSection>
    </>
  );
}

/** Amber callout shown when KBDI or NDVI failed to fetch from their upstream
 *  source. Mirrors mobile's WarningInline in app/(tabs)/risk.tsx: small
 *  triangle icon, bold lead-in + dim continuation, soft amber background. */
function WarningInline({ bold, rest }: { bold: string; rest: string }) {
  const AMBER = '#E8B339';
  const AMBER_RGB = '232, 179, 57';
  const { ae } = useAesthetic();
  return (
    <div
      role="status"
      style={{
        marginTop: 10,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 10,
        border: `0.5px solid rgba(${AMBER_RGB}, 0.30)`,
        background: `rgba(${AMBER_RGB}, 0.05)`,
      }}
    >
      <Icon name="warn" size={11} color={AMBER} strokeWidth={1.8} style={{ marginTop: 2, flexShrink: 0 }} />
      <span
        style={{
          flex: 1,
          fontFamily: ae.fontBody,
          fontSize: 11,
          lineHeight: 1.45,
          color: AMBER,
        }}
      >
        <span style={{ fontWeight: 700 }}>{bold} </span>
        <span style={{ color: ae.textDim }}>{rest}</span>
      </span>
    </div>
  );
}

function ResetButton({
  onClick,
  ready,
  loading,
  locLabel,
}: {
  onClick: () => void;
  ready: boolean;
  loading: boolean;
  locLabel: string;
}) {
  const { ae } = useAesthetic();
  const tip = ready
    ? `Seed inputs from ${locLabel}'s current weather + drought + vegetation.`
    : loading
      ? `Fetching weather + drought + vegetation for ${locLabel}…`
      : `No local data available for ${locLabel}.`;
  return (
    <button
      type="button"
      onClick={ready ? onClick : undefined}
      disabled={!ready}
      title={tip}
      aria-label={tip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 99,
        background: ready ? `rgba(${RISK_LEVELS.low.glow}, 0.10)` : 'rgba(255, 255, 255, 0.04)',
        border: `0.5px solid ${ready ? `rgba(${RISK_LEVELS.low.glow}, 0.30)` : ae.line}`,
        color: ready ? RISK_LEVELS.low.color : ae.textMute,
        cursor: ready ? 'pointer' : 'not-allowed',
        fontFamily: ae.fontMono,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: ae.chipUpper ? 'uppercase' : 'none',
        opacity: ready ? 1 : 0.5,
      }}
    >
      <span style={{ display: 'inline-flex', animation: loading ? 'px-rotate 0.9s linear infinite' : 'none' }}>
        <Icon
          name="refresh"
          size={11}
          color={ready ? RISK_LEVELS.low.color : ae.textMute}
          strokeWidth={1.8}
        />
      </span>
      Reset to my area
    </button>
  );
}

const AMBER = '#E8B339';
const AMBER_RGB = '232, 179, 57';

function FetchErrorBanner({ locLabel, onRetry }: { locLabel: string; onRetry: () => void }) {
  const { ae } = useAesthetic();
  return (
    <div
      style={{
        marginTop: 4,
        padding: '12px 16px',
        borderRadius: 10,
        background: `linear-gradient(180deg, rgba(${AMBER_RGB}, 0.06), rgba(${AMBER_RGB}, 0.02))`,
        border: `0.5px solid rgba(${AMBER_RGB}, 0.30)`,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <Icon name="warn" size={16} color={AMBER} strokeWidth={1.8} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 13.5,
            fontWeight: 600,
            color: ae.text,
            letterSpacing: ae.titleTracking,
          }}
        >
          Couldn&apos;t fetch local data for {locLabel}
        </div>
        <div style={{ marginTop: 2, fontFamily: ae.fontBody, fontSize: 12, color: ae.textDim }}>
          The inputs below show placeholder defaults until the weather / drought / NDVI services come back.
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: '6px 12px',
          borderRadius: 8,
          background: 'transparent',
          border: `0.5px solid rgba(${AMBER_RGB}, 0.35)`,
          color: AMBER,
          cursor: 'pointer',
          fontFamily: ae.fontMono,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: ae.chipUpper ? 'uppercase' : 'none',
        }}
      >
        Retry
      </button>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
