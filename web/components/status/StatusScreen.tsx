'use client';

// The Status screen. A hero band with the orb, the headline and its chips, then
// a grid of conditions, humidity, drought and vegetation cards. Anything about
// specific fires lives on Map or Safety instead.

import { useEffect, useId, useMemo, useState } from 'react';

import { Icon } from '@/components/Icon';
import { CalibrationModal } from '@/components/status/CalibrationModal';
import { CompositeExplainerModal } from '@/components/status/CompositeExplainerModal';
import { ConfidenceBreakdownModal, ConfidenceChip } from '@/components/status/ConfidenceChip';
import { PhaseSpaceModal } from '@/components/status/PhaseSpaceModal';
import { TrajectoryChip } from '@/components/status/TrajectoryChip';
import { IntelligenceSystem } from '@/components/status/HeroSystems';
import { LocalKbdiCard } from '@/components/status/LocalKbdiCard';
import { LocalNdviCard } from '@/components/status/LocalNdviCard';
import { ThreatSourceCard } from '@/components/status/ThreatSourceCard';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Button } from '@/components/ui/Button';
import { cardinal8 } from '@/components/ui/CompassRose';
import { DataErrorState } from '@/components/ui/DataErrorState';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { GridPattern } from '@/components/ui/GridPattern';
import { WavesBackground } from '@/components/WavesBackground';
import { HeroOrb } from '@/components/ui/HeroOrb';
import { PageSection } from '@/components/ui/PageSection';
import { SectionEyebrow } from '@/components/ui/SectionEyebrow';
import { SegmentedRiskChip } from '@/components/ui/SegmentedRiskChip';
import { Skeleton } from '@/components/ui/Skeleton';
import { Stagger } from '@/components/ui/Stagger';
import { TiltCard } from '@/components/ui/TiltCard';
import { WindDial } from '@/components/ui/WindDial';
import { useAesthetic } from '@/lib/aesthetic';
import { dangerToRisk } from '@/lib/api';
import { computeConfidence } from '@/lib/confidence';
import {
  bucketOf,
  composite,
  compositeFromBuckets,
  compositeSubtitle,
  envFromBuckets,
  findThreatDriver,
  normalizeWeather,
  THREAT_RADIUS_MI,
  tierArcFraction,
  type ThreatDriver,
} from '@/lib/composite-risk';
import { useAnyModalOpen } from '@/lib/modal-state';
import {
  useFiresAroundMe,
  useIgnition,
  useNamedIncidentsNear,
  useRiskFromWeather,
  useTrajectory,
  useWeather,
} from '@/lib/queries';
import { floorLow, getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { useUserLocation } from '@/lib/use-location';
import { formatDistance, formatSpeed, formatTemp, useUnits } from '@/lib/use-units';

// Headline copy per tier. compositeSubtitle handles the line underneath, which
// names whichever signal is driving it.
const HEADLINE: Record<RiskLevel, [string, string]> = {
  low:      ['All',         'Clear'],
  moderate: ['Stay',        'Aware'],
  high:     ['Heightened',  'Risk'],
  extreme:  ['Critical',    'Conditions'],
};

const dirLabel = (deg: number | null | undefined) =>
  deg == null ? '—' : cardinal8(deg);

/** Styling for the two quiet text triggers in the hero, kept identical so they
 *  read as a pair. */
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

/** Stops the waves and the CSS animations when nobody is watching. Not tied to
 *  scrolling. The waves are pinned and stay partly on screen at every scroll
 *  position, so a sentinel element would freeze waves the user can still see. */
function useTabVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  return visible;
}

export function StatusScreen() {
  const { ae, accent } = useAesthetic();
  const tabVisible = useTabVisible();
  const anyModalOpen = useAnyModalOpen();
  const loc = useUserLocation();
  const weather = useWeather(loc.coords);
  const risk = useRiskFromWeather(weather.data, loc.coords);
  const fires = useFiresAroundMe(loc.coords);
  // Full threat radius, not the smaller default, or a fire 40 miles out shows on
  // Safety and not here, which looks like an all-clear.
  const incidents = useNamedIncidentsNear(loc.coords, THREAT_RADIUS_MI);
  const units = useUnits();
  const [calibOpen, setCalibOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [confidenceOpen, setConfidenceOpen] = useState(false);
  const [phaseSpaceOpen, setPhaseSpaceOpen] = useState(false);

  const animActive = tabVisible && !anyModalOpen;
  const trajectory = useTrajectory(loc.coords);
  const ignition = useIgnition(loc.coords);

  // The first of the two axes. Calibration is what makes it comparable across
  // states, so a Florida day in that state's worst few percent scores high here even
  // though its raw number is modest.
  const weatherSignal: number | null = useMemo(
    () =>
      risk.data
        ? normalizeWeather(risk.data.risk_score, risk.data.regional_thresholds ?? null)
        : null,
    [risk.data],
  );
  const windDeg = weather.data?.wind_deg ?? null;
  const windSpeedKph = weather.data?.wind_speed ?? null;
  // The one fire behind the threat number. A satellite pixel sitting on a known
  // incident surfaces as that incident.
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
  // That fire's own factor is the aggregate, so read it off instead of looping again.
  const threatSignal: number = threatDriver?.threat ?? 0;
  // Read off the computation, not the raw feed, which covers 250 miles and is
  // rarely empty.
  const anyFireInRange: boolean = threatDriver != null;

  const compositeReady =
    weather.data !== undefined &&
    risk.data !== undefined &&
    fires.data !== undefined &&
    incidents.data !== undefined;

  // Each breakdown card waits only on its own inputs, so neither sits behind the
  // whole composite.
  const threatReady =
    weather.data !== undefined && fires.data !== undefined && incidents.data !== undefined;
  const fireWeatherReady = weather.data !== undefined && risk.data !== undefined;

  // Take the backend's level instead of re-deriving it, so this card and the what-if
  // screen show the same pill for the same score even if the two drift.
  const weatherBucket: RiskLevel | null = risk.data
    ? dangerToRisk(risk.data.regional_level ?? risk.data.danger_level)
    : null;
  const threatBucket: RiskLevel | null = anyFireInRange ? bucketOf(threatSignal) : null;

  // Not gated on the composite being ready. Without ignition this is just the
  // weather bucket, so the headline works now and sharpens when the model answers.
  const ignitionBucket: RiskLevel | null = ignition.data?.level ?? null;
  const envBucket: RiskLevel | null = envFromBuckets(weatherBucket, ignitionBucket);

  // The headline is a matrix lookup, not a blended number. See
  // web/lib/composite-risk.ts for why.
  const compositeBucket: RiskLevel = compositeReady
    ? compositeFromBuckets(envBucket, threatBucket) ?? 'moderate'
    : 'moderate'; // placeholder while loading, hidden by the skeleton anyway

  // Only the orb's arc uses this blended number, purely as a position cue. The
  // tier label is what people read. Ignition folds in as a smooth version of the
  // matrix, and drops out when the model has nothing to say.
  const ignitionScore: number | null =
    ignition.data ? ignition.data.percentile / 100 : null;
  const envScore: number | null =
    weatherSignal == null
      ? null
      : ignitionScore == null
        ? weatherSignal
        : Math.sqrt(Math.max(weatherSignal, 0) * Math.max(ignitionScore, 0));
  const compositeScore: number | null = compositeReady && envScore != null
    ? composite(envScore, threatSignal)
    : null;

  // Floor the chrome at moderate so a calm day doesn't wash the page out.
  const chromeLevel: RiskLevel = floorLow(compositeBucket);
  const r = getRisk(chromeLevel, accent);
  // Anchored to the orb's own color, so the arc can never sit in a different band
  // than the orb it wraps. The blend only positions it inside that band.
  const compositeArc: number | null =
    compositeReady && compositeScore != null
      ? tierArcFraction(chromeLevel, compositeScore)
      : null;
  // The pill takes the real tier, so LOW stays green.
  const pillTone = getRisk(compositeBucket, accent);
  const isAlarming = compositeBucket === 'high' || compositeBucket === 'extreme';

  const headlineLines: [string, string] = compositeReady
    ? HEADLINE[compositeBucket]
    : ['Loading', '…'];
  const subtitle: string = compositeReady && weatherBucket != null && envBucket != null
    ? compositeSubtitle({ envBucket, weatherBucket, ignitionBucket, threatBucket })
    : 'Reading conditions for your area…';

  // The clock ticks once a minute so the age-based parts keep counting up. Left
  // alone, the memo would freeze "8 min ago" until something else re-rendered the
  // screen. Weather has no refetch interval of its own.
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

  // A failed core signal leaves the page in the same state as a loading one, so
  // the skeletons stay put and we float a modal over them instead of swapping in
  // a whole error screen. Computed after every hook, to keep their order stable.
  const statusDataFailed =
    weather.isError || risk.isError || fires.isError || incidents.isError;
  const retryStatusData = () => {
    weather.refetch();
    risk.refetch();
    fires.refetch();
    incidents.refetch();
    trajectory.refetch();
  };

  return (
    <>
      {/* Pinned to the viewport so it holds still while the page scrolls over it. */}
      <StatusBackdrop risk={chromeLevel} active={animActive} />

      <div className={animActive ? undefined : 'ember-anim-paused'} style={{ position: 'relative', zIndex: 1 }}>
      {/* Hero */}
        <PageSection top={28} bottom={48}>
          <SectionEyebrow
            color={isAlarming ? r.color : ae.textDim}
            right={`${
              weather.isFetching || !weather.data ? 'Updating' : weather.data.location.name
            } · FIRMS · NIFC`}
          >
            {isAlarming ? 'Active Threat · ' : 'Status · '}{loc.label}
          </SectionEyebrow>

          <div
            className="app-stack"
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
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 360,
              }}
            >
              <div style={{ marginBottom: 28 }}>
                <SegmentedRiskChip risk={pillTone} loading={!compositeReady} />
              </div>
              {/* thresholds={null} keeps HeroOrb from re-mapping compositeArc,
                  which is already banded to the tier. */}
              <HeroOrb
                risk={chromeLevel}
                score={compositeArc}
                thresholds={null}
                pulseSpeed={70}
                loading={!compositeReady}
                ariaLabel={
                  compositeReady
                    ? `Overall wildfire risk: ${compositeBucket.toUpperCase()}.`
                    : 'Overall wildfire risk: loading.'
                }
              />
            </div>

            <div>
              {compositeReady ? (
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
              {compositeReady ? (
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

              {/* Confidence and Trajectory chips. The row carries the animation
                  delay, so the chips must not set their own. */}
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
                  isError={trajectory.isError}
                  onOpen={() => setPhaseSpaceOpen(true)}
                />
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                {/* "Calibrated for <state>" lives in the Fire Weather card, next to
                    the score it describes. Here it looked like it explained the
                    composite tier. */}
                {compositeReady ? (
                  <button
                    type="button"
                    onClick={() => setWhyOpen(true)}
                    className="ember-fade-up"
                    aria-label="Score Breakdown, open the matrix explainer"
                    style={metaTriggerStyle(ae, '600ms')}
                  >
                    Score Breakdown
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
                  icon="shield"
                  onClick={() => { window.location.href = '/safety'; }}
                >
                  Safety
                </Button>
              </div>
            </div>
          </div>
        </PageSection>

      {/* Wildfire Intelligence. Fire weather, threat and the ignition core on one
          stage. See components/status/HeroSystems.tsx. */}
      <PageSection top={16} bottom={22}>
        <div className="ember-fade-up" style={{ marginBottom: 16 }}>
          <SectionEyebrow
            color={isAlarming ? r.color : undefined}
            right="Computed continuously · 3 signals"
          >
            Wildfire Intelligence
          </SectionEyebrow>
        </div>
        <div className="ember-fade-up" style={{ animationDelay: '60ms' }}>
          <IntelligenceSystem
            ae={ae}
            fireWeather={{
              // The raw score, so this matches the what-if screen for the same inputs.
              score: risk.data?.risk_score ?? null,
              bucket: weatherBucket,
              zoneBoundaries: risk.data?.regional_thresholds
                ? {
                    low: risk.data.regional_thresholds.low,
                    moderate: risk.data.regional_thresholds.moderate,
                    extreme: risk.data.regional_thresholds.extreme,
                  }
                : { low: 0.3, moderate: 0.6, extreme: 0.8 },
              scoreMax: risk.data?.regional_thresholds?.score_max ?? 1.0,
              caption: risk.data?.regional_state
                ? 'Fuses temperature, humidity, wind, drought, and vegetation into a 0-1 likelihood.'
                : 'Global thresholds. Fuses temperature, humidity, wind, drought, and vegetation into a 0-1 likelihood.',
              emptyText: '—',
              isLoading: !fireWeatherReady,
              howCalculatedHref: '/risk',
              calibrationLabel:
                risk.data?.regional_level && risk.data?.regional_state
                  ? `Calibrated for ${risk.data.regional_state}${
                      risk.data.regional_level !== risk.data.danger_level
                        ? ` · national: ${risk.data.danger_level}`
                        : ''
                    }`
                  : undefined,
              onCalibration:
                risk.data?.regional_level && risk.data?.regional_state
                  ? () => setCalibOpen(true)
                  : undefined,
            }}
            threat={{
              score: anyFireInRange ? threatSignal : null,
              bucket: threatBucket,
              // Fixed bands. The backend doesn't bucket fire proximity.
              zoneBoundaries: { low: 0.25, moderate: 0.5, extreme: 0.75 },
              scoreMax: 1.0,
              caption: anyFireInRange
                ? `Worst-case among fires within ${formatDistance(THREAT_RADIUS_MI, units.distance, 0)}. Accounts for size, containment, distance, and wind alignment.`
                : 'No active fires within range. Score is zero until a fire is detected near you.',
              emptyText: 'None',
              isLoading: !threatReady,
            }}
            ignition={{
              data: ignition.data,
              isLoading: ignition.isLoading,
              isError: ignition.isError,
              onRetry: () => ignition.refetch(),
            }}
          />
        </div>
      </PageSection>

      {/* Threat Source names the single fire driving the threat */}
      <PageSection top={16} bottom={22}>
        <div className="ember-fade-up" style={{ marginBottom: 18 }}>
          <SectionEyebrow
            color={isAlarming ? r.color : undefined}
            right={
              // Don't claim "no active fires" before the feeds have answered.
              !threatReady
                ? `Checking within ${formatDistance(THREAT_RADIUS_MI, units.distance, 0)}`
                : threatDriver?.kind === 'incident'
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
          <ThreatSourceCard driver={threatDriver} isLoading={!threatReady} />
        </div>
      </PageSection>

      {/* Current Conditions */}
      <PageSection top={16} bottom={22}>
        <div className="ember-fade-up" style={{ marginBottom: 18 }}>
          <SectionEyebrow right="Open-Meteo · OWM · refreshed every 15 min">
            Current Conditions
          </SectionEyebrow>
        </div>
        <div
          className="ember-fade-up app-stack"
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

      {/* Area and Vegetation, KBDI and NDVI */}
      <PageSection top={16} bottom={48}>
        <div className="ember-fade-up" style={{ marginBottom: 18 }}>
          <SectionEyebrow right="Tracked over the local fire season">
            Area &amp; Vegetation
          </SectionEyebrow>
        </div>
        <div
          className="ember-fade-up app-stack"
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
            isLoading={weather.isLoading || risk.isLoading}
          />
          <LocalNdviCard
            ndviAnomaly={risk.data?.ndvi_anomaly ?? null}
            isLoading={weather.isLoading || risk.isLoading}
          />
        </div>
      </PageSection>
      </div>

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
        ignitionBucket={ignitionBucket}
        ignitionPercentile={ignition.data?.percentile ?? null}
        envBucket={envBucket}
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
        ignitionBucket={ignitionBucket}
        threatBucket={threatBucket}
        trajectory={trajectory.data}
        error={trajectory.isError}
        onRetry={() => trajectory.refetch()}
        regionalThresholds={risk.data?.regional_thresholds ?? null}
        currentWeatherScore={risk.data?.risk_score ?? null}
        currentConditions={{
          temperatureC: weather.data?.temperature ?? null,
          humidityPct: weather.data?.humidity ?? null,
          windKph: weather.data?.wind_speed ?? null,
        }}
      />

      {/* Not dismissible, because the page has nothing real to show behind it. */}
      {statusDataFailed ? (
        <BlockingErrorOverlay
          ae={ae}
          title="Conditions unavailable"
          message="Current fire weather and nearby fire data aren't available right now. Check your connection and try again."
          onRetry={retryStatusData}
        />
      ) : null}
    </>
  );
}

/** Floats over the frozen skeletons. The backdrop does nothing, so the only ways
 *  out are Retry and the sidebar. */
function BlockingErrorOverlay({
  ae,
  title,
  message,
  onRetry,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="presentation"
      className="app-left-inset"
      style={{
        // Cover the content but not the sidebar, so the user can walk away instead
        // of being stuck on a dead page.
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 248,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(7, 9, 12, 0.55)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          borderRadius: ae.radiusLg,
          background: ae.surface,
          boxShadow: '0 30px 90px rgba(0, 0, 0, 0.6)',
        }}
      >
        <DataErrorState title={title} message={message} onRetry={onRetry} />
      </div>
    </div>
  );
}

// Inline cards

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
            OWM · {locationName}
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {/* The dial's whole job is the direction, so hide it when we don't know
              one. A made-up needle is worse than none. The Thermometer below hides
              the same way when temperature is missing. */}
          <CondTile
            label="Wind"
            decoration={windDeg != null ? <WindDial angle={windDeg + 180} color={accentColor} size={56} /> : undefined}
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
              <span
                style={{
                  fontFamily: ae.fontMono,
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: '0.10em',
                  color: ae.textMute,
                  textTransform: 'uppercase',
                }}
              >
                Unavailable
              </span>
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
              <span
                style={{
                  fontFamily: ae.fontMono,
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: '0.10em',
                  color: ae.textMute,
                  textTransform: 'uppercase',
                }}
              >
                Unavailable
              </span>
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
  // Its own gradient id, or a second thermometer would borrow this one's fill.
  const fillId = `thermo-fill-${useId().replace(/:/g, '')}`;
  if (!visible) return null;
  const tFrac = Math.max(0, Math.min(1, temperatureC / 50));
  return (
    <svg width="48" height="72" viewBox="0 0 56 78" aria-hidden>
      <defs>
        <linearGradient id={fillId} x1="0" y1="1" x2="0" y2="0">
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
        fill={`url(#${fillId})`}
        style={{ filter: `drop-shadow(0 0 4px ${accentColor})` }}
      />
      <circle cx="28" cy="62" r="11" fill={accentColor} style={{ filter: `drop-shadow(0 0 6px ${accentColor})` }} />
      <circle cx="28" cy="62" r="7" fill="rgba(0,0,0,0.30)" />
    </svg>
  );
}

/** Capitalize each word. OpenWeather sends "scattered clouds" in lowercase. */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
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
              <span style={{ color: ae.text, fontWeight: 600 }}>{titleCase(conditions)}</span>.
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

/** The humidity dial, a ticked ring, an arc, and a droplet in the middle. */
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
  // Its own halo id. Keying on size alone collides between two equal dials.
  const haloId = `hd-halo-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <defs>
        <radialGradient id={haloId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.20" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={c - 2} fill={`url(#${haloId})`} />
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
        // Round these, or a phone and the server disagree in the last decimal
        // place and React complains the markup doesn't match.
        const rnd = (n: number) => Math.round(n * 1000) / 1000;
        return (
          <line
            key={i}
            x1={rnd(c + Math.cos(a) * r1)}
            y1={rnd(c + Math.sin(a) * r1)}
            x2={rnd(c + Math.cos(a) * r2)}
            y2={rnd(c + Math.sin(a) * r2)}
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

/** The waves behind the hero, pinned so the text scrolls up over them. A band the
 *  height of the hero, not the viewport, because the motion is tuned to its
 *  container. Stretch it and the same waves spread over twice the area. */
function StatusBackdrop({ risk, active }: { risk: RiskLevel; active: boolean }) {
  const { ae } = useAesthetic();
  return (
    <div
      aria-hidden
      className="app-left-inset"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        left: 248,
        height: 'clamp(600px, 72vh, 820px)',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      <WavesBackground risk={risk} pulseSpeed={70} active={active} />
      {/* Fade to exactly the page color, masking the WavesBackground's own darker
          vignette so the band leaves no black strip. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '42%',
          background: `linear-gradient(180deg, rgba(0,0,0,0), ${ae.bg})`,
        }}
      />
    </div>
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
