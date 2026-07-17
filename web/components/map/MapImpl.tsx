'use client';

// Leaflet + MapTiler — must stay behind `next/dynamic({ ssr: false })` because
// leaflet touches `window` at module load. The screen orchestrator (MapScreen)
// is the only place that should import this.

import L, { type Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import { AttributionControl, Circle, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';

import type { FireFeature, NamedIncident } from '@/lib/api';
import { FlameGradientDef, satelliteFlameIcon } from '@/components/map/flame-marker';
import { incidentNucleusIcon } from '@/components/map/incident-marker';
import { MapTilerLogo } from '@/components/ui/MapTilerLogo';
import { SourceNote } from '@/components/ui/SourceNote';
import { satKey } from '@/lib/firms';
import {
  LEAFLET_ATTRIB_PREFIX,
  MAP_ATTRIBUTION,
  MAPTILER_TILE_URL,
  useTileHealth,
} from '@/lib/map-tiles';
import { getRisk, hexToRgb, type RiskLevel } from '@/lib/theme';

/** Two-kind selection: named-incident from NIFC/Cal Fire OR a single
 *  FIRMS satellite hot-pixel. Mirrors mobile's `SelectedItem` discriminator. */
export type MapSelection =
  | { kind: 'incident'; id: string }
  | { kind: 'fire'; feature: FireFeature };

// Mobile uses MIN_INCIDENT_RADIUS_M = 500 so small fires stay clickable; we
// match that here so the visual reads identically.
const MIN_INCIDENT_RADIUS_M = 500;
const DEFAULT_INCIDENT_ACRES = 100;

/** Convert acres → circle radius in meters. Same formula as
 *  app/lib/geo.ts's acresToRadiusMeters: r = sqrt(area / π). */
function acresToRadiusMeters(acres: number): number {
  const sqMeters = Math.max(0, acres) * 4046.86; // acres → m²
  return Math.sqrt(sqMeters / Math.PI);
}

function incidentRadiusM(inc: NamedIncident): number {
  return Math.max(
    acresToRadiusMeters(inc.acres ?? DEFAULT_INCIDENT_ACRES),
    MIN_INCIDENT_RADIUS_M,
  );
}

function userIcon(): L.DivIcon {
  const html = `
    <div class="user-marker">
      <div class="user-marker__pulse"></div>
      <div class="user-marker__core"></div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'user-marker-wrapper',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

/** Fire energy used to rank detections for the bloom tier. FRP (fire radiative
 *  power) is the truest measure; brightness (Kelvin, ~300 baseline) is the
 *  fallback when a source omits FRP. Both land in a roughly comparable 0-100+
 *  range for active fire. The flame icon itself lives in ./flame-marker. */
function satIntensity(s: FireFeature): number {
  const f = s.properties.frp;
  if (f != null) return f;
  const b = s.properties.brightness;
  return b != null ? b - 300 : 0;
}

/** Custom leaflet panes so the satellite flames layer predictably against the
 *  incident markers, instead of relying on marker zIndexOffset (which competes
 *  with leaflet's latitude-derived z and can lose). Panes are separate stacking
 *  contexts, so their z-index wins outright:
 *    firms      (550) — non-selected flames: above the perimeter circles
 *                       (overlayPane 400), below the incident markers (600).
 *    firms-top  (620) — the selected flame: above the incident markers so its
 *                       sparks read, still below tooltips (650). */
function MapPanes() {
  const map = useMap();
  useEffect(() => {
    const firms = map.getPane('firms') ?? map.createPane('firms');
    firms.style.zIndex = '550';
    const firmsTop = map.getPane('firms-top') ?? map.createPane('firms-top');
    firmsTop.style.zIndex = '620';
  }, [map]);
  return null;
}

/** Imperative camera helper — pans/zooms when the selection OR the user's
 *  watched-location center changes. The key folds `center` in for the
 *  no-selection branch so switching saved locations actually flies the map;
 *  previously the key was just `null` for "nothing selected" and a center
 *  change went unnoticed. */
function CameraController({
  center,
  selection,
  fires,
}: {
  center: [number, number];
  selection: MapSelection | null;
  fires: NamedIncident[];
}) {
  const map = useMap();
  const lastKeyRef = useRef<string | null>(null);

  const key = selection
    ? selection.kind === 'incident'
      ? `incident:${selection.id}`
      : `fire:${selection.feature.properties.lat},${selection.feature.properties.lon}`
    : `center:${center[0].toFixed(4)},${center[1].toFixed(4)}`;

  useEffect(() => {
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    if (!selection) {
      map.flyTo(center, 8, { duration: 0.6 });
      return;
    }
    if (selection.kind === 'incident') {
      const fire = fires.find((f) => f.id === selection.id);
      if (!fire) return;
      map.flyTo([fire.lat, fire.lon], 12, { duration: 0.6 });
    } else {
      const { lat, lon } = selection.feature.properties;
      map.flyTo([lat, lon], 13, { duration: 0.6 });
    }
  }, [key, selection, fires, center, map]);

  return null;
}

export function MapImpl({
  center,
  fires,
  satellites,
  severityOf,
  selection,
  onSelect,
  maptilerKey,
}: {
  center: [number, number];
  /** Named (tracked) incidents from NIFC + Cal Fire. */
  fires: NamedIncident[];
  /** Satellite hot-pixel detections from NASA FIRMS. Rendered as flame glyphs
   *  (divIcon — fixed pixel size regardless of zoom). */
  satellites: FireFeature[];
  severityOf: (f: NamedIncident) => RiskLevel;
  selection: MapSelection | null;
  onSelect: (sel: MapSelection | null) => void;
  maptilerKey: string;
}) {
  // Memoize icons so leaflet doesn't recreate DOM on every render.
  const icons = useMemo(() => {
    const map = new Map<string, L.DivIcon>();
    for (const f of fires) {
      const sev = severityOf(f);
      map.set(`${f.id}:false`, incidentNucleusIcon(sev, false));
      map.set(`${f.id}:true`, incidentNucleusIcon(sev, true));
    }
    return map;
  }, [fires, severityOf]);

  const userMarker = useMemo(() => userIcon(), []);

  const selectedIncidentId = selection?.kind === 'incident' ? selection.id : null;
  const selectedSatKey = selection?.kind === 'fire' ? satKey(selection.feature) : null;
  const selectedFire = selectedIncidentId ? fires.find((f) => f.id === selectedIncidentId) : null;
  const selectedSeverity = selectedFire ? severityOf(selectedFire) : null;

  // The "hottest few" detections that earn the pulsing bloom. Top ~15% by fire
  // energy, capped at 6 and floored so a cluster of weak pixels gets none — this
  // is what bounds the number of expensive (glow) animations regardless of how
  // many detections come back.
  const bloomKeys = useMemo(() => {
    const set = new Set<string>();
    if (satellites.length === 0) return set;
    const scored = satellites
      .map((s) => ({ key: satKey(s), v: satIntensity(s) }))
      .sort((a, b) => b.v - a.v);
    const cap = Math.min(6, Math.max(1, Math.ceil(scored.length * 0.15)));
    for (let i = 0; i < cap && i < scored.length; i++) {
      if (scored[i].v > 12) set.add(scored[i].key);
    }
    return set;
  }, [satellites]);

  // Non-selected flame icons, memoized per detection so leaflet doesn't rebuild
  // DOM every render. Selection is handled separately (below) so toggling a
  // selection doesn't invalidate this whole map.
  const satIcons = useMemo(() => {
    const m = new Map<string, L.DivIcon>();
    for (const s of satellites) {
      const key = satKey(s);
      m.set(key, satelliteFlameIcon(bloomKeys.has(key) ? 'bloom' : 'base', false, key));
    }
    return m;
  }, [satellites, bloomKeys]);

  // The single selected detection's icon (adds sparks + enlarges). At most one.
  const selectedFlameIcon = useMemo(
    () =>
      selectedSatKey
        ? satelliteFlameIcon(bloomKeys.has(selectedSatKey) ? 'bloom' : 'base', true, selectedSatKey)
        : null,
    [selectedSatKey, bloomKeys],
  );

  const mapRef = useRef<LeafletMap | null>(null);

  // Client-side MapTiler/OSM tile-outage watcher, shared with the mini-map.
  const { showTilesNote, tileEventHandlers } = useTileHealth();

  // Expose imperative zoom controls via global event so the floating buttons
  // (which sit outside MapContainer's tree) can call into the map.
  useEffect(() => {
    const onZoom = (e: Event) => {
      const detail = (e as CustomEvent<{ delta: number }>).detail;
      mapRef.current?.zoomIn(detail.delta);
    };
    window.addEventListener('ember-map-zoom', onZoom);
    return () => window.removeEventListener('ember-map-zoom', onZoom);
  }, []);

  // Broadcast current center + zoom whenever they change. MapScreen reads
  // this to draw the scale bar (which depends on latitude + zoom). The first
  // emit runs once on mount so the bar isn't blank before the first move.

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', isolation: 'isolate' }}>
    <FlameGradientDef />
    <MapContainer
      ref={mapRef}
      center={center}
      // Zoom 8 ~ regional view (~150 mi diameter) — matches mobile's
      // latitudeDelta=4 initial framing so the user lands seeing the same
      // neighborhood-cluster context, not a city-level crop.
      zoom={8}
      zoomControl={false}
      attributionControl={false}
      style={{ width: '100%', height: '100%', background: '#0B0E12' }}
    >
      <AttributionControl prefix={LEAFLET_ATTRIB_PREFIX} />
      <MapPanes />
      <TileLayer
        url={MAPTILER_TILE_URL(maptilerKey)}
        attribution={MAP_ATTRIBUTION}
        eventHandlers={tileEventHandlers}
      />

      <Marker position={center} icon={userMarker} />

      {/* Render order (bottom → top within the SVG pane):
       *   1. Incident perimeter circles (largest, lowest priority)
       *   2. Dashed selection halo
       *   3. Satellite hot-pixels (small but on top so they stay clickable
       *      even when inside an incident circle — mobile-equivalent UX)
       *   4. Incident divIcon markers (markerPane — always on top)
       *
       *  Within a leaflet pane, later JSX renders are visually + click-priority
       *  higher. So we render incident Circles first, then satellites on top. */}

      {fires.map((f) => {
        const sev = severityOf(f);
        const color = getRisk(sev).color;
        const isSel = selectedIncidentId === f.id;
        return (
          <Circle
            key={`circle-${f.id}`}
            center={[f.lat, f.lon]}
            radius={incidentRadiusM(f)}
            pathOptions={{
              color,
              weight: isSel ? 2.5 : 1.5,
              fillColor: color,
              fillOpacity: isSel ? 0.20 : 0.12,
              opacity: 0.85,
            }}
            eventHandlers={{
              click: () => onSelect(isSel ? null : { kind: 'incident', id: f.id }),
            }}
          />
        );
      })}

      {/* Dashed selection halo around the active incident */}
      {selectedFire && selectedSeverity ? (
        <Circle
          center={[selectedFire.lat, selectedFire.lon]}
          radius={Math.max(incidentRadiusM(selectedFire) * 1.4, 1200)}
          pathOptions={{
            color: getRisk(selectedSeverity).color,
            weight: 1,
            fillOpacity: 0,
            dashArray: '4 6',
          }}
        />
      ) : null}

      {/* FIRMS satellite hot-pixel detections — flame glyphs (see
       *  satelliteFlameIcon). Each is a ~375m thermal anomaly from Suomi NPP /
       *  NOAA-20 / Aqua / Terra in the last 24h. Custom panes (see MapPanes) do
       *  the layering: the 'firms' pane sits beneath the named-incident markers
       *  (the primary layer), and the selected one moves to the 'firms-top' pane
       *  so its sparks read above everything. Panes beat marker zIndexOffset,
       *  which competes with leaflet's latitude-derived z and can't be trusted. */}
      {satellites.map((s, i) => {
        const lat = s.properties.lat;
        const lon = s.properties.lon;
        const key = satKey(s);
        const isSel = selectedSatKey === key;
        const icon = isSel ? (selectedFlameIcon ?? satIcons.get(key)) : satIcons.get(key);
        if (!icon) return null;
        return (
          <Marker
            key={`firms-${i}-${key}`}
            position={[lat, lon]}
            icon={icon}
            pane={isSel ? 'firms-top' : 'firms'}
            eventHandlers={{
              click: () => onSelect(isSel ? null : { kind: 'fire', feature: s }),
            }}
          />
        );
      })}

      {fires.map((f) => {
        const isSel = selectedIncidentId === f.id;
        const icon = icons.get(`${f.id}:${isSel}`) ?? icons.get(`${f.id}:false`);
        if (!icon) return null;
        return (
          <Marker
            key={f.id}
            position={[f.lat, f.lon]}
            icon={icon}
            eventHandlers={{
              click: () => onSelect(isSel ? null : { kind: 'incident', id: f.id }),
            }}
          />
        );
      })}

      <CameraController center={center} selection={selection} fires={fires} />
      <ZoomBroadcaster />
    </MapContainer>
      <MapTilerLogo />
      {showTilesNote ? (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            padding: '8px 13px',
            borderRadius: 10,
            background: 'rgba(13, 16, 18, 0.82)',
            border: '0.5px solid rgba(232, 179, 57, 0.30)',
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            pointerEvents: 'none',
          }}
        >
          <SourceNote text="Map tiles failed to load" />
        </div>
      ) : null}
    </div>
  );
}

/** Watches the leaflet map and dispatches `ember-map-state` whenever the
 *  center or zoom changes. Used by MapScreen's floating scale bar. */
function ZoomBroadcaster() {
  const map = useMap();
  useEffect(() => {
    const emit = () => {
      const c = map.getCenter();
      window.dispatchEvent(
        new CustomEvent('ember-map-state', {
          detail: { lat: c.lat, zoom: map.getZoom() },
        }),
      );
    };
    map.on('zoomend', emit);
    map.on('moveend', emit);
    emit();
    return () => {
      map.off('zoomend', emit);
      map.off('moveend', emit);
    };
  }, [map]);
  return null;
}

// Re-export for type narrowing convenience
export type { NamedIncident };
export { hexToRgb };
