'use client';

// The suggested-direction card. The compass points away from the nearest fire, and
// Get Directions opens maps at a real destination rather than a heading.

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
import { bearingTo, THREAT_RADIUS_MI } from '@/lib/composite-risk';
import { resolveEvacDestination } from '@/lib/evac';
import { gmapsDirectionsUrl } from '@/lib/maps';
import { getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { formatDistance, useUnits } from '@/lib/use-units';

export type EvacMode = 'away' | 'shelter';

// The edge of the threat radius, the same distance the proximity meter and the
// threat model use, so none of them contradict each other.
const EVAC_DISTANCE_MI = THREAT_RADIUS_MI;

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
  sheltersError,
  onSheltersRetry,
}: {
  origin: LatLon;
  /** Which way the nearest fire lies, in degrees. Null while loading. */
  fireBearingDeg: number | null;
  /** How far away it is, in miles. Null while loading. */
  fireDistanceMi: number | null;
  riskLevel: RiskLevel;
  mode: EvacMode;
  onModeChange: (m: EvacMode) => void;
  /** Open ones first, then by distance. The first is the destination. */
  shelters: Shelter[] | undefined;
  /** The fire feeds are in flight, so the away mode shows skeletons. */
  fireLoading?: boolean;
  /** The shelter feed is in flight, so shelter mode shows skeletons. */
  sheltersLoading?: boolean;
  /** Gets its own state, not a bare "none nearby". */
  sheltersError?: boolean;
  /** Try the shelters again from that error state. */
  onSheltersRetry?: () => void;
}) {
  const { ae, accent } = useAesthetic();
  const units = useUnits();
  const r = getRisk(riskLevel, accent);
  const [shelterInfoOpen, setShelterInfoOpen] = useState(false);

  // Open ones sort first, so this is the nearest open shelter whenever any are.
  const nearestShelter = shelters?.[0] ?? null;
  const otherOpen = (shelters ?? []).filter(
    (s) => s.activated && s.id !== nearestShelter?.id,
  );

  // The middle skeletons while its mode's data loads, but the toggle stays live
  // so you can switch modes during the wait.
  const isBodyLoading =
    mode === 'shelter' ? sheltersLoading ?? false : fireLoading ?? false;

  // An all-clear beats a compass pointing away from a fire that isn't there. The
  // card stays, so shelter mode is still reachable.
  const noFire =
    mode === 'away' &&
    !(fireLoading ?? false) &&
    (fireBearingDeg == null || fireDistanceMi == null);

  // Kept apart from the loading state, or the card falls back to the away compass
  // and offers directions to nowhere.
  const noShelter =
    mode === 'shelter' && !(sheltersLoading ?? false) && !nearestShelter;

  // Straight away from the fire. Zero until the data lands, behind the skeleton.
  const escapeBearing = fireBearingDeg != null ? (fireBearingDeg + 180) % 360 : 0;
  const fireCardinal = fireBearingDeg != null ? cardinal8(fireBearingDeg) : '';

  // Where "away" actually lands, avoiding the ocean. See evac.ts for the order.
  const awayRes = useMemo(
    () => resolveEvacDestination(origin, escapeBearing, EVAC_DISTANCE_MI, shelters),
    [origin, escapeBearing, shelters],
  );
  // Every direction is water and the shelters haven't arrived. Wait instead of
  // announcing there is nowhere to go. One might still turn up.
  const awayResolving =
    mode === 'away' && awayRes.kind === 'direction' && (sheltersLoading ?? false);

  const inShelterMode = mode === 'shelter' && nearestShelter != null;

  // The compass follows the chosen destination, so it can never point one way
  // while the directions button sends you another.
  const headingBearing = inShelterMode
    ? bearingTo(origin, { lat: nearestShelter!.lat, lon: nearestShelter!.lon })
    : awayRes.bearing;
  const headingCardinal = cardinalOf(headingBearing);
  const headingLabel = cardinal8(headingBearing);

  // Where the button goes. Null hides it.
  const dest: LatLon | null = inShelterMode
    ? { lat: nearestShelter!.lat, lon: nearestShelter!.lon }
    : awayRes.kind === 'direction'
      ? null
      : awayRes.dest;

  const ctaLabel =
    mode === 'away' && awayRes.kind === 'shelter' ? 'Directions to shelter' : 'Get Directions';

  // Only shows when the route had to be adjusted around water.
  const fallbackChip: string | null =
    mode !== 'away' || awayResolving
      ? null
      : awayRes.kind === 'rotated'
        ? 'Adjusted for the coast'
        : awayRes.kind === 'shelter'
          ? 'Routing to nearest shelter'
          : awayRes.kind === 'direction'
            ? 'Direction only, no route'
            : null;

  // Every distance here honors the miles or kilometres preference.
  const fireNote =
    fireDistanceMi != null
      ? `Fire is ${fireCardinal} at ${formatDistance(fireDistanceMi, units.distance, 0)}`
      : '';
  let subtext = '';
  if (inShelterMode) {
    subtext = `${formatDistance(nearestShelter!.distance_mi, units.distance, 1)} ${headingLabel} away`;
  } else if (fireBearingDeg != null && fireDistanceMi != null) {
    subtext = awayResolving
      ? `Finding a route away from the fire · ${fireNote}`
      : awayRes.kind === 'primary'
        ? `Routing ${formatDistance(EVAC_DISTANCE_MI, units.distance, 0)} away · ${fireNote}`
        : awayRes.kind === 'rotated'
          ? `Open land is ${headingLabel} · ${fireNote}`
          : awayRes.kind === 'shelter'
            ? `Nearest shelter, ${formatDistance(awayRes.shelter.distance_mi, units.distance, 1)} ${headingLabel} · ${fireNote}`
            : `Head inland away from the fire · ${fireNote}`;
  }

  // The caveat under away mode. Shelter mode has its own further down.
  const awayFooter = awayResolving
    ? 'Suggestion only. Finding a drive-to point away from the fire. Always follow official guidance.'
    : awayRes.kind === 'primary'
      ? `Suggestion only. Targets a point ${formatDistance(EVAC_DISTANCE_MI, units.distance, 0)} opposite the nearest fire. Google Maps figures out actual roads. Always follow official guidance.`
      : awayRes.kind === 'rotated'
        ? 'Suggestion only. A point straight away from the fire lands over water, so this targets the nearest open land in that general direction. Google Maps figures out actual roads. Always follow official guidance.'
        : awayRes.kind === 'shelter'
          ? 'Suggestion only. The area straight away from the fire is over water, so this routes to the nearest shelter that is still away from the fire. Always follow official guidance.'
          : sheltersError
            ? 'The area away from the fire is over water and nearby shelters could not be loaded, so no drive-to point is shown. Head inland, away from the fire, and follow official evacuation routes.'
            : 'There is open water in every direction away from the fire near you, so no drive-to point is shown. Head inland, away from the fire, and follow official evacuation routes.';

  return (
    <div
      style={{
        ...glassCommandCard(r.glow),
        position: 'relative',
        overflow: 'hidden',
        borderRadius: ae.radiusLg,
      }}
    >
      {/* Top radial glow, the command card's "lit from above" signature. */}
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

        {/* Compass and headline (skeleton while the data for this mode loads) */}
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
          ) : noShelter ? (
            <NoShelterPanel ae={ae} error={sheltersError ?? false} onRetry={onSheltersRetry} />
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
                    fontSize: 48,
                    fontWeight: ae.titleWeight,
                    letterSpacing: '-0.04em',
                    color: ae.text,
                    lineHeight: 0.95,
                    // Wrap, don't clip. "Head NW" outruns a narrow column.
                    overflowWrap: 'break-word',
                    textShadow: `0 0 34px rgba(${r.glow}, 0.26)`,
                  }}
                >
                  Head {headingLabel}
                </div>
                {fallbackChip ? (
                  <div
                    style={{
                      marginTop: 10,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 10px',
                      borderRadius: 99,
                      border: `0.5px solid ${ae.line}`,
                      background: 'rgba(255,255,255,0.04)',
                      fontFamily: ae.fontMono,
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      color: ae.textMute,
                      textTransform: ae.chipUpper ? 'uppercase' : 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {fallbackChip}
                  </div>
                ) : null}
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

        {/* Shelter detail, live against potential. Shelter mode only, and only
            once the shelter data has resolved. */}
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
              ? noShelter
                ? 'Shelters open and close quickly during an emergency. Always confirm with official sources before you go.'
                : 'Distances are straight-line. Google Maps figures out actual roads. Always follow official guidance.'
              : noFire
                ? 'No evacuation route needed right now. Conditions can change, so check back if a fire develops nearby.'
                : awayFooter}
          </p>
        </div>

        {/* CTA. Skeleton while loading, hidden when there is nowhere to route to.
            That's the all-clear, or shelter mode with no shelter. */}
        {!noFire && !noShelter ? (
          <div style={{ marginTop: 18 }}>
            {isBodyLoading || awayResolving ? (
              <Skeleton width={'100%'} height={44} rounded="md" />
            ) : dest ? (
              <Button
                variant="primary"
                icon="external"
                color={r.color}
                full
                style={{ height: 56, fontSize: 18, fontWeight: 700, borderRadius: 14 }}
                onClick={() => window.open(gmapsDirectionsUrl(origin, dest), '_blank', 'noopener,noreferrer')}
              >
                {ctaLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <ShelterInfoModal open={shelterInfoOpen} onClose={() => setShelterInfoOpen(false)} />
    </div>
  );
}

/** The all-clear. Laid out like the compass it replaces, so the card holds its
 *  shape, with a way into shelter mode. */
function NoFirePanel({
  ae,
  hasShelters,
  onFindShelter,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  hasShelters: boolean;
  onFindShelter: () => void;
}) {
  const C = RISK_LEVELS.low.color;
  const RGB = RISK_LEVELS.low.glow;
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

/** Shelter mode with nowhere to send anyone. Grey, not red. No shelter nearby is
 *  not an emergency by itself. */
function NoShelterPanel({
  ae,
  error,
  onRetry,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  error: boolean;
  onRetry?: () => void;
}) {
  const C = '#9ca3af';
  const RGB = '156, 163, 175';
  const title = error ? 'Shelter info unavailable' : 'No open shelters nearby';
  const body = error
    ? 'We could not load nearby shelters right now. Check the Red Cross shelter map or your local emergency services for the closest one.'
    : 'No open shelters are listed near you right now. Check the Red Cross shelter map or your local emergency services for the closest one.';
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
            border: `1.5px solid rgba(${RGB}, 0.30)`,
            boxShadow: `0 0 30px rgba(${RGB}, 0.12), inset 0 0 26px rgba(${RGB}, 0.06)`,
          }}
        />
        <Icon name="pin" size={40} color={C} strokeWidth={1.6} />
      </div>
      <div style={{ minWidth: 0 }}>
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
          {title}
        </div>
        <p
          style={{
            margin: '10px 0 0',
            maxWidth: 340,
            fontFamily: ae.fontBody,
            fontSize: 13.5,
            color: ae.textDim,
            lineHeight: 1.5,
          }}
        >
          {body}
        </p>
        {error && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
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
            Try again →
          </button>
        ) : null}
      </div>
    </>
  );
}
