'use client';

// Safety Plan orchestrator. Pulls user location + named incidents + FEMA disasters
// + nearby shelters, computes the escape bearing, and renders the full layout.

import { useState } from 'react';

import { AdvisoryRow } from '@/components/safety/AdvisoryRow';
import { ChecklistCard } from '@/components/safety/ChecklistCard';
import { EvacuationCard, type EvacMode } from '@/components/safety/EvacuationCard';
import { FemaBanner } from '@/components/safety/FemaBanner';
import { cardinal8 } from '@/components/ui/CompassRose';
import { DataErrorState } from '@/components/ui/DataErrorState';
import { PageSection } from '@/components/ui/PageSection';
import { SectionEyebrow } from '@/components/ui/SectionEyebrow';
import { useAesthetic } from '@/lib/aesthetic';
import { type LatLon } from '@/lib/api';
import {
  bearingTo,
  bucketOf,
  distanceMiles,
  firmsAgeHours,
  normalizeWeather,
  personalThreatBucket,
} from '@/lib/composite-risk';
import {
  useActiveDisasters,
  useFiresAroundMe,
  useNamedIncidentsNear,
  useNearbyShelters,
  useRiskFromWeather,
  useWeather,
} from '@/lib/queries';
import { floorLow, type RiskLevel } from '@/lib/theme';
import { useUserLocation } from '@/lib/use-location';

// distanceMiles + bearingTo come from web/lib/composite-risk so the threat
// math and the displayed numbers share one implementation. Note: the
// shared bearingTo returns 0–360 (already normalized), so the previous
// `normalizeBearing` call below is now a no-op — kept as a safety net in
// case a future change re-introduces an unnormalized input path.

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

  // Route the fire-weather signal through the same calibration pipeline as
  // Status (normalizeWeather → bucketOf). Mathematically equivalent to the
  // backend's bucket when thresholds are present, but using the shared
  // composite-risk code path means any future tweak (e.g. EXT band tuning)
  // propagates here automatically instead of drifting apart.
  const weatherNormalized: number | null = risk.data
    ? normalizeWeather(risk.data.risk_score, risk.data.regional_thresholds ?? null)
    : null;
  const riskLevel: RiskLevel =
    weatherNormalized != null ? bucketOf(weatherNormalized) : 'moderate';
  // Floor 'low' to 'moderate' for the *other* cards' chrome (Checklist,
  // EvacuationCard) so the page doesn't read as washed-out / grey when
  // conditions are calm. The AdvisoryRow banner uses raw `riskLevel` via the
  // bannerSignal calc below so its copy is accurate ("All Clear" stays
  // green, not amber).
  const chromeLevel: RiskLevel = floorLow(riskLevel);

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

  const nearestBearing = closestCoords
    ? normalizeBearing(bearingTo(loc.coords, closestCoords))
    : 0;

  // FIRMS detection age (hours) — drives the smooth staleness dampener inside
  // personalThreatBucket. Only meaningful when the winning fire is a FIRMS
  // pixel (no named incident); null for incidents (no staleness damp). Reuses
  // the shared helper so the age math lives in one place.
  const closestFirmsAgeHours =
    !closestIsIncident && nearestSatHit
      ? firmsAgeHours(
          nearestSatHit.feature.properties.acq_date,
          nearestSatHit.feature.properties.acq_time,
        )
      : null;

  // Severity for the closest detection. Uses the SHARED personalThreatBucket
  // so the value matches Status's Active Fire Threat and Fire Detail's
  // "Threat to You" tile for the same fire. Same inputs: distance + size +
  // wind alignment + containment dampener + stale-FIRMS dampener.
  const nearestSeverity: RiskLevel | null =
    closestDistanceMi == null
      ? null
      : personalThreatBucket({
          distanceMi: closestDistanceMi,
          acres: closestIsIncident && nearestIncident ? nearestIncident.acres : null,
          containedPct:
            closestIsIncident && nearestIncident ? nearestIncident.contained_pct : null,
          firmsAgeHours: closestFirmsAgeHours,
          windDeg: weather.data?.wind_deg ?? null,
          windSpeedKph: weather.data?.wind_speed ?? null,
          bearingToFireDeg: nearestBearing,
        });

  const activeDisaster = disasters.data?.active[0];

  // Combined Safety Status banner: factors in BOTH local fire-weather (from
  // /risk) AND the closest fire's threat heuristic (distance + size). Rules:
  //   - Both signals at EXTREME → "Evacuation Warning"
  //   - Either signal at HIGH or EXTREME → "Stay Aware" (copy reflects which)
  //   - Otherwise (both ≤ MODERATE) → "All Clear"
  // We never escalate to a literal "Evacuate Immediately" — that's a
  // 911-class call we shouldn't claim authority over.
  const weatherSignal: RiskLevel | null = risk.data ? riskLevel : null;
  const bannerSignal = computeBannerSignal(weatherSignal, nearestSeverity);

  // Loading state: skeleton until ALL inputs we depend on are resolved
  // enough to compute the banner. Uses isLoading (not isFetching) so
  // stale-while-revalidate refetches don't flash a skeleton.
  const bannerLoading =
    weather.isLoading || risk.isLoading || incidents.isLoading || fires.isLoading;

  // CRITICAL safety state: if any core live signal errored, we CANNOT compute a
  // trustworthy banner. Without this guard the banner falls through to "All
  // Clear" (green) on a backend/network failure — affirmatively telling the
  // user they're safe with no data behind it. Show an explicit "unavailable"
  // state + Retry instead. (weather feeding risk means a weather error also
  // surfaces here; risk stays disabled until weather resolves.)
  const safetyDataFailed =
    weather.isError || risk.isError || incidents.isError || fires.isError;
  const retryCoreData = () => {
    weather.refetch();
    risk.refetch();
    incidents.refetch();
    fires.refetch();
    disasters.refetch();
    shelters.refetch();
  };

  return (
    <PageSection top={36} bottom={56}>
      <SectionEyebrow
        color="#E8B339"
        right={`FEMA · NIFC · CAL FIRE · synced ${new Date().toLocaleTimeString([], {
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

      {/* FEMA banner — active declaration, or a compact note when the FEMA
          lookup itself failed (so an outage doesn't silently hide a possible
          declaration). When the core data failed the top banner already covers
          it, so don't double up. */}
      {disasters.isError && !safetyDataFailed ? (
        <DataErrorState
          compact
          title="FEMA disaster status unavailable"
          message="Couldn't reach FEMA — an active declaration for your county may exist but isn't shown. Check FEMA.gov or your local alerts."
          onRetry={() => disasters.refetch()}
        />
      ) : activeDisaster ? (
        <FemaBanner disaster={activeDisaster} />
      ) : null}

      {/* 2-col body */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)',
          gap: 20,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ChecklistCard riskLevel={chromeLevel} />
          {safetyDataFailed ? (
            <DataErrorState
              title="Safety data unavailable"
              message="We can't load current fire and weather data for your area right now, so this screen can't confirm whether you're at risk. Check official sources — NWS, CAL FIRE, and your local emergency alerts — and try again."
              onRetry={retryCoreData}
            />
          ) : (
            <AdvisoryRow
              banner={bannerSignal}
              closestFire={
                closestDistanceMi != null
                  ? { distance_mi: closestDistanceMi, name: closestName ?? '—' }
                  : null
              }
              closestBearingLabel={closestCoords ? cardinal8(nearestBearing) : ''}
              closestSeverity={nearestSeverity}
              isLoading={bannerLoading}
            />
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Render the card whenever we have fire data OR are still loading
              it. The card itself renders skeletons inline for whichever mode
              is still waiting on its data, so the toggle stays interactive. */}
          {(closestDistanceMi != null && closestCoords) ||
          (shelters.data && shelters.data.length > 0) ||
          incidents.isLoading ||
          fires.isLoading ||
          shelters.isLoading ? (
            <EvacuationCard
              origin={loc.coords}
              fireBearingDeg={closestCoords ? nearestBearing : null}
              fireDistanceMi={closestDistanceMi}
              riskLevel={chromeLevel}
              mode={evacMode}
              onModeChange={setEvacMode}
              shelters={shelters.data}
              fireLoading={incidents.isLoading || fires.isLoading}
              sheltersLoading={shelters.isLoading}
            />
          ) : incidents.isError || fires.isError ? (
            // Genuinely no evac routing info: we couldn't load fire/incident
            // locations, so away-from-fire routing is dead. Keyed off the EVAC
            // queries, NOT safetyDataFailed — if only the weather/risk data
            // behind the left banner were down but fires/shelters loaded fine,
            // the card still renders. We only show this when there's actually
            // no evac info to show AND that's because a fetch errored (not a
            // genuine "no fire, no shelters" all-clear, which stays null).
            <DataErrorState
              title="Evacuation routing unavailable"
              message="We can't load nearby fire and incident data right now, so this can't route you away from an active fire. Check your local emergency services and try again."
              onRetry={retryCoreData}
            />
          ) : shelters.isError ? (
            // Fire data is fine (nothing in range) but the shelter lookup
            // failed — surface that instead of showing nothing.
            <DataErrorState
              compact
              title="Shelter data unavailable"
              message="Couldn't load nearby shelters. Try again, or check Red Cross / local emergency services directly."
              onRetry={() => shelters.refetch()}
            />
          ) : null}
        </div>
      </div>
    </PageSection>
  );
}

function normalizeBearing(b: number): number {
  return ((b % 360) + 360) % 360;
}

/** Build the Safety Status banner from the two independent signals.
 *
 *  - **weather**: raw fire-weather risk from /risk (low | moderate | high |
 *    extreme). Driven by VPD × wind × drought × NDVI/season at the user's
 *    location.
 *  - **threat**: per-fire distance + size + wind + containment + staleness
 *    heuristic for the closest active fire (low | moderate | high | extreme).
 *    Computed upstream as `nearestSeverity` via personalThreatBucket() so it
 *    matches Status's Active Fire Threat and Fire Detail's "Threat to You".
 *
 *  Decision matrix (per user spec — no "EVACUATE IMMEDIATELY" copy, since
 *  that's a 911-class instruction we shouldn't claim authority over):
 *
 *  | weather | threat  | banner                                    |
 *  | ------- | ------- | ----------------------------------------- |
 *  | EXT     | EXT     | Evacuation Warning (orange)               |
 *  | HIGH+   | HIGH+   | Stay Aware — combined copy (amber)        |
 *  | HIGH+   | ≤ MOD   | Stay Aware — weather copy (amber)         |
 *  | ≤ MOD   | HIGH+   | Stay Aware — threat copy (amber)          |
 *  | ≤ MOD   | ≤ MOD   | All Clear (green)                         |
 *
 *  Returns `level` as the palette tier (low | moderate | high — never
 *  'extreme' since the only EXT+EXT case maps to 'high' / orange).
 */
export type BannerSignal = {
  level: RiskLevel;
  title: string;
  subtitle: string;
};

function computeBannerSignal(
  weather: RiskLevel | null,
  threat: RiskLevel | null,
): BannerSignal {
  const isElevated = (r: RiskLevel | null) => r === 'high' || r === 'extreme';
  const weatherHot = isElevated(weather);
  const threatHot = isElevated(threat);

  if (weather === 'extreme' && threat === 'extreme') {
    return {
      level: 'high',
      title: 'Evacuation Warning',
      subtitle:
        'Both local fire weather and a nearby active fire are at extreme levels. Prepare to evacuate and follow official guidance from local authorities.',
    };
  }
  if (weatherHot && threatHot) {
    return {
      level: 'moderate',
      title: 'Stay Aware',
      subtitle:
        'Fire weather is elevated and an active fire has been detected nearby. Review your evacuation plan and monitor conditions closely.',
    };
  }
  if (weatherHot) {
    return {
      level: 'moderate',
      title: 'Stay Aware',
      subtitle:
        'Conditions favor fire growth. Review your plan and keep an eye on local alerts.',
    };
  }
  if (threatHot) {
    return {
      level: 'moderate',
      title: 'Stay Aware',
      subtitle:
        'An active fire is nearby. Review your evacuation plan and stay alert for changes.',
    };
  }
  return {
    level: 'low',
    title: 'All Clear',
    subtitle: 'No immediate fire risk for your area. Stay informed and check back regularly.',
  };
}
