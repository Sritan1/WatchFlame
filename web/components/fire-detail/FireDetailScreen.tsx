'use client';

// Fire Detail — unified screen for both a FIRMS satellite pixel AND a named
// NIFC/Cal Fire incident. Mirrors mobile app/fire-detail.tsx 1:1.
//
// URL params (always present): lat, lon
// URL params (FIRMS only): brightness, confidence, acq_date, acq_time,
//                          satellite, daynight
//
// The page always renders the same skeleton (satellite stat tiles + spread
// map + recent passes + detection metadata). If `useNamedIncidentsNear` finds
// a match within 10 mi, the eyebrow/title flip to the incident's name and an
// extra "Incident facts" + "Incident details" block appears between the
// satellite stats and the spread map. This is exactly how mobile composes it.

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { Icon } from '@/components/Icon';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { PageSection } from '@/components/ui/PageSection';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import type { FireFeature, LatLon, NamedIncident } from '@/lib/api';
import {
  useFiresNear,
  useNamedIncidentsNear,
  useRiskFromWeather,
  useWeather,
} from '@/lib/queries';
import { dangerToRisk } from '@/lib/api';
import { getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { useUserLocation } from '@/lib/use-location';
import { severityOf } from '@/components/status/ClosestFiresList';
import { formatDistance, formatSpeed, useUnits } from '@/lib/use-units';

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';

// Mini-map is leaflet-based — keep it behind dynamic({ ssr: false }).
const MiniMap = dynamic(
  () => import('./MiniMapImpl').then((m) => m.MiniMapImpl),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: '100%',
          height: 220,
          background: '#0B0E12',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.42)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        Loading map…
      </div>
    ),
  },
);

// ─── Geometry helpers (inlined; web has no shared lib/geo) ────────────────

function distanceMiles(a: LatLon, b: LatLon): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial bearing in degrees (0 = N, 90 = E). */
function bearingDeg(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
function compassBearing(deg: number): string {
  return COMPASS_8[Math.round(deg / 45) % 8];
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────

export function FireDetailScreen() {
  const { ae, accent } = useAesthetic();
  const units = useUnits();
  const params = useSearchParams();

  const fireLat = parseFloat(params.get('lat') ?? 'NaN');
  const fireLon = parseFloat(params.get('lon') ?? 'NaN');
  const brightnessParam = params.get('brightness');
  const confidence = params.get('confidence');
  const acqDate = params.get('acq_date');
  const acqTime = params.get('acq_time');
  const satellite = params.get('satellite');
  const daynight = params.get('daynight');

  const coordsValid = Number.isFinite(fireLat) && Number.isFinite(fireLon);
  const fireLoc: LatLon | undefined = coordsValid
    ? { lat: fireLat, lon: fireLon }
    : undefined;

  const me = useUserLocation();
  const weather = useWeather(fireLoc);
  const risk = useRiskFromWeather(weather.data, fireLoc);
  const nearby = useFiresNear(fireLoc, 8, 7);
  const incidents = useNamedIncidentsNear(fireLoc, 10, 5);

  const matched: NamedIncident | null = incidents.data?.[0] ?? null;
  const incidentResolved = !incidents.isLoading;

  const distFromMe = useMemo(
    () => (me.coords && fireLoc ? distanceMiles(me.coords, fireLoc) : null),
    [me.coords, fireLoc],
  );
  const bearingFromMe = useMemo(
    () => (me.coords && fireLoc ? compassBearing(bearingDeg(me.coords, fireLoc)) : null),
    [me.coords, fireLoc],
  );

  const detectionId = useMemo(() => {
    if (!fireLoc) return 'FIRMS-unknown';
    const date = (acqDate ?? 'unknown').replace(/-/g, '');
    return `FIRMS-${date}-${Math.round(fireLat * 100)}-${Math.round(fireLon * 100)}`;
  }, [acqDate, fireLat, fireLon, fireLoc]);

  const passes = useMemo(() => {
    if (!nearby.data) return [];
    return [...nearby.data.features]
      .sort(
        (a, b) =>
          (b.properties.acq_date ?? '').localeCompare(a.properties.acq_date ?? '') ||
          (b.properties.acq_time ?? '').localeCompare(a.properties.acq_time ?? ''),
      )
      .slice(0, 8);
  }, [nearby.data]);

  const nearbyOthers = useMemo<FireFeature[]>(() => {
    if (!nearby.data || !fireLoc) return [];
    return nearby.data.features.filter(
      (f) => !(f.properties.lat === fireLat && f.properties.lon === fireLon),
    );
  }, [nearby.data, fireLoc, fireLat, fireLon]);

  if (!coordsValid) {
    return (
      <PageSection top={36} bottom={56}>
        <h1
          style={{
            margin: 0,
            fontFamily: ae.fontDisplay,
            fontSize: 32,
            fontWeight: ae.titleWeight,
            color: ae.text,
            letterSpacing: '-0.025em',
          }}
        >
          Detection not found
        </h1>
        <p style={{ margin: '14px 0 0', fontFamily: ae.fontBody, fontSize: 15, color: ae.textDim }}>
          The detail link is missing coordinates. Open one from the Map.
        </p>
        <div style={{ marginTop: 24 }}>
          <BackToMap />
        </div>
      </PageSection>
    );
  }

  // Severity tone for the screen — driven by the local risk (weather at the
  // fire's location), not the incident's own size. Matches mobile RiskTile.
  const riskLevel: RiskLevel | null = risk.data
    ? dangerToRisk(risk.data.danger_level)
    : null;
  const accentTone = riskLevel ? getRisk(riskLevel, accent) : null;

  // "Threat to You" — distance + acres heuristic shared with the rail/chips.
  // Synchronous (no network) so this resolves instantly even while the
  // fire-weather pill is still fetching. Different question from `riskLevel`:
  // this asks "how scary is this fire TO ME", not "how bad is the local fire
  // weather". For a satellite-only detection, acres is treated as 0 so the
  // heuristic falls back to pure distance.
  const threatLevel: RiskLevel | null =
    distFromMe == null
      ? null
      : severityOf({
          distance_mi: distFromMe,
          acres: matched?.acres ?? null,
        } as NamedIncident);
  const threatTone = threatLevel ? getRisk(threatLevel, accent) : null;

  const openInMaps = `https://www.google.com/maps?q=${fireLat},${fireLon}`;

  return (
    <PageSection top={28} bottom={56}>
      {/* Back nav */}
      <div style={{ marginBottom: 24 }}>
        <BackToMap />
      </div>

      {/* Header — eyebrow + title + description, or skeletons while waiting */}
      {!incidentResolved ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton width={120} height={12} rounded="sm" />
          <Skeleton width={240} height={32} rounded="sm" />
          <Skeleton width={'90%'} height={36} rounded="sm" />
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: '#ef4444',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: '#ef4444',
                  boxShadow: '0 0 8px #ef4444',
                }}
              />
              {matched ? 'Active incident' : 'Live detection'}
            </span>
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10,
                fontWeight: 600,
                color: ae.textMute,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              {matched ? matched.source.toUpperCase() : detectionId}
            </span>
          </div>
          <h1
            style={{
              margin: '10px 0 0',
              fontFamily: ae.fontDisplay,
              fontSize: 36,
              fontWeight: ae.titleWeight,
              letterSpacing: '-0.025em',
              color: ae.text,
              lineHeight: 1.05,
            }}
          >
            {matched ? matched.name : 'Fire Detection'}
          </h1>
          <p
            style={{
              margin: '10px 0 0',
              fontFamily: ae.fontBody,
              fontSize: 14,
              lineHeight: 1.55,
              color: ae.textDim,
            }}
          >
            {distFromMe != null && bearingFromMe
              ? `${formatDistance(distFromMe, units.distance, 1)} ${bearingFromMe} of your location.`
              : 'Active thermal anomaly detected by NASA satellite.'}{' '}
            {matched
              ? `Reported by ${matched.agency ?? 'the responsible agency'}${
                  matched.started ? ` on ${formatDate(matched.started)}` : ''
                }.`
              : 'All metrics below are computed from real-time data — no named-incident match was found within 10 miles.'}
          </p>
        </>
      )}

      {/* Stat grid — Risk + Distance + Brightness + Confidence (always shown) */}
      {!incidentResolved ? (
        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Skeleton width={'100%'} height={92} rounded="md" />
          <Skeleton width={'100%'} height={92} rounded="md" />
          <Skeleton width={'100%'} height={92} rounded="md" />
          <Skeleton width={'100%'} height={92} rounded="md" />
          <div style={{ gridColumn: '1 / -1' }}>
            <Skeleton width={'100%'} height={92} rounded="md" />
          </div>
        </div>
      ) : (
        <div
          style={{
            marginTop: 20,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
          }}
        >
          <RiskTile
            label="Risk Level"
            sublabel="Fire weather here"
            level={riskLevel}
            tone={accentTone?.color ?? ae.text}
            loading={weather.isLoading || risk.isLoading || (weather.data != null && risk.data == null)}
            ae={ae}
          />
          <RiskTile
            label="Threat to You"
            sublabel="Distance + size"
            level={threatLevel}
            tone={threatTone?.color ?? ae.text}
            loading={false}
            ae={ae}
          />
          <StatTile
            label="Distance"
            value={
              distFromMe != null
                ? (units.distance === 'km' ? distFromMe * 1.60934 : distFromMe).toFixed(1)
                : '—'
            }
            unit={distFromMe != null ? units.distance : undefined}
            ae={ae}
          />
          <StatTile
            label="Brightness"
            value={brightnessParam ? `${Math.round(Number(brightnessParam))}` : '—'}
            unit="K"
            ae={ae}
          />
          <div style={{ gridColumn: '1 / -1' }}>
            <StatTile
              label="Confidence"
              value={(confidence ?? '—').toUpperCase()}
              ae={ae}
            />
          </div>
        </div>
      )}

      {/* Incident facts — only when a named incident matches */}
      {matched ? (
        <div style={{ marginTop: 28 }}>
          <Eyebrow>Incident facts</Eyebrow>
          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12,
            }}
          >
            <StatTile
              label="Containment"
              value={matched.contained_pct != null ? `${Math.round(matched.contained_pct)}` : '—'}
              unit={matched.contained_pct != null ? '%' : undefined}
              ae={ae}
            />
            <StatTile
              label="Size"
              value={
                matched.acres != null
                  ? matched.acres.toLocaleString(undefined, { maximumFractionDigits: 0 })
                  : '—'
              }
              unit={matched.acres != null ? 'ac' : undefined}
              tone={(matched.acres ?? 0) > 1000 ? '#ef4444' : ae.text}
              ae={ae}
            />
            <StatTile
              label="Personnel"
              value={matched.personnel != null ? matched.personnel.toString() : '—'}
              ae={ae}
            />
            <StatTile label="Cause" value={matched.cause ?? '—'} ae={ae} />
          </div>
        </div>
      ) : null}

      {/* Incident details (county/state/location + source + control + link) */}
      {matched ? (
        <div style={{ marginTop: 24 }}>
          <Eyebrow>Incident details</Eyebrow>
          <div
            style={{
              marginTop: 10,
              padding: 18,
              background: ae.surface,
              border: ae.cardBorder,
              borderRadius: ae.radius,
            }}
          >
            {matched.county ? <Row k="County" v={matched.county} ae={ae} /> : null}
            {matched.state && !matched.county ? <Row k="State" v={matched.state} ae={ae} /> : null}
            {matched.location ? <Row k="Location" v={matched.location} ae={ae} /> : null}
            <Row
              k="Source"
              v={matched.source === 'calfire' ? 'Cal Fire' : 'NIFC WFIGS'}
              ae={ae}
            />
            {matched.control_statement ? (
              <p
                style={{
                  margin: '12px 0 0',
                  fontFamily: ae.fontBody,
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: ae.text,
                }}
              >
                {matched.control_statement}
              </p>
            ) : null}
            {matched.url ? (
              <a
                href={matched.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginTop: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontFamily: ae.fontMono,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.10em',
                  color: '#7ee787',
                  textDecoration: 'none',
                }}
              >
                <Icon name="external" size={11} color="#7ee787" strokeWidth={1.8} />
                Open official page
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Spread prediction — mini map + footer caption */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Eyebrow>Spread prediction</Eyebrow>
          {weather.data?.wind_deg != null ? (
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                color: ae.textMute,
                letterSpacing: '0.04em',
              }}
            >
              based on current local wind
            </span>
          ) : null}
        </div>
        <div
          style={{
            position: 'relative',
            marginTop: 10,
            overflow: 'hidden',
            borderRadius: ae.radius,
            border: ae.cardBorder,
          }}
        >
          {MAPTILER_KEY ? (
            <MiniMap
              center={[fireLat, fireLon]}
              nearby={nearbyOthers}
              maptilerKey={MAPTILER_KEY}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: 220,
                background: '#0B0E12',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: ae.textMute,
                fontFamily: ae.fontMono,
                fontSize: 11,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
              }}
            >
              Map needs a MapTiler key
            </div>
          )}
          {weather.data?.wind_deg != null ? (
            <SpreadArrow
              windDeg={weather.data.wind_deg}
              windKph={weather.data.wind_speed}
              speedUnit={units.speed}
              ae={ae}
            />
          ) : null}
        </div>
        <p
          style={{
            margin: '10px 0 0',
            fontFamily: ae.fontBody,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: ae.textDim,
          }}
        >
          {nearby.data
            ? `${nearby.data.features.length} thermal detections in the surrounding 8 miles over the last 7 days. Larger cluster = larger active fire footprint.`
            : 'Loading nearby detections…'}
        </p>
      </div>

      {/* Recent satellite passes — only if more than one pass */}
      {passes.length > 1 ? (
        <div style={{ marginTop: 28 }}>
          <Eyebrow>Recent satellite passes</Eyebrow>
          <div
            style={{
              marginTop: 10,
              padding: 18,
              background: ae.surface,
              border: ae.cardBorder,
              borderRadius: ae.radius,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {passes.map((p, i) => (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={`pass-${i}-${p.properties.acq_date}-${p.properties.acq_time}`}
                style={{ display: 'flex', alignItems: 'center' }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 99,
                    background: '#ef4444',
                    marginRight: 12,
                    boxShadow: '0 0 6px rgba(239,68,68,0.7)',
                  }}
                />
                <span
                  style={{
                    fontFamily: ae.fontMono,
                    fontSize: 13,
                    color: ae.text,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {p.properties.acq_date ?? 'unknown'}{' '}
                  {p.properties.acq_time
                    ? `${p.properties.acq_time.padStart(4, '0').slice(0, 2)}:${p.properties.acq_time.padStart(4, '0').slice(2)} UTC`
                    : ''}
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontFamily: ae.fontMono,
                    fontSize: 11,
                    color: ae.textDim,
                  }}
                >
                  sat {p.properties.satellite ?? '—'}
                </span>
              </div>
            ))}
          </div>
          <p
            style={{
              margin: '10px 0 0',
              fontFamily: ae.fontBody,
              fontSize: 12.5,
              lineHeight: 1.55,
              color: ae.textDim,
            }}
          >
            Each entry is a satellite pass that flagged a hot pixel near here. Multiple passes
            over time → fire is persistent.
          </p>
        </div>
      ) : null}

      {/* Detection metadata — always shown */}
      <div style={{ marginTop: 28 }}>
        <Eyebrow>Detection metadata</Eyebrow>
        <div
          style={{
            marginTop: 10,
            padding: 18,
            background: ae.surface,
            border: ae.cardBorder,
            borderRadius: ae.radius,
          }}
        >
          <Row k="Detected" v={acqDate ?? '—'} ae={ae} />
          <Row k="Acquisition time" v={acqTime ? `${acqTime} UTC` : '—'} ae={ae} />
          <Row k="Satellite" v={satellite ?? '—'} ae={ae} />
          <Row
            k="Day / night"
            v={daynight === 'D' ? 'Day' : daynight === 'N' ? 'Night' : '—'}
            ae={ae}
          />
          <Row k="Latitude" v={fireLat.toFixed(4)} ae={ae} />
          <Row k="Longitude" v={fireLon.toFixed(4)} ae={ae} last />
        </div>
      </div>

      {/* CTA — Open in Maps (Google Maps URL since we're on web) */}
      <div style={{ marginTop: 28 }}>
        <a
          href={openInMaps}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 24px',
            borderRadius: 12,
            background: '#ef4444',
            color: '#fff',
            fontFamily: ae.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            boxShadow: '0 8px 24px rgba(239,68,68,0.35)',
          }}
        >
          <Icon name="external" size={14} color="#fff" strokeWidth={2} />
          Open in Maps
        </a>
      </div>
    </PageSection>
  );
}

// ─── Inline helpers ───────────────────────────────────────────────────────

type Ae = ReturnType<typeof useAesthetic>['ae'];

function RiskTile({
  label,
  sublabel,
  level,
  tone,
  loading,
  ae,
}: {
  /** Tile heading — e.g. "Risk Level" (fire weather) or "Threat to You" (heuristic). */
  label: string;
  /** Small caption under the heading clarifying what's being measured. */
  sublabel?: string;
  level: RiskLevel | null;
  tone: string;
  /** True while /weather or /risk is still in flight. Mobile shows "—"; web
   *  shows a skeleton pill because the cold fetch (Open-Meteo + KBDI) can
   *  take several seconds and a dash makes the page look broken. */
  loading: boolean;
  ae: Ae;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: ae.radius,
        background: ae.surface,
        border: ae.cardBorder,
      }}
    >
      <div
        style={{
          fontFamily: ae.fontMono,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.18em',
          color: ae.textMute,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      {sublabel ? (
        <div
          style={{
            marginTop: 2,
            fontFamily: ae.fontMono,
            fontSize: 9.5,
            color: ae.textMute,
            letterSpacing: '0.06em',
          }}
        >
          {sublabel}
        </div>
      ) : null}
      <div style={{ marginTop: 8, minHeight: 28, display: 'flex', alignItems: 'center' }}>
        {loading ? (
          <Skeleton width={104} height={26} rounded="full" />
        ) : level ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 12px',
              borderRadius: 99,
              background: 'rgba(255, 255, 255, 0.04)',
              border: `0.5px solid ${tone}`,
              color: tone,
              fontFamily: ae.fontMono,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: tone,
                boxShadow: `0 0 8px ${tone}`,
              }}
            />
            {RISK_LEVELS[level].label}
          </span>
        ) : (
          <span
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 24,
              fontWeight: 700,
              color: ae.textDim,
            }}
          >
            —
          </span>
        )}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  unit,
  tone,
  ae,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: string;
  ae: Ae;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: ae.radius,
        background: ae.surface,
        border: ae.cardBorder,
      }}
    >
      <div
        style={{
          fontFamily: ae.fontMono,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.18em',
          color: ae.textMute,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          fontFamily: ae.fontDisplay,
          fontSize: 28,
          fontWeight: ae.titleWeight,
          color: tone ?? ae.text,
          letterSpacing: ae.titleTracking,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>{value}</span>
        {unit ? (
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 12,
              fontWeight: 500,
              color: ae.textDim,
              letterSpacing: '0.04em',
            }}
          >
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Row({
  k,
  v,
  ae,
  last,
}: {
  k: string;
  v: string;
  ae: Ae;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '8px 0',
        borderBottom: last ? 'none' : `0.5px solid ${ae.line}`,
      }}
    >
      <span style={{ fontFamily: ae.fontMono, fontSize: 12, color: ae.textDim }}>{k}</span>
      <span
        style={{
          fontFamily: ae.fontMono,
          fontSize: 12,
          fontWeight: 600,
          color: ae.text,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
          maxWidth: '70%',
        }}
      >
        {v}
      </span>
    </div>
  );
}

function SpreadArrow({
  windDeg,
  windKph,
  speedUnit,
  ae,
}: {
  windDeg: number;
  /** Wind speed in km/h. Matches what /weather returns (owm.py converts m/s
   *  → kph). Conversion to user-pref mph happens inside `formatSpeed`. */
  windKph: number;
  speedUnit: 'mph' | 'kph';
  ae: Ae;
}) {
  // FROM-direction → spread is downwind, so arrow points 180° away.
  const spreadDeg = (windDeg + 180) % 360;
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        padding: '8px 12px',
        borderRadius: 10,
        background: 'rgba(13, 16, 18, 0.78)',
        border: `0.5px solid ${ae.line}`,
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" style={{ transform: `rotate(${spreadDeg}deg)` }}>
        <line x1="11" y1="18" x2="11" y2="5" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
        <polygon points="6,8 11,2 16,8" fill="#ef4444" />
      </svg>
      <span
        style={{
          fontFamily: ae.fontMono,
          fontSize: 11,
          fontWeight: 600,
          color: ae.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatSpeed(windKph, speedUnit, 0)}
      </span>
    </div>
  );
}

function BackToMap() {
  const { ae } = useAesthetic();
  return (
    <Link
      href="/map"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: ae.textDim,
        fontFamily: ae.fontMono,
        fontSize: 11,
        letterSpacing: '0.14em',
        textTransform: ae.chipUpper ? 'uppercase' : 'none',
        textDecoration: 'none',
      }}
    >
      <Icon name="chevron" size={12} color={ae.textDim} style={{ transform: 'rotate(180deg)' }} /> Back to Map
    </Link>
  );
}
