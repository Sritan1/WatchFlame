'use client';

// Status page card: the single fire driving the user's active-fire threat,
// with a rich, type-adaptive readout. Shared chrome (summary band → identity +
// threat-level badge → 3-panel intel grid → action footer) wraps two variants
// that only ever show each fire type's REAL fields:
//
//   - FIRMS satellite pixel: "Satellite Detection". Panels = Bearing,
//     Signal (Intensity K + Confidence), Detection (Platform + Detected + D/N).
//   - Named incident (NIFC / Cal Fire): name + county. Panels = Bearing,
//     Fire Facts (Size + Personnel + Cause), Containment (status + bar).
//
// The Bearing panel's trend chip shows the wind-relative read (Toward / Away /
// Crosswind) from driver.wind — real data, since we don't track fire movement.
// The Threat Level badge reuses the app's Low/Moderate/High/Extreme via
// bucketOf(driver.threat), so it matches the composite's active-fire axis.
//
// Empty state: "No active threats" when no fires sit within 50 mi.
// Loading state: skeleton matching the live layout.
//
// Premium chrome: TiltCard + top accent stripe + corner glow blob + grid
// texture, mirroring the Score Breakdown cards above.

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

import { Icon } from '@/components/Icon';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { cardinal8 } from '@/components/ui/CompassRose';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { GridPattern } from '@/components/ui/GridPattern';
import { Skeleton } from '@/components/ui/Skeleton';
import { TiltCard } from '@/components/ui/TiltCard';
import { useAesthetic } from '@/lib/aesthetic';
import { bucketOf, formatFirmsAge, THREAT_RADIUS_MI, type ThreatDriver, type WindAlignment } from '@/lib/composite-risk';
import { confidenceLabel, firmsDetailHref, firmsPlatform } from '@/lib/firms';
import { getRisk, RISK_LEVELS, type RiskTone } from '@/lib/theme';
import { convertDistance, formatDistance, useUnits } from '@/lib/use-units';

// Fixed warm chrome for any live threat (matches the reference Command Center
// card). Severity is carried by the Threat Level badge, not the card color, so
// a low-threat fire never washes the whole card green like the empty state.
const CHROME = { color: '#FF7A3A', glow: '255, 122, 58' };
const EMPTY = { color: RISK_LEVELS.low.color, glow: RISK_LEVELS.low.glow };

function formatStartedDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Pinned to en-US so the date reads consistently regardless of the visitor's
  // browser locale (matches the app's other fixed-format numbers).
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ThreatSourceCard({
  driver,
  isLoading,
}: {
  driver: ThreatDriver | null;
  isLoading: boolean;
}) {
  const { ae, accent } = useAesthetic();
  const units = useUnits();

  // ── Loading ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <CardShell ae={ae} glow={CHROME.glow}>
        <div style={{ position: 'relative', padding: '24px 28px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Skeleton width={56} height={56} rounded="lg" />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton width={110} height={12} rounded="sm" />
              <Skeleton width={220} height={26} rounded="md" />
              <Skeleton width={170} height={11} rounded="sm" />
            </div>
            <Skeleton width={120} height={52} rounded="md" />
          </div>
          <div
            style={{
              marginTop: 20,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(216px, 1fr))',
              gap: 14,
            }}
          >
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width="100%" height={124} rounded="md" />
            ))}
          </div>
        </div>
      </CardShell>
    );
  }

  // ── Empty state (no fires within 50 mi) ─────────────────────────────────
  if (driver == null) {
    return (
      <CardShell ae={ae} glow={EMPTY.glow}>
        <div style={{ position: 'relative', padding: '26px 28px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={iconStone(EMPTY.glow)}>
              <Icon name="shield" size={26} color={EMPTY.color} strokeWidth={1.8} />
            </div>
            <div style={{ minWidth: 0 }}>
              <Eyebrow color={EMPTY.color}>Threat Source</Eyebrow>
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
                No active fires within {formatDistance(THREAT_RADIUS_MI, units.distance, 0)} of your location.
              </p>
            </div>
          </div>
        </div>
      </CardShell>
    );
  }

  // ── Live driver (named incident or FIRMS satellite) ─────────────────────
  const isIncident = driver.kind === 'incident';
  const tone = CHROME;

  const distanceMi = driver.kind === 'incident' ? driver.incident.distance_mi : driver.distanceMi;
  const distanceDisplay = convertDistance(distanceMi, units.distance);
  const distanceUnit = units.distance;
  const bearingCardinal = cardinal8(driver.bearingDeg);

  // Threat-level badge — same bucketing the composite's active-fire axis uses.
  const threatTone = getRisk(bucketOf(driver.threat), accent);

  const wTone = windTone(driver.wind);
  const windRel = windLabel(driver.wind);

  const title = driver.kind === 'incident' ? driver.incident.name : 'Satellite Detection';
  const sourceTag =
    driver.kind === 'incident'
      ? driver.incident.source === 'calfire'
        ? 'Cal Fire'
        : 'NIFC WFIGS'
      : 'NASA FIRMS';

  // Region: county+state for incidents; satellite platform for FIRMS pixels.
  // Treat a blank/whitespace `location` the same as missing so it doesn't
  // short-circuit the county/state fallback and render a stray pin with no text.
  const region =
    driver.kind === 'incident'
      ? driver.incident.location?.trim()
        ? driver.incident.location
        : [driver.incident.county, driver.incident.state].filter(Boolean).join(', ') || null
      : firmsPlatform(driver.feature.properties.satellite);

  // Timing line (summary band, right).
  const startedStr = driver.kind === 'incident' ? formatStartedDate(driver.incident.started) : null;
  const firmsAge =
    driver.kind === 'firms'
      ? formatFirmsAge(driver.feature.properties.acq_date, driver.feature.properties.acq_time)
      : null;
  const timing =
    driver.kind === 'incident'
      ? startedStr
        ? `Started ${startedStr}`
        : null
      : firmsAge
        ? driver.isStale
          ? `Last detected ${firmsAge}`
          : `Detected ${firmsAge}`
        : null;

  const blurb =
    driver.kind === 'incident'
      ? 'Confirmed active incident near your watch area.'
      : driver.isStale
        ? 'Satellite hotspot, older detection with no recent update.'
        : 'Satellite hotspot, not yet a confirmed incident.';

  const radiusLabel = formatDistance(THREAT_RADIUS_MI, units.distance, 0);
  const footerSource =
    driver.kind === 'incident'
      ? `${sourceTag} · within ${radiusLabel}`
      : `NASA FIRMS · ${firmsPlatform(driver.feature.properties.satellite) ?? 'VIIRS'} · within ${radiusLabel}`;

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

      <div style={{ position: 'relative', padding: '22px 28px 22px' }}>
        {/* ── 1 · Summary band ─────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
            paddingBottom: 16,
            marginBottom: 18,
            borderBottom: `0.5px solid ${ae.line}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '5px 11px 5px 9px',
                borderRadius: 99,
                flexShrink: 0,
                background: `linear-gradient(180deg, rgba(${tone.glow}, 0.20), rgba(${tone.glow}, 0.07))`,
                border: `0.5px solid rgba(${tone.glow}, 0.36)`,
                fontFamily: ae.fontMono,
                fontSize: 10,
                fontWeight: 700,
                color: tone.color,
                letterSpacing: '0.16em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              <Icon name="flame" size={12} color={tone.color} strokeWidth={1.8} />
              {isIncident ? 'Nearest Incident' : 'Nearest Detection'}
            </span>
            <span
              className="app-hide-sm"
              style={{ fontFamily: ae.fontBody, fontSize: 13, color: ae.textDim, lineHeight: 1.3 }}
            >
              {blurb}
            </span>
          </div>
          {timing ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                flexShrink: 0,
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                color: ae.textDim,
                letterSpacing: '0.08em',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: tone.color,
                  boxShadow: `0 0 8px ${tone.color}`,
                  animation: 'ember-flicker 2.2s ease-in-out infinite',
                }}
              />
              {timing}
            </div>
          ) : null}
        </div>

        {/* ── 2 · Identity + threat-level badge ────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 18,
            flexWrap: 'wrap',
          }}
        >
          <div className="app-threat-id" style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flex: 1 }}>
            <div style={{ ...iconStone(tone.glow), position: 'relative' }}>
              {isIncident ? (
                <Icon name="flame" size={26} color={tone.color} strokeWidth={1.8} />
              ) : (
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
                  <circle cx="14" cy="14" r="11" stroke={tone.color} strokeWidth="0.8" opacity="0.35" strokeDasharray="2 3" />
                  <circle cx="14" cy="14" r="6" stroke={tone.color} strokeWidth="1" opacity="0.7" />
                  <circle cx="14" cy="14" r="2.5" fill={tone.color} style={{ filter: `drop-shadow(0 0 6px ${tone.color})` }} />
                  <line x1="14" y1="3" x2="14" y2="6" stroke={tone.color} strokeWidth="1" opacity="0.6" />
                </svg>
              )}
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
              <h2
                className="app-wrap app-threat-title"
                style={{
                  margin: 0,
                  fontFamily: ae.fontDisplay,
                  fontSize: 27,
                  fontWeight: ae.titleWeight,
                  letterSpacing: ae.titleTracking,
                  color: ae.text,
                  lineHeight: 1.08,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {title}
              </h2>
              <div
                style={{
                  marginTop: 7,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  fontFamily: ae.fontMono,
                  fontSize: 11,
                  color: ae.textDim,
                  letterSpacing: '0.06em',
                }}
              >
                <span style={{ color: tone.color, fontWeight: 700 }}>{sourceTag}</span>
                {region ? (
                  <>
                    <span style={{ color: ae.textMute }}>·</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Icon name="pin" size={11} color={ae.textMute} strokeWidth={1.6} />
                      {region}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Threat Level badge */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 8,
              padding: '11px 15px',
              borderRadius: 13,
              flexShrink: 0,
              background: 'rgba(0, 0, 0, 0.34)',
              border: `0.5px solid rgba(${threatTone.glow}, 0.32)`,
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            }}
          >
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 9,
                color: ae.textMute,
                letterSpacing: '0.2em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              Threat Level
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span
                style={{
                  fontFamily: ae.fontDisplay,
                  fontSize: 19,
                  fontWeight: ae.titleWeight,
                  letterSpacing: '-0.01em',
                  color: threatTone.color,
                  lineHeight: 1,
                  textShadow: `0 0 18px rgba(${threatTone.glow}, 0.45)`,
                }}
              >
                {threatTone.label}
              </span>
              <ThreatMeter tone={threatTone} />
            </div>
          </div>
        </div>

        {/* ── 3 · Intel grid (Bearing + two type-tailored panels) ──────── */}
        <div
          style={{
            marginTop: 20,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(216px, 1fr))',
            gap: 14,
          }}
        >
          {/* Bearing */}
          <div style={{ ...intelBox(ae), display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flexShrink: 0 }}>
              <ThreatCompass ae={ae} tone={tone} bearingDeg={driver.bearingDeg} />
            </div>
            <div style={{ minWidth: 0 }}>
              <Eyebrow>Bearing</Eyebrow>
              <div
                style={{
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 5,
                  fontFamily: ae.fontDisplay,
                  fontWeight: ae.titleWeight,
                  color: ae.text,
                  letterSpacing: '-0.03em',
                  lineHeight: 0.9,
                }}
              >
                <span style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums' }}>
                  <AnimatedNumber value={distanceDisplay} duration={900} format={(n) => n.toFixed(1)} />
                </span>
                <span style={{ fontFamily: ae.fontMono, fontSize: 12, color: ae.textDim }}>{distanceUnit}</span>
              </div>
              <div
                style={{
                  marginTop: 9,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '4px 9px',
                  borderRadius: 99,
                  background: `rgba(${wTone.glow}, 0.10)`,
                  border: `0.5px solid rgba(${wTone.glow}, 0.26)`,
                  fontFamily: ae.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  color: wTone.color,
                  letterSpacing: '0.06em',
                }}
              >
                <span style={{ letterSpacing: '0.12em' }}>{bearingCardinal}</span>
                <span style={{ opacity: 0.5 }}>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Icon
                    name={driver.wind === 'toward' ? 'arrowUp' : 'minus'}
                    size={10}
                    color={wTone.color}
                    strokeWidth={2.2}
                  />
                  {windRel}
                </span>
              </div>
            </div>
          </div>

          {driver.kind === 'firms' ? (
            <>
              {/* Signal */}
              <div style={intelBox(ae)}>
                <Eyebrow>Signal</Eyebrow>
                <div style={{ marginTop: 4 }}>
                  <VitalRow
                    ae={ae}
                    icon={<Icon name="flame" size={13} color={ae.textDim} strokeWidth={1.6} />}
                    label="Intensity"
                    value={
                      driver.feature.properties.brightness != null ? (
                        <>
                          {Math.round(driver.feature.properties.brightness)}
                          <span style={{ fontFamily: ae.fontMono, fontSize: 10, color: ae.textDim, marginLeft: 3 }}>K</span>
                        </>
                      ) : (
                        'Unknown'
                      )
                    }
                  />
                  <VitalRow
                    ae={ae}
                    icon={<Icon name="crosshair" size={13} color={ae.textDim} strokeWidth={1.5} />}
                    label="Confidence"
                    value={confidenceLabel(driver.feature.properties.confidence)}
                    last
                  />
                </div>
              </div>

              {/* Detection */}
              <div style={intelBox(ae)}>
                <Eyebrow>Detection</Eyebrow>
                <div style={{ marginTop: 4 }}>
                  <VitalRow
                    ae={ae}
                    icon={<Icon name="layers" size={13} color={ae.textDim} strokeWidth={1.5} />}
                    label="Platform"
                    value={firmsPlatform(driver.feature.properties.satellite) ?? 'Satellite'}
                  />
                  <VitalRow
                    ae={ae}
                    icon={<Icon name="clock" size={13} color={ae.textDim} strokeWidth={1.6} />}
                    label="Detected"
                    value={firmsAge ?? 'Unknown'}
                    last={!driver.feature.properties.daynight}
                  />
                  {driver.feature.properties.daynight ? (
                    <VitalRow
                      ae={ae}
                      label="Pass"
                      value={driver.feature.properties.daynight === 'D' ? 'Daytime' : 'Night'}
                      last
                    />
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Fire Facts */}
              <div style={intelBox(ae)}>
                <Eyebrow>Fire Facts</Eyebrow>
                <div style={{ marginTop: 4 }}>
                  <VitalRow
                    ae={ae}
                    icon={<Icon name="layers" size={13} color={ae.textDim} strokeWidth={1.5} />}
                    label="Size"
                    value={
                      driver.incident.acres != null ? (
                        <>
                          {driver.incident.acres.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          <span style={{ fontFamily: ae.fontMono, fontSize: 10, color: ae.textDim, marginLeft: 3 }}>ac</span>
                        </>
                      ) : (
                        'Unknown'
                      )
                    }
                  />
                  <VitalRow
                    ae={ae}
                    icon={<Icon name="shield" size={13} color={ae.textDim} strokeWidth={1.5} />}
                    label="Personnel"
                    value={
                      driver.incident.personnel != null
                        ? driver.incident.personnel.toLocaleString('en-US')
                        : 'Unknown'
                    }
                    last={!driver.incident.cause}
                  />
                  {driver.incident.cause ? (
                    <VitalRow ae={ae} label="Cause" value={driver.incident.cause} last />
                  ) : null}
                </div>
              </div>

              {/* Containment */}
              <div style={intelBox(ae)}>
                <Eyebrow>Containment</Eyebrow>
                <ContainmentBlock ae={ae} pct={driver.incident.contained_pct} />
              </div>
            </>
          )}
        </div>

        {/* ── 4 · Action footer ────────────────────────────────────────── */}
        <div
          style={{
            marginTop: 18,
            paddingTop: 16,
            borderTop: `0.5px solid ${ae.line}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontFamily: ae.fontMono, fontSize: 10, color: ae.textMute, letterSpacing: '0.08em' }}>
            {footerSource}
          </span>
          <Link
            href={buildDetailHref(driver)}
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
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
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

/** Rounded stone that houses the header glyph. */
function iconStone(glow: string): CSSProperties {
  return {
    width: 56,
    height: 56,
    borderRadius: 14,
    flexShrink: 0,
    background: `radial-gradient(circle at 30% 30%, rgba(${glow}, 0.32), rgba(${glow}, 0.08))`,
    border: `0.5px solid rgba(${glow}, 0.40)`,
    boxShadow: `0 6px 20px rgba(${glow}, 0.22), inset 0 1px 0 rgba(255,255,255,0.12)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

function intelBox(ae: Ae): CSSProperties {
  return {
    position: 'relative',
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.022)',
    border: '0.5px solid rgba(255,255,255,0.06)',
    borderRadius: ae.radius,
    padding: '14px 16px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
    minWidth: 0,
  };
}

function CardShell({ ae, glow, children }: { ae: Ae; glow: string; children: ReactNode }) {
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

/** Ascending 4-bar meter filled to the tier's level. */
function ThreatMeter({ tone }: { tone: RiskTone }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 16 }}>
      {[0, 1, 2, 3].map((i) => {
        const on = i < tone.bar;
        return (
          <span
            key={i}
            style={{
              width: 4,
              height: 6 + i * 3,
              borderRadius: 1,
              background: on ? tone.color : 'rgba(255, 255, 255, 0.12)',
              boxShadow: on ? `0 0 6px ${tone.color}` : 'none',
            }}
          />
        );
      })}
    </div>
  );
}

/** Label (with optional icon) on the left, value on the right, hairline rule. */
function VitalRow({
  ae,
  icon,
  label,
  value,
  last,
}: {
  ae: Ae;
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '9px 0',
        borderBottom: last ? 'none' : `0.5px solid ${ae.line}`,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: ae.fontMono,
          fontSize: 11,
          color: ae.textDim,
          letterSpacing: '0.04em',
        }}
      >
        {icon}
        {label}
      </span>
      <span
        style={{
          fontFamily: ae.fontMono,
          fontSize: 12.5,
          fontWeight: 700,
          color: ae.text,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '60%',
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Containment status badge + progress bar for the incident variant. */
function ContainmentBlock({ ae, pct }: { ae: Ae; pct: number | null }) {
  const known = pct != null;
  const contained = known && pct >= 100;
  const statusTone = contained
    ? { color: RISK_LEVELS.low.color, glow: RISK_LEVELS.low.glow }
    : { color: '#FF7A3A', glow: '255, 122, 58' };
  // `contained` already implies `known`, so unknown and not-contained both read
  // "Active" — no separate `known` branch needed here (it still drives the bar).
  const statusText = contained ? 'Contained' : 'Active';
  const barPct = known ? Math.max(3, Math.round(pct)) : 0;

  return (
    <div style={{ marginTop: 8 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '5px 11px',
          borderRadius: 99,
          background: `rgba(${statusTone.glow}, 0.12)`,
          border: `0.5px solid rgba(${statusTone.glow}, 0.32)`,
          fontFamily: ae.fontMono,
          fontSize: 11,
          fontWeight: 700,
          color: statusTone.color,
          letterSpacing: '0.1em',
          textTransform: ae.chipUpper ? 'uppercase' : 'none',
        }}
      >
        <span
          style={{ width: 6, height: 6, borderRadius: 99, background: statusTone.color, boxShadow: `0 0 6px ${statusTone.color}` }}
        />
        {statusText}
      </span>
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 10,
              color: ae.textMute,
              letterSpacing: '0.12em',
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            Containment
          </span>
          <span
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 14,
              fontWeight: ae.titleWeight,
              color: known ? ae.text : ae.textMute,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {known ? `${Math.round(pct)}%` : 'Unknown'}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div
            style={{
              width: `${barPct}%`,
              height: '100%',
              borderRadius: 99,
              background: `linear-gradient(90deg, rgba(${RISK_LEVELS.low.glow}, 0.5), ${RISK_LEVELS.low.color})`,
              boxShadow: barPct > 0 ? `0 0 8px rgba(${RISK_LEVELS.low.glow}, 0.5)` : 'none',
              transition: 'width 0.9s cubic-bezier(0.3, 1, 0.4, 1)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Compass that plots the fire's direction relative to "you" at the center — a
 *  faint needle out to a glowing dot at the bearing, over a ticked dial with an
 *  N marker. Ported from the reference (web-status-extras.jsx). Trig outputs are
 *  rounded so SSR and client stringify the SVG coordinates identically. */
function ThreatCompass({
  ae,
  tone,
  bearingDeg,
}: {
  ae: Ae;
  tone: { color: string; glow: string };
  bearingDeg: number;
}) {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const C = 47;
  const R = 33;
  const rad = ((bearingDeg - 90) * Math.PI) / 180;
  const tx = round(C + Math.cos(rad) * R);
  const ty = round(C + Math.sin(rad) * R);
  return (
    <svg width="94" height="94" viewBox="0 0 94 94" fill="none">
      <circle cx={C} cy={C} r={R + 7} stroke={`rgba(${tone.glow}, 0.16)`} strokeWidth="0.5" strokeDasharray="2 5" />
      <circle cx={C} cy={C} r={R} stroke={ae.lineStrong} strokeWidth="0.75" />
      <circle cx={C} cy={C} r={R * 0.55} stroke={ae.line} strokeWidth="0.5" />
      {[0, 90, 180, 270].map((a) => {
        const r2 = ((a - 90) * Math.PI) / 180;
        return (
          <line
            key={a}
            x1={round(C + Math.cos(r2) * (R - 4))}
            y1={round(C + Math.sin(r2) * (R - 4))}
            x2={round(C + Math.cos(r2) * R)}
            y2={round(C + Math.sin(r2) * R)}
            stroke={ae.textMute}
            strokeWidth="0.9"
          />
        );
      })}
      <text x={C} y="12" fill={ae.textDim} fontSize="8" fontFamily={ae.fontMono} textAnchor="middle" letterSpacing="0.1em">
        N
      </text>
      <line x1={C} y1={C} x2={tx} y2={ty} stroke={tone.color} strokeWidth="1.25" opacity="0.5" />
      <circle cx={tx} cy={ty} r="7" fill={`rgba(${tone.glow}, 0.18)`} />
      <circle cx={tx} cy={ty} r="3.6" fill={tone.color} style={{ filter: `drop-shadow(0 0 5px ${tone.color})` }} />
      <circle cx={C} cy={C} r="6" fill="none" stroke={ae.lineStrong} strokeWidth="0.6" />
      <circle cx={C} cy={C} r="2.6" fill={ae.text} />
    </svg>
  );
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

function windTone(w: WindAlignment): { color: string; glow: string } {
  if (w === 'toward') return { color: '#ef4444', glow: '239, 68, 68' };
  if (w === 'away') return { color: RISK_LEVELS.low.color, glow: RISK_LEVELS.low.glow };
  return { color: '#9ca3af', glow: '156, 163, 175' };
}

function buildDetailHref(driver: ThreatDriver): string {
  if (driver.kind === 'incident') {
    return `/fire-detail?lat=${driver.incident.lat}&lon=${driver.incident.lon}`;
  }
  return firmsDetailHref(driver.feature);
}
