import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

/**
 * Horizontal segmented score meter — 4 colored zones (LOW / MOD / HIGH /
 * EXT) sized by the active thresholds, with a white "SCORE" marker
 * pointing to the current 0–1 score. Mirrors the screens.jsx /
 * premium.jsx `ScoreGauge` primitive.
 *
 * `thresholds` provides the per-state cutoffs from the API; when null we
 * fall back to the global 0.3 / 0.6 / 0.8 buckets. The EXT zone always
 * extends to 1.0.
 */
type Thresholds = { low: number; moderate: number; high: number; extreme: number };

const LOW_COLOR  = { hex: '#7ee787', rgb: '126, 231, 135' };
const MOD_COLOR  = { hex: '#e8b339', rgb: '232, 179, 57'  };
const HIGH_COLOR = { hex: '#fb923c', rgb: '251, 146, 60'  };
const EXT_COLOR  = { hex: '#ef4444', rgb: '239, 68, 68'   };

const GLOBAL: Thresholds = { low: 0.3, moderate: 0.6, high: 0.8, extreme: 0.8 };

export function ScoreGauge({
  score,
  thresholds,
}: {
  score: number;
  /** Per-state cutoffs from /risk; null/undefined → global buckets. */
  thresholds?: Thresholds | null;
}) {
  // The HIGH→EXT boundary is `extreme` (the 97th percentile cutoff used by
  // _bucket in api/core/regional_calibration.py). `high` (90th pctile) is
  // informational only.
  const t = thresholds ?? GLOBAL;
  const HEIGHT = 64;
  const PAD = 6;

  // Measure the container so the SVG can be sized to the actual layout
  // (full-width responsive). Until measured, render nothing — the parent
  // reserves the height so there's no reflow when the measurement lands.
  const [w, setW] = useState(0);

  const zones = [
    { from: 0,           to: t.low,      color: LOW_COLOR,  label: 'LOW'  },
    { from: t.low,       to: t.moderate, color: MOD_COLOR,  label: 'MOD'  },
    { from: t.moderate,  to: t.extreme,  color: HIGH_COLOR, label: 'HIGH' },
    { from: t.extreme,   to: 1.0,        color: EXT_COLOR,  label: 'EXT'  },
  ];

  const clampedScore = Math.max(0, Math.min(1, score));
  const innerW = Math.max(0, w - PAD * 2);
  const markerX = PAD + clampedScore * innerW;

  return (
    <View
      onLayout={(e) => {
        const next = e.nativeEvent.layout.width;
        if (next !== w) setW(next);
      }}
      style={{ width: '100%', height: HEIGHT }}
    >
      {w > 0 ? (
        <Svg width={w} height={HEIGHT} viewBox={`0 0 ${w} ${HEIGHT}`}>
          {/* Zone segments — colored rects at the track height (y=28..34) */}
          {zones.map((z, i) => {
            const x = PAD + z.from * innerW;
            const segW = Math.max(0, (z.to - z.from) * innerW);
            return (
              <Rect
                key={z.label}
                x={x + 0.5}
                y={28}
                width={Math.max(0, segW - 1)}
                height={6}
                rx={3}
                fill={`rgba(${z.color.rgb}, 0.18)`}
                stroke={`rgba(${z.color.rgb}, 0.40)`}
                strokeWidth={0.5}
              />
            );
          })}

          {/* Zone labels — centered under each segment */}
          {zones.map((z) => {
            const x = PAD + z.from * innerW;
            const segW = Math.max(0, (z.to - z.from) * innerW);
            return (
              <SvgText
                key={`${z.label}-l`}
                x={x + segW / 2}
                y={50}
                textAnchor="middle"
                fontSize={9}
                fontWeight="600"
                letterSpacing={1}
                fill={`rgba(${z.color.rgb}, 0.85)`}
              >
                {z.label}
              </SvgText>
            );
          })}

          {/* Inter-zone tick marks */}
          {zones.slice(0, -1).map((z) => {
            const x = PAD + z.to * innerW;
            return (
              <Line
                key={`tick-${z.label}`}
                x1={x}
                y1={24}
                x2={x}
                y2={38}
                stroke="rgba(255,255,255,0.14)"
                strokeWidth={0.5}
              />
            );
          })}

          {/* SCORE marker — vertical line + cap dot + "SCORE" label */}
          <Line
            x1={markerX}
            y1={14}
            x2={markerX}
            y2={38}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
          <Rect
            x={markerX - 5}
            y={9}
            width={10}
            height={10}
            rx={5}
            fill="#ffffff"
          />
          <SvgText
            x={markerX}
            y={5}
            textAnchor="middle"
            fontSize={8}
            fontWeight="700"
            letterSpacing={0.6}
            fill="#ffffff"
          >
            SCORE
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}
