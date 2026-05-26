'use client';

// Compact list of named incidents — name + region + distance + acres + contained.
// Sorted by distance. Severity dot synthesized from distance + size.

import Link from 'next/link';

import { SectionEyebrow } from '@/components/ui/SectionEyebrow';
import { useAesthetic } from '@/lib/aesthetic';
import type { NamedIncident } from '@/lib/api';
import { getRisk, type RiskLevel } from '@/lib/theme';
import { useUnits } from '@/lib/use-units';

/** Synthesize a severity bucket from distance + size — the backend doesn't
 *  attach one. Distance dominates: nearby = scarier. Acres adds tiebreaker. */
export function severityOf(f: NamedIncident): RiskLevel {
  const d = f.distance_mi;
  const a = f.acres ?? 0;
  if (d < 6 || a > 1000) return 'extreme';
  if (d < 12 || a > 300) return 'high';
  if (d < 25 || a > 50) return 'moderate';
  return 'low';
}

export function ClosestFiresList({ fires }: { fires: NamedIncident[] }) {
  const { ae, accent } = useAesthetic();
  const units = useUnits();
  // Distances from /incidents/near are always in miles; we convert at display time.
  const distConverted = (mi: number) => (units.distance === 'km' ? mi * 1.60934 : mi);
  if (fires.length === 0) {
    return (
      <div
        style={{
          background: ae.surface,
          border: ae.cardBorder,
          borderRadius: ae.radius,
          padding: 22,
        }}
      >
        <SectionEyebrow right="0 active">Closest Active Fires</SectionEyebrow>
        <p
          style={{
            margin: '8px 0 0',
            fontFamily: ae.fontBody,
            fontSize: 13,
            color: ae.textDim,
          }}
        >
          No named incidents within reach. Conditions look quiet.
        </p>
      </div>
    );
  }

  return (
    <div
      className="ember-card"
      style={{
        background: ae.surface,
        border: ae.cardBorder,
        borderRadius: ae.radius,
        padding: 22,
      }}
    >
      <SectionEyebrow right={`${fires.length} active in region`}>Closest Active Fires</SectionEyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {fires.map((f, i) => {
          const fr = getRisk(severityOf(f), accent);
          return (
            <Link
              key={f.id}
              href="/map"
              style={{
                display: 'grid',
                gridTemplateColumns: '8px 1fr auto',
                gap: 14,
                alignItems: 'center',
                padding: '12px 0',
                borderBottom: i < fires.length - 1 ? `0.5px solid ${ae.line}` : 'none',
                cursor: 'pointer',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 99,
                  background: fr.color,
                  boxShadow: `0 0 10px ${fr.color}`,
                  animation: i === 0 ? 'ember-flicker 2s ease-in-out infinite' : 'none',
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: ae.fontDisplay,
                    fontSize: 14,
                    fontWeight: 600,
                    color: ae.text,
                    letterSpacing: ae.titleTracking,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {f.name}
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontFamily: ae.fontMono,
                    fontSize: 10.5,
                    color: ae.textMute,
                    letterSpacing: '0.04em',
                  }}
                >
                  {f.location ?? f.county ?? '—'} · {f.acres ?? '—'} ac
                  {f.contained_pct != null ? ` · ${f.contained_pct}% contained` : ''}
                </div>
              </div>
              <div
                style={{
                  fontFamily: ae.fontDisplay,
                  fontSize: 18,
                  fontWeight: 600,
                  color: fr.color,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {distConverted(f.distance_mi).toFixed(1)}
                <span style={{ fontSize: 11, color: ae.textMute, fontWeight: 400, marginLeft: 3 }}>
                  {units.distance}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
