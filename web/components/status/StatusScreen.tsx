'use client';

// Command Center — mirrors mobile app/(tabs)/index.tsx as closely as possible.
//   Hero band: HeroOrb + ShimmerPill + headline + subtitle + CTAs + Calibration link
//   2x2 grid: Conditions card (Wind + Temperature) | Humidity card
//             LocalKbdiCard                         | LocalNdviCard
// Cards beyond these (Active Incident, Regional Risk Index, Closest Fires list,
// FEMA banner) live on Map / Safety in mobile; mobile Status doesn't show them.

import { useEffect, useMemo, useState } from 'react';

import { Icon, type IconName } from '@/components/Icon';
import { CalibrationModal } from '@/components/status/CalibrationModal';
import { CompositeExplainerModal } from '@/components/status/CompositeExplainerModal';
import { ConfidenceBreakdownModal, ConfidenceChip } from '@/components/status/ConfidenceChip';
import { PhaseSpaceModal } from '@/components/status/PhaseSpaceModal';
import { TrajectoryChip } from '@/components/status/TrajectoryChip';
import { LocalKbdiCard } from '@/components/status/LocalKbdiCard';
import { LocalNdviCard } from '@/components/status/LocalNdviCard';
import { ThreatSourceCard } from '@/components/status/ThreatSourceCard';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Button } from '@/components/ui/Button';
import { cardinal8 } from '@/components/ui/CompassRose';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { GridPattern } from '@/components/ui/GridPattern';
import { HeroBand } from '@/components/ui/HeroBand';
import { HeroOrb } from '@/components/ui/HeroOrb';
import { PageSection } from '@/components/ui/PageSection';
import { SectionEyebrow } from '@/components/ui/SectionEyebrow';
import { ShimmerPill } from '@/components/ui/ShimmerPill';
import { Skeleton } from '@/components/ui/Skeleton';
import { Stagger } from '@/components/ui/Stagger';
import { TiltCard } from '@/components/ui/TiltCard';
import { WindDial } from '@/components/ui/WindDial';
import { useAesthetic } from '@/lib/aesthetic';
import { dangerToRisk } from '@/lib/api';
import { computeConfidence } from '@/lib/confidence';
import {
  aggregateThreat,
  bucketOf,
  composite,
  compositeFromBuckets,
  compositeSubtitle,
  findThreatDriver,
  normalizeWeather,
  type ThreatDriver,
} from '@/lib/composite-risk';
import {
  useFiresAroundMe,
  useNamedIncidentsNear,
  useRiskFromWeather,
  useTrajectory,
  useWeather,
} from '@/lib/queries';
import { floorLow, getRisk, hexToRgb, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { useUserLocation } from '@/lib/use-location';
import { formatDistance, formatSpeed, formatTemp, useUnits } from '@/lib/use-units';

// THREAT_RADIUS_MI from composite-risk is 50; we render it here as a label
// for the breakdown card caption. Kept as a constant in miles since that's
// the unit composite-risk uses internally — the call site converts to the
// user's preferred unit via formatDistance.
const THREAT_RADIUS_MI = 50;

// Composite-bucket-driven hero copy. The bucket is computed from the full
// composite (fire weather + active-fire threat) — see `compositeSubtitle`
// for the context-aware subtitle that explains which signal is driving it.
const HEADLINE: Record<RiskLevel, [string, string]> = {
  low:      ['All',         'Clear'],
  moderate: ['Stay',        'Aware'],
  high:     ['Heightened',  'Risk'],
  extreme:  ['Critical',    'Conditions'],
};

const dirLabel = (deg: number | null | undefined) =>
  deg == null ? '—' : cardinal8(deg);

/** Shared visual treatment for the two ghost-text triggers in the hero
 *  meta-info row (Calibration · Why this score?). Both are small mono
 *  caps with a trailing info icon; identical layout so they read as a
 *  pair rather than two unrelated affordances. */
function metaTriggerStyle(
  ae: ReturnType<typeof useAesthetic>['ae'],
  animationDelay: string,
): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: 0,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: ae.textMute,
    fontFamily: ae.fontMono,
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    animationDelay,
  };
}

export function StatusScreen() {
  const { ae, accent } = useAesthetic();
  const loc = useUserLocation();
  const weather = useWeather(loc.coords);
  const risk = useRiskFromWeather(weather.data, loc.coords);
  const fires = useFiresAroundMe(loc.coords);
  const incidents = useNamedIncidentsNear(loc.coords);
  const units = useUnits();
  const [calibOpen, setCalibOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [confidenceOpen, setConfidenceOpen] = useState(false);
  const [phaseSpaceOpen, setPhaseSpaceOpen] = useState(false);

  // Trajectory (Tier 2 #7) — short-term forecast projection. Drives the
  // Trajectory chip below the subtitle and the projection arrow in the
  // phase-space modal. Backed by /trajectory which hits Open-Meteo
  // Forecast (separate endpoint + quota from the Archive used for KBDI).
  const trajectory = useTrajectory(loc.coords);

  // ── Composite score ─────────────────────────────────────────────────────
  // Two independent inputs:
  //   w = calibration-aware fire-weather score (regional percentile-aligned)
  //   t = aggregate active-fire threat across nearby NIFC/Cal Fire incidents
  //       + FIRMS satellite hits within 50 mi (distance, size, wind, time)
  // Composite = 0.45 × w + 0.55 × t. Bucket = quartile of the composite.
  //
  // Calibration matters: a Bronson FL day at the 95th percentile FOR FL has
  // w ≈ 0.92 even though raw/score_max is only ~0.42, because the regional
  // thresholds remap each tier into a quarter of [0, 1].
  const weatherSignal: number | null = useMemo(
    () =>
      risk.data
        ? normalizeWeather(risk.data.risk_score, risk.data.regional_thresholds ?? null)
        : null,
    [risk.data],
  );
  const windDeg = weather.data?.wind_deg ?? null;
  const windSpeedKph = weather.data?.wind_speed ?? null;
  const threatSignal: number = useMemo(
    () =>
      incidents.data != null && fires.data != null
        ? aggregateThreat({
            userLoc: loc.coords,
            namedIncidents: incidents.data,
            firmsHits: fires.data.features,
            windDeg,
            windSpeedKph,
          })
        : 0,
    [incidents.data, fires.data, loc.coords, windDeg, windSpeedKph],
  );
  // The single fire driving the threat score — for the Threat Source card.
  // Applies the FIRMS→named-incident tiebreak inside findThreatDriver so a
  // satellite pixel sitting on top of a real Cal Fire incident surfaces the
  // named incident instead.
  const threatDriver: ThreatDriver | null = useMemo(
    () =>
      incidents.data != null && fires.data != null
        ? findThreatDriver({
            userLoc: loc.coords,
            namedIncidents: incidents.data,
            firmsHits: fires.data.features,
            windDeg,
            windSpeedKph,
          })
        : null,
    [incidents.data, fires.data, loc.coords, windDeg, windSpeedKph],
  );
  // True when there's at least one fire that contributed to the threat
  // signal — i.e. within THREAT_RADIUS_MI. Derived from the actual
  // computation, NOT from the raw dataset (useFiresAroundMe pulls a 250 mi
  // bbox, so the dataset can be non-empty even with no fire in range).
  const anyFireInRange: boolean = threatDriver != null;

  // While any input is loading, treat composite as null and skeleton the
  // hero rather than show stale or partial values.
  const compositeReady =
    weather.data !== undefined &&
    risk.data !== undefined &&
    fires.data !== undefined &&
    incidents.data !== undefined;

  // Component buckets — feed both the matrix-derived headline tier AND
  // the breakdown row below the hero. For weather, prefer the backend's
  // authoritative `regional_level` (or the global `danger_level` fallback)
  // so the bucket pill on the Status breakdown card matches the Risk
  // Calculator's pill for the same raw V4 score. `bucketOf(weatherSignal)`
  // is mathematically equivalent when thresholds are present, but using
  // the backend value directly is simpler and avoids any drift if the two
  // band schemes ever diverge.
  const weatherBucket: RiskLevel | null = risk.data
    ? dangerToRisk(risk.data.regional_level ?? risk.data.danger_level)
    : null;
  const threatBucket: RiskLevel | null = anyFireInRange ? bucketOf(threatSignal) : null;

  // Headline tier comes from the COMPOSITE_MATRIX lookup, not from
  // bucketOf(linear blend). Two reasons spelled out in
  // web/lib/composite-risk.ts + docs/DECISIONS.md §6: the prior 0.45/0.55
  // weights were a political knob with no empirical fit, and the linear
  // blend's quartile sometimes lands in a tier the operational intent
  // wouldn't (e.g. W=high × T=mod → ~0.48 linear → MOD, but matrix → HIGH).
  // The matrix encodes each cell's call explicitly in one published table.
  const compositeBucket: RiskLevel = compositeReady
    ? compositeFromBuckets(weatherBucket, threatBucket) ?? 'moderate'
    : 'moderate'; // placeholder while loading (skeleton hides it anyway)

  // `compositeScore` (linear blend, 0-1) is kept ONLY for the HeroOrb arc
  // fill — it's a visual position cue, not the source of truth for the
  // tier label. In edge cells the arc fill can sit visually in a slightly
  // different band than the tier color; that's acceptable since the user
  // reads the tier label, not the arc precise position.
  const compositeScore: number | null = compositeReady && weatherSignal != null
    ? composite(weatherSignal, threatSignal)
    : null;

  // Floor 'low' to 'moderate' for the page CHROME (background waves, hero
  // orb palette, section eyebrow accent). The literal Risk pill below still
  // receives the actual bucket so the user sees "LOW" in green when applicable
  // — this only stops the surrounding visuals from going muted teal/grey.
  const chromeLevel: RiskLevel = floorLow(compositeBucket);
  const r = getRisk(chromeLevel, accent);
  // pillTone uses the true composite bucket so "LOW" stays green.
  const pillTone = getRisk(compositeBucket, accent);
  const isAlarming = compositeBucket === 'high' || compositeBucket === 'extreme';

  const heroReady = compositeReady;
  const headlineLines: [string, string] = compositeReady
    ? HEADLINE[compositeBucket]
    : ['Loading', '…'];
  const subtitle: string = compositeReady && weatherBucket != null
    ? compositeSubtitle({ weatherBucket, threatBucket })
    : 'Reading conditions for your area…';

  // Confidence breakdown — computes the weakest-link confidence across
  // weather observation age, KBDI availability, NDVI availability,
  // calibration source, and driving-fire age. Shown as a small chip
  // beneath the subtitle; tap to expand into a full breakdown modal.
  //
  // `confidenceNowMs` ticks once a minute via setInterval so the chip's
  // age-based signals (weather observation age, FIRMS detection age)
  // advance over time even when TanStack hasn't refetched. Without this,
  // computeConfidence's internal `Date.now()` is captured by useMemo at
  // the moment its deps last changed — and the chip stays frozen at
  // "X min ago" until the next refetch (10+ min for /weather).
  const [confidenceNowMs, setConfidenceNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setConfidenceNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const confidence = useMemo(
    () =>
      computeConfidence({
        weatherUpdatedAt: weather.dataUpdatedAt,
        weatherLoading: weather.isLoading,
        riskData: risk.data,
        riskLoading: risk.isLoading,
        threatDriver,
        nowMs: confidenceNowMs,
      }),
    [
      weather.dataUpdatedAt,
      weather.isLoading,
      risk.data,
      risk.isLoading,
      threatDriver,
      confidenceNowMs,
    ],
  );

  return (
    <>
      {/* ─── HERO BAND ─────────────────────────────────────────────────── */}
      <HeroBand risk={chromeLevel} pulseSpeed={70}>
        <PageSection top={28} bottom={48}>
          <SectionEyebrow
            color={isAlarming ? r.color : ae.textDim}
            right={`${
              weather.isFetching || !weather.data ? 'Updating' : weather.data.location.name
            } · CAL FIRE · NWS`}
          >
            {isAlarming ? 'Active Threat · ' : 'Status · '}{loc.label}
          </SectionEyebrow>

          {/* 2-col: orb left, headline + subtitle + CTAs right */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(380px, 480px) 1fr',
              gap: 56,
              alignItems: 'center',
              marginTop: 24,
            }}
          >
            <div
              className="ember-fade-up"
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 360,
              }}
            >
              {/* Orb arc reflects the COMPOSITE score (0-1), not raw V4.
                  Passing thresholds={null} bypasses HeroOrb's internal
                  scoreToFraction re-mapping so the composite is used
                  directly as the arc fraction. */}
              <HeroOrb
                risk={chromeLevel}
                score={compositeScore}
                thresholds={null}
                pulseSpeed={70}
              />
            </div>

            <div>
              <div className="ember-fade-up" style={{ marginBottom: 16 }}>
                {compositeReady ? (
                  <ShimmerPill risk={pillTone} />
                ) : (
                  <Skeleton width={96} height={28} rounded="full" />
                )}
              </div>
              {heroReady ? (
                <h1
                  key={headlineLines.join('-')}
                  style={{
                    margin: 0,
                    fontFamily: ae.fontDisplay,
                    fontSize: 64,
                    fontWeight: ae.titleWeight,
                    letterSpacing: '-0.035em',
                    lineHeight: 0.98,
                    color: ae.text,
                    textWrap: 'balance' as React.CSSProperties['textWrap'],
                  }}
                >
                  <Stagger text={headlineLines.join(' ')} baseDelay={70} startDelay={140} />
                </h1>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Skeleton width={'70%'} height={56} rounded="md" />
                  <Skeleton width={'45%'} height={56} rounded="md" />
                </div>
              )}
              {heroReady ? (
                <p
                  key={headlineLines.join('-') + '-p'}
                  className="ember-fade-up"
                  style={{
                    margin: '18px 0 0',
                    maxWidth: 540,
                    fontFamily: ae.fontBody,
                    fontSize: 17,
                    lineHeight: 1.5,
                    color: ae.textDim,
                    animationDelay: '420ms',
                  }}
                >
                  {subtitle}
                </p>
              ) : (
                <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 540 }}>
                  <Skeleton width={'100%'} height={18} rounded="sm" />
                  <Skeleton width={'82%'} height={18} rounded="sm" />
                </div>
              )}

              {/* Confidence + Trajectory chips — own row directly under the
                  subtitle, AQI-style. Confidence reads data quality
                  ("HIGH / MEDIUM / LOW CONFIDENCE") and opens a per-signal
                  breakdown. Trajectory reads direction over the next 6 hr
                  ("RISING / STEADY / FALLING") and opens the phase-space
                  modal where the projected position + driver context live. */}
              <div
                style={{
                  marginTop: 14,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 10,
                  animationDelay: '600ms',
                }}
                className="ember-fade-up"
              >
                <ConfidenceChip
                  confidence={confidence}
                  onOpen={() => setConfidenceOpen(true)}
                />
                <TrajectoryChip
                  trajectory={trajectory.data}
                  isLoading={trajectory.isLoading}
                  onOpen={() => setPhaseSpaceOpen(true)}
                />
              </div>

              {/* Hero meta-info row: calibration hint + "Why this score?"
                  trigger. Both open their respective modals — the
                  calibration ladder explains where your bucket comes from,
                  the explainer walks you through the matrix that produced
                  the composite tier. */}
              <div
                style={{
                  marginTop: 14,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                {risk.data?.regional_level && risk.data?.regional_state ? (
                  <button
                    type="button"
                    onClick={() => setCalibOpen(true)}
                    className="ember-fade-up"
                    aria-label="What does calibrated for this state mean?"
                    style={metaTriggerStyle(ae, '500ms')}
                  >
                    Calibrated for {risk.data.regional_state}
                    {risk.data.regional_level !== risk.data.danger_level
                      ? ` · national: ${risk.data.danger_level}`
                      : ''}
                    <Icon name="info" size={11} color={ae.textMute} strokeWidth={1.8} />
                  </button>
                ) : null}

                {/* Sibling trigger — opens the matrix explainer. Always
                    available; doesn't require regional calibration. */}
                {compositeReady ? (
                  <button
                    type="button"
                    onClick={() => setWhyOpen(true)}
                    className="ember-fade-up"
                    aria-label="Why this score? — open the matrix explainer"
                    style={metaTriggerStyle(ae, '600ms')}
                  >
                    Why this score?
                    <Icon name="info" size={11} color={ae.textMute} strokeWidth={1.8} />
                  </button>
                ) : null}
              </div>

              <div
                className="ember-fade-up"
                style={{ marginTop: 26, display: 'flex', gap: 10, animationDelay: '560ms' }}
              >
                <Button
                  variant="primary"
                  icon="map"
                  color={isAlarming ? r.color : undefined}
                  onClick={() => { window.location.href = '/map'; }}
                >
                  View Live Map
                </Button>
                <Button
                  variant="secondary"
                  icon="flame"
                  onClick={() => { window.location.href = '/risk'; }}
                >
                  Risk Calculator
                </Button>
              </div>
            </div>
          </div>
        </PageSection>
      </HeroBand>

      {/* ─── Composite breakdown: the two halves that drive the score ─── */}
      <PageSection top={4} bottom={16}>
        <div className="ember-fade-up" style={{ marginBottom: 18 }}>
          <SectionEyebrow
            color={isAlarming ? r.color : undefined}
            right="Computed continuously · weights documented in Risk Forecast"
          >
            Score Breakdown
          </SectionEyebrow>
        </div>
        <div
          className="ember-fade-up"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 16,
            animationDelay: '60ms',
          }}
        >
          <ComponentScoreCard
            label="Fire Weather"
            icon="flame"
            // Show the raw V4 risk_score (matches what the Risk Calculator
            // displays for the same inputs) — NOT my normalized percentile.
            score={risk.data?.risk_score ?? null}
            bucket={weatherBucket}
            isLoading={!compositeReady}
            // Pass the regional thresholds so the gauge zones agree with
            // whichever bucket the backend assigned. Falls back to the
            // global defaults the backend uses for uncalibrated locations.
            zoneBoundaries={
              risk.data?.regional_thresholds
                ? {
                    low: risk.data.regional_thresholds.low,
                    moderate: risk.data.regional_thresholds.moderate,
                    extreme: risk.data.regional_thresholds.extreme,
                  }
                : { low: 0.3, moderate: 0.6, extreme: 0.8 }
            }
            scoreMax={risk.data?.regional_thresholds?.score_max ?? 1.0}
            caption={
              risk.data?.regional_state
                ? `Calibrated for ${risk.data.regional_state} — fuses temperature, humidity, wind, drought, and vegetation into a 0–1 likelihood.`
                : 'Global thresholds — fuses temperature, humidity, wind, drought, and vegetation into a 0–1 likelihood.'
            }
            emptyText="—"
          />
          <ComponentScoreCard
            label="Active Fire Threat"
            icon="pin"
            score={anyFireInRange ? threatSignal : null}
            bucket={threatBucket}
            isLoading={!compositeReady}
            // Threat axis uses my fixed composite-side band edges since
            // there's no backend-equivalent bucketing for fire proximity.
            zoneBoundaries={{ low: 0.25, moderate: 0.5, extreme: 0.75 }}
            scoreMax={1.0}
            caption={
              anyFireInRange
                ? `Worst-case among fires within ${formatDistance(THREAT_RADIUS_MI, units.distance, 0)} — accounts for size, containment, distance, and wind alignment.`
                : 'No active fires within range — score is zero until a fire is detected near you.'
            }
            emptyText="None"
          />
        </div>
      </PageSection>

      {/* ─── Threat Source: names the single fire driving the threat ──── */}
      <PageSection top={4} bottom={16}>
        <div className="ember-fade-up" style={{ marginBottom: 18 }}>
          <SectionEyebrow
            color={isAlarming ? r.color : undefined}
            right={
              threatDriver?.kind === 'incident'
                ? `${threatDriver.incident.source === 'calfire' ? 'CAL FIRE' : 'NIFC WFIGS'} · within ${formatDistance(THREAT_RADIUS_MI, units.distance, 0)}`
                : threatDriver?.kind === 'firms'
                  ? `NASA FIRMS · within ${formatDistance(THREAT_RADIUS_MI, units.distance, 0)}`
                  : `No active fires within ${formatDistance(THREAT_RADIUS_MI, units.distance, 0)}`
            }
          >
            Threat Source
          </SectionEyebrow>
        </div>
        <div className="ember-fade-up" style={{ animationDelay: '120ms' }}>
          <ThreatSourceCard driver={threatDriver} isLoading={!compositeReady} />
        </div>
      </PageSection>

      {/* ─── Current Conditions: Wind + Temperature + Humidity ────────── */}
      <PageSection top={4} bottom={16}>
        <div className="ember-fade-up" style={{ marginBottom: 18 }}>
          <SectionEyebrow right="Open-Meteo · OWM · refreshed every 15 min">
            Current Conditions
          </SectionEyebrow>
        </div>
        <div
          className="ember-fade-up"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)',
            gap: 16,
            animationDelay: '180ms',
          }}
        >
          <ConditionsCard
            wind={weather.data?.wind_speed ?? null}
            windDeg={weather.data?.wind_deg ?? null}
            temperatureC={weather.data?.temperature ?? null}
            tempUnit={units.temp}
            speedUnit={units.speed}
            locationName={weather.data?.location.name ?? loc.label}
            accentColor={r.color}
            isLoading={weather.isLoading}
          />
          <HumidityCard
            humidity={weather.data?.humidity ?? null}
            conditions={weather.data?.conditions ?? null}
            isLoading={weather.isLoading}
          />
        </div>
      </PageSection>

      {/* ─── Area & Vegetation: KBDI + NDVI ─────────────────────────────── */}
      <PageSection top={4} bottom={48}>
        <div className="ember-fade-up" style={{ marginBottom: 18 }}>
          <SectionEyebrow right="Tracked over the local fire season">
            Area &amp; Vegetation
          </SectionEyebrow>
        </div>
        <div
          className="ember-fade-up"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: 16,
            animationDelay: '240ms',
          }}
        >
          <LocalKbdiCard
            kbdi={risk.data?.kbdi ?? null}
            regionalLevel={risk.data?.regional_level ?? null}
            regionalState={risk.data?.regional_state ?? null}
            isLoading={risk.isLoading}
          />
          <LocalNdviCard
            ndviAnomaly={risk.data?.ndvi_anomaly ?? null}
            isLoading={risk.isLoading}
          />
        </div>
      </PageSection>

      <CalibrationModal
        open={calibOpen}
        onClose={() => setCalibOpen(false)}
        userScore={risk.data?.risk_score ?? null}
        userState={risk.data?.regional_state ?? null}
      />

      <CompositeExplainerModal
        open={whyOpen}
        onClose={() => setWhyOpen(false)}
        weatherBucket={weatherBucket}
        threatBucket={threatBucket}
        compositeBucket={compositeReady ? compositeBucket : null}
        weatherRawScore={risk.data?.risk_score ?? null}
        threatSignal={compositeReady ? threatSignal : null}
        regionalState={risk.data?.regional_state ?? null}
        regionalThresholds={risk.data?.regional_thresholds ?? null}
        driver={threatDriver}
        distanceUnit={units.distance}
      />

      <ConfidenceBreakdownModal
        open={confidenceOpen}
        onClose={() => setConfidenceOpen(false)}
        confidence={confidence}
      />

      <PhaseSpaceModal
        open={phaseSpaceOpen}
        onClose={() => setPhaseSpaceOpen(false)}
        weatherBucket={weatherBucket}
        threatBucket={threatBucket}
        trajectory={trajectory.data}
        regionalThresholds={risk.data?.regional_thresholds ?? null}
        currentWeatherScore={risk.data?.risk_score ?? null}
        currentConditions={{
          temperatureC: weather.data?.temperature ?? null,
          humidityPct: weather.data?.humidity ?? null,
          windKph: weather.data?.wind_speed ?? null,
        }}
      />
    </>
  );
}

// ─── Inline cards ──────────────────────────────────────────────────────────

function ConditionsCard({
  wind,
  windDeg,
  temperatureC,
  tempUnit,
  speedUnit,
  locationName,
  accentColor,
  isLoading,
}: {
  wind: number | null;
  windDeg: number | null;
  temperatureC: number | null;
  tempUnit: 'C' | 'F';
  speedUnit: 'mph' | 'kph';
  locationName: string;
  accentColor: string;
  isLoading: boolean;
}) {
  const { ae } = useAesthetic();
  return (
    <TiltCard
      max={2}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: ae.cardBorder,
        borderRadius: ae.radiusLg,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <GridPattern opacity={0.025} />
      <div style={{ position: 'relative', padding: 22 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            gap: 12,
          }}
        >
          <Eyebrow>Wind &amp; Temperature</Eyebrow>
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 10,
              color: ae.textMute,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '60%',
            }}
          >
            NWS · {locationName}
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {/* Wind */}
          <CondTile
            label="Wind"
            decoration={<WindDial angle={(windDeg ?? 0) + 180} color={accentColor} size={56} />}
          >
            {wind != null ? (
              <>
                <BigNumber>{formatSpeed(wind, speedUnit, 0)}</BigNumber>
                {windDeg != null ? <CondCaption>From {dirLabel(windDeg)}</CondCaption> : null}
              </>
            ) : isLoading ? (
              <>
                <Skeleton width={120} height={32} rounded="md" />
                <div style={{ marginTop: 8 }}>
                  <Skeleton width={64} height={12} rounded="sm" />
                </div>
              </>
            ) : (
              <BigNumber>—</BigNumber>
            )}
          </CondTile>

          {/* Temperature */}
          <CondTile
            label="Temperature"
            decoration={
              <Thermometer
                ae={ae}
                accentColor={accentColor}
                temperatureC={temperatureC ?? 0}
                visible={temperatureC != null}
              />
            }
          >
            {temperatureC != null ? (
              <>
                <BigNumber>{formatTemp(temperatureC, tempUnit, 0)}</BigNumber>
                <CondCaption>
                  {tempUnit === 'F'
                    ? `${temperatureC.toFixed(1)}°C`
                    : `${((temperatureC * 9) / 5 + 32).toFixed(0)}°F`}
                </CondCaption>
              </>
            ) : isLoading ? (
              <>
                <Skeleton width={120} height={32} rounded="md" />
                <div style={{ marginTop: 8 }}>
                  <Skeleton width={56} height={12} rounded="sm" />
                </div>
              </>
            ) : (
              <BigNumber>—</BigNumber>
            )}
          </CondTile>
        </div>
      </div>
    </TiltCard>
  );
}

function CondTile({
  label,
  decoration,
  children,
}: {
  label: string;
  decoration?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { ae } = useAesthetic();
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))',
        border: ae.cardBorder,
        borderRadius: ae.radius,
        padding: '18px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        minHeight: 124,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <Eyebrow>{label}</Eyebrow>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
      {decoration ? <div style={{ flexShrink: 0 }}>{decoration}</div> : null}
    </div>
  );
}

function Thermometer({
  ae,
  accentColor,
  temperatureC,
  visible,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  accentColor: string;
  temperatureC: number;
  visible: boolean;
}) {
  if (!visible) return null;
  const tFrac = Math.max(0, Math.min(1, temperatureC / 50));
  return (
    <svg width="48" height="72" viewBox="0 0 56 78" aria-hidden>
      <defs>
        <linearGradient id="thermo-fill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={accentColor} stopOpacity="0.85" />
          <stop offset="100%" stopColor={accentColor} stopOpacity="0.20" />
        </linearGradient>
      </defs>
      <rect
        x="22"
        y="6"
        width="12"
        height="48"
        rx="6"
        fill="none"
        stroke={ae.lineStrong}
        strokeWidth="0.8"
      />
      <rect
        x="24"
        y={6 + 48 * (1 - tFrac)}
        width="8"
        height={48 * tFrac}
        rx="4"
        fill="url(#thermo-fill)"
        style={{ filter: `drop-shadow(0 0 4px ${accentColor})` }}
      />
      <circle cx="28" cy="62" r="11" fill={accentColor} style={{ filter: `drop-shadow(0 0 6px ${accentColor})` }} />
      <circle cx="28" cy="62" r="7" fill="rgba(0,0,0,0.30)" />
    </svg>
  );
}

function HumidityCard({
  humidity,
  conditions,
  isLoading,
}: {
  humidity: number | null;
  conditions: string | null;
  isLoading: boolean;
}) {
  const { ae } = useAesthetic();
  const blue = '#4FA8FF';
  const blueGlow = '79, 168, 255';

  return (
    <TiltCard
      max={3}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: ae.cardBorder,
        borderRadius: ae.radiusLg,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 220,
          height: 220,
          borderRadius: '50%',
          filter: 'blur(50px)',
          pointerEvents: 'none',
          background: `radial-gradient(circle, rgba(${blueGlow}, 0.12), transparent 70%)`,
        }}
      />
      <GridPattern opacity={0.025} />
      <div
        style={{
          position: 'relative',
          padding: 22,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Eyebrow>Humidity</Eyebrow>
        <div
          style={{
            marginTop: 12,
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          {humidity != null ? (
            <div
              style={{
                fontFamily: ae.fontDisplay,
                fontSize: 56,
                fontWeight: ae.titleWeight,
                letterSpacing: '-0.04em',
                color: ae.text,
                lineHeight: 0.9,
                fontVariantNumeric: 'tabular-nums',
                textShadow: `0 0 32px rgba(${blueGlow}, 0.25)`,
              }}
            >
              <AnimatedNumber value={humidity} format={(n) => `${Math.round(n)}`} duration={1000} />
              <span
                style={{
                  fontSize: 24,
                  color: ae.textDim,
                  fontWeight: 500,
                }}
              >
                %
              </span>
            </div>
          ) : isLoading ? (
            <Skeleton width={140} height={56} rounded="md" />
          ) : (
            <span
              style={{
                fontFamily: ae.fontDisplay,
                fontSize: 44,
                fontWeight: ae.titleWeight,
                color: ae.textDim,
                letterSpacing: '-0.03em',
              }}
            >
              —
            </span>
          )}
          {humidity != null ? (
            <div style={{ flexShrink: 0, marginLeft: 'auto' }}>
              <HumidityDial ae={ae} value={humidity} color={blue} glow={blueGlow} size={96} />
            </div>
          ) : null}
        </div>
        {conditions ? (
          <div
            style={{
              marginTop: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 12,
              background: `linear-gradient(180deg, rgba(${RISK_LEVELS.low.glow}, 0.10), rgba(${RISK_LEVELS.low.glow}, 0.02))`,
              border: `0.5px solid rgba(${RISK_LEVELS.low.glow}, 0.28)`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 99,
                background: RISK_LEVELS.low.color,
                boxShadow: `0 0 8px ${RISK_LEVELS.low.color}`,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: ae.fontBody,
                fontSize: 13,
                color: RISK_LEVELS.low.color,
                fontWeight: 500,
              }}
            >
              Conditions:{' '}
              <span style={{ color: ae.text, fontWeight: 600 }}>{conditions}</span>.
            </span>
          </div>
        ) : isLoading ? (
          <div style={{ marginTop: 14 }}>
            <Skeleton width="100%" height={40} rounded="md" />
          </div>
        ) : null}
      </div>
    </TiltCard>
  );
}

/** Radial humidity dial — ticked ring + arc fill + droplet glyph in center. */
function HumidityDial({
  ae,
  value,
  color,
  glow,
  size = 96,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  value: number;
  color: string;
  glow: string;
  size?: number;
}) {
  const c = size / 2;
  const r = c - 8;
  const circ = 2 * Math.PI * r;
  const dash = circ * (value / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <defs>
        <radialGradient id={`hd-halo-${size}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.20" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={c - 2} fill={`url(#hd-halo-${size})`} />
      <circle cx={c} cy={c} r={r} fill="none" stroke={ae.line} strokeWidth="3" />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        transform={`rotate(-90 ${c} ${c})`}
        style={{
          filter: `drop-shadow(0 0 6px ${color})`,
          transition: 'stroke-dasharray 1.1s cubic-bezier(0.2, 0.7, 0.3, 1)',
        }}
      />
      {/* Tick marks */}
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (i * 15 * Math.PI) / 180;
        const r1 = r - 5;
        const r2 = r - (i % 6 === 0 ? 9 : 7);
        return (
          <line
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            x1={c + Math.cos(a) * r1}
            y1={c + Math.sin(a) * r1}
            x2={c + Math.cos(a) * r2}
            y2={c + Math.sin(a) * r2}
            stroke={i % 6 === 0 ? ae.lineStrong : ae.line}
            strokeWidth="0.5"
          />
        );
      })}
      {/* Droplet glyph */}
      <path
        d={`M ${c} ${c - 10} C ${c + 7} ${c}, ${c + 6} ${c + 9}, ${c} ${c + 9} C ${c - 6} ${c + 9}, ${c - 7} ${c}, ${c} ${c - 10} Z`}
        fill={`rgba(${glow}, 0.18)`}
        stroke={color}
        strokeWidth="1"
      />
    </svg>
  );
}

/** Premium breakdown card for the Score Breakdown row. Shows the score
 *  (raw V4 for Fire Weather, computed 0-1 for Active Fire Threat), a level
 *  pill, a segmented 4-zone gauge with a marker, and a contextual caption.
 *  Loading and "no data" states preserved from the previous version. */
function ComponentScoreCard({
  label,
  score,
  bucket,
  isLoading,
  caption,
  emptyText,
  icon,
  /** Zone boundaries on the gauge: where LOW→MOD, MOD→HIGH, HIGH→EXT land.
   *  Defaults to 0.25/0.5/0.75 (my composite-side bands); Fire Weather
   *  passes regional thresholds so the gauge agrees with the backend bucket. */
  zoneBoundaries,
  /** Max value on the gauge (usually 1.0; pass score_max for regional cap). */
  scoreMax = 1.0,
}: {
  label: string;
  score: number | null;
  bucket: RiskLevel | null;
  isLoading: boolean;
  caption: string | null;
  emptyText: string;
  icon: IconName;
  zoneBoundaries?: { low: number; moderate: number; extreme: number };
  scoreMax?: number;
}) {
  const { ae, accent } = useAesthetic();
  const tone = bucket ? getRisk(bucket, accent) : null;
  const palette = tone ?? { color: 'rgba(255,255,255,0.35)', glow: '255,255,255', label: '—' };

  // Default zones use the composite-side bands; callers can override.
  const z = zoneBoundaries ?? { low: 0.25, moderate: 0.5, extreme: 0.75 };
  const zones = [
    { until: z.low / scoreMax,           color: RISK_LEVELS.low.color,                lbl: 'Low'  },
    { until: z.moderate / scoreMax,      color: RISK_LEVELS.moderate.color,           lbl: 'Mod'  },
    { until: z.extreme / scoreMax,       color: getRisk('high', accent).color,        lbl: 'High' },
    { until: 1.0,                        color: getRisk('extreme', accent).color,     lbl: 'Ext'  },
  ];

  const markerPct = score == null
    ? 0
    : Math.max(0.5, Math.min(99, (score / scoreMax) * 100));

  return (
    <TiltCard
      max={3}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: `0.5px solid rgba(${palette.glow}, 0.20)`,
        borderRadius: ae.radiusLg,
        boxShadow: `0 20px 60px rgba(${palette.glow}, 0.08), inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      {/* Top accent stripe — glow gradient pinned to the top edge */}
      <div
        aria-hidden
        style={{
          height: 2.5,
          background: `linear-gradient(90deg, transparent, rgba(${palette.glow}, 0.75), transparent)`,
          boxShadow: `0 0 14px ${palette.color}`,
        }}
      />
      {/* Soft corner glow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -50,
          right: -50,
          width: 240,
          height: 240,
          borderRadius: '50%',
          filter: 'blur(50px)',
          pointerEvents: 'none',
          background: `radial-gradient(circle, rgba(${palette.glow}, 0.14), transparent 70%)`,
        }}
      />
      <GridPattern opacity={0.035} />

      <div style={{ position: 'relative', padding: 26 }}>
        {/* Header: icon stone + label, level pill on right */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                flexShrink: 0,
                background: `radial-gradient(circle at 30% 30%, rgba(${palette.glow}, 0.22), rgba(${palette.glow}, 0.05))`,
                border: `0.5px solid rgba(${palette.glow}, 0.30)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={icon} size={15} color={palette.color} strokeWidth={1.6} />
            </div>
            <Eyebrow>{label}</Eyebrow>
          </div>
          {isLoading ? (
            <Skeleton width={80} height={22} rounded="full" />
          ) : tone ? (
            <span
              className="px-shimmer-pill"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px 5px 9px',
                borderRadius: 99,
                background: `linear-gradient(180deg, rgba(${tone.glow}, 0.18), rgba(${tone.glow}, 0.06))`,
                border: `0.5px solid rgba(${tone.glow}, 0.32)`,
                fontFamily: ae.fontMono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.16em',
                color: tone.color,
                textTransform: 'uppercase',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: tone.color,
                  boxShadow: `0 0 6px ${tone.color}`,
                }}
              />
              {tone.label}
            </span>
          ) : null}
        </div>

        {/* Big number */}
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          {isLoading ? (
            <Skeleton width={160} height={56} rounded="md" />
          ) : score != null ? (
            <>
              <span
                style={{
                  fontFamily: ae.fontDisplay,
                  fontSize: 60,
                  fontWeight: ae.titleWeight,
                  letterSpacing: '-0.04em',
                  lineHeight: 0.9,
                  color: ae.text,
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: `0 0 32px rgba(${palette.glow}, 0.35)`,
                }}
              >
                <AnimatedNumber value={score} format={(n) => n.toFixed(2)} duration={900} />
              </span>
              <span
                style={{
                  fontFamily: ae.fontMono,
                  fontSize: 11,
                  color: ae.textMute,
                  letterSpacing: '0.12em',
                }}
              >
                / {scoreMax.toFixed(2)}
              </span>
            </>
          ) : (
            <span
              style={{
                fontFamily: ae.fontDisplay,
                fontSize: 44,
                fontWeight: ae.titleWeight,
                color: ae.textDim,
                letterSpacing: '-0.025em',
                lineHeight: 0.95,
              }}
            >
              {emptyText}
            </span>
          )}
        </div>

        {/* Segmented gauge */}
        <div style={{ marginTop: 22, position: 'relative' }}>
          <div style={{ display: 'flex', gap: 3, height: 8, borderRadius: 99 }}>
            {zones.map((zone, i) => {
              const prev = i === 0 ? 0 : zones[i - 1].until;
              const w = (zone.until - prev) * 100;
              const active = score != null && (score / scoreMax) >= prev;
              const rgb = hexToRgb(zone.color);
              return (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  style={{
                    width: `${w}%`,
                    background: active
                      ? `linear-gradient(180deg, rgba(${rgb}, 0.55), rgba(${rgb}, 0.25))`
                      : `rgba(${rgb}, 0.12)`,
                    border: `0.5px solid rgba(${rgb}, ${active ? 0.45 : 0.18})`,
                    borderRadius: 99,
                    transition: 'background 0.4s ease',
                  }}
                />
              );
            })}
          </div>
          {/* Marker — hidden when score is null */}
          {score != null ? (
            <div
              style={{
                position: 'absolute',
                top: -3,
                left: `${markerPct}%`,
                transform: 'translateX(-50%)',
                width: 2,
                height: 14,
                borderRadius: 99,
                background: '#fff',
                boxShadow: `0 0 10px ${palette.color}`,
                transition: 'left 0.6s cubic-bezier(0.3, 1, 0.4, 1)',
              }}
            />
          ) : null}
          {/* Zone labels — each label's container matches the width of the
              bar segment above it (with the same 3px gap), so the centered
              text label always sits beneath the center of its bar. This
              matters for regional thresholds where the segments aren't
              equal-width (e.g. CA's 30/30/20/20 split). */}
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              gap: 3,
              fontFamily: ae.fontMono,
              fontSize: 9.5,
              color: ae.textMute,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            {zones.map((zone, i) => {
              const prev = i === 0 ? 0 : zones[i - 1].until;
              const w = (zone.until - prev) * 100;
              const isActive = tone != null && tone.color === zone.color;
              return (
                <span
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  style={{
                    width: `${w}%`,
                    textAlign: 'center',
                    color: isActive ? tone!.color : ae.textMute,
                    fontWeight: isActive ? 700 : 500,
                  }}
                >
                  {zone.lbl}
                </span>
              );
            })}
          </div>
        </div>

        {/* Caption */}
        {caption ? (
          <p
            style={{
              margin: '20px 0 0',
              paddingTop: 16,
              borderTop: `0.5px solid ${ae.line}`,
              fontFamily: ae.fontBody,
              fontSize: 13,
              lineHeight: 1.5,
              color: ae.textDim,
            }}
          >
            {caption}
          </p>
        ) : null}
      </div>
    </TiltCard>
  );
}

function BigNumber({ children }: { children: React.ReactNode }) {
  const { ae } = useAesthetic();
  return (
    <span
      style={{
        fontFamily: ae.fontDisplay,
        fontSize: 30,
        fontWeight: ae.titleWeight,
        color: ae.text,
        letterSpacing: '-0.03em',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 0.95,
      }}
    >
      {children}
    </span>
  );
}

function CondCaption({ children }: { children: React.ReactNode }) {
  const { ae } = useAesthetic();
  return (
    <div
      style={{
        marginTop: 8,
        fontFamily: ae.fontBody,
        fontSize: 13,
        color: ae.textDim,
      }}
    >
      {children}
    </div>
  );
}
