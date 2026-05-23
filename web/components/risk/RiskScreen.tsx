'use client';

// Risk Forecast orchestrator. Owns: input state (temp/humidity/wind/kbdi/season/ndvi),
// region selection, vegetation mode. Calls useRiskForInputs (debounced) and
// renders the hero + factor breakdown + inputs grid + insights rail.
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
import { InputPanel } from '@/components/risk/InputPanel';
import { InsightsRail } from '@/components/risk/InsightsRail';
import { VegetationPanel, type VegMode } from '@/components/risk/VegetationPanel';
import { PageSection } from '@/components/ui/PageSection';
import { SectionEyebrow } from '@/components/ui/SectionEyebrow';
import { useAesthetic } from '@/lib/aesthetic';
import { dangerToRisk, type RiskRequest, type Season } from '@/lib/api';
import { useRiskForInputs, useRiskFromWeather, useWeather } from '@/lib/queries';
import { getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { useUserLocation } from '@/lib/use-location';
import { useUnits } from '@/lib/use-units';

// Defaults match the reference Risk Forecast screenshot so the
// computed score lands at ~0.44 with FL calibration ("Risk Level: Extreme").
// Wind default is in **km/h** because the backend's `wind_speed` field
// (api/routes/risk.py) is documented as km/h, and weather.wind_speed from
// /weather is returned in km/h. 15 kph ≈ 9.3 mph — matches mobile's default
// in app/(tabs)/risk.tsx so first-paint risk scores agree across platforms.
const DEFAULTS = {
  temperature: 33,
  humidity: 38,
  wind: 15,
  kbdi: 413,
  season: 'spring' as Season,
  ndvi: 0,
  region: 'FL' as RegionCode,
  vegMode: 'season' as VegMode,
};

const SEASON_LABEL: Record<Season, string> = {
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
};

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
  const [season, setSeasonRaw] = useState<Season>(DEFAULTS.season);
  const [ndvi, setNdviRaw] = useState(DEFAULTS.ndvi);
  const [region, setRegion] = useState<RegionCode>(DEFAULTS.region);
  const [vegMode, setVegMode] = useState<VegMode>(DEFAULTS.vegMode);

  // "User has manually moved a slider" — once true, the auto-seed effect
  // stops overwriting their values when fresh local data arrives. Reset to
  // my area clears it so subsequent location changes auto-seed again.
  const userTouchedRef = useRef(false);
  const markTouched = () => {
    userTouchedRef.current = true;
    setAwaitingFirstSeed(false);
  };
  const setTemperature = (v: number) => { markTouched(); setTemperatureRaw(v); };
  const setHumidity    = (v: number) => { markTouched(); setHumidityRaw(v); };
  const setWind        = (v: number) => { markTouched(); setWindRaw(v); };
  const setKbdi        = (v: number) => { markTouched(); setKbdiRaw(v); };
  const setSeason      = (v: Season) => { markTouched(); setSeasonRaw(v); };
  const setNdvi        = (v: number) => { markTouched(); setNdviRaw(v); };

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
  const localNdvi = localRisk.data?.ndvi_anomaly ?? null;
  const localReady =
    localTemp != null && localHumidity != null && localWind != null && localKbdi != null;
  const localFailed = localWeather.isError || localRisk.isError;

  const applyLocal = useCallback(() => {
    if (localTemp != null) setTemperatureRaw(Math.round(localTemp));
    if (localHumidity != null) setHumidityRaw(Math.round(localHumidity));
    if (localWind != null) setWindRaw(Math.round(localWind));
    if (localKbdi != null) setKbdiRaw(Math.round(localKbdi));
    setSeasonRaw(currentSeason());
    setNdviRaw(localNdvi != null ? Number(localNdvi.toFixed(3)) : 0);
  }, [localTemp, localHumidity, localWind, localKbdi, localNdvi]);

  /** Reset button — same as applyLocal but also clears the user-touched flag
   *  AND switches the calibration region to whatever state the backend's
   *  Census reverse-geocode resolved for the user. `regional_state` is null
   *  when the location is outside the 17 fitted states → Global.
   *  Matches mobile's "Reset to my area" behavior. */
  const resetToLocal = useCallback(() => {
    applyLocal();
    userTouchedRef.current = false;
    const stateFromBackend = localRisk.data?.regional_state ?? null;
    setRegion(stateFromBackend);
  }, [applyLocal, localRisk.data?.regional_state]);

  // Auto-seed: on first load (and whenever the location's local readings
  // change), if the user hasn't manually edited anything, swap the placeholder
  // defaults for real local values. Tracks the seeded snapshot so location
  // changes always reseed, and content updates only reseed when untouched.
  // `awaitingFirstSeed` drives the slider skeleton state — true until either
  // auto-seed lands OR the user manually edits a slider.
  const seededLocKeyRef = useRef<string | null>(null);
  const seededContentRef = useRef<string | null>(null);
  const [awaitingFirstSeed, setAwaitingFirstSeed] = useState(true);
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
    setAwaitingFirstSeed(false);
    seededLocKeyRef.current = locKey;
    seededContentRef.current = contentKey;
  }, [localReady, locKey, contentKey, applyLocal]);

  // If local data outright failed, drop the skeletons — show the hardcoded
  // defaults so the user can still play with the calculator (and the
  // FetchErrorBanner above explains why).
  useEffect(() => {
    if (localFailed) setAwaitingFirstSeed(false);
  }, [localFailed]);

  // Skeleton state for the sliders: only while we haven't auto-seeded yet
  // AND a local fetch is actually in flight. Once user touches a slider OR
  // local lands, the input goes back to its normal interactive state.
  const inputsLoading = awaitingFirstSeed && (localWeather.isLoading || localRisk.isLoading);

  const req: RiskRequest = useMemo(
    () => ({
      temperature,
      humidity,
      wind_speed: wind,
      days_since_rain: Math.round(kbdi / 100),
      season,
      kbdi,
      ...(vegMode === 'ndvi' ? { ndvi_anomaly: ndvi } : {}),
      // null region = Global cutoffs (don't send `state` to backend)
      ...(region ? { state: region } : {}),
    }),
    [temperature, humidity, wind, kbdi, season, ndvi, vegMode, region],
  );

  const risk = useRiskForInputs(req, 220);

  // Fall back to a synthesized computation when the request is still in flight
  // so the hero never shows "—" or blanks during typing.
  const score = risk.data?.risk_score ?? 0.44;
  const level: RiskLevel = risk.data
    ? (risk.data.regional_level ? dangerToRisk(risk.data.regional_level) : dangerToRisk(risk.data.danger_level))
    : 'extreme';
  const factors = risk.data?.factors ?? { vpd: 0.69, wind: 0.30, drought: 0.59, season: 0.80 };

  // Dominant driver — pick the largest WEIGHTED contribution.
  const contrib = {
    vpd: factors.vpd * 0.5,
    wind: factors.wind * 0.3,
    drought: factors.drought * 0.2,
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
  const dominantPct = (contrib[dominant] / Math.max(0.001, score)) * 100;

  const sr = getRisk(level, accent);
  const regionDisplay = regionName(region);

  return (
    <>
      {/* ───── HERO ────────────────────────────────────────────────── */}
      <PageSection top={36} bottom={28}>
        <SectionEyebrow
          color="#E8B339"
          right={`Calibrated for ${regionDisplay}${risk.data?.danger_level && region ? ` · Global: ${capitalize(risk.data.danger_level)}` : ''}`}
        >
          Risk Forecast · What-If
        </SectionEyebrow>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)',
            gap: 24,
          }}
        >
          <HeroScorePanel
            score={score}
            level={level}
            region={region}
            onRegionChange={setRegion}
            thresholds={risk.data?.regional_thresholds ?? null}
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

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
            gap: 20,
          }}
        >
          {/* Sliders + vegetation panel */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
              caption="Combines with humidity into Vapor Pressure Deficit — hot air has more drying power."
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
              caption="Lower humidity = drier fuels and faster ignition."
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
              caption="Sustained 10-min average. Gusts spread fire faster + harder to predict."
              onChange={(v) => setWind(units.speed === 'mph' ? v / 0.621371 : v)}
              isLoading={inputsLoading}
            />
            <InputPanel
              label="Drought (KBDI)"
              value={kbdi}
              unit=""
              min={0}
              max={800}
              color={sr.color}
              glowRgb={sr.glow}
              index={4}
              caption="Keetch-Byram Drought Index, 0–800. Higher = drier soil + fuels."
              onChange={setKbdi}
              isLoading={inputsLoading}
            />

            <VegetationPanel
              mode={vegMode}
              onModeChange={setVegMode}
              season={season}
              onSeasonChange={setSeason}
              ndvi={ndvi}
              onNdviChange={setNdvi}
              color={sr.color}
              glowRgb={sr.glow}
            />
          </div>

          <InsightsRail
            dominantLabel={dominantLabel}
            dominantContributionPct={dominantPct}
            dominantDescription={dominantDescription}
          />
        </div>
      </PageSection>
    </>
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
