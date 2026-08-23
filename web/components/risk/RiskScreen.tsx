'use client';

// The what-if screen. Holds every slider value and scores it locally, no backend
// round-trip. The one backend touch is seeding from the user's location, swapping
// placeholders for real readings unless they have already edited something.

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
import { RiskBackground } from '@/components/risk/RiskBackground';
import { VegetationPanel, type VegMode } from '@/components/risk/VegetationPanel';
import { PageSection } from '@/components/ui/PageSection';
import { SectionEyebrow } from '@/components/ui/SectionEyebrow';
import { useAesthetic } from '@/lib/aesthetic';
import { useAnyModalOpen } from '@/lib/modal-state';
import { dangerToRisk, type RiskRequest, type Season } from '@/lib/api';
import { useRiskFromWeather, useWeather } from '@/lib/queries';
import { lookupStateLocal } from '@/lib/regional-thresholds';
import { computeRiskLocal } from '@/lib/risk-local';
import { floorLow, getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { useUserLocation } from '@/lib/use-location';
import { formatSpeed, formatTemp, useUnits } from '@/lib/use-units';
import { V4_WEIGHTS } from '@/lib/v4-weights';

// The heads-up amber, taken from the theme so it can't drift.
const AMBER = RISK_LEVELS.moderate.color;
const AMBER_RGB = RISK_LEVELS.moderate.glow;

// Starting values, so the first paint lands somewhere interesting and not on zero.
// Wind is km/h, which is what the backend and /weather both speak.
const DEFAULTS = {
  temperature: 33,
  humidity: 38,
  wind: 15,
  // Middle of KBDI's moderate band.
  kbdi: 400,
  // The same neutral default the Status query sends.
  daysSinceRain: 7,
  season: 'spring' as Season,
  ndvi: 0,
  // Global cutoffs until seeding swaps in the user's real state.
  region: null as RegionCode,
  // Open on the measured signals. The toggles still switch to the rougher proxies.
  vegMode: 'ndvi' as VegMode,
  droughtMode: 'kbdi' as DroughtMode,
};

const SEASON_LABEL: Record<Season, string> = {
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
};

/** Put an NDVI anomaly into words for the vegetation line. */
function ndviQualitative(anomaly: number): string {
  if (anomaly <= -0.10) return 'much drier than 3-yr norm, more fire risk';
  if (anomaly <= -0.03) return 'drier than 3-yr norm';
  if (anomaly <   0.03) return 'near 3-yr norm';
  if (anomaly <   0.10) return 'greener than 3-yr norm';
  return 'much greener than 3-yr norm, less fire risk';
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

  // Stop the backdrop when nobody can see it.
  const anyModalOpen = useAnyModalOpen();
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const animActive = tabVisible && !anyModalOpen;

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

  // Once the user moves a slider, seeding stops overwriting their work.
  const userTouchedRef = useRef(false);
  // The region tracks the location separately from the sliders. It only needs
  // coordinates and has to keep working when the backend seed fails.
  const regionLocKeyRef = useRef<string | null>(null);
  const regionManualRef = useRef(false);
  // Once the user sets KBDI or NDVI themselves, the "couldn't fetch" warning goes
  // away. Reset brings it back if the upstream is still down.
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
  // Picking a region counts as touching the screen, or the next refetch puts the
  // seeded values back.
  const pickRegion = (v: RegionCode) => { regionManualRef.current = true; markTouched(); setRegion(v); };

  // Same queries Status already ran at these coordinates, so usually free.
  const loc = useUserLocation();
  const localWeather = useWeather(loc.coords);
  const localRisk = useRiskFromWeather(localWeather.data, loc.coords);
  const localTemp = localWeather.data?.temperature ?? null;
  const localHumidity = localWeather.data?.humidity ?? null;
  const localWind = localWeather.data?.wind_speed ?? null;
  const localKbdi = localRisk.data?.kbdi ?? null;
  // Measured now, not guessed from KBDI the way it used to be. Null on a failed fetch.
  const localDays = localRisk.data?.days_since_rain_observed ?? null;
  const localNdvi = localRisk.data?.ndvi_anomaly ?? null;
  // Don't insist on a KBDI. It comes back null whenever the drought archive is
  // down, and demanding one left the sliders stuck on defaults with Reset greyed
  // out.
  const localWeatherReady =
    localTemp != null && localHumidity != null && localWind != null;
  // Seed once /risk has settled either way. If it failed, the real temperature,
  // humidity and wind from /weather are still worth having. While it is merely
  // loading, wait, so everything lands at once instead of in two flashes.
  const localSeedReady =
    localWeatherReady && (localRisk.data !== undefined || localRisk.isError);
  const localFailed = localWeather.isError || localRisk.isError;

  const applyLocal = useCallback((seedMode: 'auto' | 'reset' = 'auto') => {
    if (localTemp != null) setTemperatureRaw(Math.round(localTemp));
    if (localHumidity != null) setHumidityRaw(Math.round(localHumidity));
    if (localWind != null) setWindRaw(Math.round(localWind));
    // A failed drought or vegetation fetch is handled differently per seed mode.
    // Auto falls back to defaults, or the last location's numbers would follow the
    // user to the new one. An explicit Reset keeps whatever they typed.
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
    // Clear the "I set this myself" flags, so the warnings come back if those
    // upstreams are still down.
    setKbdiUserSet(false);
    setNdviUserSet(false);
  }, [localTemp, localHumidity, localWind, localKbdi, localDays, localNdvi]);

  // /risk answered, but a null KBDI or NDVI inside it means that one upstream
  // failed here.
  const localFetchComplete = localRisk.data !== undefined;
  const localKbdiFailed = localFetchComplete && localKbdi == null;
  const localNdviFailed = localFetchComplete && localNdvi == null;

  /** Reseed from the user's location and snap the region back, so later location
   *  changes start seeding on their own again. */
  const resetToLocal = useCallback(() => {
    applyLocal('reset');
    userTouchedRef.current = false;
    regionManualRef.current = false;
    // Take the backend's word once it has one, null included. Null means no fit here
    // and the global cutoffs apply. The local guess only covers the wait.
    setRegion(
      localFetchComplete
        ? localRisk.data?.regional_state ?? null
        : lookupStateLocal(loc.coords.lat, loc.coords.lon),
    );
  }, [applyLocal, localFetchComplete, localRisk.data, loc.coords.lat, loc.coords.lon]);

  // Swap the placeholders for real readings on load and on a location change, as long
  // as the user hasn't edited anything. appliedLocKey remembers the last seeded
  // location, and a mismatch shows skeletons until the new seed lands.
  const seededLocKeyRef = useRef<string | null>(null);
  const seededContentRef = useRef<string | null>(null);
  const [appliedLocKey, setAppliedLocKey] = useState<string | null>(null);
  const locKey = `${loc.coords.lat.toFixed(3)},${loc.coords.lon.toFixed(3)}`;
  const contentKey = `${localTemp}|${localHumidity}|${localWind}|${localKbdi}|${localNdvi}|${localDays}`;
  useEffect(() => {
    if (!localSeedReady) return;
    const locChanged = seededLocKeyRef.current !== locKey;
    const contentChanged = seededContentRef.current !== contentKey;
    if (!locChanged && !contentChanged) return;
    if (!locChanged && userTouchedRef.current) return;
    applyLocal();
    if (locChanged) userTouchedRef.current = false;
    seededLocKeyRef.current = locKey;
    seededContentRef.current = contentKey;
    setAppliedLocKey(locKey);
  }, [localSeedReady, locKey, contentKey, applyLocal]);

  // The region follows the location even with no backend. Coordinates are all it
  // takes. Uses the local guess straight away, upgrades when the backend answers.
  useEffect(() => {
    if (regionLocKeyRef.current !== locKey) {
      regionLocKeyRef.current = locKey;
      regionManualRef.current = false;
      setRegion(
        localFetchComplete
          ? localRisk.data?.regional_state ?? null
          : lookupStateLocal(loc.coords.lat, loc.coords.lon),
      );
      return;
    }
    // Honor the null too. Ignore it and a town inside a fitted state's rectangle
    // but not in that state stays stuck on its neighbour's harsher curve.
    if (!regionManualRef.current && localFetchComplete) {
      setRegion(localRisk.data?.regional_state ?? null);
    }
  }, [locKey, localFetchComplete, localRisk.data, loc.coords.lat, loc.coords.lon]);

  // If the local data never arrived, drop the skeletons and show defaults so the
  // calculator still works. The banner above explains why.
  useEffect(() => {
    if (localFailed) setAppliedLocKey(locKey);
  }, [localFailed, locKey]);

  // Skeletons on first mount and in the gap after a location switch. A value the
  // user typed is not a loading state.
  const inputsLoading = appliedLocKey !== locKey;

  const req: RiskRequest = useMemo(
    () => ({
      temperature,
      humidity,
      wind_speed: wind,
      // Required either way. In KBDI mode it is filler and gets ignored, in days
      // mode it carries the real slider value and KBDI is left out.
      days_since_rain: droughtMode === 'days' ? daysSinceRain : Math.round(kbdi / 100),
      season,
      ...(droughtMode === 'kbdi' ? { kbdi } : {}),
      ...(vegMode === 'ndvi' ? { ndvi_anomaly: ndvi } : {}),
      // No region means the global cutoffs, so send no state at all.
      ...(region ? { state: region } : {}),
    }),
    [temperature, humidity, wind, kbdi, daysSinceRain, droughtMode, season, ndvi, vegMode, region],
  );

  // A pure function of the sliders, so it runs here and not over the network on
  // every keystroke. Nothing can fail, so there is no error branch.
  const risk = useMemo(() => computeRiskLocal(req), [req]);

  const score = risk.risk_score;
  const level: RiskLevel = risk.regional_level
    ? dangerToRisk(risk.regional_level)
    : dangerToRisk(risk.danger_level);
  const factors = risk.factors;

  // The named driver and the three percentages come from the same weighted
  // contributions, so they can't disagree, and normalizing makes them add to 100.
  const { dominantLabel, dominantDescription, shares } = useMemo(() => {
    const contrib = {
      vpd: factors.vpd * V4_WEIGHTS.vpd,
      wind: factors.wind * V4_WEIGHTS.wind,
      drought: factors.drought * V4_WEIGHTS.drought,
    };
    const total = contrib.vpd + contrib.wind + contrib.drought || 1;
    const dominant: 'vpd' | 'wind' | 'drought' = (['vpd', 'wind', 'drought'] as const)
      .reduce<'vpd' | 'wind' | 'drought'>((acc, k) => (contrib[k] > contrib[acc] ? k : acc), 'vpd');
    return {
      dominantLabel: {
        vpd: 'Vapor Pressure Deficit',
        wind: 'Wind',
        drought: 'Drought',
      }[dominant],
      dominantDescription: {
        vpd: 'Dry, hot air pulls moisture out of fuels faster than wind alone.',
        wind: 'Sustained wind drives spread rate and makes containment harder.',
        drought: 'Soil moisture deficit primes fuels for rapid ignition.',
      }[dominant],
      shares: {
        vpd: contrib.vpd / total,
        wind: contrib.wind / total,
        drought: contrib.drought / total,
      },
    };
  }, [factors.vpd, factors.wind, factors.drought]);

  // Floored to moderate so a calm day leaves the page warm instead of green.
  const sr = getRisk(floorLow(level), accent);
  const regionDisplay = regionName(region);

  return (
    <>
      {/* Fixed behind the page, showing through the gaps between cards. */}
      <RiskBackground risk={floorLow(level)} active={animActive} />

      <div
        className={animActive ? undefined : 'ember-anim-paused'}
        style={{ position: 'relative', zIndex: 1 }}
      >
        {/* Hero */}
        <PageSection top={36} bottom={28}>
        <SectionEyebrow
          color={AMBER}
          right={`Calibrated for ${regionDisplay}${region ? ` · Global: ${capitalize(risk.danger_level)}` : ''}`}
        >
          Fire-Weather What-If
        </SectionEyebrow>

        <div
          className="app-stack"
          style={{
            // Lopsided, so the score is clearly the headline.
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
            isLoading={inputsLoading}
            vpd={factors.vpd}
            wind={factors.wind}
            drought={factors.drought}
            season={factors.season}
            seasonLabel={vegMode === 'season' ? SEASON_LABEL[season] : 'NDVI'}
            caption={{
              vpd: `${formatTemp(temperature, units.temp)} · ${humidity}% RH`,
              wind: formatSpeed(wind, units.speed),
              // Name whichever drought input is actually driving the factor.
              drought:
                droughtMode === 'days'
                  ? `${daysSinceRain} ${daysSinceRain === 1 ? 'day' : 'days'} since rain`
                  : `${kbdi} KBDI`,
            }}
            vegetationDetail={
              vegMode === 'ndvi'
                ? `NDVI anomaly: ${ndvi >= 0 ? '+' : ''}${ndvi.toFixed(2)} (${ndviQualitative(ndvi)})`
                : `Estimated from the season. No recent satellite reading for this spot.`
            }
          />
        </div>
      </PageSection>

      {/* Only on a real failure, so the user knows the sliders below hold defaults
          and not their own conditions. */}
      {localFailed ? (
        <PageSection top={0} bottom={0}>
          <FetchErrorBanner
            locLabel={loc.label}
            onRetry={() => {
              localWeather.refetch();
              // Only retry /risk once weather worked. Too early and it sends an
              // undefined temperature and earns a 422.
              if (localWeather.data !== undefined) localRisk.refetch();
            }}
          />
        </PageSection>
      ) : null}

      {/* Inputs and insights */}
      <PageSection top={20} bottom={56}>
        <SectionEyebrow
          color={sr.color}
          right={
            <ResetButton
              onClick={resetToLocal}
              // Live as soon as seeding is possible, /risk failure included. The
              // weather it returned is still worth reseeding from.
              ready={localSeedReady}
              loading={localWeather.isLoading || localRisk.isLoading}
              locLabel={loc.label}
            />
          }
        >
          Inputs · Adjust to Compare
        </SectionEyebrow>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="app-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            {/* State stays in the units the backend wants. The conversion is for
                display only, and onChange converts straight back. */}
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

          {/* Vegetation and drought, both with a mode toggle. */}
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
                    bold="Couldn't load your area's vegetation reading."
                    rest="Clouds may have blocked the satellite recently, or this spot is outside its coverage. Move the slider to test a value."
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
                    bold="Couldn't load your area's drought reading."
                    rest="The drought data source didn't respond, so Reset to my area can't fill in your real value. Move the slider to test a value."
                  />
                ) : null
              }
            />
          </div>

          {/* The driver, full width, with the three shares alongside it. */}
          <InsightsRail
            dominantLabel={dominantLabel}
            dominantDescription={dominantDescription}
            shares={shares}
            isLoading={inputsLoading}
          />
        </div>
      </PageSection>
      </div>
    </>
  );
}

/** The amber note when drought or vegetation data didn't arrive. */
function WarningInline({ bold, rest }: { bold: string; rest: string }) {
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
    ? `Fill the inputs with ${locLabel}'s current weather, drought, and vegetation.`
    : loading
      ? `Loading weather, drought, and vegetation for ${locLabel}…`
      : `No local data available for ${locLabel}.`;
  return (
    <button
      type="button"
      onClick={ready ? onClick : undefined}
      disabled={!ready}
      title={tip}
      aria-label={tip}
      onMouseEnter={(e) => {
        if (!ready) return;
        e.currentTarget.style.background = `rgba(${RISK_LEVELS.low.glow}, 0.16)`;
        e.currentTarget.style.borderColor = `rgba(${RISK_LEVELS.low.glow}, 0.42)`;
      }}
      onMouseLeave={(e) => {
        if (!ready) return;
        e.currentTarget.style.background = `rgba(${RISK_LEVELS.low.glow}, 0.10)`;
        e.currentTarget.style.borderColor = `rgba(${RISK_LEVELS.low.glow}, 0.30)`;
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 99,
        background: ready ? `rgba(${RISK_LEVELS.low.glow}, 0.10)` : 'rgba(255, 255, 255, 0.04)',
        border: `0.5px solid ${ready ? `rgba(${RISK_LEVELS.low.glow}, 0.30)` : ae.line}`,
        transition: 'background .15s ease, border-color .15s ease',
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
          Couldn&apos;t load local data for {locLabel}
        </div>
        <div style={{ marginTop: 2, fontFamily: ae.fontBody, fontSize: 12, color: ae.textDim }}>
          The inputs below show placeholder values until the weather, drought, and vegetation data comes back.
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
