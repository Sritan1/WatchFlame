'use client';

// Featured "Active Incident · Top Priority" card. Shows when the closest
// named incident is high or extreme severity (synthesized from distance + size).
// Simplified vs. the reference: no mini-map (step 8) and no event timeline
// (no API data) — surfaces the stats + containment progress + control statement.

import Link from 'next/link';

import { Icon } from '@/components/Icon';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { SectionEyebrow } from '@/components/ui/SectionEyebrow';
import { useAesthetic } from '@/lib/aesthetic';
import type { NamedIncident, WeatherResponse } from '@/lib/api';
import { getRisk, type RiskLevel } from '@/lib/theme';
import { formatDistance, formatSpeed, useUnits } from '@/lib/use-units';

export function ActiveIncidentCard({
  incident,
  severity,
  weather,
}: {
  incident: NamedIncident;
  severity: RiskLevel;
  weather: WeatherResponse | undefined;
}) {
  const { ae, accent } = useAesthetic();
  const units = useUnits();
  const r = getRisk(severity, accent);

  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const windDir = weather?.wind_deg != null ? dirs[Math.round(weather.wind_deg / 45) % 8] : '—';
  const stats = [
    { l: 'Distance', v: formatDistance(incident.distance_mi, units.distance, 1), tone: r.color },
    {
      l: 'Containment',
      v: incident.contained_pct != null ? `${incident.contained_pct}%` : '—',
      tone: ae.text,
    },
    {
      l: 'Personnel',
      v: incident.personnel != null ? incident.personnel.toLocaleString() : '—',
      tone: ae.text,
    },
    {
      l: 'Wind',
      v: weather ? `${formatSpeed(weather.wind_speed, units.speed, 0)} ${windDir}` : '—',
      tone: ae.text,
    },
  ];

  return (
    <>
      <SectionEyebrow color={r.color} right={`ID ${incident.id} · ${incident.county ?? incident.location ?? '—'}`}>
        Active Incident · Top Priority
      </SectionEyebrow>

      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
          border: `0.5px solid rgba(${r.glow}, 0.25)`,
          borderRadius: ae.radiusLg,
          boxShadow: `0 30px 80px rgba(${r.glow}, 0.10), inset 0 1px 0 rgba(255,255,255,0.04)`,
        }}
      >
        {/* Top stripe */}
        <div
          style={{
            height: 3,
            background: `linear-gradient(90deg, transparent, ${r.color}, transparent)`,
            boxShadow: `0 0 14px ${r.color}`,
          }}
        />

        <div style={{ padding: 28 }}>
          {/* Header row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              marginBottom: 18,
              gap: 16,
            }}
          >
            <div>
              <Eyebrow color={r.color}>{incident.name}</Eyebrow>
              <h2
                style={{
                  margin: '6px 0 0',
                  fontFamily: ae.fontDisplay,
                  fontSize: 36,
                  fontWeight: ae.titleWeight,
                  letterSpacing: '-0.025em',
                  color: ae.text,
                  lineHeight: 1,
                }}
              >
                {incident.acres != null ? incident.acres.toLocaleString() : '—'}{' '}
                <span style={{ fontSize: 18, color: ae.textDim, fontWeight: 400 }}>
                  acres burning
                </span>
              </h2>
            </div>
            <Link
              href="/map"
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: `0.5px solid ${ae.line}`,
                background: ae.surface,
                color: ae.text,
                cursor: 'pointer',
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              View on Map <Icon name="chevron" size={12} color={ae.text} />
            </Link>
          </div>

          {/* Stats grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 1,
              background: ae.line,
              border: `0.5px solid ${ae.line}`,
              borderRadius: ae.radius,
              overflow: 'hidden',
            }}
          >
            {stats.map((s) => (
              <div key={s.l} style={{ padding: '14px 16px', background: ae.surface }}>
                <Eyebrow>{s.l}</Eyebrow>
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: ae.fontDisplay,
                    fontSize: 22,
                    fontWeight: ae.titleWeight,
                    letterSpacing: ae.titleTracking,
                    color: s.tone,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {s.v}
                </div>
              </div>
            ))}
          </div>

          {/* Containment progress */}
          {incident.contained_pct != null ? (
            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 8,
                }}
              >
                <Eyebrow>Containment Progress</Eyebrow>
                <span
                  style={{
                    fontFamily: ae.fontMono,
                    fontSize: 11,
                    color: ae.textDim,
                    letterSpacing: '0.06em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {incident.contained_pct}%
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 99,
                  background: ae.line,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: `${incident.contained_pct}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, rgba(${r.glow}, 0.7), ${r.color})`,
                    borderRadius: 99,
                    boxShadow: `0 0 10px ${r.color}`,
                    transition: 'width 1.2s cubic-bezier(0.3, 1, 0.4, 1)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div className="px-sweep" />
                </div>
              </div>
            </div>
          ) : null}

          {/* Control statement */}
          {incident.control_statement ? (
            <p
              style={{
                margin: '18px 0 0',
                fontFamily: ae.fontBody,
                fontSize: 13.5,
                color: ae.textDim,
                lineHeight: 1.55,
              }}
            >
              {incident.control_statement}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
