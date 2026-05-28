'use client';

// Status page card: explains which specific fire is driving the user's
// active-fire threat score, and which inputs (size, containment, wind
// alignment, age) are pushing it up or down. Two variants based on source:
//
//   - Named incident (NIFC / Cal Fire): name + agency + started date,
//     stats = Distance / Size / Containment / Wind.
//   - FIRMS satellite pixel: "Satellite Detection" + detected-X-ago,
//     stats = Distance / Brightness / Confidence / Wind.
//
// Empty state: "No active threats" when no fires sit within 50 mi.
// Loading state: full skeleton matching the same layout as the live card.
//
// Premium chrome: TiltCard + top accent stripe + corner glow blob + grid
// texture, mirroring the Score Breakdown cards above.

import Link from 'next/link';

import { Icon } from '@/components/Icon';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { GridPattern } from '@/components/ui/GridPattern';
import { Skeleton } from '@/components/ui/Skeleton';
import { TiltCard } from '@/components/ui/TiltCard';
import { useAesthetic } from '@/lib/aesthetic';
import { formatFirmsAge, type ThreatDriver, type WindAlignment } from '@/lib/composite-risk';
import { RISK_LEVELS } from '@/lib/theme';
import { formatDistance, useUnits } from '@/lib/use-units';

const COMPASS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
function cardinal8(deg: number): string {
  return COMPASS_8[Math.round(deg / 45) % 8];
}

function formatStartedDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ThreatSourceCard({
  driver,
  isLoading,
}: {
  driver: ThreatDriver | null;
  isLoading: boolean;
}) {
  const { ae } = useAesthetic();
  const units = useUnits();

  // Tone for the card chrome — red/orange when there's an active fire, low/green
  // when nothing in range so empty state doesn't read as alarming.
  const tone =
    driver == null
      ? { color: RISK_LEVELS.low.color, glow: RISK_LEVELS.low.glow }
      : { color: '#FF7A3A', glow: '255, 122, 58' };

  // ── Loading ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <CardShell ae={ae} glow={tone.glow}>
        <div style={{ position: 'relative', padding: '26px 28px 24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 18,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flex: 1 }}>
              <Skeleton width={56} height={56} rounded="lg" />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Skeleton width={100} height={12} rounded="sm" />
                <Skeleton width={220} height={28} rounded="md" />
                <Skeleton width={180} height={11} rounded="sm" />
              </div>
            </div>
            <Skeleton width={130} height={32} rounded="full" />
          </div>
          <div
            style={{
              marginTop: 22,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 12,
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} width="100%" height={72} rounded="md" />
            ))}
          </div>
        </div>
      </CardShell>
    );
  }

  // ── Empty state (no fires within 50 mi) ─────────────────────────────────
  if (driver == null) {
    return (
      <CardShell ae={ae} glow={tone.glow}>
        <div style={{ position: 'relative', padding: '26px 28px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                flexShrink: 0,
                background: `radial-gradient(circle at 30% 30%, rgba(${tone.glow}, 0.30), rgba(${tone.glow}, 0.06))`,
                border: `0.5px solid rgba(${tone.glow}, 0.40)`,
                boxShadow: `0 6px 20px rgba(${tone.glow}, 0.18), inset 0 1px 0 rgba(255,255,255,0.12)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="shield" size={26} color={tone.color} strokeWidth={1.8} />
            </div>
            <div style={{ minWidth: 0 }}>
              <Eyebrow color={tone.color}>Threat Source</Eyebrow>
              <h2
                style={{
                  margin: '6px 0 0',
                  fontFamily: ae.fontDisplay,
                  fontSize: 26,
                  fontWeight: ae.titleWeight,
                  letterSpacing: ae.titleTracking,
                  color: ae.text,
                  lineHeight: 1.05,
                }}
              >
                No active threats
              </h2>
              <p
                style={{
                  margin: '6px 0 0',
                  fontFamily: ae.fontBody,
                  fontSize: 13.5,
                  color: ae.textDim,
                  lineHeight: 1.5,
                }}
              >
                No active fires within 50 miles of your location.
              </p>
            </div>
          </div>
        </div>
      </CardShell>
    );
  }

  // ── Live driver (named or FIRMS) ────────────────────────────────────────
  const distanceMi =
    driver.kind === 'incident' ? driver.incident.distance_mi : driver.distanceMi;
  const bearingLabel = cardinal8(driver.bearingDeg);
  const distanceLabel = formatDistance(distanceMi, units.distance, 1);

  const title =
    driver.kind === 'incident' ? driver.incident.name : 'Satellite Detection';

  const sourceTag =
    driver.kind === 'incident'
      ? driver.incident.source === 'calfire'
        ? 'Cal Fire'
        : 'NIFC WFIGS'
      : 'NASA FIRMS';

  const subDetail =
    driver.kind === 'incident'
      ? formatStartedDate(driver.incident.started)
        ? `started ${formatStartedDate(driver.incident.started)}`
        : null
      : (() => {
          const age = formatFirmsAge(
            driver.feature.properties.acq_date,
            driver.feature.properties.acq_time,
          );
          if (!age) return null;
          return driver.isStale ? `last detected ${age}` : `detected ${age}`;
        })();

  const detailHref = buildDetailHref(driver);

  return (
    <CardShell ae={ae} glow={tone.glow}>
      {/* Top accent stripe */}
      <div
        aria-hidden
        style={{
          height: 3,
          background: `linear-gradient(90deg, transparent, ${tone.color}, transparent)`,
          boxShadow: `0 0 14px ${tone.color}`,
        }}
      />

      <div style={{ position: 'relative', padding: '26px 28px 24px' }}>
        {/* Header row: big icon stone + title + source/detail, distance chip on right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 18,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                flexShrink: 0,
                position: 'relative',
                background: `radial-gradient(circle at 30% 30%, rgba(${tone.glow}, 0.32), rgba(${tone.glow}, 0.08))`,
                border: `0.5px solid rgba(${tone.glow}, 0.40)`,
                boxShadow: `0 6px 20px rgba(${tone.glow}, 0.22), inset 0 1px 0 rgba(255,255,255,0.12)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Satellite-style mini glyph */}
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
                <circle
                  cx="14"
                  cy="14"
                  r="11"
                  stroke={tone.color}
                  strokeWidth="0.8"
                  opacity="0.35"
                  strokeDasharray="2 3"
                />
                <circle cx="14" cy="14" r="6" stroke={tone.color} strokeWidth="1" opacity="0.7" />
                <circle
                  cx="14"
                  cy="14"
                  r="2.5"
                  fill={tone.color}
                  style={{ filter: `drop-shadow(0 0 6px ${tone.color})` }}
                />
                <line x1="14" y1="3" x2="14" y2="6" stroke={tone.color} strokeWidth="1" opacity="0.6" />
              </svg>
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: tone.color,
                  boxShadow: `0 0 8px ${tone.color}`,
                  animation: 'ember-flicker 2.2s ease-in-out infinite',
                }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <Eyebrow color={tone.color}>Threat Source</Eyebrow>
              <h2
                style={{
                  margin: '6px 0 0',
                  fontFamily: ae.fontDisplay,
                  fontSize: 26,
                  fontWeight: ae.titleWeight,
                  letterSpacing: ae.titleTracking,
                  color: ae.text,
                  lineHeight: 1.1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {title}
              </h2>
              <div
                style={{
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontFamily: ae.fontMono,
                  fontSize: 11,
                  color: ae.textDim,
                  letterSpacing: '0.06em',
                }}
              >
                <span style={{ color: tone.color, fontWeight: 700 }}>{sourceTag}</span>
                {subDetail ? (
                  <>
                    <span style={{ color: ae.textMute }}>·</span>
                    <span>{subDetail}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Distance/bearing chip */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 99,
              background: 'rgba(0,0,0,0.40)',
              border: `0.5px solid rgba(${tone.glow}, 0.32)`,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              fontFamily: ae.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: tone.color,
              textTransform: 'uppercase',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <Icon name="pin" size={11} color={tone.color} strokeWidth={2} />
            {distanceLabel} {bearingLabel}
          </div>
        </div>

        {/* 4-stat grid */}
        <div
          style={{
            marginTop: 22,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          <ThreatStat ae={ae} label="Distance" value={distanceLabel} accent={tone.color} />
          {driver.kind === 'incident' ? (
            <>
              <ThreatStat
                ae={ae}
                label="Size"
                value={
                  driver.incident.acres != null
                    ? `${driver.incident.acres.toLocaleString(undefined, { maximumFractionDigits: 0 })} ac`
                    : '—'
                }
              />
              <ThreatStat
                ae={ae}
                label="Containment"
                value={
                  driver.incident.contained_pct != null
                    ? `${Math.round(driver.incident.contained_pct)}%`
                    : '—'
                }
                accent={
                  driver.incident.contained_pct != null &&
                  driver.incident.contained_pct >= 75
                    ? RISK_LEVELS.low.color
                    : undefined
                }
              />
            </>
          ) : (
            <>
              <ThreatStat
                ae={ae}
                label="Brightness"
                value={
                  driver.feature.properties.brightness != null
                    ? `${Math.round(driver.feature.properties.brightness)} K`
                    : '—'
                }
              />
              <ThreatStat
                ae={ae}
                label="Confidence"
                value={confidenceLabel(driver.feature.properties.confidence)}
              />
            </>
          )}
          <ThreatStat ae={ae} label="Wind" value={windLabel(driver.wind)} accent={windColor(driver.wind)} />
        </div>

        {/* CTA */}
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <Link
            href={detailHref}
            className="threat-source-cta"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 16px',
              borderRadius: 10,
              background: `linear-gradient(180deg, rgba(${tone.glow}, 0.20), rgba(${tone.glow}, 0.06))`,
              border: `0.5px solid rgba(${tone.glow}, 0.40)`,
              color: tone.color,
              textDecoration: 'none',
              fontFamily: ae.fontMono,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 18px rgba(${tone.glow}, 0.20)`,
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
          >
            Open Detail
            <Icon name="chevron" size={11} color={tone.color} strokeWidth={2.2} />
          </Link>
        </div>
      </div>
    </CardShell>
  );
}

// ─── Internal pieces ──────────────────────────────────────────────────────

type Ae = ReturnType<typeof useAesthetic>['ae'];

function CardShell({
  ae,
  glow,
  children,
}: {
  ae: Ae;
  glow: string;
  children: React.ReactNode;
}) {
  return (
    <TiltCard
      max={2}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: `0.5px solid rgba(${glow}, 0.22)`,
        borderRadius: ae.radiusLg,
        boxShadow: `0 30px 80px rgba(${glow}, 0.10), inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -80,
          right: -80,
          width: 360,
          height: 360,
          borderRadius: '50%',
          filter: 'blur(60px)',
          pointerEvents: 'none',
          background: `radial-gradient(circle, rgba(${glow}, 0.14), transparent 70%)`,
        }}
      />
      <GridPattern opacity={0.04} />
      {children}
    </TiltCard>
  );
}

function ThreatStat({
  ae,
  label,
  value,
  accent,
}: {
  ae: Ae;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.022)',
        border: '0.5px solid rgba(255,255,255,0.06)',
        borderRadius: ae.radius,
        padding: '14px 14px',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
        minWidth: 0,
      }}
    >
      <Eyebrow>{label}</Eyebrow>
      <div
        style={{
          marginTop: 10,
          fontFamily: ae.fontDisplay,
          fontSize: 20,
          fontWeight: ae.titleWeight,
          letterSpacing: '-0.02em',
          color: accent ?? ae.text,
          lineHeight: 1.05,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function confidenceLabel(c: string | null): string {
  const v = (c ?? '').trim().toUpperCase();
  if (v === 'L') return 'Low';
  if (v === 'N') return 'Nominal';
  if (v === 'H') return 'High';
  return '—';
}

function windLabel(w: WindAlignment): string {
  switch (w) {
    case 'toward':
      return 'Toward you';
    case 'away':
      return 'Away';
    case 'crosswind':
      return 'Crosswind';
    default:
      return 'Calm';
  }
}

function windColor(w: WindAlignment): string | undefined {
  if (w === 'toward') return '#ef4444';
  if (w === 'away') return RISK_LEVELS.low.color;
  return undefined;
}

function buildDetailHref(driver: ThreatDriver): string {
  if (driver.kind === 'incident') {
    return `/fire-detail?lat=${driver.incident.lat}&lon=${driver.incident.lon}`;
  }
  const p = driver.feature.properties;
  const params = new URLSearchParams();
  params.set('lat', String(p.lat));
  params.set('lon', String(p.lon));
  if (p.brightness != null) params.set('brightness', String(p.brightness));
  if (p.confidence) params.set('confidence', p.confidence);
  if (p.acq_date) params.set('acq_date', p.acq_date);
  if (p.acq_time) params.set('acq_time', p.acq_time);
  if (p.satellite) params.set('satellite', p.satellite);
  if (p.daynight) params.set('daynight', p.daynight);
  return `/fire-detail?${params.toString()}`;
}
