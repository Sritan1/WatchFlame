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
import { bearingTo, THREAT_RADIUS_MI } from '@/lib/composite-risk';
import { resolveEvacDestination } from '@/lib/evac';
import { gmapsDirectionsUrl } from '@/lib/maps';
import { getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { formatDistance, useUnits } from '@/lib/use-units';

export type EvacMode = 'away' | 'shelter';

// Route the user to the edge of the threat zone — the same "edge of relevance"
// radius the proximity meter and the threat model use, so they never disagree.
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
  /** Shelters query errored — shelter mode shows a distinct "unavailable"
   *  empty state (with retry) rather than a bare "none nearby". */
  sheltersError?: boolean;
  /** Retry the shelters query from the shelter-mode error state. */
  onSheltersRetry?: () => void;
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

  // "Shelter" mode with no shelter to route to (query resolved OR errored, not
  // loading). Distinct from the loading state so we show a real empty/error
  // panel instead of silently falling back to the away-from-fire compass and a
  // "Get Directions" button that points nowhere.
  const noShelter =
    mode === 'shelter' && !(sheltersLoading ?? false) && !nearestShelter;

  // Opposite of fire bearing — where to run to. Default to 0 when fire data
  // hasn't arrived; the skeleton hides this anyway.
  const escapeBearing = fireBearingDeg != null ? (fireBearingDeg + 180) % 360 : 0;
  const fireCardinal = fireBearingDeg != null ? cardinal8(fireBearingDeg) : '';

  // Away-from-fire destination, resolved to avoid open water near a coast:
  // straight-away point → ±60° → nearest shelter in that arc → direction-only.
  // (Only meaningful in away mode with a fire; cheap + memoized either way.)
  const awayRes = useMemo(
    () => resolveEvacDestination(origin, escapeBearing, EVAC_DISTANCE_MI, shelters),
    [origin, escapeBearing, shelters],
  );
  // If every straight-line point is water AND shelters are still loading, hold
  // the CTA/note in a transient "finding a route" state — a shelter may still
  // resolve, so don't flash the direction-only verdict.
  const awayResolving =
    mode === 'away' && awayRes.kind === 'direction' && (sheltersLoading ?? false);

  const inShelterMode = mode === 'shelter' && nearestShelter != null;

  // Heading drives the compass + "Head [cardinal]". It follows the ACTUAL chosen
  // direction (shelter bearing, or the resolved away bearing) so it never
  // contradicts where "Get Directions" sends you — same as shelter mode already.
  const headingBearing = inShelterMode
    ? bearingTo(origin, { lat: nearestShelter!.lat, lon: nearestShelter!.lon })
    : awayRes.bearing;
  const headingCardinal = cardinalOf(headingBearing);
  const headingLabel = cardinal8(headingBearing);

  // CTA destination (null = no drive-to point → the button is hidden).
  const dest: LatLon | null = inShelterMode
    ? { lat: nearestShelter!.lat, lon: nearestShelter!.lon }
    : awayRes.kind === 'direction'
      ? null
      : awayRes.dest;

  const ctaLabel =
    mode === 'away' && awayRes.kind === 'shelter' ? 'Directions to shelter' : 'Get Directions';

  // A small fallback chip under the heading so a coastal adjustment is always
  // visible (the primary/direct route shows none). Neutral tone — this is
  // informational, not an alarm.
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

  // Routing note — every distance goes through formatDistance (mi/km follows the
  // Units preference).
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

  // Footer caveat for away mode (shelter mode keeps its own, below).
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
                    // Wrap instead of clipping: the card sits in a narrow 1fr
                    // grid column on laptop, so a 2-letter cardinal ("Head NW")
                    // can exceed the text column. It fits on one line at typical
                    // widths and gracefully wraps on smaller ones.
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
              ? noShelter
                ? 'Shelters open and close quickly during an emergency. Always confirm with official sources before you go.'
                : 'Distances are straight-line. Google Maps figures out actual roads. Always follow official guidance.'
              : noFire
                ? 'No evacuation route needed right now. Conditions can change, so check back if a fire develops nearby.'
                : awayFooter}
          </p>
        </div>

        {/* CTA — skeleton while loading; hidden when there's no destination to
            route to (the no-fire all-clear, or shelter mode with no shelter). */}
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

/** Empty / error state for "Nearest Shelter" mode when there's no shelter to
 *  route to. Mirrors NoFirePanel's ring + text rhythm so the card height stays
 *  stable, and stacks cleanly on mobile via the parent's `app-flex-col`. Uses a
 *  neutral grey tone (no shelter is not an alarm state). */
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
