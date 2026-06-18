// Design tokens for the Ember web app — ported from tokens.jsx.
// Server-safe (no React, no DOM). Aesthetics are switchable via AestheticProvider.

export type RiskLevel = 'low' | 'moderate' | 'high' | 'extreme';
export type AccentHue = 'amber' | 'orange' | 'red';
export type AestheticId = 'gov' | 'startup' | 'tactical';

export interface RiskTone {
  label: string;
  /** Hex color, e.g. "#3FB68B". */
  color: string;
  /** RGB triple as a comma-separated string for use inside rgba(...). e.g. "63, 182, 139". */
  glow: string;
  /** 1-based ordinal — low=1, extreme=4. Used by Regional Risk meter. */
  bar: number;
}

export const RISK_LEVELS: Record<RiskLevel, RiskTone> = {
  low:      { label: 'Low',      color: '#3FB68B', glow: '63, 182, 139',  bar: 1 },
  moderate: { label: 'Moderate', color: '#E8B339', glow: '232, 179, 57',  bar: 2 },
  high:     { label: 'High',     color: '#FF7A3A', glow: '255, 122, 58',  bar: 3 },
  extreme:  { label: 'Extreme',  color: '#F04438', glow: '240, 68, 56',   bar: 4 },
};

export interface Aesthetic {
  id: AestheticId;
  name: string;
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  lineStrong: string;
  text: string;
  textDim: string;
  textMute: string;
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  radius: number;
  radiusLg: number;
  cardBorder: string;
  titleWeight: number;
  titleTracking: string;
  chipUpper: boolean;
}

export const AESTHETICS: Record<AestheticId, Aesthetic> = {
  gov: {
    id: 'gov',
    name: 'Government utility',
    bg: '#0B0E12',
    surface: '#10141B',
    surface2: '#161B24',
    line: 'rgba(255,255,255,0.07)',
    lineStrong: 'rgba(255,255,255,0.14)',
    text: '#F2F4F7',
    textDim: 'rgba(255,255,255,0.62)',
    // 0.52 (~5.7:1 on the dark bg) clears WCAG AA 4.5:1 for small text (0.42 ≈ 4.2:1).
    textMute: 'rgba(255,255,255,0.52)',
    fontDisplay: 'var(--font-display), -apple-system, system-ui, sans-serif',
    fontBody: 'var(--font-body), -apple-system, system-ui, sans-serif',
    fontMono: 'var(--font-mono), ui-monospace, "SF Mono", monospace',
    radius: 12,
    radiusLg: 16,
    cardBorder: '0.5px solid rgba(255,255,255,0.09)',
    titleWeight: 700,
    // -0.025em tightens display headings just enough to register as premium
    // (mass-market sans uses -0.01..-0.02; editorial dashboards use -0.025+).
    titleTracking: '-0.025em',
    chipUpper: true,
  },
  startup: {
    id: 'startup',
    name: 'Modern startup',
    bg: '#0A0908',
    surface: '#161311',
    surface2: '#1F1B18',
    line: 'rgba(255,255,255,0.06)',
    lineStrong: 'rgba(255,255,255,0.12)',
    text: '#F8F4EE',
    textDim: 'rgba(248,244,238,0.65)',
    textMute: 'rgba(248,244,238,0.52)',
    fontDisplay: 'var(--font-display), -apple-system, system-ui, sans-serif',
    fontBody: 'var(--font-body), -apple-system, system-ui, sans-serif',
    fontMono: 'var(--font-mono), ui-monospace, monospace',
    radius: 20,
    radiusLg: 28,
    cardBorder: '0.5px solid rgba(255,255,255,0.08)',
    titleWeight: 600,
    titleTracking: '-0.03em',
    chipUpper: false,
  },
  tactical: {
    id: 'tactical',
    name: 'Tactical instrument',
    bg: '#070809',
    surface: '#0D1012',
    surface2: '#13171A',
    line: 'rgba(180,200,210,0.08)',
    lineStrong: 'rgba(180,200,210,0.18)',
    text: '#E8EDF0',
    textDim: 'rgba(232,237,240,0.60)',
    textMute: 'rgba(232,237,240,0.38)',
    fontDisplay: 'var(--font-mono), ui-monospace, monospace',
    fontBody: 'var(--font-mono), ui-monospace, monospace',
    fontMono: 'var(--font-mono), ui-monospace, monospace',
    radius: 4,
    radiusLg: 6,
    cardBorder: '0.5px solid rgba(180,200,210,0.12)',
    titleWeight: 500,
    titleTracking: '0',
    chipUpper: true,
  },
};

/** Accent hue overrides for high/extreme risk colors. low/moderate are fixed. */
export function getRisk(level: RiskLevel, accentHue: AccentHue = 'orange'): RiskTone {
  const base = RISK_LEVELS[level];
  if (level !== 'high' && level !== 'extreme') return base;
  const tuned: Record<AccentHue, { high: [string, string]; extreme: [string, string] }> = {
    amber:  { high: ['#E8A23A', '232, 162, 58'], extreme: ['#E8541C', '232, 84, 28'] },
    red:    { high: ['#F04438', '240, 68, 56'],  extreme: ['#E62D2A', '230, 45, 42'] },
    orange: { high: ['#FF7A3A', '255, 122, 58'], extreme: ['#F04438', '240, 68, 56'] },
  };
  const [color, glow] = tuned[accentHue][level];
  return { ...base, color, glow };
}

/** Convert #RGB or #RRGGBB to a comma-separated RGB triple for use inside rgba(). */
export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(', ');
}

/** Single shared easing for transitions/animations across the app. */
export const EMBER_EASE = 'cubic-bezier(0.2, 0.7, 0.3, 1)';

/** Coerce a `low` level to `moderate` for AMBIENT chrome (page background,
 *  hero band palette, card border tint, glows). The literal risk pill / label
 *  should still pass the actual `level` so the user sees "LOW" in green —
 *  this only floors the surrounding visual treatment so the page doesn't
 *  read as washed-out / muted when the underlying risk is low. */
export function floorLow(level: RiskLevel): RiskLevel {
  return level === 'low' ? 'moderate' : level;
}
