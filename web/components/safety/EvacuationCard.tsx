'use client';

// "Suggested Direction" featured card. Compass shows escape bearing (opposite
// of nearest-fire bearing); "Get Directions" opens Google Maps with a real
// destination computed from spherical trig (destPoint helper).
// The segmented toggle swaps between "Away From Fire" and "Nearest Shelter".
// Info icon (shelter mode only) → ShelterInfoModal.

import { useMemo, useState } from 'react';

import { Icon } from '@/components/Icon';
import { ShelterInfoModal } from '@/components/safety/ShelterInfoModal';
import { Button } from '@/components/ui/Button';
import { CompassRose, cardinal8, cardinalOf } from '@/components/ui/CompassRose';
import { GlassSegmented } from '@/components/ui/GlassSegmented';
import { GridPattern } from '@/components/ui/GridPattern';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import type { LatLon, Shelter } from '@/lib/api';
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
  nearestShelter,
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
  nearestShelter: Shelter | null;
  /** Fires/incidents query is in flight — show skeletons in 'away' mode. */
  fireLoading?: boolean;
  /** Shelters query is in flight — show skeletons in 'shelter' mode. */
  sheltersLoading?: boolean;
}) {
  const { ae, accent } = useAesthetic();
  const units = useUnits();
  const r = getRisk(riskLevel, accent);
  const [shelterInfoOpen, setShelterInfoOpen] = useState(false);

  // Body (compass + headline + subtext + CTA) shows skeletons when the data
  // for the current mode is still in flight. Chrome (eyebrow + toggle +
  // caveat) stays interactive so the user can flip modes during the load.
  // When `shelters` resolves with no nearby results, `nearestShelter` is
  // null but we're NOT loading — the existing fallback (silently using the
  // away-from-fire compass/heading in shelter mode) takes over.
  const isBodyLoading =
    mode === 'shelter'
      ? sheltersLoading ?? false
      : (fireLoading ?? false) || fireBearingDeg == null || fireDistanceMi == null;

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
    ? `${nearestShelter.activated ? 'OPEN · ' : ''}${nearestShelter.name} · ${formatDistance(nearestShelter.distance_mi, units.distance, 1)} ${headingLabel}`
    : fireDistanceMi != null
      ? `Routing ${formatDistance(EVAC_DISTANCE_MI, units.distance, 0)} away · fire is ${fireCardinal} at ${formatDistance(fireDistanceMi, units.distance, 0)}`
      : '';

  return (
    <div
      className="ember-card ember-hero-card"
      style={{
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: `0.5px solid rgba(${r.glow}, 0.30)`,
        borderRadius: ae.radiusLg,
        boxShadow: `0 24px 60px rgba(${r.glow}, 0.15)`,
        ['--card-accent' as string]: r.color,
        ['--card-accent-soft' as string]: `rgba(${r.glow}, 0.18)`,
      }}
    >
      <GridPattern opacity={0.04} />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: -80,
          right: -80,
          width: 280,
          height: 280,
          borderRadius: '50%',
          filter: 'blur(32px)',
          pointerEvents: 'none',
          background: `radial-gradient(circle, rgba(${r.glow}, 0.20), transparent 70%)`,
        }}
      />

      <div style={{ position: 'relative', padding: 24 }}>
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
                fontSize: 10,
                fontWeight: 700,
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
                width: 22,
                height: 22,
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
              <Icon name="info" size={11} color={ae.textMute} strokeWidth={1.8} />
            </button>
          ) : null}
        </div>

        {/* Mode toggle */}
        <div style={{ marginTop: 14 }}>
          <GlassSegmented<EvacMode>
            value={mode}
            options={[
              { id: 'away', label: 'Away From Fire' },
              { id: 'shelter', label: 'Nearest Shelter' },
            ]}
            onChange={onModeChange}
            color={r.color}
            glowRgb={r.glow}
            size="sm"
          />
        </div>

        {/* Compass + headline (skeleton while the data for this mode loads) */}
        <div style={{ marginTop: 22, display: 'flex', gap: 18, alignItems: 'center' }}>
          {isBodyLoading ? (
            <>
              <Skeleton width={130} height={130} rounded="full" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Skeleton width={180} height={42} rounded="md" />
                <Skeleton width={'80%'} height={11} rounded="sm" />
              </div>
            </>
          ) : (
            <>
              <CompassRose
                bearingDeg={headingBearing}
                cardinal={headingCardinal}
                color={r.color}
                glowRgb={r.glow}
                size={130}
              />
              <div>
                <div
                  style={{
                    fontFamily: ae.fontDisplay,
                    fontSize: 52,
                    fontWeight: ae.titleWeight,
                    letterSpacing: '-0.04em',
                    color: ae.text,
                    lineHeight: 0.95,
                  }}
                >
                  Head {headingLabel}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontFamily: ae.fontMono,
                    fontSize: 11.5,
                    color: ae.textDim,
                    letterSpacing: '0.04em',
                    lineHeight: 1.4,
                  }}
                >
                  {subtext}
                </div>
              </div>
            </>
          )}
        </div>

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
              fontSize: 12.5,
              lineHeight: 1.55,
              color: ae.textDim,
            }}
          >
            {mode === 'shelter'
              ? 'Distances are straight-line. Google Maps figures out actual roads. Always follow official guidance.'
              : `Suggestion only — targets a point ${formatDistance(EVAC_DISTANCE_MI, units.distance, 0)} opposite the nearest fire. Google Maps figures out actual roads. Always follow official guidance.`}
          </p>
        </div>

        {/* CTA — skeleton while loading; disabled to prevent a misrouted click. */}
        <div style={{ marginTop: 18 }}>
          {isBodyLoading ? (
            <Skeleton width={'100%'} height={44} rounded="md" />
          ) : (
            <Button
              variant="primary"
              icon="external"
              color={r.color}
              full
              onClick={() => window.open(gmapsDirectionsUrl(origin, dest), '_blank', 'noopener,noreferrer')}
            >
              Get Directions
            </Button>
          )}
        </div>
      </div>

      <ShelterInfoModal open={shelterInfoOpen} onClose={() => setShelterInfoOpen(false)} />
    </div>
  );
}

function bearingTo(from: LatLon, to: LatLon): number {
  const dLon = (to.lon - from.lon) * (Math.PI / 180);
  const lat1 = from.lat * (Math.PI / 180);
  const lat2 = to.lat * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}
