import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { FactorBar } from '@/components/ui/FactorBar';
import { GlassSegmented } from '@/components/ui/GlassSegmented';
import { InputCard } from '@/components/ui/InputCard';
import { kbdiBucket } from '@/components/ui/LocalKbdiCard';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { RadialGlow } from '@/components/ui/RadialGlow';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { SectionRibbon } from '@/components/ui/SectionRibbon';
import { Skeleton } from '@/components/ui/Skeleton';
import { SliderRow } from '@/components/ui/SliderRow';
import { StatePicker } from '@/components/ui/StatePicker';
import { TabHeader } from '@/components/ui/TabHeader';
import {
  useActiveLocation,
  useRiskForInputs,
  useRiskFromWeather,
  useWeather,
} from '@/lib/hooks';
import { tap } from '@/lib/haptics';
import { currentSeason } from '@/lib/season';
import type { DangerLevel, Season } from '@/lib/types';
import { useUnits } from '@/lib/units';

// V2 factors. "Weight" here is the log-space exponent in the multiplicative
// formula (vpd^0.5 · wind^0.3 · drought^0.2). They sum to 1.0 so each is
// shown as a percentage of total weight; "season" is a separate scalar
// multiplier and gets its own row at the bottom.
const FACTOR_META = {
  vpd:     { label: 'Vapor Pressure Deficit', weightPct: 50, color: '#fb923c' },
  wind:    { label: 'Wind',                   weightPct: 30, color: '#60a5fa' },
  drought: { label: 'Drought',                weightPct: 20, color: '#f59e0b' },
} as const;

// Mirrors api/core/risk_algorithm._SEASON_MULT
const SEASON_MULT: Record<Season, number> = {
  winter: 0.4,
  spring: 0.8,
  summer: 1.0,
  fall:   0.9,
};

// Section ribbon palette — kept inline so the file is self-contained.
const AMBER = '#e8b339';
const AMBER_RGB = '232, 179, 57';
const RED = '#ef4444';
const RED_RGB = '239, 68, 68';

// Danger-level palette — drives the score color, gauge marker, and the
// "RISK LEVEL: X" outlined CTA below the score.
const LEVEL_PALETTE: Record<DangerLevel, { color: string; rgb: string }> = {
  LOW:      { color: '#7ee787', rgb: '126, 231, 135' },
  MODERATE: { color: '#e8b339', rgb: '232, 179, 57'  },
  HIGH:     { color: '#fb923c', rgb: '251, 146, 60'  },
  EXTREME:  { color: '#ef4444', rgb: '239, 68, 68'   },
};

type VegMode = 'season' | 'ndvi';

export default function RiskScreen() {
  // Neutral defaults — overwritten by the seed effect once local data lands.
  const [temperature, setTemperature] = useState(25);
  const [humidity, setHumidity] = useState(40);
  const [windSpeed, setWindSpeed] = useState(15);
  const [kbdi, setKbdi] = useState(200);
  const [season, setSeason] = useState<Season>(currentSeason());
  // Vegetation mode: 'season' uses the calendar season multiplier (legacy
  // path); 'ndvi' uses a satellite NDVI anomaly value as the fuel-load
  // signal — same input Status uses when CDSE imagery is available.
  // Only ONE of {season, ndvi_anomaly} is sent in the API request.
  const [vegMode, setVegMode] = useState<VegMode>('season');
  const [ndviAnomaly, setNdviAnomaly] = useState(0); // typical range −0.30..+0.30
  // Per-slider "user manually moved this" flags. Used to hide the
  // "fetch failed" warning once the user has supplied their own value; the
  // warning reappears after Reset to my area resets these to false. Tracking
  // per-slider so adjusting KBDI doesn't also dismiss the NDVI warning.
  const [kbdiUserSet, setKbdiUserSet] = useState(false);
  const [ndviUserSet, setNdviUserSet] = useState(false);
  // Calibration scope: null = global cutoffs (default); 2-letter state code
  // = use that state's percentile-derived thresholds for the regional pill.
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [explainerOpen, setExplainerOpen] = useState(false);
  // Bumped every time applyLocal runs (Reset to my area + location-change
  // seed). Passed as the `resetKey` to each SliderRow so the underlying
  // @react-native-community/slider — which treats `value` as initial-only
  // — remounts cleanly with the new seeded value. Without this the slider
  // thumb sticks at its last drag position even though the readout above
  // it updates.
  const [seedNonce, setSeedNonce] = useState(0);

  // Local conditions for the seed + reset button.
  // Cache-hits the same queries Status fires, so usually no extra requests.
  const loc = useActiveLocation();
  const localWeather = useWeather(loc.coords);
  const localRisk = useRiskFromWeather(localWeather.data, loc.coords);

  const localTemp = localWeather.data?.temperature;
  const localHumidity = localWeather.data?.humidity;
  const localWind = localWeather.data?.wind_speed;
  const localKbdi = localRisk.data?.kbdi ?? null;
  const localNdvi = localRisk.data?.ndvi_anomaly ?? null;
  const localState = localRisk.data?.regional_state ?? null;
  // Seeding waits for BOTH weather AND risk so KBDI + NDVI seed from real
  // local values instead of the neutral defaults (200 / 0). Without this,
  // the seed effect fires the moment weather lands — typically before risk
  // resolves — and NDVI gets stuck at 0 until the user moves it manually.
  // Same gating disables "Reset to my area" briefly until risk catches up
  // so clicking it never stamps zeros over real local data.
  const localReady =
    localTemp != null &&
    localHumidity != null &&
    localWind != null &&
    localRisk.data !== undefined;
  // Identity for the active location — used to detect when the user switches
  // saved locations (or GPS resolves) so we re-seed to the new place.
  const locKey = `${loc.coords.lat.toFixed(4)},${loc.coords.lon.toFixed(4)}`;

  const userTouchedRef = useRef(false);

  const applyLocal = useCallback(() => {
    if (localTemp != null) setTemperature(Math.round(localTemp));
    if (localHumidity != null) setHumidity(Math.round(localHumidity));
    if (localWind != null) setWindSpeed(Math.round(localWind));
    if (localKbdi != null) setKbdi(Math.round(localKbdi));
    setSeason(currentSeason());
    // Seed the NDVI slider — the user's local satellite value when available,
    // neutral 0 otherwise. The mode toggle itself isn't touched; vegMode is
    // a deliberate user preference, and Reset to my area is a value reset,
    // not a mode reset.
    if (localNdvi != null) setNdviAnomaly(Number(localNdvi.toFixed(3)));
    else setNdviAnomaly(0);
    // Auto-select the user's calibration scope from their GPS state. Falls
    // back to Global when the user is outside the 17 fitted states — that's
    // a real signal ("this state isn't calibrated"), not a missing value.
    setSelectedState(localState);
    // Clear all "user manually edited" flags so the fetch-failed warnings
    // reappear (they're suppressed once the user supplies their own value).
    setKbdiUserSet(false);
    setNdviUserSet(false);
    userTouchedRef.current = false;
    // Force each SliderRow's native slider to remount with the new value.
    setSeedNonce((n) => n + 1);
  }, [localTemp, localHumidity, localWind, localKbdi, localNdvi, localState]);

  // Seed all sliders + season from local conditions. Two re-seed triggers:
  //
  //   1. Location changed (locKey differs from last seeded) — always re-seed,
  //      even if the user has edited sliders. Switching saved locations is an
  //      explicit "show me this other place" intent that should overwrite any
  //      what-if values from the previous location.
  //
  //   2. Same location but underlying data changed (contentKey differs) —
  //      re-seed ONLY if the user hasn't touched any slider. This catches the
  //      case where the initial seed ran with partial data (e.g. weather
  //      cached + risk still resolving for the new coords, or a brief
  //      TanStack queryKey-transition render with stale values) and the
  //      fresh values arrive afterward. Without this, the user has to click
  //      "Reset to my area" to pick up the trailing update.
  //
  // contentKey is a serialized snapshot of every value the seed reads from
  // so any change in any of them invalidates it.
  const contentKey =
    `${localTemp ?? ''}|${localHumidity ?? ''}|${localWind ?? ''}` +
    `|${localKbdi ?? ''}|${localNdvi ?? ''}|${localState ?? ''}`;
  const seededForKeyRef = useRef<string | null>(null);
  const lastSeededContentRef = useRef<string | null>(null);
  // Mirrors seededForKeyRef as state so the input UI can derive a loading
  // flag from it (refs don't trigger re-renders). Stays null until the
  // first seed runs, then tracks the locKey we last fully seeded for.
  const [appliedLocKey, setAppliedLocKey] = useState<string | null>(null);
  useEffect(() => {
    if (!localReady) return;
    const locationChanged = seededForKeyRef.current !== locKey;
    const contentChanged = lastSeededContentRef.current !== contentKey;
    if (!locationChanged && !contentChanged) return;
    if (!locationChanged && userTouchedRef.current) return;
    applyLocal();
    seededForKeyRef.current = locKey;
    lastSeededContentRef.current = contentKey;
    setAppliedLocKey(locKey);
  }, [locKey, contentKey, localReady, applyLocal]);

  // Inputs are in "about to be seeded" state when the seed hasn't yet
  // applied for the current location — covers first mount + every location
  // switch. Slider values during this window are stale (the previous
  // place's), so the input UI renders skeletons instead until seeding
  // completes. After a user manually adjusts a slider, appliedLocKey stays
  // === locKey so this stays false (user values aren't a loading state).
  const inputsInTransition = appliedLocKey !== locKey;

  const touchAnd = <T,>(setter: (v: T) => void) => (v: T) => {
    userTouchedRef.current = true;
    setter(v);
  };

  // Upstream failure flags — localRisk.data being defined means the backend
  // call resolved; within that, kbdi/ndvi_anomaly being null means the
  // specific upstream (Open-Meteo / CDSE) failed for the user's coords.
  // Surface these to the user inline next to the relevant slider so they
  // know Reset to my area can't fill it with real data.
  const localFetchComplete = localRisk.data !== undefined;
  const localKbdiFailed = localFetchComplete && localKbdi == null;
  const localNdviFailed = localFetchComplete && localNdvi == null;

  // Score-block loading: keep the skeleton up while the calculator is
  // catching up to a new location. Without this, switching saved locations
  // briefly displays the previous place's score because the seed updates
  // state, the debounce holds 250ms, then the query fires — during that
  // window risk.data is whatever was last computed (looks "loaded" but is
  // the previous location's value) and risk.isFetching is still false.
  //
  // Anchor approach: every locKey change captures a timestamp. The block
  // stays in skeleton until risk.dataUpdatedAt exceeds that timestamp,
  // i.e. a fresh response actually landed after the switch. Survives the
  // debounce window and the "stale cache hit" case where risk.data exists
  // but is from the previous location.
  const [transitionAnchor, setTransitionAnchor] = useState(0);
  const [trackedLocKey, setTrackedLocKey] = useState(locKey);
  if (trackedLocKey !== locKey) {
    setTransitionAnchor(Date.now());
    setTrackedLocKey(locKey);
  }

  const risk = useRiskForInputs({
    temperature,
    humidity,
    wind_speed: windSpeed,
    // days_since_rain is required by the schema but ignored when kbdi is set.
    days_since_rain: 0,
    kbdi,
    // Season is required by the schema. The backend ignores it when
    // ndvi_anomaly is also sent (vegetation mode), so we always pass it.
    season,
    ...(vegMode === 'ndvi' ? { ndvi_anomaly: ndviAnomaly } : {}),
    ...(selectedState ? { state: selectedState } : {}),
  });

  const scoreInTransition =
    transitionAnchor > 0 && (risk.dataUpdatedAt ?? 0) < transitionAnchor;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await risk.refetch();
    setRefreshing(false);
  }, [risk]);

  // Slider state stays in metric (the API only accepts °C / kph). Display
  // values + min/max/step convert per the user's preferred units, and the
  // onChange handler converts back to metric before storing. Display value is
  // rounded to int so the slider thumb doesn't stutter on the round-trip.
  const { units } = useUnits();
  const tempIsF = units.temp === 'F';
  const tempDisplay = Math.round(tempIsF ? temperature * 9 / 5 + 32 : temperature);
  const tempMinDisplay = tempIsF ? 14 : -10;     // -10°C  ≈ 14°F
  const tempMaxDisplay = tempIsF ? 113 : 45;     //  45°C  ≈ 113°F
  const onTempChange = (v: number) => {
    const celsius = tempIsF ? (v - 32) * 5 / 9 : v;
    touchAnd(setTemperature)(celsius);
  };

  const windIsMph = units.speed === 'mph';
  const windDisplay = Math.round(windIsMph ? windSpeed * 0.621371 : windSpeed);
  const windMaxDisplay = windIsMph ? 37 : 60;    //  60 kph ≈ 37 mph
  const onWindChange = (v: number) => {
    const kph = windIsMph ? v / 0.621371 : v;
    touchAnd(setWindSpeed)(kph);
  };

  // Resolved level + palette for the score block + gauge marker + CTA.
  const effectiveLevel: DangerLevel =
    risk.data?.regional_level ?? risk.data?.danger_level ?? 'LOW';
  const palette = LEVEL_PALETTE[effectiveLevel];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0E12' }} edges={['top']}>
      <StatusBar style="light" />

      {/* Soft amber halo top-right — same vignette pattern as Safety, so
       *  all three screens share the same warm slate atmosphere. */}
      <RadialGlow
        rgb={AMBER_RGB}
        size={320}
        intensity={0.18}
        style={{ position: 'absolute', top: -60, right: -80 }}
      />

      <View style={{ flex: 1, zIndex: 1 }}>
        <TabHeader />
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          className="flex-1"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#7ee787"
              colors={['#7ee787']}
            />
          }
        >
          {/* Section: Risk Calculator */}
          <View style={{ marginTop: 18 }}>
            <SectionRibbon color={AMBER} rgb={AMBER_RGB} eyebrow="Risk Calculator" />
          </View>

          {/* Hero — title, subtitle, big score, gauge, threshold, level CTA */}
          <View style={{ paddingHorizontal: 24, marginTop: 20, alignItems: 'center' }}>
            {/* Small amber accent dot — echoes the RISK CALCULATOR ribbon
             *  above and gives the title a deliberate "this is the page's
             *  artifact" anchor instead of just floating centered text. */}
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 99,
                backgroundColor: AMBER,
                shadowColor: AMBER,
                shadowOpacity: 0.8,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 0 },
              }}
            />
            <Text
              style={{
                marginTop: 10,
                fontSize: 32,
                fontWeight: '900',
                color: '#f8fafc',
                textAlign: 'center',
                letterSpacing: -0.8,
                lineHeight: 36,
                // Faint white text-shadow softens the stroke edges so the
                // title reads as "set into" the page rather than printed on.
                textShadowColor: 'rgba(255,255,255,0.08)',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 8,
              }}
            >
              What-If Risk Score
            </Text>
            {/* Hairline divider between title and subtitle — short, centered,
             *  fading at the edges. Makes the pair read as composed. */}
            <View
              style={{
                marginTop: 12,
                width: 48,
                height: 1,
              }}
            >
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.18)', 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ flex: 1 }}
              />
            </View>
            <Text
              style={{
                marginTop: 12,
                fontSize: 13.5,
                color: '#9ca3af',
                textAlign: 'center',
                lineHeight: 20,
                letterSpacing: 0.1,
              }}
            >
              Tweak conditions; get a transparent score from the same algorithm the
              Status tab uses.
            </Text>
          </View>

          {/* Score block — premium card chrome (slate gradient + level-
           *  tinted border + top accent stripe + soft corner halo). Mirrors
           *  the screens.jsx hero-card treatment so the score reads as the
           *  page's primary artifact, not loose centered text. */}
          <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
            <PremiumCard
              rgb={palette.rgb}
              accentColor={palette.color}
              padding={22}
              glowPosition="bottomRight"
              glowIntensity={0.22}
              textureOpacity={0.04}
            >
              {risk.data && !scoreInTransition ? (
                <View style={{ alignItems: 'center' }}>
                  {/* Score number with a subtle halo behind it. RadialGlow
                   *  sits low + small under the digits for a hint of warmth;
                   *  textShadow adds a tight (8px radius) inner softening
                   *  so the strokes don't read as flat. Earlier values were
                   *  way too aggressive and made the number look smeared. */}
                  <View
                    style={{
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      paddingVertical: 6,
                    }}
                  >
                    <RadialGlow
                      rgb={palette.rgb}
                      size={200}
                      intensity={0.14}
                      style={{ position: 'absolute' }}
                    />
                    <AnimatedNumber
                      value={risk.data.risk_score}
                      format={(n) => n.toFixed(2)}
                      style={{
                        fontSize: 84,
                        fontWeight: '800',
                        color: palette.color,
                        letterSpacing: -3,
                        lineHeight: 90,
                        textShadowColor: `rgba(${palette.rgb}, 0.30)`,
                        textShadowOffset: { width: 0, height: 0 },
                        textShadowRadius: 8,
                      }}
                    />
                  </View>

                  {/* Segmented score gauge — zones from regional cutoffs
                   *  when calibrated, globals otherwise. */}
                  <View style={{ width: '100%', marginTop: 4 }}>
                    <ScoreGauge
                      score={risk.data.risk_score}
                      thresholds={risk.data.regional_thresholds ?? null}
                    />
                  </View>

                  {/* Threshold readout. State-calibrated → ThresholdLine
                   *  with the active bucket prominently emphasized on its
                   *  own line. Global → simple "score 0 – 1" label. */}
                  {risk.data.regional_thresholds && risk.data.regional_level ? (
                    <View style={{ marginTop: 8, width: '100%' }}>
                      <ThresholdLine
                        t={risk.data.regional_thresholds}
                        activeLevel={risk.data.regional_level}
                      />
                    </View>
                  ) : (
                    <Text
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        letterSpacing: 2,
                        color: '#9ca3af',
                        textTransform: 'uppercase',
                      }}
                    >
                      score 0 – 1
                    </Text>
                  )}

                  {/* RISK LEVEL: X — pill-style level indicator. Narrower
                   *  than full width (insets ~22px on each side) so it
                   *  reads as a status badge tied to the score, not a CTA
                   *  competing with it. */}
                  <View
                    style={{
                      marginTop: 18,
                      alignSelf: 'stretch',
                      paddingHorizontal: 22,
                    }}
                  >
                    <RiskLevelButton level={effectiveLevel} palette={palette} />
                  </View>
                </View>
              ) : (
                /* Loading — skeleton blocks sized to match the loaded layout
                 *  (84px score + 12px wrapper padding, 64px gauge, 14px
                 *  threshold line, 60px risk-level button) so the card
                 *  doesn't reflow when data lands. */
                <View style={{ alignItems: 'center' }}>
                  <Skeleton width={220} height={100} rounded="lg" />
                  <View style={{ width: '100%', marginTop: 4 }}>
                    <Skeleton width={'100%'} height={64} rounded="md" />
                  </View>
                  <View style={{ marginTop: 8 }}>
                    <Skeleton width={220} height={14} rounded="sm" />
                  </View>
                  <View style={{ marginTop: 18, alignSelf: 'stretch', paddingHorizontal: 22 }}>
                    <Skeleton width={'100%'} height={52} rounded="lg" />
                  </View>
                </View>
              )}
            </PremiumCard>

            {/* Calibration meta — sits OUTSIDE the card, below */}
            {risk.data && !scoreInTransition ? (
              risk.data.regional_level && risk.data.regional_state ? (
                <Text
                  style={{
                    marginTop: 10,
                    fontSize: 10,
                    letterSpacing: 2,
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                  }}
                >
                  Calibrated for {risk.data.regional_state}
                  {risk.data.regional_level !== risk.data.danger_level
                    ? `  ·  global: ${risk.data.danger_level}`
                    : ''}
                </Text>
              ) : (
                <Text
                  style={{
                    marginTop: 10,
                    fontSize: 10,
                    letterSpacing: 2,
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                  }}
                >
                  Global cutoffs
                </Text>
              )
            ) : null}
          </View>

          {/* Section: Inputs (with Reset action on the right) */}
          <View style={{ marginTop: 28 }}>
            <SectionRibbon
              color={RED}
              rgb={RED_RGB}
              eyebrow="Inputs"
              action={
                <Pressable
                  onPress={applyLocal}
                  disabled={!localReady}
                  hitSlop={8}
                  accessibilityLabel="Reset inputs to current conditions for your area"
                  style={{
                    borderRadius: 999,
                    overflow: 'hidden',
                    borderWidth: 0.5,
                    borderColor: localReady ? 'rgba(126,231,135,0.35)' : 'rgba(255,255,255,0.08)',
                    opacity: localReady ? 1 : 0.5,
                    position: 'relative',
                  }}
                >
                  {/* Subtle green gradient — slightly brighter at top so the
                   *  pill reads as a polished CTA, not a flat tint. */}
                  <LinearGradient
                    colors={
                      localReady
                        ? ['rgba(126,231,135,0.18)', 'rgba(126,231,135,0.05)']
                        : ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.02)']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                  />
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                    }}
                  >
                    <FontAwesome name="refresh" size={9} color="#7ee787" />
                    <Text
                      style={{
                        marginLeft: 6,
                        fontSize: 9.5,
                        fontWeight: '700',
                        letterSpacing: 1.4,
                        color: '#7ee787',
                        textTransform: 'uppercase',
                      }}
                    >
                      Reset to my area
                    </Text>
                  </View>
                </Pressable>
              }
            />
          </View>

          {/* Inputs — StatePicker leads the list as the calibration scope
           *  input, followed by the numbered slider cards. */}
          <View style={{ paddingHorizontal: 16, marginTop: 14, gap: 10 }}>
            <StatePicker
              value={selectedState}
              onChange={setSelectedState}
              isLoading={inputsInTransition}
            />
            <View>
              <SliderRow
                key={`temp-${seedNonce}`}
                label="Temperature"
                value={tempDisplay}
                min={tempMinDisplay} max={tempMaxDisplay} step={1}
                unit={`°${units.temp}`}
                onChange={onTempChange}
                isLoading={inputsInTransition}
                index={1}
                bigValue
              />
              {!inputsInTransition ? (
                <HelperText>
                  Combines with humidity into Vapor Pressure Deficit — hot air has more
                  drying power.
                </HelperText>
              ) : null}
            </View>
            <SliderRow
              key={`humidity-${seedNonce}`}
              label="Humidity"
              value={humidity}
              min={0} max={100} step={1} unit="%"
              onChange={touchAnd(setHumidity)}
              isLoading={inputsInTransition}
              index={2}
              bigValue
            />
            <SliderRow
              key={`wind-${seedNonce}`}
              label="Wind speed"
              value={windDisplay}
              min={0} max={windMaxDisplay} step={1}
              unit={` ${units.speed}`}
              onChange={onWindChange}
              isLoading={inputsInTransition}
              index={3}
              bigValue
            />
            <View>
              <SliderRow
                key={`kbdi-${seedNonce}`}
                label="Drought (KBDI)"
                value={kbdi}
                min={0} max={800} step={10} unit=""
                onChange={(v) => {
                  setKbdiUserSet(true);
                  touchAnd(setKbdi)(v);
                }}
                isLoading={inputsInTransition}
                index={4}
                bigValue
              />
              {!inputsInTransition ? (
                <View style={{ marginTop: 6, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 99,
                      backgroundColor: kbdiBucket(kbdi).color,
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '600',
                      letterSpacing: 2,
                      color: kbdiBucket(kbdi).color,
                      textTransform: 'uppercase',
                    }}
                  >
                    {kbdiBucket(kbdi).label} · 0–800 scale
                  </Text>
                </View>
              ) : null}
              {!inputsInTransition && localKbdiFailed && !kbdiUserSet ? (
                <WarningInline
                  bold="Couldn't fetch your area's KBDI."
                  rest="Open-Meteo Archive didn't respond, so Reset to my area can't fill this with your real drought value."
                />
              ) : null}
            </View>

            {/* Vegetation signal — full-card skeleton during transitions so
             *  it matches the sliders + state picker above instead of
             *  rendering its toggle while the rest of the screen is in
             *  loading state. */}
            {inputsInTransition ? (
              <InputCard padding={16} style={{ marginTop: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Skeleton width={130} height={12} rounded="sm" />
                  <Skeleton width={60} height={18} rounded="full" />
                </View>
                <View style={{ marginTop: 12 }}>
                  <Skeleton width={'100%'} height={38} rounded="md" />
                </View>
                <View style={{ marginTop: 12 }}>
                  <Skeleton width={'100%'} height={32} rounded="md" />
                </View>
              </InputCard>
            ) : (
            <InputCard padding={16} style={{ marginTop: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text
                  style={{
                    fontSize: 10.5,
                    fontWeight: '600',
                    letterSpacing: 2,
                    color: '#9ca3af',
                    textTransform: 'uppercase',
                  }}
                >
                  Vegetation signal
                </Text>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    borderWidth: 0.5,
                    borderColor: 'rgba(255,255,255,0.08)',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: '600',
                      letterSpacing: 1.4,
                      color: '#9ca3af',
                      textTransform: 'uppercase',
                    }}
                  >
                    Pick one
                  </Text>
                </View>
              </View>

              {/* Season ↔ NDVI segmented control. Uses the Risk screen's
               *  constant RED accent (not the level color) so it stays
               *  visually consistent with the SPRING chip + multiplier card
               *  below — those are always red too. Only the score, gauge
               *  marker, and Risk Level CTA above are level-tinted. */}
              <View style={{ marginTop: 12 }}>
                <GlassSegmented
                  value={vegMode}
                  onChange={(v: VegMode) => setVegMode(v)}
                  color={RED}
                  rgb={RED_RGB}
                  options={[
                    { id: 'season', label: 'Season' },
                    { id: 'ndvi',   label: 'Vegetation (NDVI)' },
                  ]}
                />
              </View>

              {vegMode === 'season' ? (
                <View style={{ marginTop: 12 }}>
                  <GlassSegmented
                    value={season}
                    onChange={touchAnd(setSeason)}
                    color={RED}
                    rgb={RED_RGB}
                    size="sm"
                    options={[
                      { id: 'winter', label: 'Winter' },
                      { id: 'spring', label: 'Spring' },
                      { id: 'summer', label: 'Summer' },
                      { id: 'fall',   label: 'Fall' },
                    ]}
                  />
                  {!inputsInTransition ? (
                    <>
                      <View style={{ marginTop: 10 }}>
                        <HelperText>
                          Multipliers: winter ×0.40 · spring ×0.80 ·
                          summer ×1.00 · fall ×0.90.
                        </HelperText>
                      </View>
                      <View
                        style={{
                          marginTop: 12,
                          borderRadius: 12,
                          borderWidth: 0.5,
                          borderColor: `rgba(${AMBER_RGB}, 0.30)`,
                          backgroundColor: `rgba(${AMBER_RGB}, 0.05)`,
                          padding: 12,
                          flexDirection: 'row',
                          gap: 12,
                          alignItems: 'flex-start',
                        }}
                      >
                        <View
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 9,
                            backgroundColor: `rgba(${AMBER_RGB}, 0.14)`,
                            borderWidth: 0.5,
                            borderColor: `rgba(${AMBER_RGB}, 0.35)`,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <FontAwesome name="info" size={13} color={AMBER} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '800',
                              color: AMBER,
                              letterSpacing: 0.3,
                              lineHeight: 16,
                            }}
                          >
                            Fallback signal
                          </Text>
                          <Text
                            style={{
                              marginTop: 3,
                              fontSize: 11,
                              color: '#9ca3af',
                              lineHeight: 16,
                            }}
                          >
                            Status uses real NDVI from satellite. Season is a
                            coarse proxy — switch to Vegetation (NDVI) above
                            for an accurate what-if.
                          </Text>
                        </View>
                      </View>
                    </>
                  ) : null}
                </View>
              ) : (
                <View style={{ marginTop: 12 }}>
                  <SliderRow
                    key={`ndvi-${seedNonce}`}
                    label="NDVI anomaly"
                    value={ndviAnomaly}
                    min={-0.50} max={0.50} step={0.001}
                    unit=""
                    onChange={(v) => {
                      setNdviUserSet(true);
                      touchAnd(setNdviAnomaly)(v);
                    }}
                    isLoading={inputsInTransition}
                    bigValue
                  />
                  {!inputsInTransition ? (
                    <>
                      <View
                        style={{
                          marginTop: 6,
                          paddingHorizontal: 4,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <View
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 99,
                            backgroundColor: ndviLabel(ndviAnomaly).color,
                          }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            letterSpacing: 2,
                            color: ndviLabel(ndviAnomaly).color,
                            textTransform: 'uppercase',
                          }}
                        >
                          {ndviLabel(ndviAnomaly).text}
                        </Text>
                      </View>
                      <View style={{ marginTop: 8 }}>
                        <HelperText>
                          Negative = drier than normal, raises risk. Sentinel-2
                          satellite reading.
                        </HelperText>
                      </View>
                    </>
                  ) : null}
                  {!inputsInTransition && localNdviFailed && !ndviUserSet ? (
                    <WarningInline
                      bold="Couldn't fetch your area's NDVI."
                      rest="Likely cloud cover over the last several Sentinel-2 passes, or outside Sentinel-2 coverage. Reset to my area can't fill this with your real value."
                    />
                  ) : null}
                </View>
              )}
            </InputCard>
            )}
          </View>

          {/* Section: Factor Breakdown — section ribbon + How is this calculated link */}
          <View style={{ marginTop: 28 }}>
            <SectionRibbon
              color={AMBER}
              rgb={AMBER_RGB}
              eyebrow="Factor Breakdown"
              action={
                <Pressable onPress={() => setExplainerOpen(true)} hitSlop={8}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: '#7ee787',
                    }}
                  >
                    How is this calculated?
                  </Text>
                </Pressable>
              }
            />
          </View>

          <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
            <InputCard padding={16}>
              {risk.data ? (
                <View style={{ gap: 14 }}>
                  {(Object.keys(FACTOR_META) as Array<keyof typeof FACTOR_META>).map((k, i) => {
                    const meta = FACTOR_META[k];
                    return (
                      <FactorBar
                        key={k}
                        label={meta.label}
                        factor={risk.data!.factors[k]}
                        weightPct={meta.weightPct}
                        color={meta.color}
                        index={i + 1}
                      />
                    );
                  })}
                  <View
                    style={{
                      marginTop: 4,
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: 'rgba(255,255,255,0.04)',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '600',
                        letterSpacing: 2,
                        color: '#9ca3af',
                        textTransform: 'uppercase',
                      }}
                    >
                      {vegMode === 'ndvi' ? 'Vegetation multiplier' : 'Season multiplier'}
                    </Text>
                    <Text style={{ marginTop: 4, fontSize: 12, color: '#f8fafc' }}>
                      {vegMode === 'ndvi'
                        ? `NDVI anomaly ${ndviAnomaly >= 0 ? '+' : ''}${ndviAnomaly.toFixed(3)} → ×${risk.data.factors.season.toFixed(2)}`
                        : `${season} → ×${risk.data.factors.season.toFixed(2)}`}
                      <Text style={{ color: '#9ca3af' }}> applied to the multiplicative product above.</Text>
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: '#9ca3af' }}>Move a slider to compute…</Text>
              )}
            </InputCard>
          </View>

          {risk.isError ? (
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 14,
                padding: 12,
                borderRadius: 12,
                borderWidth: 0.5,
                borderColor: 'rgba(239, 68, 68, 0.4)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
              }}
            >
              <Text style={{ fontSize: 13, color: RED }}>
                Couldn&apos;t reach the API. Make sure the backend is running.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </View>

      <ExplainerModal visible={explainerOpen} onClose={() => setExplainerOpen(false)} />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------

/** Premium "Risk Level" status row — sits below the score and reads as
 *  the bottom of the hero card.
 *
 *  Composition (mirrors the screens.jsx FeatureCard button style):
 *    - Slate-tinted level gradient surface (`rgba(level, 0.20) → 0.04`)
 *    - 0.5px hairline border at 0.45 alpha
 *    - 0.5px inset top white hairline (the "inner highlight" that gives
 *      premium cards their depth)
 *    - Outer drop-shadow glow tinted with the level color
 *    - Left: 36px framed icon tile (same chrome as the FEMA seal)
 *    - Center: "RISK LEVEL: X" mono-spaced label
 *    - Right: 8px status dot (mirrors the icon tile's optical weight so
 *      the label stays centered between them)
 */
function RiskLevelButton({
  level,
  palette,
}: {
  level: DangerLevel;
  palette: { color: string; rgb: string };
}) {
  return (
    <View
      style={{
        height: 52,
        borderRadius: 12,
        borderWidth: 0.5,
        borderColor: `rgba(${palette.rgb}, 0.40)`,
        overflow: 'hidden',
        position: 'relative',
        // Solid slate base so the parent PremiumCard's grid texture
        // doesn't bleed through the button — the level-tinted gradient
        // below overlays on TOP of this opaque fill.
        backgroundColor: '#10141B',
        // Subtle outer halo (was 0.35/16 — too "lit"; this reads as a
        // gentle ambient glow rather than a spotlight).
        shadowColor: palette.color,
        shadowOpacity: 0.18,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 0 },
        elevation: 2,
      }}
    >
      {/* Level-tinted gradient surface — slightly dimmer than before so
       *  the button doesn't overpower the score above it. */}
      <LinearGradient
        colors={[`rgba(${palette.rgb}, 0.14)`, `rgba(${palette.rgb}, 0.03)`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {/* Inset top hairline highlight */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 0.5,
          backgroundColor: 'rgba(255,255,255,0.10)',
        }}
      />
      {/* Content row */}
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
        }}
      >
        {/* Framed icon tile (matches FEMA seal chrome, scaled down to
         *  fit the narrower pill). */}
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            borderWidth: 0.5,
            borderColor: `rgba(${palette.rgb}, 0.45)`,
            backgroundColor: `rgba(${palette.rgb}, 0.16)`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FontAwesome name="exclamation-triangle" size={13} color={palette.color} />
        </View>
        {/* Centered label */}
        <Text
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 12.5,
            fontWeight: '800',
            letterSpacing: 2.2,
            color: palette.color,
            textTransform: 'uppercase',
          }}
        >
          Risk Level: {level}
        </Text>
        {/* Right status dot — softer glow, smaller, balances the icon tile */}
        <View style={{ width: 30, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 3.5,
              backgroundColor: palette.color,
              shadowColor: palette.color,
              shadowOpacity: 0.6,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
        </View>
      </View>
    </View>
  );
}

// (SeasonChips removed — now using GlassSegmented inline for consistency
//  with the Season ↔ NDVI toggle above it.)

/** Inline helper note rendered below an input. The thin colored leading
 *  bar gives the text grounding so it reads as "tied to the thing above"
 *  rather than loose marginalia. */
function HelperText({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        paddingLeft: 8,
        marginLeft: 2,
      }}
    >
      <View
        style={{
          width: 1.5,
          alignSelf: 'stretch',
          borderRadius: 1,
          backgroundColor: 'rgba(255,255,255,0.10)',
          marginRight: 8,
        }}
      />
      <Text style={{ flex: 1, fontSize: 11, color: '#6b7280', lineHeight: 16 }}>
        {children}
      </Text>
    </View>
  );
}

// (SeasonMultiplierRow removed — multipliers now read by the HelperText
//  line below the chips. The visual mini-cards were redundant with the
//  text breakdown.)

/** Small inline amber warning row — used to surface KBDI/NDVI fetch
 *  failures next to the relevant slider. Bold lede + muted body. */
function WarningInline({ bold, rest }: { bold: string; rest: string }) {
  return (
    <View
      style={{
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        borderRadius: 10,
        borderWidth: 0.5,
        borderColor: `rgba(${AMBER_RGB}, 0.30)`,
        backgroundColor: `rgba(${AMBER_RGB}, 0.05)`,
        paddingHorizontal: 10,
        paddingVertical: 8,
      }}
    >
      <FontAwesome name="exclamation-triangle" size={10} color={AMBER} style={{ marginTop: 2 }} />
      <Text style={{ flex: 1, fontSize: 10.5, lineHeight: 15, color: AMBER }}>
        <Text style={{ fontWeight: '700' }}>{bold} </Text>
        <Text style={{ color: '#9ca3af' }}>{rest}</Text>
      </Text>
    </View>
  );
}

/** Threshold readout for state-calibrated mode — shows the inactive
 *  buckets on a compact dim line, then the active bucket on its own line
 *  in a larger, color-coded display. Mirrors the screens.jsx reference
 *  where "EXT ≥0.42" reads as the headline of the row.
 *
 *  The two-line layout reads top-to-bottom as: "here are the four bands;
 *  THIS is where you land." The active bucket's size + color give it
 *  hierarchy without needing a separate label. */
function ThresholdLine({
  t,
  activeLevel,
}: {
  t: { low: number; moderate: number; high: number; extreme: number; score_max: number };
  activeLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
}) {
  const buckets: Array<{ key: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME'; label: string; range: string; color: string }> = [
    { key: 'LOW',      label: 'LOW',  range: `<${t.low.toFixed(2)}`,     color: '#7ee787' },
    { key: 'MODERATE', label: 'MOD',  range: `<${t.moderate.toFixed(2)}`, color: '#e8b339' },
    { key: 'HIGH',     label: 'HIGH', range: `<${t.extreme.toFixed(2)}`,  color: '#fb923c' },
    { key: 'EXTREME',  label: 'EXT',  range: `≥${t.extreme.toFixed(2)}`,  color: '#ef4444' },
  ];
  const inactive = buckets.filter((b) => b.key !== activeLevel);
  const active = buckets.find((b) => b.key === activeLevel)!;
  return (
    <View style={{ alignItems: 'center' }}>
      {/* Inactive buckets — compact, dim, single row separated by middots */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'center',
        }}
      >
        {inactive.map((b, i) => (
          <Text
            key={b.key}
            style={{
              fontSize: 10,
              fontWeight: '600',
              letterSpacing: 1.5,
              color: '#6b7280',
              textTransform: 'uppercase',
            }}
          >
            {b.label} {b.range}
            {i < inactive.length - 1 ? '   ·   ' : ''}
          </Text>
        ))}
      </View>
      {/* Active bucket — larger, color-coded, own line */}
      <Text
        style={{
          marginTop: 6,
          fontSize: 13,
          fontWeight: '800',
          letterSpacing: 2,
          color: active.color,
          textTransform: 'uppercase',
        }}
      >
        {active.label} {active.range}
      </Text>
    </View>
  );
}

/** Human-readable bucket for the NDVI anomaly slider. Same thresholds the
 *  CalibrationModal on Status uses, plus a color cue. */
function ndviLabel(anomaly: number): { text: string; color: string } {
  if (anomaly <= -0.10) return { text: 'Much drier than normal',   color: '#ef4444' };
  if (anomaly <= -0.03) return { text: 'Drier than normal',        color: '#fb923c' };
  if (anomaly <   0.03) return { text: 'About normal',             color: '#9ca3af' };
  if (anomaly <   0.10) return { text: 'Greener than normal',      color: '#7ee787' };
  return                      { text: 'Much greener than normal', color: '#7ee787' };
}

// ---------------------------------------------------------------------------
// ExplainerModal — preserved verbatim; opened from the "How is this
// calculated?" link in the Factor Breakdown ribbon.
// ---------------------------------------------------------------------------

function ExplainerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0E12' }} edges={['top']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 12,
            borderBottomWidth: 0.5,
            borderBottomColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '800',
              letterSpacing: 3,
              color: '#f8fafc',
              textTransform: 'uppercase',
            }}
          >
            How It Works
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <FontAwesome name="times" size={20} color="#f8fafc" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} className="px-6">
          <Text className="mt-4 text-2xl font-extrabold text-chalk-50">
            What this score means
          </Text>
          <Text className="mt-2 text-sm text-chalk-400">
            This is a <Text className="font-bold text-chalk-100">fire weather index</Text>{' '}
            — it grades current conditions at a location for fire ignition and growth, on a
            0–1 scale. Think of it like a UV index for fire danger. It does{' '}
            <Text className="italic">not</Text> predict that a fire{' '}
            <Text className="italic">will</Text> start, and it doesn&apos;t describe an
            existing fire&apos;s behavior — it&apos;s a severity signal for the local
            environment.
          </Text>
          <Text className="mt-2 text-sm text-chalk-400">
            Active fires near you are tracked separately from satellite data and shown on
            the Status and Map tabs.
          </Text>
          <Text className="mt-4 text-base font-bold text-chalk-50">
            How it&apos;s computed (V2)
          </Text>
          <Text className="mt-1 text-sm text-chalk-400">
            Three factors are combined <Text className="italic">multiplicatively</Text>, then
            multiplied by a season scalar. Multiplicative combination captures the
            well-known &quot;hot AND dry AND windy&quot; non-linearity — any single mild
            factor pulls the whole score down. The structure mirrors the published Fosberg
            and Hot-Dry-Windy fire weather indices.
          </Text>

          <View
            style={{
              marginTop: 18,
              padding: 12,
              borderRadius: 12,
              backgroundColor: '#10141B',
              borderWidth: 0.5,
              borderColor: 'rgba(255,255,255,0.09)',
            }}
          >
            <Text style={{ fontFamily: 'Courier', fontSize: 12, color: '#e5e7eb', lineHeight: 18 }}>
              raw   = vpd_factor^0.5{'\n'}
              {'      '}× wind_factor^0.3{'\n'}
              {'      '}× drought_factor^0.2{'\n'}
              score = season_multiplier × raw
            </Text>
          </View>

          <View className="mt-6 gap-5">
            <Item
              title="Vapor Pressure Deficit (50% weight)"
              body={
                'How much drying power the air has — the modern industry-standard fire weather quantity. Combines temperature and humidity into one physical measure: how aggressively the air will pull moisture out of plant fuel.\n\n' +
                'e_s = 6.1078 · exp(17.27·T / (T + 237.3))    (Tetens / Magnus)\n' +
                'VPD = e_s · (1 − humidity/100)               (hPa)\n' +
                'factor = clamp(VPD / 40, 0, 1)\n\n' +
                'A summer day at 35°C / 15% RH gives VPD ≈ 48 hPa → factor saturates at 1.0. A cool damp day at 10°C / 80% RH gives ≈ 2 hPa → factor ≈ 0.05.'
              }
            />
            <Item
              title="Wind (30% weight)"
              body={
                'Wind drives flame spread roughly with a power law (Rothermel 1972). Replaces V1\'s 4-step ladder, which had artifacts at the boundaries.\n\n' +
                'factor = clamp(0.2 + 0.8 · (wind/40)^1.5, 0.2, 1)\n\n' +
                '0.2 floor: even on a calm day, a fire still burns — the floor prevents the multiplicative formula from collapsing the score to zero.'
              }
            />
            <Item
              title="Drought — KBDI (20% weight)"
              body={
                'The Keetch-Byram Drought Index (Keetch & Byram 1968) — the operational soil-moisture deficit metric the US Forest Service uses. Computed daily by integrating a year of precipitation and evapotranspiration history; far more honest than a "days since rain" proxy because two weeks of dry weather in Florida humidity is not the same drought as two weeks in Arizona.\n\n' +
                'KBDI scale 0 – 800 (hundredths of an inch of soil moisture deficit):\n' +
                '   0 – 200   moist (saturated soil, low fire risk)\n' +
                ' 200 – 400   dry\n' +
                ' 400 – 600   very dry\n' +
                ' 600 – 800   severe drought\n\n' +
                'factor = clamp(0.1 + 0.9 · KBDI/800, 0.1, 1)\n\n' +
                '0.1 floor: even after rain, fires still happen — the floor preserves multiplicative behavior. When your location is known the app pulls real KBDI from a year of Open-Meteo Archive history; otherwise the slider drives the what-if.'
              }
            />
            <Item
              title="Vegetation/fuel-load multiplier (separate scalar)"
              body={
                'Multiplicative scaling on the combined raw score. Two signals can drive it; the Risk Calculator lets you toggle between them.\n\n' +
                '• NDVI anomaly (vegetation mode): the difference between current vegetation greenness (Sentinel-2 satellite on the Status flow, slider here) and the same-month average over the last 3 years. Drier than normal raises the multiplier; greener than normal lowers it. This is what operational fire-weather systems use as a fuel-load signal.\n\n' +
                '• Calendar season (season mode): the legacy fallback. winter ×0.4 · spring ×0.8 · summer ×1.0 · fall ×0.9. Status also falls back to this when satellite passes are cloud-blocked.\n\n' +
                'On the Status flow the choice is automatic (NDVI when available, season otherwise). On this calculator you can choose explicitly to compare how the two signals weight the same inputs.'
              }
            />
          </View>

          <View
            style={{
              marginTop: 28,
              padding: 12,
              borderRadius: 12,
              backgroundColor: '#10141B',
              borderWidth: 0.5,
              borderColor: 'rgba(255,255,255,0.09)',
            }}
          >
            <Text style={{ fontSize: 12, color: '#e5e7eb', lineHeight: 18 }}>
              <Text style={{ fontWeight: '700' }}>Default (global) danger buckets:</Text>{'\n'}
              0.0 – 0.3  LOW{'\n'}
              0.3 – 0.6  MODERATE{'\n'}
              0.6 – 0.8  HIGH{'\n'}
              0.8 – 1.0  EXTREME
            </Text>
          </View>
          <Text className="mt-3 text-xs text-chalk-400">
            For users in the <Text className="font-bold text-chalk-100">17 fitted
            states</Text>, the Status pill uses per-state percentile cutoffs derived
            from each state&apos;s historical fire-day distribution instead of these
            globals — see &quot;Calibrated for X&quot; on the Status tab for the full
            explanation. This calculator&apos;s state dropdown lets you preview the
            same per-state bucketing for any hypothetical inputs; &quot;Global&quot;
            keeps the comparison across states honest by using the cutoffs above.
          </Text>

          <Text className="mt-6 text-xs font-bold uppercase tracking-[2px] text-risk-low">
            ●  Validated
          </Text>
          <Text className="mt-2 text-sm text-chalk-400">
            Validated against a stratified 500-fire sample from the Kaggle 1.88M US
            Wildfires dataset using real day-of-fire weather (Open-Meteo archive).
            Spearman correlation between log(fire size) and predicted risk:{' '}
            <Text className="font-bold text-chalk-100">0.27</Text> with real per-fire
            weather vs. 0.18 with seasonal climate normals — input quality matters as
            much as formula quality. Mean predicted risk for &gt;1000-acre fires:{' '}
            <Text className="font-bold text-chalk-100">0.46</Text> vs. 0.32 for fires
            under 1 acre, with non-overlapping 95% CIs. Per-state regional thresholds
            were fit against the score distribution after the KBDI upgrade.
          </Text>
          <Text className="mt-3 text-[11px] italic text-chalk-500">
            Numbers above are from the V2 baseline run; KBDI integration came after and
            re-running the notebook would produce slightly updated decimals — the shape
            of the conclusions still holds. See notebooks/validation_v2.ipynb in the
            repo for the full analysis.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Item({ title, body }: { title: string; body: string }) {
  return (
    <View>
      <Text className="text-base font-bold text-chalk-50">{title}</Text>
      <Text className="mt-1 text-sm text-chalk-400">{body}</Text>
    </View>
  );
}
