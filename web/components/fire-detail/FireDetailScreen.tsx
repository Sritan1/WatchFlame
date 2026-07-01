'use client';

// Fire Detail — unified screen for both a FIRMS satellite pixel AND a named
// NIFC/Cal Fire incident. Mirrors mobile app/fire-detail.tsx 1:1 functionally,
// dressed in the premium two-column desktop layout from web-incident*.jsx.
//
// URL params (always present): lat, lon
// URL params (FIRMS only): brightness, confidence, acq_date, acq_time,
//                          satellite, daynight
//
// The page always renders the same skeleton. If `useNamedIncidentsNear` finds
// a match within 10 mi, the eyebrow flips to "Active incident", the title to
// the incident's name, and two extra blocks (Incident facts + Incident
// details) appear in the appropriate columns.

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';

import { Icon } from '@/components/Icon';
import { cardinal8 } from '@/components/ui/CompassRose';
import { PageSection } from '@/components/ui/PageSection';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import { dangerToRisk } from '@/lib/api';
import type { FireFeature, LatLon, NamedIncident } from '@/lib/api';
import {
  bearingTo,
  distanceMiles,
  firmsAgeHours,
  personalThreatBucket,
} from '@/lib/composite-risk';
import { firmsPlatform } from '@/lib/firms';
import {
  useFiresNear,
  useNamedIncidentsNear,
  useRiskFromWeather,
  useWeather,
} from '@/lib/queries';
import { getRisk, hexToRgb, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { useUserLocation } from '@/lib/use-location';
import { formatDistance, formatSpeed, useUnits, type DistanceUnit } from '@/lib/use-units';

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';
const RED = '#F04438';
const RED_RGB = '240, 68, 56';

// Mini-map is leaflet-based — keep it behind dynamic({ ssr: false }).
const MiniMap = dynamic(
  () => import('./MiniMapImpl').then((m) => m.MiniMapImpl),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: '100%',
          height: 400,
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

// distanceMiles + bearingTo come from web/lib/composite-risk so the threat
// math and the displayed numbers stay in lockstep. cardinal8 comes from
// CompassRose so all surfaces share the same 8-point label set.

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

type Ae = ReturnType<typeof useAesthetic>['ae'];

export function FireDetailScreen() {
  const { ae, accent } = useAesthetic();
  const units = useUnits();
  const params = useSearchParams();

  const fireLat = parseFloat(params.get('lat') ?? 'NaN');
  const fireLon = parseFloat(params.get('lon') ?? 'NaN');
  const brightnessParam = params.get('brightness');
  const confidenceParam = params.get('confidence');
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
  // User-location weather — used to align the "Threat to You" formula's
  // wind alignment modifier from the USER's perspective (same source Status uses for the
  // composite). TanStack dedupes on the query key, so this is free when
  // Status already loaded the same coords.
  const userWeather = useWeather(me.coords);
  const risk = useRiskFromWeather(weather.data, fireLoc);
  const nearby = useFiresNear(fireLoc, 8, 7);
  // reportHealth:false — detail-screen queries must not drive the global
  // feed-health (a transient failure here was poisoning the Map/sidebar FIRMS
  // + incident status until a manual refresh).
  const incidents = useNamedIncidentsNear(fireLoc, 10, 5, false);

  const matched: NamedIncident | null = incidents.data?.[0] ?? null;
  const incidentResolved = !incidents.isLoading;

  const distFromMe = useMemo(
    () => (me.coords && fireLoc ? distanceMiles(me.coords, fireLoc) : null),
    [me.coords, fireLoc],
  );
  // Bearing in raw degrees — feeds `personalThreatBucket` for wind alignment.
  const bearingDegFromMe = useMemo(
    () => (me.coords && fireLoc ? bearingTo(me.coords, fireLoc) : null),
    [me.coords, fireLoc],
  );
  const bearingFromMe = useMemo(
    () => (bearingDegFromMe != null ? cardinal8(bearingDegFromMe) : null),
    [bearingDegFromMe],
  );

  const detectionId = useMemo(() => {
    if (!fireLoc) return 'FIRMS-unknown';
    const date = (acqDate ?? 'unknown').replace(/-/g, '');
    return `FIRMS-${date}-${Math.round(fireLat * 100)}-${Math.round(fireLon * 100)}`;
  }, [acqDate, fireLat, fireLon, fireLoc]);

  const passes = useMemo(() => {
    if (!nearby.data) return [];
    // FIRMS acq_time is "HHMM" but not always zero-padded ("542" = 05:42), so
    // pad before the string compare or "542" would sort after "1842".
    const hhmm = (t: string | null | undefined) => (t ?? '').padStart(4, '0');
    return [...nearby.data.features]
      .sort(
        (a, b) =>
          (b.properties.acq_date ?? '').localeCompare(a.properties.acq_date ?? '') ||
          hhmm(b.properties.acq_time).localeCompare(hhmm(a.properties.acq_time)),
      )
      .slice(0, 8);
  }, [nearby.data]);

  const nearbyOthers = useMemo<FireFeature[]>(() => {
    if (!nearby.data || !fireLoc) return [];
    return nearby.data.features.filter(
      (f) => !(f.properties.lat === fireLat && f.properties.lon === fireLon),
    );
  }, [nearby.data, fireLoc, fireLat, fireLon]);

  // "Threat to You" — uses the same per-fire helper as Status's Active Fire
  // Threat axis so a fire reads the same on both screens. Same modifiers:
  // distance + size + wind alignment (user-side wind) + time decay for
  // stale FIRMS + containment dampener. Synchronous; wind/age modifiers
  // gracefully degrade when their inputs aren't yet loaded (null wind →
  // skip wind modifier). No new loading state introduced.
  // Only FIRMS-only flows (no matched incident) participate in the
  // stale-pixel dampener; reuse the shared helper so the threshold is in
  // one place.
  // NOTE: these two hooks (firmsAge, threatLevel) must stay ABOVE the
  // `!coordsValid` early return — moving them below it would make the hook
  // count vary between renders when coordsValid flips (React error).
  const firmsAge = useMemo(
    () => (matched ? null : firmsAgeHours(acqDate, acqTime)),
    [matched, acqDate, acqTime],
  );

  const userWindDeg = userWeather.data?.wind_deg ?? null;
  const userWindSpeedKph = userWeather.data?.wind_speed ?? null;
  const matchedAcres = matched?.acres ?? null;
  const matchedContainedPct = matched?.contained_pct ?? null;
  const threatLevel: RiskLevel | null = useMemo(
    () =>
      distFromMe == null || bearingDegFromMe == null
        ? null
        : personalThreatBucket({
            distanceMi: distFromMe,
            acres: matchedAcres,
            containedPct: matchedContainedPct,
            firmsAgeHours: firmsAge,
            windDeg: userWindDeg,
            windSpeedKph: userWindSpeedKph,
            bearingToFireDeg: bearingDegFromMe,
          }),
    [
      distFromMe,
      bearingDegFromMe,
      matchedAcres,
      matchedContainedPct,
      firmsAge,
      userWindDeg,
      userWindSpeedKph,
    ],
  );

  if (!coordsValid) {
    return (
      <PageSection top={36} bottom={56} maxWidth={920}>
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
        <p
          style={{
            margin: '14px 0 0',
            fontFamily: ae.fontBody,
            fontSize: 15,
            color: ae.textDim,
          }}
        >
          The detail link is missing coordinates. Open one from the Map.
        </p>
        <div style={{ marginTop: 24 }}>
          <BackToMap ae={ae} />
        </div>
      </PageSection>
    );
  }

  // Severity tone for the screen — driven by the local risk (weather at the
  // fire's location). Matches mobile RiskTile.
  const riskLevel: RiskLevel | null = risk.data
    ? dangerToRisk(risk.data.danger_level)
    : null;
  const accentTone = riskLevel ? getRisk(riskLevel, accent) : null;
  const threatTone = threatLevel ? getRisk(threatLevel, accent) : null;

  const openInMaps = `https://www.google.com/maps?q=${fireLat},${fireLon}`;

  // Fire-weather (local /weather + /risk) failed to load. Excluded from
  // `fireWeatherLoading` so the Risk Level cell doesn't skeleton forever when
  // risk errors after weather resolves — the `weather.data != null && risk.data
  // == null` clause below would otherwise stay true indefinitely on error.
  const fireWeatherFailed = weather.isError || risk.isError;
  const fireWeatherLoading =
    !fireWeatherFailed &&
    (weather.isLoading || risk.isLoading || (weather.data != null && risk.data == null));

  const idLabel = matched
    ? matched.source === 'calfire'
      ? 'CAL FIRE'
      : 'NIFC WFIGS'
    : detectionId;

  // Three panels are FIRMS-specific (Brightness, Confidence, Detection
  // Metadata). When opened from a named incident with no paired FIRMS pixel,
  // their values would all be '—' — so hide each independently based on
  // whether its source param is present. A FIRMS pixel that *also* matches
  // an incident still shows them since the params are in the URL.
  const hasBrightness = brightnessParam != null;
  const hasConfidence = confidenceParam != null;
  const hasFirmsDetection =
    acqDate != null || acqTime != null || satellite != null || daynight != null;

  const detectionMetaRows = [
    { label: 'Detected', value: acqDate ?? '—' },
    { label: 'Acquisition time', value: acqTime ? `${acqTime} UTC` : '—' },
    { label: 'Satellite', value: firmsPlatform(satellite) ?? satellite ?? '—' },
    { label: 'Day / night', value: daynight === 'D' ? 'Day' : daynight === 'N' ? 'Night' : '—' },
    { label: 'Latitude', value: fireLat.toFixed(4) },
    { label: 'Longitude', value: fireLon.toFixed(4) },
  ];

  return (
    <PageSection top={32} bottom={64} maxWidth={1320}>
      {/* ─── Hero ────────────────────────────────────────────────── */}
      <Hero
        ae={ae}
        idLabel={idLabel}
        matched={matched}
        title={matched ? matched.name : 'Fire Detection'}
        description={
          incidentResolved
            ? buildDescription(matched, distFromMe, bearingFromMe, units.distance)
            : undefined
        }
        loading={!incidentResolved}
      />

      {/* ─── Main grid ───────────────────────────────────────────── */}
      <div
        className="app-stack app-detail-grid"
        style={{
          marginTop: 36,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)',
          gap: 20,
          alignItems: 'start',
        }}
      >
        {/* ─── LEFT COLUMN ───────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          {/* Local fire map — nearby recent detections + a wind-direction arrow */}
          <IncPanel
            ae={ae}
            eyebrow="Local fire map · wind"
            glow={RED_RGB}
            padding={22}
          >
            <div
              style={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 14,
                border: `0.5px solid ${ae.lineStrong}`,
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
                    height: 400,
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
                margin: '20px 4px 0',
                fontFamily: ae.fontBody,
                fontSize: 13.5,
                lineHeight: 1.55,
                color: ae.textDim,
              }}
            >
              {nearby.data
                ? `${nearby.data.features.length} thermal detections in the surrounding ${formatDistance(8, units.distance, 0)} over the last 7 days. Larger cluster = larger active fire footprint.`
                : 'Loading nearby detections…'}
            </p>
          </IncPanel>

          {/* Detection Metadata — FIRMS-only */}
          {hasFirmsDetection ? (
            <IncPanel ae={ae} eyebrow="Detection Metadata" right="FIRMS / VIIRS" padding={22} className="app-detail-late">
              <MetadataList ae={ae} rows={detectionMetaRows} />
            </IncPanel>
          ) : null}

          {/* Recent passes — only if more than one pass */}
          {passes.length > 1 ? (
            <IncPanel ae={ae} eyebrow="Recent satellite passes" padding={22}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {passes.map((p, i) => (
                  <div
                    key={`pass-${i}-${p.properties.acq_date}-${p.properties.acq_time}`}
                    style={{ display: 'flex', alignItems: 'center' }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 99,
                        background: RED,
                        marginRight: 12,
                        boxShadow: `0 0 6px rgba(${RED_RGB}, 0.7)`,
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
                        ? `${p.properties.acq_time.padStart(4, '0').slice(0, 2)}:${p.properties.acq_time
                            .padStart(4, '0')
                            .slice(2)} UTC`
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
                      sat {firmsPlatform(p.properties.satellite) ?? p.properties.satellite ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
              <p
                style={{
                  margin: '14px 0 0',
                  fontFamily: ae.fontBody,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: ae.textDim,
                }}
              >
                Each entry is a satellite pass that flagged a hot pixel near here. Multiple passes
                over time → fire is persistent.
              </p>
            </IncPanel>
          ) : null}

          {/* Incident details — matched only */}
          {matched ? (
            <IncPanel ae={ae} eyebrow="Incident details" padding={22} className="app-detail-late">
              {matched.county ? <DetailRow ae={ae} k="County" v={matched.county} /> : null}
              {matched.state && !matched.county ? (
                <DetailRow ae={ae} k="State" v={matched.state} />
              ) : null}
              {matched.location ? <DetailRow ae={ae} k="Location" v={matched.location} /> : null}
              <DetailRow
                ae={ae}
                k="Source"
                v={matched.source === 'calfire' ? 'Cal Fire' : 'NIFC WFIGS'}
                last={!matched.control_statement && !matched.url}
              />
              {matched.control_statement ? (
                <blockquote
                  style={{
                    margin: '14px 0 0',
                    paddingLeft: 14,
                    borderLeft: '2px solid rgba(255, 255, 255, 0.18)',
                    fontFamily: ae.fontBody,
                    fontStyle: 'italic',
                    fontSize: 14,
                    fontWeight: 400,
                    lineHeight: 1.6,
                    color: ae.text,
                  }}
                >
                  {matched.control_statement}
                </blockquote>
              ) : null}
              {matched.url ? (
                <a
                  href={matched.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    marginTop: 14,
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
            </IncPanel>
          ) : null}
        </div>

        {/* ─── RIGHT COLUMN ──────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          {/* Risk + Threat compound */}
          <AssessmentSplit
            ae={ae}
            riskLevel={riskLevel}
            riskTone={accentTone?.color ?? ae.textDim}
            riskGlow={accentTone?.glow ?? '255,255,255'}
            threatLevel={threatLevel}
            threatTone={threatTone?.color ?? ae.textDim}
            threatGlow={threatTone?.glow ?? '255,255,255'}
            riskLoading={fireWeatherLoading}
            riskError={fireWeatherFailed}
          />

          {/* Incident facts — matched only (2x2 mini grid) */}
          {matched ? (
            <IncPanel ae={ae} eyebrow="Incident facts" padding={22}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 12,
                }}
              >
                <MiniStat
                  ae={ae}
                  label="Containment"
                  value={
                    matched.contained_pct != null
                      ? `${Math.round(matched.contained_pct)}`
                      : 'Unknown'
                  }
                  unit={matched.contained_pct != null ? '%' : undefined}
                />
                <MiniStat
                  ae={ae}
                  label="Size"
                  value={
                    matched.acres != null
                      ? matched.acres.toLocaleString(undefined, { maximumFractionDigits: 0 })
                      : 'Unknown'
                  }
                  unit={matched.acres != null ? 'ac' : undefined}
                  tone={(matched.acres ?? 0) > 1000 ? RED : ae.text}
                />
                <MiniStat
                  ae={ae}
                  label="Personnel"
                  value={matched.personnel != null ? matched.personnel.toString() : 'Unknown'}
                />
                <MiniStat ae={ae} label="Cause" value={matched.cause ?? 'Unknown'} />
              </div>
            </IncPanel>
          ) : null}

          {/* Distance */}
          <IncPanel ae={ae} eyebrow="Distance" right="from you" padding={22}>
            <DistanceViz
              ae={ae}
              distMi={distFromMe}
              bearing={bearingFromMe}
              unit={units.distance}
            />
          </IncPanel>

          {/* Brightness — FIRMS-only */}
          {hasBrightness ? (
            <IncPanel
              ae={ae}
              eyebrow="Brightness"
              right="Kelvin · channel I-4"
              padding={22}
            >
              <ThermalScale ae={ae} kelvin={Math.round(Number(brightnessParam))} />
            </IncPanel>
          ) : null}

          {/* Confidence — FIRMS-only */}
          {hasConfidence ? (
            <IncPanel ae={ae} eyebrow="Confidence" right="VIIRS rating" padding={22}>
              <ConfidenceBlock ae={ae} value={confidenceParam} />
            </IncPanel>
          ) : null}

          {/* Open in Maps CTA */}
          <OpenInMapsButton ae={ae} href={openInMaps} className="app-detail-last" />
        </div>
      </div>
    </PageSection>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────

function Hero({
  ae,
  idLabel,
  matched,
  title,
  description,
  loading,
}: {
  ae: Ae;
  idLabel: string;
  matched: NamedIncident | null;
  title: string;
  description: string | undefined;
  loading: boolean;
}) {
  return (
    <div style={{ position: 'relative' }}>
      {/* Top strip — back + ID */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 28,
        }}
      >
        <BackToMap ae={ae} />
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 14px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.025)',
            border: `0.5px solid ${ae.line}`,
          }}
        >
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: '0.18em',
              color: ae.textMute,
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            ID
          </span>
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 11.5,
              fontWeight: 500,
              letterSpacing: '0.06em',
              color: ae.text,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {idLabel}
          </span>
        </div>
      </div>

      {/* Headline block */}
      <div style={{ position: 'relative', maxWidth: 820 }}>
        <div style={{ marginBottom: 18 }}>
          {loading ? (
            <Skeleton width={160} height={28} rounded="full" />
          ) : (
            <LivePill ae={ae} matched={matched != null} />
          )}
        </div>

        {loading ? (
          <Skeleton width={420} height={56} rounded="sm" />
        ) : (
          <h1
            style={{
              margin: 0,
              fontFamily: ae.fontDisplay,
              fontSize: 64,
              fontWeight: ae.titleWeight,
              letterSpacing: '-0.035em',
              lineHeight: 0.98,
              color: ae.text,
            }}
          >
            {title}
          </h1>
        )}

        {loading ? (
          <div style={{ marginTop: 20 }}>
            <Skeleton width="80%" height={20} rounded="sm" />
          </div>
        ) : (
          <p
            style={{
              margin: '20px 0 0',
              maxWidth: 720,
              fontFamily: ae.fontBody,
              fontSize: 15.5,
              lineHeight: 1.55,
              color: ae.textDim,
            }}
          >
            {description}
          </p>
        )}
      </div>

      {/* Subtle red radial behind the hero */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -120,
          left: -160,
          width: 640,
          height: 360,
          background: `radial-gradient(ellipse at center, rgba(${RED_RGB}, 0.10), transparent 70%)`,
          filter: 'blur(40px)',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      />
    </div>
  );
}

function buildDescription(
  matched: NamedIncident | null,
  distFromMe: number | null,
  bearing: string | null,
  distanceUnit: DistanceUnit,
): string {
  const lead =
    distFromMe != null && bearing
      ? `${formatDistance(distFromMe, distanceUnit, 1)} ${bearing} of your location.`
      : 'Active thermal anomaly detected by NASA satellite.';
  const tail = matched
    ? `Reported by ${matched.agency ?? 'the responsible agency'}${
        matched.started ? ` on ${formatDate(matched.started)}` : ''
      }.`
    : `All metrics below are computed from real-time data — no named-incident match was found within ${formatDistance(10, distanceUnit, 0)}.`;
  return `${lead} ${tail}`;
}

function LivePill({ ae, matched }: { ae: Ae; matched: boolean }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 14px 7px 12px',
        borderRadius: 999,
        background: `linear-gradient(180deg, rgba(${RED_RGB}, 0.16), rgba(${RED_RGB}, 0.05))`,
        border: `0.5px solid rgba(${RED_RGB}, 0.40)`,
        boxShadow: `0 0 0 1px rgba(${RED_RGB}, 0.04), 0 8px 28px rgba(${RED_RGB}, 0.18), inset 0 1px 0 rgba(255,255,255,0.06)`,
        position: 'relative',
      }}
    >
      <span style={{ position: 'relative', width: 8, height: 8 }}>
        <span
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 99,
            background: RED,
            boxShadow: `0 0 10px ${RED}`,
          }}
        />
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: -3,
            borderRadius: 99,
            border: `1px solid ${RED}`,
            animation: 'ember-pulse 1.6s ease-out infinite',
          }}
        />
      </span>
      <span
        style={{
          fontFamily: ae.fontMono,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.22em',
          color: RED,
          textTransform: ae.chipUpper ? 'uppercase' : 'none',
        }}
      >
        {matched ? 'Active Incident' : 'Live Detection'}
      </span>
    </div>
  );
}

// ─── Panel chrome ─────────────────────────────────────────────────────────

function IncPanel({
  ae,
  eyebrow,
  right,
  children,
  padding = 22,
  glow,
  className,
}: {
  ae: Ae;
  eyebrow?: string;
  right?: string;
  children: ReactNode;
  padding?: number;
  glow?: string;
  /** Extra class for mobile reordering hooks (desktop ignores it). */
  className?: string;
}) {
  return (
    <div
      className={`inc-panel${className ? ` ${className}` : ''}`}
      style={{
        position: 'relative',
        background: `linear-gradient(180deg, ${ae.surface}, ${ae.surface2})`,
        border: ae.cardBorder,
        borderRadius: ae.radiusLg,
        padding,
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 0 rgba(0,0,0,0.4), 0 18px 50px rgba(0,0,0,0.35)',
        overflow: 'hidden',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 24,
          right: 24,
          height: 1,
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)',
          pointerEvents: 'none',
        }}
      />
      {glow ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -80,
            right: -80,
            width: 220,
            height: 220,
            background: `radial-gradient(circle, rgba(${glow}, 0.18), transparent 70%)`,
            filter: 'blur(20px)',
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {(eyebrow || right) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 18,
            position: 'relative',
            gap: 12,
          }}
        >
          {eyebrow ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 99,
                  flexShrink: 0,
                  background: ae.textDim,
                }}
              />
              <span
                style={{
                  fontFamily: ae.fontMono,
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: '0.18em',
                  color: ae.textDim,
                  textTransform: ae.chipUpper ? 'uppercase' : 'none',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {eyebrow}
              </span>
            </div>
          ) : (
            <span />
          )}
          {right ? (
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10,
                color: ae.textMute,
                letterSpacing: '0.10em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {right}
            </span>
          ) : null}
        </div>
      )}
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

// ─── Risk + Threat compound ───────────────────────────────────────────────

function AssessmentSplit({
  ae,
  riskLevel,
  riskTone,
  riskGlow,
  threatLevel,
  threatTone,
  threatGlow,
  riskLoading,
  riskError = false,
}: {
  ae: Ae;
  riskLevel: RiskLevel | null;
  riskTone: string;
  riskGlow: string;
  threatLevel: RiskLevel | null;
  threatTone: string;
  threatGlow: string;
  riskLoading: boolean;
  /** Local /weather or /risk errored — the Risk Level cell shows an explicit
   *  "Unavailable" instead of a bare "—" (which reads as unknown, not failed). */
  riskError?: boolean;
}) {
  return (
    <IncPanel ae={ae} padding={0}>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <AssessmentCell
          ae={ae}
          label="Risk Level"
          sub="Fire weather here"
          level={riskLevel}
          tone={riskTone}
          glow={riskGlow}
          loading={riskLoading}
          error={riskError}
        />
        <div
          style={{
            width: 0.5,
            background: ae.line,
            alignSelf: 'stretch',
            margin: '14px 0',
          }}
        />
        <AssessmentCell
          ae={ae}
          label="Threat to You"
          sub="Distance + size"
          level={threatLevel}
          tone={threatTone}
          glow={threatGlow}
          loading={false}
        />
      </div>
    </IncPanel>
  );
}

function AssessmentCell({
  ae,
  label,
  sub,
  level,
  tone,
  glow,
  loading,
  error = false,
}: {
  ae: Ae;
  label: string;
  sub: string;
  level: RiskLevel | null;
  tone: string;
  glow: string;
  loading: boolean;
  error?: boolean;
}) {
  const bar = level ? RISK_LEVELS[level].bar : 0;
  const pillText = level ? RISK_LEVELS[level].label : '—';
  return (
    <div style={{ padding: '22px 22px', flex: 1, position: 'relative', minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: ae.fontMono,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '0.18em',
            color: ae.textDim,
            textTransform: ae.chipUpper ? 'uppercase' : 'none',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: ae.fontMono,
            fontSize: 10,
            color: ae.textMute,
            letterSpacing: '0.08em',
          }}
        >
          {bar}/4
        </span>
      </div>
      <div
        style={{
          fontFamily: ae.fontBody,
          fontSize: 13,
          color: ae.textDim,
          marginBottom: 16,
          letterSpacing: '0.01em',
        }}
      >
        {sub}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 28 }}>
        {loading ? (
          <Skeleton width={86} height={24} rounded="full" />
        ) : error ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontFamily: ae.fontMono,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              color: ae.textMute,
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            <Icon name="warn" size={13} color="#E8B339" strokeWidth={1.8} />
            Unavailable
          </span>
        ) : level ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '5px 11px',
              borderRadius: 999,
              background: `rgba(${glow}, 0.12)`,
              border: `0.5px solid rgba(${glow}, 0.35)`,
              fontFamily: ae.fontMono,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.16em',
              color: tone,
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            <span
              style={{
                width: 5.5,
                height: 5.5,
                borderRadius: 99,
                background: tone,
                boxShadow: `0 0 8px ${tone}`,
              }}
            />
            {pillText}
          </span>
        ) : (
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              color: ae.textMute,
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            Unknown
          </span>
        )}
      </div>
      <div style={{ marginTop: 14 }}>
        <SegMeter ae={ae} level={bar} color={tone} />
      </div>
    </div>
  );
}

function SegMeter({
  ae,
  level,
  color,
  height = 7,
}: {
  ae: Ae;
  /** 0..4 — 0 means none filled. */
  level: number;
  color: string;
  height?: number;
}) {
  const colorRgb = color.startsWith('#') ? hexToRgb(color) : '255,255,255';
  return (
    <div style={{ display: 'flex', gap: 4, height }}>
      {[1, 2, 3, 4].map((i) => {
        const active = i <= level;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: '100%',
              borderRadius: 2,
              background: active
                ? `linear-gradient(180deg, ${color}, rgba(${colorRgb}, 0.55))`
                : 'rgba(255,255,255,0.05)',
              boxShadow: active
                ? `0 0 10px rgba(${colorRgb}, 0.5), inset 0 0 0 0.5px rgba(255,255,255,0.10)`
                : `inset 0 0 0 0.5px ${ae.line}`,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Distance / Brightness / Confidence ───────────────────────────────────

function DistanceViz({
  ae,
  distMi,
  bearing,
  unit,
}: {
  ae: Ae;
  /** Distance from user to fire in miles (always miles internally). */
  distMi: number | null;
  bearing: string | null;
  unit: DistanceUnit;
}) {
  // Reference uses a 0..120mi rail. We anchor to the same cap so very-far
  // fires don't slam against the right edge.
  const ratio = distMi != null ? Math.min(distMi / 120, 0.95) : 0;
  const xPct = 6 + ratio * 88;

  const displayValue =
    distMi != null
      ? unit === 'km'
        ? (distMi * 1.60934).toFixed(1)
        : distMi.toFixed(1)
      : '—';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 18 }}>
        <span
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 56,
            fontWeight: ae.titleWeight,
            letterSpacing: '-0.035em',
            lineHeight: 0.95,
            color: ae.text,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {displayValue}
        </span>
        {distMi != null ? (
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 14,
              color: ae.textDim,
              letterSpacing: '0.08em',
            }}
          >
            {unit}
          </span>
        ) : null}
      </div>

      <div style={{ position: 'relative', height: 38, marginBottom: 6 }}>
        <div
          style={{
            position: 'absolute',
            top: 19,
            left: 0,
            right: 0,
            height: 0.5,
            background: ae.lineStrong,
          }}
        />
        {[0, 25, 50, 75, 100].map((pct) => (
          <div
            key={pct}
            style={{
              position: 'absolute',
              left: `${6 + pct * 0.88}%`,
              top: 14,
              width: 0.5,
              height: 10,
              background: ae.line,
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            left: '6%',
            top: 14,
            transform: 'translateX(-50%)',
            width: 10,
            height: 10,
            borderRadius: 99,
            background: ae.surface,
            border: `1px solid ${ae.text}`,
            boxShadow: `inset 0 0 0 2px ${ae.bg}`,
          }}
        />
        {distMi != null ? (
          <>
            <div
              style={{
                position: 'absolute',
                left: `${xPct}%`,
                top: 13,
                transform: 'translateX(-50%)',
                width: 14,
                height: 14,
                borderRadius: 99,
                background: RED,
                boxShadow: `0 0 12px ${RED}, inset 0 0 0 2px rgba(255,255,255,0.15)`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 19,
                left: '6%',
                width: `${xPct - 6}%`,
                height: 0.5,
                background: `linear-gradient(90deg, ${ae.text}, ${RED})`,
                opacity: 0.5,
              }}
            />
          </>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: ae.fontMono,
          fontSize: 10,
          color: ae.textMute,
          letterSpacing: '0.10em',
          textTransform: ae.chipUpper ? 'uppercase' : 'none',
        }}
      >
        <span>You</span>
        <span>{bearing ? `${bearing} bearing · ${formatDistance(120, unit, 0)} range` : `${formatDistance(120, unit, 0)} range`}</span>
      </div>
    </div>
  );
}

function ThermalScale({ ae, kelvin }: { ae: Ae; kelvin: number | null }) {
  const min = 270;
  const max = 500;
  const pct =
    kelvin != null ? Math.min(Math.max((kelvin - min) / (max - min), 0), 1) : null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 18 }}>
        <span
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 56,
            fontWeight: ae.titleWeight,
            letterSpacing: '-0.035em',
            lineHeight: 0.95,
            color: ae.text,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {kelvin ?? '—'}
        </span>
        {kelvin != null ? (
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 14,
              color: ae.textDim,
              letterSpacing: '0.08em',
            }}
          >
            K
          </span>
        ) : null}
      </div>
      <div style={{ position: 'relative', height: 38, marginBottom: 6 }}>
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: 0,
            right: 0,
            height: 10,
            borderRadius: 5,
            background:
              'linear-gradient(90deg, #3A7CDB 0%, #6DC2A6 25%, #E8B339 55%, #FF7A3A 80%, #F04438 100%)',
            opacity: 0.85,
            boxShadow:
              'inset 0 0 0 0.5px rgba(255,255,255,0.10), inset 0 1px 0 rgba(255,255,255,0.10)',
          }}
        />
        {pct != null ? (
          <div
            style={{
              position: 'absolute',
              left: `${pct * 100}%`,
              top: 10,
              transform: 'translateX(-50%)',
              width: 4,
              height: 18,
              background: ae.text,
              borderRadius: 1,
              boxShadow: '0 0 10px rgba(255,255,255,0.5)',
            }}
          />
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: ae.fontMono,
          fontSize: 10,
          color: ae.textMute,
          letterSpacing: '0.10em',
        }}
      >
        <span>270 K</span>
        <span>500 K</span>
      </div>
    </div>
  );
}

function ConfidenceBlock({ ae, value }: { ae: Ae; value: string | null }) {
  // FIRMS confidence is either a single letter (L/N/H) or a percentage string.
  // The mobile/web flow always normalizes to L/N/H — anything else falls back
  // to dash. Lower-case the matched description.
  const states = [
    { k: 'L', label: 'Low' },
    { k: 'N', label: 'Nominal' },
    { k: 'H', label: 'High' },
  ] as const;
  const upper = (value ?? '').trim().toUpperCase();
  const active = states.find((s) => s.k === upper) ?? null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
        <span
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 56,
            fontWeight: ae.titleWeight,
            letterSpacing: '-0.035em',
            lineHeight: 0.95,
            color: ae.text,
          }}
        >
          {active?.k ?? '—'}
        </span>
        {active ? (
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 12,
              color: ae.textDim,
              letterSpacing: '0.06em',
            }}
          >
            {active.label.toLowerCase()}
          </span>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {states.map((s) => {
          const isActive = active?.k === s.k;
          return (
            <div
              key={s.k}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: 8,
                background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                border: `0.5px solid ${isActive ? ae.lineStrong : ae.line}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
              }}
            >
              <span
                style={{
                  fontFamily: ae.fontMono,
                  fontSize: 11,
                  fontWeight: 700,
                  color: isActive ? ae.text : ae.textMute,
                  letterSpacing: '0.06em',
                }}
              >
                {s.k}
              </span>
              <span
                style={{
                  fontFamily: ae.fontMono,
                  fontSize: 9,
                  fontWeight: 500,
                  color: isActive ? ae.textDim : ae.textMute,
                  letterSpacing: '0.10em',
                  textTransform: ae.chipUpper ? 'uppercase' : 'none',
                }}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Misc helpers ──────────────────────────────────────────────────────────

function MiniStat({
  ae,
  label,
  value,
  unit,
  tone,
}: {
  ae: Ae;
  label: string;
  value: string;
  unit?: string;
  tone?: string;
}) {
  // Numeric-style values (and the lone "—" placeholder) get the big display
  // font. Text values like "Undetermined" or "Human caused" use a smaller
  // body font and wrap, so they don't overflow the half-column tile.
  const isNumericLike = /^[\d,.\-—%\s]*$/.test(value);
  return (
    <div
      style={{
        padding: 14,
        borderRadius: ae.radius,
        background: ae.surface2,
        border: `0.5px solid ${ae.line}`,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: ae.fontMono,
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: '0.16em',
          color: ae.textMute,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      {isNumericLike ? (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            fontFamily: ae.fontDisplay,
            fontSize: 24,
            fontWeight: ae.titleWeight,
            color: tone ?? ae.text,
            letterSpacing: ae.titleTracking,
            fontVariantNumeric: 'tabular-nums',
            minWidth: 0,
          }}
        >
          <span>{value}</span>
          {unit ? (
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 11,
                fontWeight: 500,
                color: ae.textDim,
                letterSpacing: '0.04em',
              }}
            >
              {unit}
            </span>
          ) : null}
        </div>
      ) : (
        <div
          style={{
            marginTop: 10,
            fontFamily: ae.fontBody,
            fontSize: 15,
            fontWeight: 600,
            lineHeight: 1.25,
            color: tone ?? ae.text,
            letterSpacing: '-0.005em',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            minWidth: 0,
          }}
        >
          {value}
        </div>
      )}
    </div>
  );
}

function MetadataList({
  ae,
  rows,
}: {
  ae: Ae;
  rows: { label: string; value: string }[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((row, i) => (
        <div
          key={row.label}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            alignItems: 'baseline',
            gap: 16,
            padding: '14px 4px',
            borderTop: i === 0 ? 'none' : `0.5px solid ${ae.line}`,
          }}
        >
          <span style={{ fontFamily: ae.fontBody, fontSize: 13.5, color: ae.textDim }}>
            {row.label}
          </span>
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 14,
              fontWeight: 500,
              color: ae.text,
              letterSpacing: '0.04em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function DetailRow({
  ae,
  k,
  v,
  last,
}: {
  ae: Ae;
  k: string;
  v: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '10px 0',
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
  /** Wind speed in km/h. Conversion to user-pref mph happens inside `formatSpeed`. */
  windKph: number;
  speedUnit: 'mph' | 'kph';
  ae: Ae;
}) {
  const spreadDeg = (windDeg + 180) % 360;
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px 8px 10px',
        borderRadius: 12,
        background: 'rgba(15,18,24,0.72)',
        border: `0.5px solid rgba(${RED_RGB}, 0.35)`,
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        boxShadow: `0 0 0 1px rgba(${RED_RGB}, 0.05), 0 10px 28px rgba(0,0,0,0.5)`,
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        style={{ transform: `rotate(${spreadDeg}deg)` }}
      >
        <line
          x1="11"
          y1="18"
          x2="11"
          y2="5"
          stroke={RED}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <polygon points="6,8 11,2 16,8" fill={RED} />
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

function OpenInMapsButton({ ae, href, className }: { ae: Ae; href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inc-open-btn${className ? ` ${className}` : ''}`}
      style={{
        height: 56,
        width: '100%',
        borderRadius: ae.radius,
        border: 'none',
        cursor: 'pointer',
        background: `linear-gradient(180deg, ${RED}, #C72E25)`,
        color: '#fff',
        fontFamily: ae.fontMono,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.20em',
        textTransform: ae.chipUpper ? 'uppercase' : 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        textDecoration: 'none',
        boxShadow:
          '0 0 0 0.5px rgba(255,255,255,0.10) inset, 0 1px 0 rgba(255,255,255,0.16) inset, 0 10px 30px rgba(240,68,56,0.40), 0 2px 0 rgba(0,0,0,0.3)',
        transition: 'transform .18s cubic-bezier(0.2, 0.7, 0.3, 1)',
      }}
    >
      <Icon name="external" size={16} color="#fff" strokeWidth={2.2} />
      Open in Maps
    </a>
  );
}

function BackToMap({ ae }: { ae: Ae }) {
  return (
    <Link
      href="/map"
      className="inc-back"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px 6px 8px',
        borderRadius: 8,
        background: 'transparent',
        border: `0.5px solid ${ae.line}`,
        color: ae.textDim,
        cursor: 'pointer',
        fontFamily: ae.fontMono,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.16em',
        textTransform: ae.chipUpper ? 'uppercase' : 'none',
        textDecoration: 'none',
      }}
    >
      <Icon
        name="chevron"
        size={13}
        color={ae.textDim}
        style={{ transform: 'rotate(180deg)' }}
      />
      Back to Map
    </Link>
  );
}
