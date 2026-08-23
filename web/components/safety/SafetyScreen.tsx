'use client';

// The Safety screen. Gathers the user's location, nearby fires, any federal
// declaration and the shelters around them, works out which way to go, and lays
// it all out.

import { useEffect, useState } from 'react';

import { AdvisoryRow, type BannerSignal } from '@/components/safety/AdvisoryRow';
import { ChecklistCard } from '@/components/safety/ChecklistCard';
import { EvacuationCard, type EvacMode } from '@/components/safety/EvacuationCard';
import { FemaBanner } from '@/components/safety/FemaBanner';
import { SafetyScene } from '@/components/safety/SafetyScene';
import { cardinal8 } from '@/components/ui/CompassRose';
import { DataErrorState } from '@/components/ui/DataErrorState';
import { PageSection } from '@/components/ui/PageSection';
import { SectionEyebrow } from '@/components/ui/SectionEyebrow';
import { SourceNote } from '@/components/ui/SourceNote';
import { useAesthetic } from '@/lib/aesthetic';
import { femaNote, shelterFeedNote, useSourceHealth } from '@/lib/source-health';
import { useAnyModalOpen } from '@/lib/modal-state';
import { type LatLon } from '@/lib/api';
import {
  bearingTo,
  bucketOf,
  distanceMiles,
  firmsAgeHours,
  normalizeWeather,
  personalThreatBucket,
  THREAT_RADIUS_MI,
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

export function SafetyScreen() {
  const { ae } = useAesthetic();
  const loc = useUserLocation();
  const weather = useWeather(loc.coords);
  const risk = useRiskFromWeather(weather.data, loc.coords);
  // Full threat radius, or a fire just inside it gets dropped by the default.
  const incidents = useNamedIncidentsNear(loc.coords, THREAT_RADIUS_MI);
  const fires = useFiresAroundMe(loc.coords); // FIRMS satellite hot pixels
  const disasters = useActiveDisasters(loc.coords);
  const shelters = useNearbyShelters(loc.coords);
  const [evacMode, setEvacMode] = useState<EvacMode>('away');

  // These routes come back empty instead of failing, so without the health map an
  // outage looks like good news.
  const health = useSourceHealth();
  const femaSourceNote = femaNote(health);
  const shelterSourceNote = shelterFeedNote(health);

  // Stop the backdrop and the compass sweep when nobody can see them.
  const anyModalOpen = useAnyModalOpen();
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const animActive = tabVisible && !anyModalOpen;

  // Same calibration path Status uses, so a future change to the bands reaches
  // this screen too.
  const weatherNormalized: number | null = risk.data
    ? normalizeWeather(risk.data.risk_score, risk.data.regional_thresholds ?? null)
    : null;
  const riskLevel: RiskLevel =
    weatherNormalized != null ? bucketOf(weatherNormalized) : 'moderate';
  // Floor the other cards at moderate so a calm day doesn't grey the page out.
  // The banner keeps the real level, so All Clear stays green.
  const chromeLevel: RiskLevel = floorLow(riskLevel);

  // Whichever feed has something closer. Satellites usually see a fire before
  // anyone files paperwork on it.
  const nearestIncident = incidents.data?.[0] ?? null;
  const nearestSatHit = (() => {
    if (!fires.data?.features?.length) return null;
    let best: { feature: typeof fires.data.features[number]; dist: number } | null = null;
    for (const f of fires.data.features) {
      const d = distanceMiles(loc.coords, { lat: f.properties.lat, lon: f.properties.lon });
      // The feed covers 250 miles, so gate it the way Status does. Otherwise a
      // far pixel poses as the closest fire, kills the all-clear, and points the
      // evacuation compass at nothing.
      if (d > THREAT_RADIUS_MI) continue;
      if (!best || d < best.dist) best = { feature: f, dist: d };
    }
    return best;
  })();

  // What the Closest Active Fire card reads from. Nearer wins, and a named
  // incident takes a tie.
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

  const nearestBearing = closestCoords ? bearingTo(loc.coords, closestCoords) : 0;

  // Damps the threat as it ages. Only applies when a satellite pixel won.
  const closestFirmsAgeHours =
    !closestIsIncident && nearestSatHit
      ? firmsAgeHours(
          nearestSatHit.feature.properties.acq_date,
          nearestSatHit.feature.properties.acq_time,
        )
      : null;

  // The NEAREST fire, not the question Status asks. Status surfaces the most
  // threatening fire in range, Safety answers "what is closest to me", so the two
  // can name different fires and both be right.
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

  const weatherSignal: RiskLevel | null = risk.data ? riskLevel : null;
  const bannerSignal = computeBannerSignal(weatherSignal, nearestSeverity);

  // Keyed on the first load, not any fetch, so a background refresh doesn't flash.
  const bannerLoading =
    weather.isLoading || risk.isLoading || incidents.isLoading || fires.isLoading;
  // Compares two feeds, so it means nothing until both have landed. Show it early
  // and it announces a far fire as the closest, then jumps when a nearer pixel
  // arrives.
  const closestReady = !incidents.isLoading && !fires.isLoading;

  // This one matters. Without the guard, a core signal being down falls through
  // to a green All Clear, telling someone they are safe on no data at all.
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
    <>
      {/* Fixed behind the page, same pattern as the Status backdrop. */}
      <SafetyScene active={animActive} />

      <div
        className={animActive ? undefined : 'ember-anim-paused'}
        style={{ position: 'relative', zIndex: 1 }}
      >
        <PageSection top={28} bottom={56}>
          <SectionEyebrow
            color="#E8B339"
            right={`FEMA · NIFC · CAL FIRE · synced ${new Date().toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })}`}
          >
            Safety · {loc.label}
          </SectionEyebrow>

          {/* Hero */}
          <div style={{ marginBottom: 40 }}>
            <h1
              style={{
                margin: 0,
                fontFamily: ae.fontDisplay,
                fontSize: 'clamp(44px, 5.4vw, 84px)',
                fontWeight: ae.titleWeight,
                letterSpacing: '-0.04em',
                color: ae.text,
                lineHeight: 0.98,
              }}
            >
              Your wildfire safety plan.
            </h1>
            <p
              style={{
                margin: '20px 0 0',
                maxWidth: 760,
                fontFamily: ae.fontBody,
                fontSize: 20,
                lineHeight: 1.5,
                color: ae.textDim,
              }}
            >
              Prepare ahead, and know where to go if a fire reaches your area.
            </p>
          </div>

          {/* A note when the lookup failed, so an outage never hides a real
              declaration. The top banner already covers a core-data failure. */}
          {disasters.isError && !safetyDataFailed ? (
            <DataErrorState
              compact
              title="FEMA disaster status unavailable"
              message="Couldn't reach FEMA. An active declaration for your county may exist but isn't shown. Check FEMA.gov or your local alerts."
              onRetry={() => disasters.refetch()}
            />
          ) : activeDisaster ? (
            <FemaBanner disaster={activeDisaster} />
          ) : femaSourceNote && !disasters.isLoading && !safetyDataFailed ? (
            // Gated on loading. The health store isn't location-scoped and remembers
            // an outage for twenty minutes, which flashes a stale warning otherwise.
            <SourceNote text={femaSourceNote} style={{ marginTop: 6, marginBottom: 6 }} />
          ) : null}

          {/* Status band, full width with the banner and closest fire, or the
              blocking "safety data unavailable" state if a core signal died. */}
          {safetyDataFailed ? (
            <DataErrorState
              title="Safety data unavailable"
              message="Current fire and weather data isn't available for your area right now, so this screen can't confirm whether you're at risk. Check official sources such as the NWS, CAL FIRE, and your local emergency alerts, then try again."
              onRetry={retryCoreData}
            />
          ) : (
            <AdvisoryRow
              banner={bannerSignal}
              closestFire={
                closestReady && closestDistanceMi != null
                  ? { distance_mi: closestDistanceMi, name: closestName ?? '—' }
                  : null
              }
              closestBearingLabel={closestReady && closestCoords ? cardinal8(nearestBearing) : ''}
              closestSeverity={closestReady ? nearestSeverity : null}
              isLoading={bannerLoading}
            />
          )}

          {/* Action band, the checklist beside the suggested-direction card. */}
          <div
            className="app-stack"
            style={{
              marginTop: 20,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.34fr) minmax(0, 1fr)',
              gap: 20,
              alignItems: 'start',
            }}
          >
            <ChecklistCard riskLevel={chromeLevel} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Past the core-data gate this card always renders something. The
                  exception is the fire lookups failing, because routing away from a
                  fire needs to know where it is. Reads the evac queries, not
                  safetyDataFailed. */}
              {incidents.isError || fires.isError ? (
                <DataErrorState
                  title="Evacuation routing unavailable"
                  message="Nearby fire and incident data isn't available right now, so this can't route you away from an active fire. Check your local emergency services and try again."
                  onRetry={retryCoreData}
                />
              ) : (
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
                  sheltersError={shelters.isError}
                  onSheltersRetry={() => shelters.refetch()}
                />
              )}

              {/* One feed dropping still leaves the others, so name which one. The
                  loading gate matters because the health store keeps a down for about
                  20 minutes and isn't location-scoped. */}
              {shelterSourceNote && !shelters.isLoading && !shelters.isError && !safetyDataFailed ? (
                <SourceNote text={shelterSourceNote} />
              ) : null}
            </div>
          </div>
        </PageSection>
      </div>
    </>
  );
}

/** The banner, from the fire weather and the nearest fire. It never says "evacuate
 *  immediately", which is a 911-class instruction and not ours to give. The level is
 *  a palette tier and never extreme, the worst case already maps onto orange. */
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
