'use client';

// The actual leaflet map. Must stay lazily loaded, because leaflet reaches for
// window the moment it is imported.

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

/** What's selected, either a named incident or a single satellite pixel. */
export type MapSelection =
  | { kind: 'incident'; id: string }
  | { kind: 'fire'; feature: FireFeature };

// A floor on the circle size, so a small fire is still big enough to click.
const MIN_INCIDENT_RADIUS_M = 500;
const DEFAULT_INCIDENT_ACRES = 100;

/** Acres to a circle radius in meters, treating the fire as round. */
function acresToRadiusMeters(acres: number): number {
  const sqMeters = Math.max(0, acres) * 4046.86;
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

/** How fierce a detection is. Radiative power is the real measure, with
 *  brightness as the fallback when a satellite doesn't report it. */
function satIntensity(s: FireFeature): number {
  const f = s.properties.frp;
  if (f != null) return f;
  const b = s.properties.brightness;
  return b != null ? b - 300 : 0;
}

/** Our own panes, so the flames stack predictably against the incident markers.
 *  Leaflet's per-marker offsets fight its own latitude ordering and lose, while a
 *  pane is its own stacking context and simply wins. */
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

/** Moves the camera on a selection or location change. The key includes the
 *  center, or switching saved locations with nothing selected leaves the map
 *  sitting where it was. */
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
  /** The named incidents. */
  fires: NamedIncident[];
  /** Drawn as flames that stay the same size at any zoom. */
  satellites: FireFeature[];
  severityOf: (f: NamedIncident) => RiskLevel;
  selection: MapSelection | null;
  onSelect: (sel: MapSelection | null) => void;
  maptilerKey: string;
}) {
  // Hold onto the icons, or leaflet rebuilds their DOM every render.
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

  // Capped, with a floor so a cluster of weak pixels gets none. Keeps the number
  // of expensive animations bounded however many detections arrive.
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

  // The selected one is built separately below, so selecting a fire doesn't
  // rebuild every other flame.
  const satIcons = useMemo(() => {
    const m = new Map<string, L.DivIcon>();
    for (const s of satellites) {
      const key = satKey(s);
      m.set(key, satelliteFlameIcon(bloomKeys.has(key) ? 'bloom' : 'base', false, key));
    }
    return m;
  }, [satellites, bloomKeys]);

  // The selected one, which is bigger and throws sparks. Never more than one.
  const selectedFlameIcon = useMemo(
    () =>
      selectedSatKey
        ? satelliteFlameIcon(bloomKeys.has(selectedSatKey) ? 'bloom' : 'base', true, selectedSatKey)
        : null,
    [selectedSatKey, bloomKeys],
  );

  const mapRef = useRef<LeafletMap | null>(null);

  // Watches for a tile outage, shared with the mini-map.
  const { showTilesNote, tileEventHandlers } = useTileHealth();

  // The zoom buttons float outside the map's tree, so they reach it by event.
  useEffect(() => {
    const onZoom = (e: Event) => {
      const detail = (e as CustomEvent<{ delta: number }>).detail;
      mapRef.current?.zoomIn(detail.delta);
    };
    window.addEventListener('ember-map-zoom', onZoom);
    return () => window.removeEventListener('ember-map-zoom', onZoom);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', isolation: 'isolate' }}>
    <FlameGradientDef />
    <MapContainer
      ref={mapRef}
      center={center}
      // Wide enough to open on the region instead of a single city.
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

      {/* Order matters, because whatever renders later sits on top and wins the click.
          Circles first, then the halo, then the satellite pixels, which are small
          and must stay clickable even inside a circle. */}

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

      {/* Satellite detections, each a roughly 375m hot spot from the last day. */}
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

/** Announces the view whenever it moves, for the floating scale bar. */
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
    // Once on mount as well, or the scale bar stays blank until something moves.
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
