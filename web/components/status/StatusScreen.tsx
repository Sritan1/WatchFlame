'use client';

// Command Center — mirrors mobile app/(tabs)/index.tsx as closely as possible.
//   Hero band: HeroOrb + ShimmerPill + headline + subtitle + CTAs + Calibration link
//   2x2 grid: Conditions card (Wind + Temperature) | Humidity card
//             LocalKbdiCard                         | LocalNdviCard
// Cards beyond these (Active Incident, Regional Risk Index, Closest Fires list,
// FEMA banner) live on Map / Safety in mobile; mobile Status doesn't show them.

import { useState } from 'react';

import { Icon } from '@/components/Icon';
import { CalibrationModal } from '@/components/status/CalibrationModal';
import { LocalKbdiCard } from '@/components/status/LocalKbdiCard';
import { LocalNdviCard } from '@/components/status/LocalNdviCard';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { HeroBand } from '@/components/ui/HeroBand';
import { HeroOrb } from '@/components/ui/HeroOrb';
import { PageSection } from '@/components/ui/PageSection';
import { SectionEyebrow } from '@/components/ui/SectionEyebrow';
import { ShimmerPill } from '@/components/ui/ShimmerPill';
import { Skeleton } from '@/components/ui/Skeleton';
import { Stagger } from '@/components/ui/Stagger';
import { WindDial } from '@/components/ui/WindDial';
import { useAesthetic } from '@/lib/aesthetic';
import { dangerToRisk } from '@/lib/api';
import {
  useFiresAroundMe,
  useNamedIncidentsNear,
  useRiskFromWeather,
  useWeather,
} from '@/lib/queries';
import { getRisk, type RiskLevel } from '@/lib/theme';
import { useUserLocation } from '@/lib/use-location';
import { formatDistance, formatSpeed, formatTemp, useUnits } from '@/lib/use-units';

const NEARBY_DISTANCE_MI = 20;
const EVAC_DISTANCE_MI = 10;

const HEADLINE: Record<RiskLevel, [string, string]> = {
  low:      ['No Nearby',     'Fires'],
  moderate: ['Smoke',         'Advisory'],
  high:     ['Elevated',      'Fire Risk'],
  extreme:  ['Extreme Fire',  'Weather'],
};
const SUBHEAD: Record<RiskLevel, string> = {
  low:      'Conditions are calm. No active fires within 250 mi.',
  moderate: 'Air quality reduced. Stay informed for changes.',
  high:     'Elevated fire weather in your area. No active fires nearby.',
  extreme:  'Extreme fire weather. Avoid outdoor ignition sources.',
};

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const dirLabel = (deg: number | null | undefined) =>
  deg == null ? '—' : DIRS[Math.round(deg / 45) % 8];

function bearingBetween(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const dLon = (to.lon - from.lon) * (Math.PI / 180);
  const lat1 = from.lat * (Math.PI / 180);
  const lat2 = to.lat * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  // Normalize to 0..360 — atan2 returns -180..180, and `dirLabel` indexes a
  // length-8 array with `Math.round(deg/45) % 8`. In JS, `% 8` preserves the
  // sign of the dividend, so a negative bearing would index DIRS[-2] (=
  // undefined) and the narrative would read "X mi undefined of you".
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
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

  // Effective level — prefer the regional bucket when the user is in a fitted state.
  const effectiveLevel: RiskLevel | null = risk.data
    ? dangerToRisk(risk.data.regional_level ?? risk.data.danger_level)
    : null;
  const displayLevel: RiskLevel = effectiveLevel ?? 'moderate';
  const r = getRisk(displayLevel, accent);
  const isAlarming = displayLevel === 'high' || displayLevel === 'extreme';

  // Don't render hero text until fires + weather have resolved at least once —
  // prevents the "No Nearby Fires" / "Smoke Advisory" flash while data is in
  // flight. Mirrors mobile's `heroReady` gate.
  const heroReady = !fires.isLoading && fires.data !== undefined && !weather.isLoading;

  // Nearest fire — used for the "Fire Detected Nearby" / "Evacuate" gating.
  // Prefer named incidents (richer metadata); fall back to FIRMS satellite hits.
  const nearestIncident = incidents.data?.[0];
  const nearestSatHit = fires.data?.features[0];
  const nearestCoords = nearestIncident
    ? { lat: nearestIncident.lat, lon: nearestIncident.lon }
    : nearestSatHit
      ? { lat: nearestSatHit.properties.lat, lon: nearestSatHit.properties.lon }
      : null;
  const nearestDistanceMi = nearestIncident?.distance_mi ?? null;
  const nearestName = nearestIncident?.name ?? null;
  const hasNearby = nearestDistanceMi != null && nearestDistanceMi < NEARBY_DISTANCE_MI;
  const hasImmediate = hasNearby && nearestDistanceMi! < EVAC_DISTANCE_MI && effectiveLevel === 'extreme';

  // Headline gating identical to mobile: close fire + extreme weather → Evacuate;
  // any nearby fire → Fire Detected Nearby; otherwise level-driven copy.
  const headlineLines: [string, string] = hasImmediate
    ? ['Evacuate', 'Immediately']
    : hasNearby
      ? ['Fire Detected', 'Nearby']
      : effectiveLevel
        ? HEADLINE[effectiveLevel]
        : ['Loading', '…'];

  const subtitle: string = (() => {
    if (nearestDistanceMi != null && (hasImmediate || hasNearby) && nearestCoords) {
      const dir = dirLabel(bearingBetween(loc.coords, nearestCoords));
      const distStr = formatDistance(nearestDistanceMi, units.distance, 1);
      if (hasImmediate)
        return `Active fire ${distStr} ${dir} of you with extreme fire weather. Leave now if you can.`;
      return `Active fire ${distStr} ${dir} of you${nearestName ? ` (${nearestName})` : ''}. Stay informed.`;
    }
    if (!effectiveLevel) return 'Reading conditions for your area…';
    return SUBHEAD[effectiveLevel];
  })();

  return (
    <>
      {/* ─── HERO BAND ─────────────────────────────────────────────────── */}
      <HeroBand risk={displayLevel} pulseSpeed={70}>
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
              <HeroOrb risk={displayLevel} pulseSpeed={70} />
            </div>

            <div>
              <div className="ember-fade-up" style={{ marginBottom: 16 }}>
                {effectiveLevel ? (
                  <ShimmerPill risk={r} />
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

              {/* Calibration hint — opens CalibrationModal. Mirrors mobile. */}
              {risk.data?.regional_level && risk.data?.regional_state ? (
                <button
                  type="button"
                  onClick={() => setCalibOpen(true)}
                  className="ember-fade-up"
                  aria-label="What does calibrated for this state mean?"
                  style={{
                    marginTop: 14,
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
                    animationDelay: '500ms',
                  }}
                >
                  Calibrated for {risk.data.regional_state}
                  {risk.data.regional_level !== risk.data.danger_level
                    ? ` · national: ${risk.data.danger_level}`
                    : ''}
                  <Icon name="info" size={11} color={ae.textMute} strokeWidth={1.8} />
                </button>
              ) : null}

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

      {/* ─── 2×2 GRID: Conditions / Humidity / KBDI / NDVI ──────────────── */}
      <PageSection top={4} bottom={48}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
          }}
        >
          {/* Conditions: Wind + Temperature side-by-side, matches mobile Card */}
          <ConditionsCard
            wind={weather.data?.wind_speed ?? null}
            windDeg={weather.data?.wind_deg ?? null}
            temperatureC={weather.data?.temperature ?? null}
            tempUnit={units.temp}
            speedUnit={units.speed}
            isLoading={weather.isLoading}
          />

          {/* Humidity — own card */}
          <HumidityCard
            humidity={weather.data?.humidity ?? null}
            conditions={weather.data?.conditions ?? null}
            isLoading={weather.isLoading}
          />

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

      <CalibrationModal open={calibOpen} onClose={() => setCalibOpen(false)} />
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
  isLoading,
}: {
  wind: number | null;
  windDeg: number | null;
  temperatureC: number | null;
  tempUnit: 'C' | 'F';
  speedUnit: 'mph' | 'kph';
  isLoading: boolean;
}) {
  const { ae } = useAesthetic();
  return (
    <div
      style={{
        background: ae.surface,
        border: ae.cardBorder,
        borderRadius: ae.radius,
        padding: 22,
      }}
    >
      <Eyebrow>Current conditions</Eyebrow>
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Tile label="Wind">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              {wind != null ? (
                <>
                  <BigNumber>{formatSpeed(wind, speedUnit, 0)}</BigNumber>
                  {windDeg != null ? <Caption>From {dirLabel(windDeg)}</Caption> : null}
                </>
              ) : isLoading ? (
                <>
                  <Skeleton width={68} height={22} rounded="sm" />
                  <div style={{ marginTop: 6 }}>
                    <Skeleton width={56} height={11} rounded="sm" />
                  </div>
                </>
              ) : (
                <BigNumber>—</BigNumber>
              )}
            </div>
            <WindDial angle={(windDeg ?? 0) + 180} color="#fb923c" size={40} />
          </div>
        </Tile>
        <Tile label="Temperature">
          {temperatureC != null ? (
            <>
              <BigNumber>{formatTemp(temperatureC, tempUnit, 0)}</BigNumber>
              <Caption>
                {tempUnit === 'F'
                  ? `${temperatureC.toFixed(1)}°C`
                  : `${((temperatureC * 9) / 5 + 32).toFixed(0)}°F`}
              </Caption>
            </>
          ) : isLoading ? (
            <>
              <Skeleton width={68} height={22} rounded="sm" />
              <div style={{ marginTop: 6 }}>
                <Skeleton width={50} height={11} rounded="sm" />
              </div>
            </>
          ) : (
            <BigNumber>—</BigNumber>
          )}
        </Tile>
      </div>
    </div>
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
  return (
    <div
      style={{
        background: ae.surface,
        border: ae.cardBorder,
        borderRadius: ae.radius,
        padding: 22,
      }}
    >
      <Eyebrow>Humidity</Eyebrow>
      <div style={{ marginTop: 14 }}>
        {humidity != null ? (
          <span
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 36,
              fontWeight: ae.titleWeight,
              color: ae.text,
              letterSpacing: '-0.025em',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}
          >
            {Math.round(humidity)}%
          </span>
        ) : isLoading ? (
          <Skeleton width={120} height={40} rounded="md" />
        ) : (
          <span
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 36,
              fontWeight: ae.titleWeight,
              color: ae.textDim,
              letterSpacing: '-0.025em',
            }}
          >
            —
          </span>
        )}
      </div>
      {conditions ? (
        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(126, 231, 135, 0.06)',
            border: '0.5px solid rgba(126, 231, 135, 0.22)',
          }}
        >
          <p style={{ margin: 0, fontFamily: ae.fontBody, fontSize: 13, color: '#7ee787' }}>
            Conditions: {conditions}.
          </p>
        </div>
      ) : isLoading ? (
        <div style={{ marginTop: 14 }}>
          <Skeleton width={'100%'} height={40} rounded="md" />
        </div>
      ) : null}
    </div>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  const { ae } = useAesthetic();
  return (
    <div
      style={{
        padding: '14px 14px',
        borderRadius: 10,
        background: 'rgba(255, 255, 255, 0.025)',
        border: `0.5px solid ${ae.line}`,
      }}
    >
      <div
        style={{
          fontFamily: ae.fontMono,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.16em',
          color: ae.textMute,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

function BigNumber({ children }: { children: React.ReactNode }) {
  const { ae } = useAesthetic();
  return (
    <span
      style={{
        fontFamily: ae.fontDisplay,
        fontSize: 22,
        fontWeight: ae.titleWeight,
        color: ae.text,
        letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  const { ae } = useAesthetic();
  return (
    <div
      style={{
        marginTop: 6,
        fontFamily: ae.fontMono,
        fontSize: 10.5,
        color: ae.textMute,
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </div>
  );
}
