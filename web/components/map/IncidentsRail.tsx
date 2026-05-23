'use client';

// 380px right rail: header (with explainer info icon) + scrolling list +
// kind-aware detail card in the footer. Selection can be either a named
// incident (NIFC/Cal Fire) OR a FIRMS satellite hot-pixel. The footer
// shows the appropriate fields per selection kind, with a "Limited data"
// callout for incidents missing acres/containment (mirrors mobile).

import Link from 'next/link';
import { useState } from 'react';

import { Icon } from '@/components/Icon';
import { FireFieldsExplainerModal } from '@/components/map/FireFieldsExplainerModal';
import type { MapSelection } from '@/components/map/MapImpl';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAesthetic } from '@/lib/aesthetic';
import type { FireFeature, LatLon, NamedIncident } from '@/lib/api';
import { getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';
import { formatDistance, useUnits } from '@/lib/use-units';

/** Great-circle distance in miles (haversine) — used to label the satellite
 *  detail card. Named incidents already carry `distance_mi` from the backend. */
function distanceMiles(a: LatLon, b: LatLon): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function IncidentsRail({
  fires,
  selection,
  onSelect,
  locationLabel,
  severityOf,
  isLoading = false,
  satelliteCount = 0,
  userCoords,
  radiusMi = 30,
  listLimit = 20,
}: {
  fires: NamedIncident[];
  selection: MapSelection | null;
  onSelect: (sel: MapSelection | null) => void;
  locationLabel: string;
  severityOf: (f: NamedIncident) => RiskLevel;
  isLoading?: boolean;
  /** Number of FIRMS satellite hot-pixels in view. */
  satelliteCount?: number;
  /** User's current focus point — needed to compute distance to the
   *  selected satellite hit (named incidents carry their own distance). */
  userCoords: LatLon;
  /** Search radius shown in the subtitle ("Within N mi of …"). */
  radiusMi?: number;
  /** Cap on how many incidents appear in the scrolling list. The header
   *  still shows the full count, and the map renders every incident — only
   *  the rail list is sliced to stay readable on dense days. */
  listLimit?: number;
}) {
  const { ae, accent } = useAesthetic();
  const units = useUnits();
  const selectedIncidentId = selection?.kind === 'incident' ? selection.id : null;
  const selected = selectedIncidentId ? fires.find((f) => f.id === selectedIncidentId) ?? null : null;
  const selectedSev = selected ? severityOf(selected) : null;
  const [explainerOpen, setExplainerOpen] = useState(false);

  // Backend already sorts by distance, so the first N are the closest N. If
  // the selected incident is past the cap, splice it in so the user can still
  // see its row when they click a pin on the map.
  const visibleList = (() => {
    if (fires.length <= listLimit) return fires;
    const head = fires.slice(0, listLimit);
    if (selectedIncidentId && !head.some((f) => f.id === selectedIncidentId)) {
      const sel = fires.find((f) => f.id === selectedIncidentId);
      if (sel) return [...head.slice(0, listLimit - 1), sel];
    }
    return head;
  })();
  const truncated = fires.length > visibleList.length;

  return (
    <aside
      style={{
        borderLeft: `0.5px solid ${ae.line}`,
        background: ae.bg,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: 22, borderBottom: `0.5px solid ${ae.line}` }}>
        <div
          style={{
            fontFamily: ae.fontMono,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '0.18em',
            color: ae.textMute,
            textTransform: ae.chipUpper ? 'uppercase' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 99,
                background: ae.textDim,
              }}
            />
            Active Incidents
          </span>
          <button
            type="button"
            onClick={() => setExplainerOpen(true)}
            aria-label="About these fields"
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
        </div>
        {isLoading && fires.length === 0 ? (
          <>
            <div style={{ marginTop: 8 }}>
              <Skeleton width={'70%'} height={28} rounded="md" />
            </div>
            <div style={{ marginTop: 8 }}>
              <Skeleton width={'90%'} height={11} rounded="sm" />
            </div>
          </>
        ) : (
          <>
            <h2
              style={{
                margin: '8px 0 0',
                fontFamily: ae.fontDisplay,
                fontSize: 24,
                fontWeight: ae.titleWeight,
                letterSpacing: '-0.02em',
                color: ae.text,
              }}
            >
              {fires.length} {fires.length === 1 ? 'fire' : 'fires'} in region
            </h2>
            <div
              style={{
                marginTop: 4,
                fontFamily: ae.fontMono,
                fontSize: 11,
                color: ae.textDim,
                letterSpacing: '0.04em',
              }}
            >
              {fires.length > 0
                ? truncated
                  ? `Within ${formatDistance(radiusMi, units.distance, 0)} of ${locationLabel} · showing closest ${visibleList.length} of ${fires.length}`
                  : `Within ${formatDistance(radiusMi, units.distance, 0)} of ${locationLabel} · sorted by distance`
                : 'No active incidents within range.'}
            </div>
            {satelliteCount > 0 ? (
              <div
                style={{
                  marginTop: 10,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 99,
                  background: 'rgba(255, 122, 58, 0.10)',
                  border: '0.5px solid rgba(255, 122, 58, 0.30)',
                  fontFamily: ae.fontMono,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.10em',
                  color: '#ff7a3a',
                  textTransform: ae.chipUpper ? 'uppercase' : 'none',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 99,
                    background: '#ff7a3a',
                    boxShadow: '0 0 6px #ff7a3a',
                  }}
                />
                {satelliteCount} satellite{satelliteCount === 1 ? '' : 's'} detected
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading && fires.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div
                key={i}
                style={{
                  padding: '16px 22px',
                  borderBottom: i < 3 ? `0.5px solid ${ae.line}` : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Skeleton width={70} height={11} rounded="sm" />
                  <Skeleton width={42} height={10} rounded="sm" />
                </div>
                <Skeleton width={'80%'} height={18} rounded="md" />
                <div style={{ marginTop: 6 }}>
                  <Skeleton width={'55%'} height={10} rounded="sm" />
                </div>
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <Skeleton width={36} height={11} rounded="sm" />
                  <Skeleton width={36} height={11} rounded="sm" />
                  <Skeleton width={36} height={11} rounded="sm" />
                </div>
              </div>
            ))
          : null}
        {visibleList.map((f, i) => {
          const sev = severityOf(f);
          const fr = getRisk(sev, accent);
          const isSel = selectedIncidentId === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelect(isSel ? null : { kind: 'incident', id: f.id })}
              style={{
                width: '100%',
                padding: '16px 22px',
                textAlign: 'left',
                background: isSel
                  ? `linear-gradient(90deg, rgba(${fr.glow}, 0.10), transparent)`
                  : 'transparent',
                border: 'none',
                borderBottom: i < visibleList.length - 1 ? `0.5px solid ${ae.line}` : 'none',
                borderLeft: isSel ? `2px solid ${fr.color}` : '2px solid transparent',
                cursor: 'pointer',
                transition: 'background .2s ease',
                color: 'inherit',
                fontFamily: 'inherit',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 99,
                      background: fr.color,
                      boxShadow: `0 0 10px ${fr.color}`,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: ae.fontMono,
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: fr.color,
                      letterSpacing: '0.14em',
                      textTransform: ae.chipUpper ? 'uppercase' : 'none',
                    }}
                  >
                    {RISK_LEVELS[sev].label}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: ae.fontMono,
                    fontSize: 10,
                    color: ae.textMute,
                    letterSpacing: '0.04em',
                  }}
                >
                  #{f.id.split('-').pop()}
                </span>
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontFamily: ae.fontDisplay,
                  fontSize: 16,
                  fontWeight: 600,
                  color: ae.text,
                  letterSpacing: ae.titleTracking,
                }}
              >
                {f.name}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontFamily: ae.fontMono,
                  fontSize: 11,
                  color: ae.textDim,
                }}
              >
                {f.location ?? f.county ?? '—'}
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                }}
              >
                {[
                  { l: 'Dist', v: formatDistance(f.distance_mi, units.distance, 1) },
                  { l: 'Size', v: f.acres != null ? `${f.acres.toLocaleString()} ac` : '—' },
                  { l: 'Cont', v: f.contained_pct != null ? `${f.contained_pct}%` : '—' },
                ].map((s) => (
                  <div key={s.l}>
                    <div
                      style={{
                        fontFamily: ae.fontMono,
                        fontSize: 9,
                        fontWeight: 600,
                        color: ae.textMute,
                        letterSpacing: '0.10em',
                        textTransform: ae.chipUpper ? 'uppercase' : 'none',
                      }}
                    >
                      {s.l}
                    </div>
                    <div
                      style={{
                        marginTop: 2,
                        fontFamily: ae.fontMono,
                        fontSize: 12,
                        color: ae.text,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {s.v}
                    </div>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Kind-aware detail card — incident OR satellite. Always at the
       *  bottom of the rail when something is selected. Mirrors mobile's
       *  bottom-sheet card. */}
      {selection?.kind === 'incident' && selected && selectedSev ? (
        <IncidentDetailCard
          incident={selected}
          severity={selectedSev}
          accentColor={getRisk(selectedSev, accent).color}
          accentGlow={getRisk(selectedSev, accent).glow}
          onClose={() => onSelect(null)}
        />
      ) : null}
      {selection?.kind === 'fire' ? (
        <SatelliteDetailCard
          feature={selection.feature}
          userCoords={userCoords}
          onClose={() => onSelect(null)}
        />
      ) : null}

      <FireFieldsExplainerModal open={explainerOpen} onClose={() => setExplainerOpen(false)} />
    </aside>
  );
}

// ─── Detail cards ─────────────────────────────────────────────────────────

function IncidentDetailCard({
  incident,
  severity,
  accentColor,
  accentGlow,
  onClose,
}: {
  incident: NamedIncident;
  severity: RiskLevel;
  accentColor: string;
  accentGlow: string;
  onClose: () => void;
}) {
  const { ae } = useAesthetic();
  const units = useUnits();
  const limited = incident.acres == null || incident.contained_pct == null;
  return (
    <div
      style={{
        padding: '18px 22px',
        borderTop: `0.5px solid ${ae.line}`,
        background: ae.surface,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: accentColor,
                boxShadow: `0 0 8px ${accentColor}`,
              }}
            />
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10,
                fontWeight: 700,
                color: accentColor,
                letterSpacing: '0.16em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              {incident.source === 'calfire' ? 'Cal Fire incident' : 'Active incident'}
            </span>
          </div>
          <div
            style={{
              marginTop: 4,
              fontFamily: ae.fontDisplay,
              fontSize: 17,
              fontWeight: ae.titleWeight,
              color: ae.text,
              letterSpacing: ae.titleTracking,
            }}
          >
            {incident.name}
          </div>
        </div>
        <CloseButton onClose={onClose} />
      </div>
      <DetailFields
        fields={[
          { l: 'Distance', v: formatDistance(incident.distance_mi, units.distance, 1) },
          { l: 'Size',     v: incident.acres != null ? `${incident.acres.toLocaleString(undefined, { maximumFractionDigits: 0 })} ac` : '—' },
          { l: 'Contained', v: incident.contained_pct != null ? `${Math.round(incident.contained_pct)}%` : '—' },
        ]}
      />
      {limited ? (
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            border: '0.5px solid rgba(255, 255, 255, 0.09)',
            background: 'rgba(255, 255, 255, 0.03)',
            fontFamily: ae.fontBody,
            fontSize: 11.5,
            lineHeight: 1.4,
            color: ae.textDim,
          }}
        >
          <strong style={{ color: ae.text, fontWeight: 700 }}>Limited data. </strong>
          This is a managed wildfire incident — not a single satellite detection.
          Size and containment are reported by {incident.agency ?? 'the managing agency'} and
          may not have been published yet.
        </div>
      ) : null}
      <Link
        href={`/fire-detail?lat=${incident.lat}&lon=${incident.lon}`}
        className="px-btn px-primary"
        style={{
          height: 44,
          width: '100%',
          borderRadius: 10,
          border: 'none',
          fontFamily: ae.fontDisplay,
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: ae.titleTracking,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          background: accentColor,
          color: '#fff',
          boxShadow: `0 6px 18px rgba(${accentGlow}, 0.35)`,
          textDecoration: 'none',
          cursor: 'pointer',
        }}
      >
        Full Details →
      </Link>
    </div>
  );
}

function SatelliteDetailCard({
  feature,
  userCoords,
  onClose,
}: {
  feature: FireFeature;
  userCoords: LatLon;
  onClose: () => void;
}) {
  const { ae } = useAesthetic();
  const units = useUnits();
  const p = feature.properties;
  const dist = distanceMiles(userCoords, { lat: p.lat, lon: p.lon });
  const detailHref =
    `/fire-detail?lat=${p.lat}&lon=${p.lon}`
    + (p.brightness != null ? `&brightness=${p.brightness}` : '')
    + (p.confidence != null ? `&confidence=${encodeURIComponent(p.confidence)}` : '')
    + (p.acq_date != null ? `&acq_date=${p.acq_date}` : '')
    + (p.acq_time != null ? `&acq_time=${p.acq_time}` : '')
    + (p.satellite != null ? `&satellite=${encodeURIComponent(p.satellite)}` : '')
    + (p.daynight != null ? `&daynight=${encodeURIComponent(p.daynight)}` : '');
  return (
    <div
      style={{
        padding: '18px 22px',
        borderTop: `0.5px solid ${ae.line}`,
        background: ae.surface,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: '#ff7a3a',
                boxShadow: '0 0 8px #ff7a3a',
              }}
            />
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10,
                fontWeight: 700,
                color: '#ff7a3a',
                letterSpacing: '0.16em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              Live detection
            </span>
          </div>
          <div
            style={{
              marginTop: 4,
              fontFamily: ae.fontDisplay,
              fontSize: 17,
              fontWeight: ae.titleWeight,
              color: ae.text,
              letterSpacing: ae.titleTracking,
            }}
          >
            Satellite fire pixel
          </div>
        </div>
        <CloseButton onClose={onClose} />
      </div>
      <DetailFields
        fields={[
          { l: 'Distance',   v: formatDistance(dist, units.distance, 1) },
          { l: 'Brightness', v: p.brightness != null ? `${Math.round(p.brightness)}K` : '—' },
          { l: 'Confidence', v: (p.confidence ?? '—').toString().toUpperCase() },
        ]}
      />
      <div style={{ fontFamily: ae.fontBody, fontSize: 11.5, color: ae.textMute, lineHeight: 1.5 }}>
        Detected {p.acq_date ?? 'recently'} by NASA {p.satellite ?? 'satellite'}.
      </div>
      <Link
        href={detailHref}
        className="px-btn px-primary"
        style={{
          height: 44,
          width: '100%',
          borderRadius: 10,
          border: 'none',
          fontFamily: ae.fontDisplay,
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: ae.titleTracking,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          background: '#ff7a3a',
          color: '#fff',
          boxShadow: '0 6px 18px rgba(255, 122, 58, 0.35)',
          textDecoration: 'none',
          cursor: 'pointer',
        }}
      >
        Full Details →
      </Link>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const { ae } = useAesthetic();
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close details"
      style={{
        width: 26,
        height: 26,
        borderRadius: 99,
        background: 'rgba(255, 255, 255, 0.04)',
        border: `0.5px solid ${ae.line}`,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        padding: 0,
      }}
    >
      <Icon
        name="plus"
        size={12}
        color={ae.textDim}
        style={{ transform: 'rotate(45deg)' }}
      />
    </button>
  );
}

function DetailFields({ fields }: { fields: { l: string; v: string }[] }) {
  const { ae } = useAesthetic();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${fields.length}, 1fr)`, gap: 10 }}>
      {fields.map((s) => (
        <div key={s.l}>
          <div
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9.5,
              fontWeight: 600,
              color: ae.textMute,
              letterSpacing: '0.12em',
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            {s.l}
          </div>
          <div
            style={{
              marginTop: 3,
              fontFamily: ae.fontDisplay,
              fontSize: 15,
              fontWeight: ae.titleWeight,
              color: ae.text,
              letterSpacing: ae.titleTracking,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {s.v}
          </div>
        </div>
      ))}
    </div>
  );
}
