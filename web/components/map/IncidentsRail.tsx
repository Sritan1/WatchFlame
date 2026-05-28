'use client';

// 380px right rail: header (with explainer info icon + "Live" pill) +
// scrolling list of premium incident cards + kind-aware detail card in the
// footer. Selection can be either a named incident (NIFC/Cal Fire) OR a
// FIRMS satellite hot-pixel — the footer renders the appropriate fields per
// kind, with a "Limited data" callout for incidents missing acres/containment.
//
// Visual: premium glass aesthetic ported from web-map.jsx — left hairline
// + inner shadow so the rail reads overlaid on the map; ambient accent glow
// when a fire is selected; cards with severity bar, cursor-following shine,
// hover lift, and shimmer pip on urgent chips. NO containment progress bar
// inside cards (per design spec).

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
  const selectedRisk = selectedSev ? getRisk(selectedSev, accent) : null;
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
        position: 'relative',
        background: `linear-gradient(180deg, ${ae.surface} 0%, ${ae.bg} 22%, ${ae.bg} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        isolation: 'isolate',
      }}
    >
      {/* Left edge hairline — makes the rail feel overlaid on the map */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 1,
          background: `linear-gradient(180deg, rgba(255,255,255,0.10), ${ae.lineStrong} 12%, ${ae.line} 50%, transparent)`,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      {/* Soft inner shadow at the left edge */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 40,
          background: 'linear-gradient(90deg, rgba(0,0,0,0.45), transparent)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Ambient accent glow tinted to the selected fire's severity */}
      {selectedRisk ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -120,
            right: -100,
            width: 360,
            height: 360,
            background: `radial-gradient(circle, rgba(${selectedRisk.glow}, 0.18), transparent 65%)`,
            filter: 'blur(36px)',
            pointerEvents: 'none',
            zIndex: 0,
            transition: 'background 0.45s ease',
          }}
        />
      ) : null}

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '22px 22px 18px',
          borderBottom: `0.5px solid ${ae.line}`,
          background: `linear-gradient(180deg, ${ae.surface}, transparent)`,
        }}
      >
        {/* Top hairline highlight */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 22,
            right: 22,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 99,
                background: ae.textDim,
              }}
            />
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.18em',
                color: ae.textMute,
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              Active Incidents
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Live pill */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 9px 4px 8px',
                borderRadius: 999,
                background: 'rgba(63, 182, 139, 0.10)',
                border: '0.5px solid rgba(63, 182, 139, 0.30)',
                fontFamily: ae.fontMono,
                fontSize: 9.5,
                fontWeight: 700,
                color: '#3FB68B',
                letterSpacing: '0.16em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              <span
                className="inc-live-dot"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: '#3FB68B',
                  boxShadow: '0 0 8px #3FB68B',
                }}
              />
              Live
            </span>

            {/* Explainer info button — preserved */}
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
                padding: 0,
              }}
            >
              <Icon name="info" size={11} color={ae.textMute} strokeWidth={1.8} />
            </button>
          </div>
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
                margin: 0,
                fontFamily: ae.fontDisplay,
                fontSize: 26,
                fontWeight: ae.titleWeight,
                letterSpacing: '-0.025em',
                color: ae.text,
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fires.length}</span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  color: ae.textDim,
                  letterSpacing: '-0.01em',
                }}
              >
                {fires.length === 1 ? 'fire in region' : 'fires in region'}
              </span>
            </h2>

            <div
              style={{
                marginTop: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                color: ae.textDim,
                letterSpacing: '0.06em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={ae.textMute}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
                {fires.length > 0
                  ? `Within ${formatDistance(radiusMi, units.distance, 0)} of ${locationLabel}`
                  : 'No active incidents within range.'}
              </span>
              {fires.length > 0 ? (
                <>
                  <span style={{ opacity: 0.45 }}>·</span>
                  <span>
                    {truncated
                      ? `closest ${visibleList.length} of ${fires.length}`
                      : 'sorted by distance'}
                  </span>
                </>
              ) : null}
            </div>

            {/* Satellite count callout — preserved */}
            {satelliteCount > 0 ? (
              <div
                style={{
                  marginTop: 12,
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

      {/* ── List ───────────────────────────────────────────────────── */}
      <div
        className="inc-rail-scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 14px 22px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {isLoading && fires.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div
                key={i}
                style={{
                  padding: '14px 16px 14px 18px',
                  marginBottom: 8,
                  borderRadius: ae.radius,
                  background: `linear-gradient(180deg, ${ae.surface}, ${ae.surface2})`,
                  border: `0.5px solid ${ae.line}`,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <Skeleton width={70} height={20} rounded="full" />
                  <Skeleton width={42} height={11} rounded="sm" />
                </div>
                <Skeleton width={'80%'} height={18} rounded="md" />
                <div style={{ marginTop: 6 }}>
                  <Skeleton width={'55%'} height={11} rounded="sm" />
                </div>
                <div
                  style={{
                    marginTop: 12,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                  }}
                >
                  <Skeleton width={'100%'} height={32} rounded="md" />
                  <Skeleton width={'100%'} height={32} rounded="md" />
                  <Skeleton width={'100%'} height={32} rounded="md" />
                </div>
              </div>
            ))
          : null}
        {visibleList.map((f, i) => {
          const sev = severityOf(f);
          const fr = getRisk(sev, accent);
          const isSel = selectedIncidentId === f.id;
          const isUrgent = sev === 'extreme' || sev === 'high';
          return (
            <IncidentCard
              key={f.id}
              fire={f}
              risk={fr}
              severity={sev}
              index={i}
              isSelected={isSel}
              isUrgent={isUrgent}
              distanceUnit={units.distance}
              onClick={() => onSelect(isSel ? null : { kind: 'incident', id: f.id })}
            />
          );
        })}
      </div>

      {/* ── Kind-aware detail footer ───────────────────────────────────
       *  Minimal "Selected" rail per the design spec — dot + label + name
       *  + distance + "Open Incident Report" CTA. The verbose detail card
       *  (3-stat grid, Limited-data callout, close X) is removed because
       *  the same data already lives in the card list above, and clicking
       *  the selected card / marker a second time unselects it. */}
      {selection?.kind === 'incident' && selected && selectedRisk ? (
        <DetailFooter
          label="Selected"
          name={selected.name}
          distanceLabel={formatDistance(selected.distance_mi, units.distance, 1)}
          accentColor={selectedRisk.color}
          accentGlow={selectedRisk.glow}
          detailHref={`/fire-detail?lat=${selected.lat}&lon=${selected.lon}`}
        />
      ) : null}
      {selection?.kind === 'fire' ? (
        <DetailFooter
          label="Selected"
          name="Satellite Detection"
          distanceLabel={formatDistance(
            distanceMiles(userCoords, {
              lat: selection.feature.properties.lat,
              lon: selection.feature.properties.lon,
            }),
            units.distance,
            1,
          )}
          accentColor="#ff7a3a"
          accentGlow="255, 122, 58"
          detailHref={buildFirmsDetailHref(selection.feature)}
        />
      ) : null}

      <FireFieldsExplainerModal open={explainerOpen} onClose={() => setExplainerOpen(false)} />
    </aside>
  );
}

/** Build the /fire-detail URL for a FIRMS satellite pixel. Passes through
 *  all the satellite-specific URL params the detail page consumes. */
function buildFirmsDetailHref(feature: FireFeature): string {
  const p = feature.properties;
  return (
    `/fire-detail?lat=${p.lat}&lon=${p.lon}` +
    (p.brightness != null ? `&brightness=${p.brightness}` : '') +
    (p.confidence != null ? `&confidence=${encodeURIComponent(p.confidence)}` : '') +
    (p.acq_date != null ? `&acq_date=${p.acq_date}` : '') +
    (p.acq_time != null ? `&acq_time=${p.acq_time}` : '') +
    (p.satellite != null ? `&satellite=${encodeURIComponent(p.satellite)}` : '') +
    (p.daynight != null ? `&daynight=${encodeURIComponent(p.daynight)}` : '')
  );
}

// ─── Incident Card ────────────────────────────────────────────────────────

function IncidentCard({
  fire,
  risk,
  severity,
  index,
  isSelected,
  isUrgent,
  distanceUnit,
  onClick,
}: {
  fire: NamedIncident;
  risk: { color: string; glow: string; label: string };
  severity: RiskLevel;
  index: number;
  isSelected: boolean;
  isUrgent: boolean;
  distanceUnit: 'mi' | 'km';
  onClick: () => void;
}) {
  const { ae } = useAesthetic();

  // Cursor-following highlight — sets CSS vars used by .inc-card-shine.
  const onMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  const distLabel = formatDistance(fire.distance_mi, distanceUnit, 1);
  const sizeLabel =
    fire.acres != null ? fire.acres.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
  const contLabel = fire.contained_pct != null ? `${Math.round(fire.contained_pct)}` : '—';

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseMove={onMove}
      data-selected={isSelected ? 'true' : 'false'}
      className={`inc-card${isSelected ? ' inc-card-sel' : ''}`}
      style={{
        ['--ic-color' as string]: risk.color,
        ['--ic-glow' as string]: risk.glow,
        width: '100%',
        padding: '14px 16px 14px 18px',
        marginBottom: 8,
        textAlign: 'left',
        position: 'relative',
        background: isSelected
          ? `linear-gradient(180deg, rgba(${risk.glow}, 0.12), rgba(${risk.glow}, 0.04) 60%, ${ae.surface})`
          : `linear-gradient(180deg, ${ae.surface}, ${ae.surface2})`,
        border: isSelected
          ? `0.5px solid rgba(${risk.glow}, 0.45)`
          : `0.5px solid ${ae.line}`,
        borderRadius: ae.radius,
        cursor: 'pointer',
        overflow: 'hidden',
        animation: `ember-fade-up 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) ${index * 60}ms both`,
        boxShadow: isSelected
          ? `0 0 0 0.5px rgba(${risk.glow}, 0.20), 0 14px 32px rgba(${risk.glow}, 0.18), inset 0 1px 0 rgba(255,255,255,0.04)`
          : 'inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 0 rgba(0,0,0,0.3)',
        transition:
          'border-color .25s ease, box-shadow .25s ease, transform .22s cubic-bezier(0.2, 0.7, 0.3, 1), background .3s ease',
        color: 'inherit',
        fontFamily: 'inherit',
      }}
    >
      {/* Cursor-following highlight */}
      <span aria-hidden className="inc-card-shine" />

      {/* Left severity bar */}
      <span
        aria-hidden
        className="inc-card-bar"
        style={{
          position: 'absolute',
          top: 14,
          bottom: 14,
          left: 7,
          width: 2.5,
          borderRadius: 2,
          background: `linear-gradient(180deg, ${risk.color}, rgba(${risk.glow}, 0.45))`,
          boxShadow:
            isUrgent || isSelected ? `0 0 10px rgba(${risk.glow}, 0.65)` : 'none',
          opacity: isSelected ? 1 : 0.75,
          transition: 'opacity .25s ease, box-shadow .3s ease',
        }}
      />

      {/* Top hairline highlight when selected */}
      {isSelected ? (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 16,
            right: 16,
            height: 1,
            background: `linear-gradient(90deg, transparent, rgba(${risk.glow}, 0.55), transparent)`,
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {/* Row 1: severity chip + ID + chevron */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '4px 9px 4px 8px',
            borderRadius: 999,
            background: `rgba(${risk.glow}, 0.12)`,
            border: `0.5px solid rgba(${risk.glow}, 0.32)`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              width: 5.5,
              height: 5.5,
              borderRadius: 99,
              background: risk.color,
              boxShadow: `0 0 8px ${risk.color}`,
            }}
          />
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9.5,
              fontWeight: 700,
              color: risk.color,
              letterSpacing: '0.16em',
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            {RISK_LEVELS[severity].label}
          </span>
          {/* Shimmer pip for urgent (high/extreme) */}
          {isUrgent ? (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: '40%',
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
                animation: 'inc-card-shimmer 3.4s linear infinite',
                pointerEvents: 'none',
              }}
            />
          ) : null}
        </div>

        <span
          className="inc-card-chev"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: isSelected ? risk.color : ae.textMute,
            transition: 'color .25s ease, transform .25s ease',
          }}
        >
          <Icon name="chevron" size={12} strokeWidth={2} />
        </span>
      </div>

      {/* Row 2: name */}
      <div style={{ marginTop: 10 }}>
        <div
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 16.5,
            fontWeight: 600,
            color: ae.text,
            letterSpacing: ae.titleTracking,
            lineHeight: 1.15,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {fire.name}
        </div>
      </div>

      {/* Row 3: 3-stat grid with vertical dividers (NO containment bar) */}
      <div
        style={{
          marginTop: 12,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          padding: '10px 2px',
          background: 'rgba(255,255,255,0.02)',
          border: `0.5px solid ${ae.line}`,
          borderRadius: 8,
        }}
      >
        <Stat ae={ae} label="Dist" value={distLabel} dividerLeft={false} />
        <Stat ae={ae} label="Size" value={sizeLabel} unit="ac" dividerLeft />
        <Stat ae={ae} label="Cont" value={contLabel} unit="%" dividerLeft />
      </div>
    </button>
  );
}

function Stat({
  ae,
  label,
  value,
  unit,
  dividerLeft,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  label: string;
  value: string;
  unit?: string;
  dividerLeft: boolean;
}) {
  return (
    <div
      style={{
        padding: '0 10px',
        borderLeft: dividerLeft ? `0.5px solid ${ae.line}` : 'none',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: ae.fontMono,
          fontSize: 9,
          fontWeight: 600,
          color: ae.textMute,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          display: 'flex',
          alignItems: 'baseline',
          gap: 3,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 15,
            fontWeight: 600,
            color: ae.text,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          {value}
        </span>
        {unit && value !== '—' ? (
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9.5,
              color: ae.textMute,
              letterSpacing: '0.06em',
            }}
          >
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Minimal selected-row footer ──────────────────────────────────────────

/** Compact selection footer pinned to the bottom of the rail. Shows only:
 *  dot + "Selected" label + fire name + distance, then a single
 *  Open-Incident-Report CTA below. No 3-stat grid, no Limited-data callout,
 *  no close X — the user unselects by clicking the same card (or marker)
 *  again. The same data is still visible in the card list above, so this
 *  footer just confirms "what's selected" and provides the route-through
 *  to the full detail page. */
function DetailFooter({
  label,
  name,
  distanceLabel,
  accentColor,
  accentGlow,
  detailHref,
}: {
  label: string;
  name: string;
  distanceLabel: string;
  accentColor: string;
  accentGlow: string;
  detailHref: string;
}) {
  const { ae } = useAesthetic();
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        padding: '16px 18px 18px',
        borderTop: `0.5px solid ${ae.line}`,
        background: `linear-gradient(180deg, transparent, ${ae.surface} 30%)`,
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
      }}
    >
      {/* Accent-tinted top hairline */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 22,
          right: 22,
          height: 1,
          background: `linear-gradient(90deg, transparent, rgba(${accentGlow}, 0.40), transparent)`,
          pointerEvents: 'none',
        }}
      />

      {/* Selected fire summary above the button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 99,
              background: accentColor,
              boxShadow: `0 0 10px ${accentColor}`,
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: ae.fontMono,
                fontSize: 9.5,
                fontWeight: 700,
                color: accentColor,
                letterSpacing: '0.16em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              {label}
            </div>
            <div
              style={{
                marginTop: 2,
                fontFamily: ae.fontDisplay,
                fontSize: 13.5,
                fontWeight: 600,
                color: ae.text,
                letterSpacing: ae.titleTracking,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 220,
              }}
            >
              {name}
            </div>
          </div>
        </div>
        <span
          style={{
            fontFamily: ae.fontMono,
            fontSize: 10,
            color: ae.textMute,
            letterSpacing: '0.06em',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {distanceLabel}
        </span>
      </div>

      <Link
        href={detailHref}
        style={{
          height: 44,
          width: '100%',
          borderRadius: 10,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          fontFamily: ae.fontMono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: ae.chipUpper ? 'uppercase' : 'none',
          color: '#fff',
          background: `linear-gradient(180deg, ${accentColor}, rgba(${accentGlow}, 0.85))`,
          border: `0.5px solid rgba(${accentGlow}, 0.45)`,
          boxShadow: `0 0 0 0.5px rgba(255,255,255,0.08) inset, 0 1px 0 rgba(255,255,255,0.16) inset, 0 10px 30px rgba(${accentGlow}, 0.35)`,
          textDecoration: 'none',
          transition: 'transform 0.18s cubic-bezier(0.2, 0.7, 0.3, 1)',
        }}
        className="inc-rail-cta"
      >
        Open Incident Report
        <Icon name="chevron" size={11} color="#fff" strokeWidth={2.4} />
      </Link>
    </div>
  );
}
