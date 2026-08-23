'use client';

// The floating severity filter over the map, with counts off the incident list.

import { useAesthetic } from '@/lib/aesthetic';
import { getRisk, RISK_LEVELS, type RiskLevel } from '@/lib/theme';

export type FireFilter = 'all' | RiskLevel;

interface ChipDef {
  id: FireFilter;
  label: string;
  count: number;
  color?: string;
}

export function FilterChips({
  active,
  onChange,
  counts,
}: {
  active: FireFilter;
  onChange: (f: FireFilter) => void;
  counts: Record<FireFilter, number>;
}) {
  const { ae, accent } = useAesthetic();

  const chips: ChipDef[] = [
    { id: 'all',      label: 'All Fires', count: counts.all },
    { id: 'extreme',  label: RISK_LEVELS.extreme.label,  count: counts.extreme,  color: getRisk('extreme', accent).color },
    { id: 'high',     label: RISK_LEVELS.high.label,     count: counts.high,     color: getRisk('high', accent).color },
    { id: 'moderate', label: RISK_LEVELS.moderate.label, count: counts.moderate, color: getRisk('moderate', accent).color },
  ];

  return (
    <div className="app-map-filters" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {chips.map((f) => {
        const isActive = active === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 10,
              cursor: 'pointer',
              background: isActive ? ae.surface : 'rgba(13, 16, 18, 0.72)',
              border: `0.5px solid ${isActive ? ae.lineStrong : ae.line}`,
              backdropFilter: 'blur(20px) saturate(160%)',
              WebkitBackdropFilter: 'blur(20px) saturate(160%)',
              color: isActive ? ae.text : ae.textDim,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {f.color ? (
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 99,
                  background: f.color,
                  boxShadow: `0 0 8px ${f.color}`,
                }}
              />
            ) : null}
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              {f.label}
            </span>
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.05)',
                fontFamily: ae.fontMono,
                fontSize: 9.5,
                fontWeight: 600,
                color: ae.textDim,
                letterSpacing: '0.04em',
              }}
            >
              {f.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
