// Design tokens. No React and no DOM, so this is safe on the server.
// AestheticProvider switches between the three looks below.

export type RiskLevel = 'low' | 'moderate' | 'high' | 'extreme';
export type AccentHue = 'amber' | 'orange' | 'red';
export type AestheticId = 'gov' | 'startup' | 'tactical';

export interface RiskTone {
  label: string;
  /** Hex color, like "#3FB68B". */
  color: string;
  /** The same color as "63, 182, 139", ready to drop inside rgba(). */
  glow: string;
  /** Rank from 1 for low to 4 for extreme, for the risk meter. */
  bar: number;
}

export const RISK_LEVELS: Record<RiskLevel, RiskTone> = {
  low:      { label: 'Low',      color: '#3FB68B', glow: '63, 182, 139',  bar: 1 },
  moderate: { label: 'Moderate', color: '#E8B339', glow: '232, 179, 57',  bar: 2 },
  high:     { label: 'High',     color: '#FF7A3A', glow: '255, 122, 58',  bar: 3 },
  extreme:  { label: 'Extreme',  color: '#F04438', glow: '240, 68, 56',   bar: 4 },
};

/** One color per fire-weather factor, so the breakdown bars, explainer bullets and
 *  driver strip can't drift apart. Where these match a risk tier's color, it means
 *  nothing. */
export const FACTOR_COLORS: Record<'vpd' | 'wind' | 'drought', { color: string; glow: string }> = {
  vpd:     { color: '#FF7A3A', glow: '255, 122, 58' },
  wind:    { color: '#4FA8FF', glow: '79, 168, 255' },
  drought: { color: '#E8B339', glow: '232, 179, 57' },
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
    name: 'Editorial standard',
    bg: '#0B0E12',
    surface: '#10141B',
    surface2: '#161B24',
    line: 'rgba(255,255,255,0.07)',
    lineStrong: 'rgba(255,255,255,0.14)',
    text: '#F2F4F7',
    textDim: 'rgba(255,255,255,0.62)',
    // 0.52 gives about 5.7:1 here, clearing the 4.5:1 AA bar for small text.
    textMute: 'rgba(255,255,255,0.52)',
    fontDisplay: 'var(--font-display), -apple-system, system-ui, sans-serif',
    fontBody: 'var(--font-body), -apple-system, system-ui, sans-serif',
    fontMono: 'var(--font-mono), ui-monospace, "SF Mono", monospace',
    radius: 12,
    radiusLg: 16,
    cardBorder: '0.5px solid rgba(255,255,255,0.09)',
    titleWeight: 700,
    // Tight enough to feel editorial. Ordinary sans sits nearer -0.015.
    titleTracking: '-0.025em',
    chipUpper: true,
  },
  startup: {
    id: 'startup',
    name: 'Modern studio',
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

/** Retint high and extreme for the chosen accent. Low and moderate are fixed. */
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

/** Turn a hex color into the "r, g, b" form rgba() wants. */
export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(', ');
}

/** Bump a low level up to moderate for background chrome only, since a low page
 *  looks washed out in green. Pass the real level to the pill and the label. */
export function floorLow(level: RiskLevel): RiskLevel {
  return level === 'low' ? 'moderate' : level;
}
