'use client';

// The map screen. Owns the selection, the filter and the two-column layout, and
// loads the map lazily so leaflet never reaches the server bundle.

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@/components/Icon';
import { FilterChips, type FireFilter } from '@/components/map/FilterChips';
import { IncidentsRail, type RailTab } from '@/components/map/IncidentsRail';
import type { MapSelection } from '@/components/map/MapImpl';
import { severityOf } from '@/lib/severity';
import { useAesthetic } from '@/lib/aesthetic';
import { distanceMiles } from '@/lib/composite-risk';
import { matchIncidentByFemaTitle } from '@/lib/fema-match';
import { useFiresAroundMe, useNamedIncidentsNear } from '@/lib/queries';
import type { RiskLevel } from '@/lib/theme';
import { useUserLocation } from '@/lib/use-location';
import { useUnits, type DistanceUnit } from '@/lib/use-units';

// A busy region returns hundreds of detections, so cap what we draw.
const MAX_FIRMS_MARKERS = 120;
// The rail lists every one in distance order, so a pin always has a card to match.
const INCIDENT_RADIUS_MI = 100;
const INCIDENT_LIMIT = 30;

// Loaded lazily. Leaflet reaches for window the moment it's imported.
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
  const units = useUnits();
  const incidentsQ = useNamedIncidentsNear(loc.coords, INCIDENT_RADIUS_MI, INCIDENT_LIMIT);
  const firesQ = useFiresAroundMe(loc.coords, 250); // satellite, last 24h
  const fires = useMemo(() => incidentsQ.data ?? [], [incidentsQ.data]);
  // Keep the nearest, up to the cap.
  const satelliteTotal = firesQ.data?.features.length ?? 0;
  const satellites = useMemo(() => {
    const all = firesQ.data?.features ?? [];
    if (all.length <= MAX_FIRMS_MARKERS) return all;
    const dist = (f: (typeof all)[number]) =>
      distanceMiles(loc.coords, { lat: f.properties.lat, lon: f.properties.lon });
    return [...all].sort((a, b) => dist(a) - dist(b)).slice(0, MAX_FIRMS_MARKERS);
  }, [firesQ.data, loc.coords]);
  const searchParams = useSearchParams();

  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [filter, setFilter] = useState<FireFilter>('all');
  // Kept up here so a click on the map can open the matching tab.
  const [railTab, setRailTab] = useState<RailTab>('incidents');

  // Seeded with the view the map opens on, so the scale bar is right before the
  // first event arrives.
  const [mapState, setMapState] = useState<{ lat: number; zoom: number }>({
    lat: loc.coords.lat,
    zoom: 8,
  });
  useEffect(() => {
    const onState = (e: Event) => {
      const detail = (e as CustomEvent<{ lat: number; zoom: number }>).detail;
      setMapState(detail);
    };
    window.addEventListener('ember-map-state', onState);
    return () => window.removeEventListener('ember-map-state', onState);
  }, []);
  const scale = useMemo(
    () => computeScale(mapState.lat, mapState.zoom, units.distance),
    [mapState, units.distance],
  );

  // Arriving from Safety's "Show on Map". With no convincing match, select nothing.
  // Opening on the wrong fire labelled as the declared one is worse. Remember which
  // title we acted on, or one latched boolean swallows every handoff after the first.
  const lastIntentRef = useRef<string | null>(null);
  useEffect(() => {
    if (searchParams.get('from') !== 'fema') {
      lastIntentRef.current = null;
      return;
    }
    if (fires.length === 0) return;
    const title = searchParams.get('title');
    const intentKey = title ?? '';
    if (lastIntentRef.current === intentKey) return;
    const match = title ? matchIncidentByFemaTitle(title, fires) : null;
    if (match) {
      setSelection({ kind: 'incident', id: match.id });
      lastIntentRef.current = intentKey;
    } else if (!title) {
      // Nothing to match against, so nothing to retry.
      lastIntentRef.current = intentKey;
    }
    // A title with no match yet gets another chance once GPS resolves and the
    // incident feed refetches nearer the disaster.
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

  // Drop a selection the current data no longer contains, or the footer sits
  // there reporting a distance of several thousand miles after a location change.
  // Matched on coordinates. A refetch hands back new objects.
  useEffect(() => {
    if (!selection) return;
    if (selection.kind === 'incident') {
      if (!visibleFires.find((f) => f.id === selection.id)) setSelection(null);
      return;
    }
    const { lat, lon } = selection.feature.properties;
    const stillPresent = satellites.some(
      (s) => s.properties.lat === lat && s.properties.lon === lon,
    );
    if (!stillPresent) setSelection(null);
  }, [selection, visibleFires, satellites]);

  // Only fires on a real selection change, so browsing the tabs by hand wins.
  useEffect(() => {
    if (selection?.kind === 'fire') setRailTab('hotspots');
    else if (selection?.kind === 'incident') setRailTab('incidents');
  }, [selection]);

  // Switching tabs by hand clears the selection, because the footer belongs to the
  // feed you just left. Map clicks go through the effect above and keep theirs.
  const changeRailTab = (t: RailTab) => {
    if (t !== railTab) setSelection(null);
    setRailTab(t);
  };

  return (
    <div
      className="app-map-layout"
      style={{
        position: 'relative',
        width: '100%',
        height: 'calc(100vh - 80px)',
        background: ae.bg,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: '1fr 380px',
      }}
    >
      {/* Map canvas */}
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

        {/* Filter chips, top left */}
        <div className="app-map-filter-bar" style={{ position: 'absolute', top: 20, left: 20, right: 20, zIndex: 8 }}>
          <FilterChips active={filter} onChange={setFilter} counts={counts} />
        </div>

        {/* Zoom controls, right side */}
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

        {/* Scale indicator, bottom left, lifted above the MapTiler logo. */}
        <div
          style={{
            position: 'absolute',
            bottom: 44,
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
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Bar with tick caps at both ends. Width tracks the zoom. */}
            <div
              style={{
                position: 'relative',
                width: scale.widthPx,
                height: 10,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 4,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: ae.text,
                  borderRadius: 1,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: 2,
                  height: 10,
                  background: ae.text,
                  borderRadius: 1,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  width: 2,
                  height: 10,
                  background: ae.text,
                  borderRadius: 1,
                }}
              />
            </div>
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                color: ae.text,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {scale.label}
            </span>
          </div>
        </div>
      </div>

      {/* Right rail */}
      <IncidentsRail
        fires={visibleFires}
        selection={selection}
        onSelect={setSelection}
        locationLabel={loc.label}
        severityOf={severityOf}
        isLoading={incidentsQ.isLoading}
        // The two feeds fail separately. One being down still leaves the
        // other worth showing. Only losing both counts as an outage.
        incidentsError={incidentsQ.isError}
        satellitesError={firesQ.isError}
        onRetry={() => {
          incidentsQ.refetch();
          firesQ.refetch();
        }}
        satellites={satellites}
        satelliteTotal={satelliteTotal}
        satellitesLoading={firesQ.isLoading}
        tab={railTab}
        onTabChange={changeRailTab}
        userCoords={loc.coords}
        radiusMi={INCIDENT_RADIUS_MI}
        incidentsUpdatedAt={incidentsQ.dataUpdatedAt}
        satellitesUpdatedAt={firesQ.dataUpdatedAt}
      />
    </div>
  );
}

// Meters per pixel at the equator, fully zoomed out. Leaflet's own scale control
// uses the same number.
const MERCATOR_RES_Z0 = 156543.03392;
const METERS_PER_MILE = 1609.344;

/** A round number for the scale bar, aiming for about 80 pixels wide. */
function computeScale(
  lat: number,
  zoom: number,
  unit: DistanceUnit,
): { label: string; widthPx: number } {
  const metersPerPx =
    (MERCATOR_RES_Z0 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  const unitMeters = unit === 'mi' ? METERS_PER_MILE : 1000;
  const targetPx = 80;
  const targetUnits = (targetPx * metersPerPx) / unitMeters;

  // Enough ticks to cover everything from a street to a continent.
  const ticks = [
    0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000,
  ];
  let chosen = ticks[0];
  for (const t of ticks) {
    if (t <= targetUnits) chosen = t;
  }

  const chosenMeters = chosen * unitMeters;
  const widthPx = Math.max(20, Math.min(160, chosenMeters / metersPerPx));
  return { label: `${chosen} ${unit}`, widthPx };
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
          to{' '}
          <code style={{ fontFamily: ae.fontMono, fontSize: 12 }}>web/.env.local</code>{' '}
          and restart the dev server. Free keys are at{' '}
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
