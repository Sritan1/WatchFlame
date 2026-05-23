'use client';

// Safety Plan orchestrator. Pulls user location + named incidents + FEMA disasters
// + nearby shelters, computes the escape bearing, and renders the full layout.

import { useState } from 'react';

import { severityOf } from '@/components/status/ClosestFiresList';
import { AdvisoryRow } from '@/components/safety/AdvisoryRow';
import { ChecklistCard } from '@/components/safety/ChecklistCard';
import { EvacuationCard, type EvacMode } from '@/components/safety/EvacuationCard';
import { FemaBanner } from '@/components/safety/FemaBanner';
import { cardinal8 } from '@/components/ui/CompassRose';
import { PageSection } from '@/components/ui/PageSection';
import { SectionEyebrow } from '@/components/ui/SectionEyebrow';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import { dangerToRisk, type LatLon } from '@/lib/api';
import {
  useActiveDisasters,
  useFiresAroundMe,
  useNamedIncidentsNear,
  useNearbyShelters,
  useRiskFromWeather,
  useWeather,
} from '@/lib/queries';
import { type RiskLevel } from '@/lib/theme';
import { useUserLocation } from '@/lib/use-location';

function bearingTo(from: LatLon, to: LatLon): number {
  const dLon = (to.lon - from.lon) * (Math.PI / 180);
  const lat1 = from.lat * (Math.PI / 180);
  const lat2 = to.lat * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Great-circle distance in miles (haversine). */
function distanceMiles(a: LatLon, b: LatLon): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function SafetyScreen() {
  const { ae } = useAesthetic();
  const loc = useUserLocation();
  const weather = useWeather(loc.coords);
  const risk = useRiskFromWeather(weather.data, loc.coords);
  const incidents = useNamedIncidentsNear(loc.coords);
  const fires = useFiresAroundMe(loc.coords); // FIRMS satellite hot pixels
  const disasters = useActiveDisasters(loc.coords);
  const shelters = useNearbyShelters(loc.coords);
  const [evacMode, setEvacMode] = useState<EvacMode>('away');

  const riskLevel: RiskLevel = risk.data
    ? dangerToRisk(risk.data.danger_level)
    : 'moderate';

  // Closest fire — pick whichever source has a closer detection. Mobile uses
  // FIRMS for the proximity meter because satellite hits often appear before
  // a named incident is filed. Named incidents win for evacuation routing
  // (richer metadata, real bearing).
  const nearestIncident = incidents.data?.[0] ?? null;
  const nearestSatHit = (() => {
    if (!fires.data?.features?.length) return null;
    let best: { feature: typeof fires.data.features[number]; dist: number } | null = null;
    for (const f of fires.data.features) {
      const d = distanceMiles(loc.coords, { lat: f.properties.lat, lon: f.properties.lon });
      if (!best || d < best.dist) best = { feature: f, dist: d };
    }
    return best;
  })();

  // Source-of-truth for the Closest Active Fire card. Prefer the closer of
  // the two sources; named incident details (name) win the tie if equal.
  const closestDistanceMi: number | null = (() => {
    const fromIncident = nearestIncident?.distance_mi ?? null;
    const fromSat = nearestSatHit?.dist ?? null;
    if (fromIncident == null && fromSat == null) return null;
    if (fromIncident == null) return fromSat;
    if (fromSat == null) return fromIncident;
    return Math.min(fromIncident, fromSat);
  })();
  const closestIsIncident =
    nearestIncident != null &&
    (nearestSatHit == null || (nearestIncident.distance_mi ?? Infinity) <= nearestSatHit.dist);
  const closestName = closestIsIncident ? nearestIncident?.name ?? null : 'Satellite detection';
  const closestCoords: LatLon | null = closestIsIncident && nearestIncident
    ? { lat: nearestIncident.lat, lon: nearestIncident.lon }
    : nearestSatHit
      ? { lat: nearestSatHit.feature.properties.lat, lon: nearestSatHit.feature.properties.lon }
      : null;

  // Severity for the closest detection. Use synthesized severity for named
  // incidents (distance + acres) and fall back to MODERATE for satellite-only
  // (FIRMS has no acres data — can't bucket reliably).
  const nearestSeverity: RiskLevel | null = !closestDistanceMi
    ? null
    : closestIsIncident && nearestIncident
      ? severityOf(nearestIncident)
      : 'moderate';
  const nearestBearing = closestCoords
    ? normalizeBearing(bearingTo(loc.coords, closestCoords))
    : 0;

  const activeDisaster = disasters.data?.active[0];
  const nearestShelter = shelters.data?.[0] ?? null;

  return (
    <PageSection top={36} bottom={56}>
      <SectionEyebrow
        color="#E8B339"
        right={`FEMA · CAL FIRE · NWS · synced ${new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}`}
      >
        Safety Plan · {loc.label}
      </SectionEyebrow>

      {/* Hero */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: ae.fontDisplay,
            fontSize: 48,
            fontWeight: ae.titleWeight,
            letterSpacing: '-0.025em',
            color: ae.text,
            lineHeight: 1.0,
          }}
        >
          Be ready, not rushed.
        </h1>
        <p
          style={{
            margin: '14px 0 0',
            maxWidth: 720,
            fontFamily: ae.fontBody,
            fontSize: 16,
            lineHeight: 1.5,
            color: ae.textDim,
          }}
        >
          A short checklist beats a long plan you won&apos;t read mid-evacuation. These actions are
          sequenced by impact for the conditions in your watch area.
        </p>
      </div>

      {/* FEMA banner — only when there's an active declaration */}
      {activeDisaster ? <FemaBanner disaster={activeDisaster} /> : null}

      {/* 2-col body */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)',
          gap: 20,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ChecklistCard riskLevel={riskLevel} />
          <AdvisoryRow
            riskLevel={riskLevel}
            closestFire={
              closestDistanceMi != null
                ? { distance_mi: closestDistanceMi, name: closestName ?? '—' }
                : null
            }
            closestBearingLabel={closestCoords ? cardinal8(nearestBearing) : ''}
            closestSeverity={nearestSeverity}
            isLoading={incidents.isLoading || fires.isLoading}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {closestDistanceMi != null && closestCoords ? (
            <EvacuationCard
              origin={loc.coords}
              fireBearingDeg={nearestBearing}
              fireDistanceMi={closestDistanceMi}
              riskLevel={riskLevel}
              mode={evacMode}
              onModeChange={setEvacMode}
              nearestShelter={nearestShelter}
            />
          ) : incidents.isLoading || fires.isLoading ? (
            <EvacuationCardSkeleton />
          ) : null}
        </div>
      </div>
    </PageSection>
  );
}

function EvacuationCardSkeleton() {
  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #161B24, #10141B)',
        border: '0.5px solid rgba(255, 255, 255, 0.09)',
        borderRadius: 16,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <Skeleton width={140} height={12} rounded="sm" />
      <Skeleton width={'100%'} height={32} rounded="md" />
      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        <Skeleton width={130} height={130} rounded="full" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton width={120} height={32} rounded="md" />
          <Skeleton width={'90%'} height={11} rounded="sm" />
        </div>
      </div>
      <Skeleton width={'100%'} height={44} rounded="md" />
    </div>
  );
}

function normalizeBearing(b: number): number {
  return ((b % 360) + 360) % 360;
}
