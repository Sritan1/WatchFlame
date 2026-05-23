'use client';

// Live Map orchestrator. Owns: selected fire id, active filter, layout grid
// (1fr map + 380px rail). Loads MapImpl behind next/dynamic so leaflet stays
// off the server bundle. Renders a friendly placeholder when MAPTILER_KEY
// is missing instead of broken tiles.

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@/components/Icon';
import { FilterChips, type FireFilter } from '@/components/map/FilterChips';
import { IncidentsRail } from '@/components/map/IncidentsRail';
import type { MapSelection } from '@/components/map/MapImpl';
import { severityOf } from '@/components/status/ClosestFiresList';
import { useAesthetic } from '@/lib/aesthetic';
import { useFiresAroundMe, useNamedIncidentsNear } from '@/lib/queries';
import type { RiskLevel } from '@/lib/theme';
import { useUserLocation } from '@/lib/use-location';

// FIRMS satellite hits can number in the hundreds for a busy region. Mobile
// caps at ~100 markers; we do the same to keep the leaflet layer light.
const MAX_FIRMS_MARKERS = 120;
// Named incidents: backend returns up to `INCIDENT_LIMIT` within
// `INCIDENT_RADIUS_MI`. Mobile uses (100, 30) and the map should match so
// drilling out of Bronson, FL shows the same set. The rail then caps its
// scrolling list at RAIL_VISIBLE so it doesn't get unwieldy on dense days.
const INCIDENT_RADIUS_MI = 100;
const INCIDENT_LIMIT = 30;
const RAIL_VISIBLE = 20;

// Behind dynamic({ ssr: false }) — leaflet touches window at import time.
const MapImpl = dynamic(() => import('./MapImpl').then((m) => m.MapImpl), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0B0E12',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255,255,255,0.42)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}
    >
      Loading map…
    </div>
  ),
});

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';

export function MapScreen() {
  const { ae } = useAesthetic();
  const loc = useUserLocation();
  const incidentsQ = useNamedIncidentsNear(loc.coords, INCIDENT_RADIUS_MI, INCIDENT_LIMIT);
  const firesQ = useFiresAroundMe(loc.coords, 250); // NASA FIRMS, last 24h
  const fires = useMemo(() => incidentsQ.data ?? [], [incidentsQ.data]);
  // Cap at MAX_FIRMS_MARKERS, prefer brightest detections (matches mobile).
  const satellites = useMemo(() => {
    const all = firesQ.data?.features ?? [];
    if (all.length <= MAX_FIRMS_MARKERS) return all;
    return [...all]
      .sort((a, b) => (b.properties.brightness ?? 0) - (a.properties.brightness ?? 0))
      .slice(0, MAX_FIRMS_MARKERS);
  }, [firesQ.data]);
  const searchParams = useSearchParams();

  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [filter, setFilter] = useState<FireFilter>('all');

  // Intent handoff from Safety's "Show on Map" — when ?from=fema is present,
  // auto-select the closest named incident once data lands. Mirrors mobile's
  // IntentProvider flow. Handled exactly once per query-param change.
  const intentHandledRef = useRef(false);
  useEffect(() => {
    if (intentHandledRef.current) return;
    if (searchParams.get('from') !== 'fema') return;
    if (fires.length === 0) return;
    setSelection({ kind: 'incident', id: fires[0].id });
    intentHandledRef.current = true;
  }, [fires, searchParams]);

  const counts: Record<FireFilter, number> = useMemo(() => {
    const c = { all: fires.length, low: 0, moderate: 0, high: 0, extreme: 0 } as Record<FireFilter, number>;
    for (const f of fires) c[severityOf(f) as RiskLevel] += 1;
    return c;
  }, [fires]);

  const visibleFires = useMemo(
    () => (filter === 'all' ? fires : fires.filter((f) => severityOf(f) === filter)),
    [fires, filter],
  );

  // Clear selection if the selected incident was filtered out (only applies
  // to incident selections — satellite selections aren't filtered).
  if (
    selection?.kind === 'incident' &&
    !visibleFires.find((f) => f.id === selection.id)
  ) {
    queueMicrotask(() => setSelection(null));
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 'calc(100vh - 64px)',
        background: ae.bg,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: '1fr 380px',
      }}
    >
      {/* MAP CANVAS */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        {MAPTILER_KEY ? (
          <MapImpl
            center={[loc.coords.lat, loc.coords.lon]}
            fires={visibleFires}
            satellites={satellites}
            severityOf={severityOf}
            selection={selection}
            onSelect={setSelection}
            maptilerKey={MAPTILER_KEY}
          />
        ) : (
          <MissingKeyPlaceholder />
        )}

        {/* Filter chips — top-left */}
        <div style={{ position: 'absolute', top: 20, left: 20, right: 20, zIndex: 8 }}>
          <FilterChips active={filter} onChange={setFilter} counts={counts} />
        </div>

        {/* Zoom controls — right */}
        <div
          style={{
            position: 'absolute',
            right: 20,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            zIndex: 8,
          }}
        >
          <ZoomButton dir={1} />
          <ZoomButton dir={-1} />
        </div>

        {/* Scale indicator — bottom-left */}
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(13, 16, 18, 0.78)',
            border: `0.5px solid ${ae.line}`,
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            zIndex: 8,
          }}
        >
          <div
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9.5,
              fontWeight: 600,
              color: ae.textMute,
              letterSpacing: '0.14em',
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            Scale
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 64,
                height: 4,
                borderRadius: 2,
                background: `linear-gradient(90deg, ${ae.text} 50%, ${ae.line} 50%)`,
              }}
            />
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                color: ae.text,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              5 mi
            </span>
          </div>
        </div>
      </div>

      {/* RIGHT RAIL */}
      <IncidentsRail
        fires={visibleFires}
        selection={selection}
        onSelect={setSelection}
        locationLabel={loc.label}
        severityOf={severityOf}
        isLoading={incidentsQ.isLoading}
        satelliteCount={satellites.length}
        userCoords={loc.coords}
        radiusMi={INCIDENT_RADIUS_MI}
        listLimit={RAIL_VISIBLE}
      />
    </div>
  );
}

function ZoomButton({ dir }: { dir: 1 | -1 }) {
  const { ae } = useAesthetic();
  return (
    <button
      type="button"
      aria-label={dir > 0 ? 'Zoom in' : 'Zoom out'}
      onClick={() =>
        window.dispatchEvent(new CustomEvent('ember-map-zoom', { detail: { delta: dir } }))
      }
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        cursor: 'pointer',
        background: 'rgba(13, 16, 18, 0.72)',
        border: `0.5px solid ${ae.line}`,
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: ae.text,
      }}
    >
      <Icon name={dir > 0 ? 'plus' : 'minus'} size={15} color={ae.text} />
    </button>
  );
}

function MissingKeyPlaceholder() {
  const { ae } = useAesthetic();
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'radial-gradient(ellipse at center, #161B24, #0B0E12 80%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <div
          style={{
            margin: '0 auto 18px',
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'rgba(232, 179, 57, 0.10)',
            border: '0.5px solid rgba(232, 179, 57, 0.30)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="map" size={26} color="#E8B339" strokeWidth={1.6} />
        </div>
        <h2
          style={{
            margin: 0,
            fontFamily: ae.fontDisplay,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: ae.titleTracking,
            color: ae.text,
          }}
        >
          Map needs a MapTiler key
        </h2>
        <p
          style={{
            margin: '10px 0 0',
            fontFamily: ae.fontBody,
            fontSize: 14,
            lineHeight: 1.55,
            color: ae.textDim,
          }}
        >
          Add{' '}
          <code
            style={{
              fontFamily: ae.fontMono,
              fontSize: 12,
              background: 'rgba(255,255,255,0.05)',
              padding: '1px 6px',
              borderRadius: 4,
              border: `0.5px solid ${ae.line}`,
            }}
          >
            NEXT_PUBLIC_MAPTILER_KEY
          </code>{' '}
          to <code style={{ fontFamily: ae.fontMono, fontSize: 12 }}>web/.env.local</code> and
          restart the dev server. Free keys are at{' '}
          <a
            href="https://www.maptiler.com/cloud/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#E8B339', textDecoration: 'none' }}
          >
            maptiler.com/cloud
          </a>
          .
        </p>
      </div>
    </div>
  );
}
