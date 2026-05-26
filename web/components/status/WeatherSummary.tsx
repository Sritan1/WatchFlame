'use client';

// Right-column "Atmospheric" card. Lists each weather signal we have data
// for — replaces the AQI panel in the reference since we don't have an AQI
// endpoint. Same row style + tabular numerics as the reference.

import { SectionEyebrow } from '@/components/ui/SectionEyebrow';
import { useAesthetic } from '@/lib/aesthetic';
import type { WeatherResponse } from '@/lib/api';
import { formatSpeed, formatTemp, useUnits } from '@/lib/use-units';

function dirLabel(deg: number | null): string {
  if (deg == null) return '—';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

export function WeatherSummary({ w }: { w: WeatherResponse | undefined }) {
  const { ae } = useAesthetic();
  const units = useUnits();
  if (!w) {
    return (
      <div
        style={{
          background: ae.surface,
          border: ae.cardBorder,
          borderRadius: ae.radius,
          padding: 22,
        }}
      >
        <SectionEyebrow>Atmospheric</SectionEyebrow>
      </div>
    );
  }

  // Show the chosen unit prominently, the alternate as the small unit-line caption.
  // Note: w.wind_speed is in km/h from the backend (owm.py converts m/s→kph),
  // so the alt-unit branches are inverted from a naïve reading.
  const altTemp = units.temp === 'F' ? `${w.temperature.toFixed(1)}°C` : `${((w.temperature * 9) / 5 + 32).toFixed(0)}°F`;
  const altSpeed = units.speed === 'mph'
    ? `${w.wind_speed.toFixed(0)} kph`
    : `${(w.wind_speed * 0.621371).toFixed(0)} mph`;

  const rows: { l: string; v: string; u: string }[] = [
    { l: 'Temperature', v: formatTemp(w.temperature, units.temp, units.temp === 'F' ? 0 : 1), u: altTemp },
    { l: 'Humidity',    v: `${w.humidity.toFixed(0)}%`, u: 'RH' },
    { l: 'Wind',        v: formatSpeed(w.wind_speed, units.speed, 0), u: `${dirLabel(w.wind_deg)} · ${altSpeed}` },
    { l: 'Conditions',  v: w.conditions ?? '—', u: '' },
  ];

  return (
    <div
      className="ember-card ember-card-hover"
      style={{
        background: ae.surface,
        border: ae.cardBorder,
        borderRadius: ae.radius,
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <SectionEyebrow>Atmospheric</SectionEyebrow>
      <div style={{ flex: 1 }}>
        {rows.map((m, i) => (
          <div
            key={m.l}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              padding: '10px 0',
              borderBottom: i < rows.length - 1 ? `0.5px solid ${ae.line}` : 'none',
            }}
          >
            <span
              style={{
                fontFamily: ae.fontMono,
                fontSize: 11,
                color: ae.textDim,
                letterSpacing: '0.08em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}
            >
              {m.l}
            </span>
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  fontFamily: ae.fontDisplay,
                  fontSize: 16,
                  fontWeight: 600,
                  color: ae.text,
                  letterSpacing: ae.titleTracking,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {m.v}
              </span>
              {m.u ? (
                <span style={{ marginLeft: 6, fontFamily: ae.fontMono, fontSize: 10.5, color: ae.textMute }}>
                  {m.u}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
