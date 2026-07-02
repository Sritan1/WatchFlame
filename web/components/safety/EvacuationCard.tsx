'use client';

// "Suggested Direction" featured card. Compass shows escape bearing (opposite
// of nearest-fire bearing); "Get Directions" opens Google Maps with a real
// destination computed from spherical trig (destPoint helper).
// The segmented toggle swaps between "Away From Fire" and "Nearest Shelter".
// Info icon (shelter mode only) → ShelterInfoModal.

import { useMemo, useState } from 'react';

import { Icon } from '@/components/Icon';
import { glassCommandCard } from '@/components/safety/glass';
import { ShelterInfoModal } from '@/components/safety/ShelterInfoModal';
import { OtherOpenShelters, ShelterDetailTile } from '@/components/safety/ShelterStatus';
import { Button } from '@/components/ui/Button';
import { CompassRose, cardinal8, cardinalOf } from '@/components/ui/CompassRose';
import { GlassSegmented } from '@/components/ui/GlassSegmented';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import type { LatLon, Shelter } from '@/lib/api';
import { bearingTo } from '@/lib/composite-risk';
import { getRisk, type RiskLevel } from '@/lib/theme';
import { formatDistance, useUnits } from '@/lib/use-units';

export type EvacMode = 'away' | 'shelter';

const EVAC_DISTANCE_MI = 50;

/** Compute a destination lat/lon `distMi` from origin in `bearingDeg` direction. */
function destPoint(origin: LatLon, bearingDeg: number, distMi: number): LatLon {
  const R = 3958.8; // Earth radius in miles
  const δ = distMi / R;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (origin.lat * Math.PI) / 180;
  const λ1 = (origin.lon * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return { lat: (φ2 * 180) / Math.PI, lon: (λ2 * 180) / Math.PI };
}

function gmapsDirectionsUrl(origin: LatLon, dest: LatLon): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lon}&destination=${dest.lat},${dest.lon}&travelmode=driving`;
}

export function EvacuationCard({
  origin,
  fireBearingDeg,
  fireDistanceMi,
  riskLevel,
  mode,
  onModeChange,
  shelters,
  fireLoading,
  sheltersLoading,
}: {
  origin: LatLon;
  /** Bearing FROM user TO nearest fire (deg, 0=N). Null while loading. */
  fireBearingDeg: number | null;
  /** Distance to nearest fire in miles (for the "fire is X at Y mi" caption). Null while loading. */
  fireDistanceMi: number | null;
  riskLevel: RiskLevel;
  mode: EvacMode;
  onModeChange: (m: EvacMode) => void;
  /** Nearby shelters, sorted activated-first then by distance (from
   *  /shelters). The first is the nearest target; activated ones get the
   *  confirmed/live treatment. */
  shelters: Shelter[] | undefined;
  /** Fires/incidents query is in flight — show skeletons in 'away' mode. */
  fireLoading?: boolean;
  /** Shelters query is in flight — show skeletons in 'shelter' mode. */
  sheltersLoading?: boolean;
}) {
  const { ae, accent } = useAesthetic();
  const units = useUnits();
  const r = getRisk(riskLevel, accent);
  const [shelterInfoOpen, setShelterInfoOpen] = useState(false);

  // Nearest shelter is the compass target; activated shelters sort first, so
  // when any are open the target is the nearest open one. `otherOpen` powers a
  // compact list of the remaining open shelters beneath the detail tile.
  const nearestShelter = shelters?.[0] ?? null;
  const otherOpen = (shelters ?? []).filter(
    (s) => s.activated && s.id !== nearestShelter?.id,
  );

  // Body (compass + headline + subtext + CTA) shows skeletons when the data
  // for the current mode is still in flight. Chrome (eyebrow + toggle +
  // caveat) stays interactive so the user can flip modes during the load.
  // When `shelters` resolves with no nearby results, `nearestShelter` is
  // null but we're NOT loading — the existing fallback (silently using the
  // away-from-fire compass/heading in shelter mode) takes over.
  const isBodyLoading =
    mode === 'shelter' ? sheltersLoading ?? false : fireLoading ?? false;

  // "Away" mode with no nearby fire (the query resolved, nothing in range) —
  // show a calm all-clear state instead of a misleading compass or a perpetual
  // skeleton. The card still renders so the Nearest Shelter mode stays reachable.
  const noFire =
    mode === 'away' &&
    !(fireLoading ?? false) &&
    (fireBearingDeg == null || fireDistanceMi == null);

  // Opposite of fire bearing — where to run to. Default to 0 when fire data
  // hasn't arrived; the skeleton hides this anyway.
  const escapeBearing = fireBearingDeg != null ? (fireBearingDeg + 180) % 360 : 0;
  const fireCardinal = fireBearingDeg != null ? cardinal8(fireBearingDeg) : '';

  const dest = useMemo(() => {
    if (mode === 'shelter' && nearestShelter) {
      return { lat: nearestShelter.lat, lon: nearestShelter.lon };
    }
    return destPoint(origin, escapeBearing, EVAC_DISTANCE_MI);
  }, [mode, nearestShelter, origin, escapeBearing]);

  const headingCardinal = mode === 'shelter' && nearestShelter
    ? cardinalOf(bearingTo(origin, { lat: nearestShelter.lat, lon: nearestShelter.lon }))
    : cardinalOf(escapeBearing);

  const headingBearing = mode === 'shelter' && nearestShelter
    ? bearingTo(origin, { lat: nearestShelter.lat, lon: nearestShelter.lon })
    : escapeBearing;

  const headingLabel = mode === 'shelter' && nearestShelter
    ? cardinal8(bearingTo(origin, { lat: nearestShelter.lat, lon: nearestShelter.lon }))
    : cardinal8(escapeBearing);

  const subtext = mode === 'shelter' && nearestShelter
    ? `${formatDistance(nearestShelter.distance_mi, units.distance, 1)} ${headingLabel} away`
    : fireDistanceMi != null
      ? `Routing ${formatDistance(EVAC_DISTANCE_MI, units.distance, 0)} away · fire is ${fireCardinal} at ${formatDistance(fireDistanceMi, units.distance, 0)}`
      : '';

  return (
    <div
      style={{
        ...glassCommandCard(r.glow),
        position: 'relative',
        overflow: 'hidden',
        borderRadius: ae.radiusLg,
      }}
    >
      {/* Top radial glow — the command card's "lit from above" signature. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 200,
          pointerEvents: 'none',
          background: `radial-gradient(120% 90% at 50% -25%, rgba(${r.glow}, 0.09), transparent 70%)`,
        }}
      />

      <div className="app-card-pad" style={{ position: 'relative', padding: '24px 26px 26px' }}>
        {/* Eyebrow */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: r.color,
                boxShadow: `0 0 8px ${r.color}`,
                animation: 'ember-flicker 1.8s ease-in-out infinite',
              }}
            />
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 11.5,
                fontWeight: 600,
                letterSpacing: '0.18em',
                color: r.color,
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              Suggested Direction
            </span>
          </span>
          {mode === 'shelter' ? (
            <button
              type="button"
              onClick={() => setShelterInfoOpen(true)}
              aria-label="About these shelters"
              style={{
                width: 28,
                height: 28,
                borderRadius: 99,
                background: 'rgba(255, 255, 255, 0.04)',
                border: `0.5px solid ${ae.line}`,
                color: ae.textMute,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="info" size={14} color={ae.textMute} strokeWidth={1.7} />
            </button>
          ) : null}
        </div>

        {/* Mode toggle */}
        <div style={{ marginTop: 20 }}>
          <GlassSegmented<EvacMode>
            value={mode}
            options={[
              { id: 'away', label: 'Away From Fire' },
              { id: 'shelter', label: 'Nearest Shelter' },
            ]}
            onChange={onModeChange}
            glowRgb={r.glow}
            size="md"
          />
        </div>

        {/* Compass + headline (skeleton while the data for this mode loads) */}
        <div
          className="app-flex-col"
          style={{ marginTop: 26, display: 'flex', gap: 18, alignItems: 'center' }}
        >
          {isBodyLoading ? (
            <>
              <Skeleton width={128} height={128} rounded="full" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Skeleton width={180} height={48} rounded="md" />
                <Skeleton width={'80%'} height={12} rounded="sm" />
              </div>
            </>
          ) : noFire ? (
            <NoFirePanel
              ae={ae}
              hasShelters={nearestShelter != null}
              onFindShelter={() => onModeChange('shelter')}
            />
          ) : (
            <>
              <div
                style={{
                  position: 'relative',
                  width: 128,
                  height: 128,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Slow radar sweep behind the rose. */}
                <span
                  className="sf-radar-sweep"
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: -2,
                    borderRadius: '50%',
                    background: `conic-gradient(from 0deg, rgba(${r.glow}, 0.45), rgba(${r.glow}, 0.10) 60deg, transparent 120deg)`,
                    opacity: 0.9,
                    pointerEvents: 'none',
                  }}
                />
                <CompassRose
                  bearingDeg={headingBearing}
                  cardinal={headingCardinal}
                  color={r.color}
                  glowRgb={r.glow}
                  size={122}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: ae.fontDisplay,
                    fontSize: 56,
                    fontWeight: ae.titleWeight,
                    letterSpacing: '-0.04em',
                    color: ae.text,
                    lineHeight: 0.9,
                    whiteSpace: 'nowrap',
                    textShadow: `0 0 34px rgba(${r.glow}, 0.26)`,
                  }}
                >
                  Head {headingLabel}
                </div>
                <div
                  style={{
                    marginTop: 12,
                    fontFamily: ae.fontMono,
                    fontSize: 13,
                    color: ae.textDim,
                    letterSpacing: '0.02em',
                    lineHeight: 1.4,
                  }}
                >
                  {subtext}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Shelter detail — confirmed/live vs potential, integrated into the
            shelter flow. Only in shelter mode once shelter data has resolved. */}
        {mode === 'shelter' && !isBodyLoading && nearestShelter ? (
          <>
            <ShelterDetailTile shelter={nearestShelter} ae={ae} />
            <OtherOpenShelters shelters={otherOpen} origin={origin} ae={ae} />
          </>
        ) : null}

        {/* Caveat */}
        <div
          style={{
            marginTop: 18,
            paddingTop: 16,
            borderTop: `0.5px solid ${ae.line}`,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: ae.fontBody,
              fontSize: 13.5,
              lineHeight: 1.55,
              color: ae.textDim,
            }}
          >
            {mode === 'shelter'
              ? 'Distances are straight-line. Google Maps figures out actual roads. Always follow official guidance.'
              : noFire
                ? 'No evacuation route needed right now. Conditions can change, so check back if a fire develops nearby.'
                : `Suggestion only. Targets a point ${formatDistance(EVAC_DISTANCE_MI, units.distance, 0)} opposite the nearest fire. Google Maps figures out actual roads. Always follow official guidance.`}
          </p>
        </div>

        {/* CTA — skeleton while loading; hidden in the all-clear (no-fire)
            state since there's no destination to route to. */}
        {!noFire ? (
          <div style={{ marginTop: 18 }}>
            {isBodyLoading ? (
              <Skeleton width={'100%'} height={44} rounded="md" />
            ) : (
              <Button
                variant="primary"
                icon="external"
                color={r.color}
                full
                style={{ height: 56, fontSize: 18, fontWeight: 700, borderRadius: 14 }}
                onClick={() => window.open(gmapsDirectionsUrl(origin, dest), '_blank', 'noopener,noreferrer')}
              >
                Get Directions
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <ShelterInfoModal open={shelterInfoOpen} onClose={() => setShelterInfoOpen(false)} />
    </div>
  );
}

/** Calm all-clear state for "Away From Fire" when nothing is burning nearby.
 *  Mirrors the compass + text layout so the card stays visually consistent,
 *  and offers a path into the shelter view. */
function NoFirePanel({
  ae,
  hasShelters,
  onFindShelter,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  hasShelters: boolean;
  onFindShelter: () => void;
}) {
  const C = '#3FB68B';
  const RGB = '63, 182, 139';
  return (
    <>
      <div
        style={{
          position: 'relative',
          width: 130,
          height: 130,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: `1.5px solid rgba(${RGB}, 0.35)`,
            boxShadow: `0 0 30px rgba(${RGB}, 0.16), inset 0 0 26px rgba(${RGB}, 0.07)`,
          }}
        />
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M5 12.5 L10 17.5 L19 7"
            stroke={C}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 6px ${C})` }}
          />
        </svg>
      </div>
      <div>
        <div
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 30,
            fontWeight: ae.titleWeight,
            letterSpacing: '-0.02em',
            color: ae.text,
            lineHeight: 1.05,
          }}
        >
          No fire nearby
        </div>
        <div
          style={{
            marginTop: 8,
            fontFamily: ae.fontMono,
            fontSize: 11.5,
            color: ae.textDim,
            letterSpacing: '0.04em',
            lineHeight: 1.4,
          }}
        >
          You&apos;re not in a current evacuation path.
        </div>
        {hasShelters ? (
          <button
            type="button"
            onClick={onFindShelter}
            style={{
              marginTop: 12,
              padding: 0,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: C,
              fontFamily: ae.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            Find a nearby shelter →
          </button>
        ) : null}
      </div>
    </>
  );
}
