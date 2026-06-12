'use client';

// Tier-lookup matrix grids for the "Why this score?" explainer modal. A generic
// `TierMatrixGrid` renders any (rowTier × colTier → outputTier) lookup, with the
// user's actual cell highlighted (brighter fill + colored border + glow) and the
// user's row/column emphasized for cross-hatch readability. Two wrappers use it:
//
//   - CompositeMatrixGrid: Environmental tier (E) × Active-fire Threat (T)  [4×5]
//   - EnvMatrixGrid:       Fire Weather (W) × Ignition Likelihood (I)        [4×4]
//
// Pure presentational. The matrices are mirrored inline (identical to
// COMPOSITE_MATRIX / ENV_MATRIX in web/lib/composite-risk.ts) to keep this
// component independent of the risk-logic import graph — edit both places.

import type { RiskLevel } from '@/lib/theme';
import { useAesthetic } from '@/lib/aesthetic';
import { hexToRgb, RISK_LEVELS } from '@/lib/theme';

type Ae = ReturnType<typeof useAesthetic>['ae'];
type ThreatTier = 'none' | RiskLevel;

const W_ROWS: RiskLevel[] = ['low', 'moderate', 'high', 'extreme'];
const T_COLS: ThreatTier[] = ['none', 'low', 'moderate', 'high', 'extreme'];
const I_COLS: RiskLevel[] = ['low', 'moderate', 'high', 'extreme'];

// Mirror of COMPOSITE_MATRIX in web/lib/composite-risk.ts.
const COMPOSITE: Record<RiskLevel, Record<ThreatTier, RiskLevel>> = {
  low:      { none: 'low',      low: 'low',      moderate: 'low',      high: 'moderate', extreme: 'high'    },
  moderate: { none: 'low',      low: 'moderate', moderate: 'moderate', high: 'high',     extreme: 'high'    },
  high:     { none: 'moderate', low: 'moderate', moderate: 'high',     high: 'high',     extreme: 'extreme' },
  extreme:  { none: 'moderate', low: 'high',     moderate: 'high',     high: 'extreme',  extreme: 'extreme' },
};

// Mirror of ENV_MATRIX in web/lib/composite-risk.ts (symmetric, multiplicative).
const ENV: Record<RiskLevel, Record<RiskLevel, RiskLevel>> = {
  low:      { low: 'low',      moderate: 'low',      high: 'moderate', extreme: 'moderate' },
  moderate: { low: 'low',      moderate: 'moderate', high: 'moderate', extreme: 'high'     },
  high:     { low: 'moderate', moderate: 'moderate', high: 'high',     extreme: 'high'     },
  extreme:  { low: 'moderate', moderate: 'high',     high: 'high',     extreme: 'extreme'  },
};

const TIER_SHORT: Record<RiskLevel, string> = { low: 'LOW', moderate: 'MOD', high: 'HIGH', extreme: 'EXT' };
const COL_SHORT: Record<ThreatTier, string> = { none: 'NONE', low: 'LOW', moderate: 'MOD', high: 'HIGH', extreme: 'EXT' };

// ─── Wrappers ──────────────────────────────────────────────────────────────

/** Stage 2: Environmental tier (E) × Active-fire Threat (T). */
export function CompositeMatrixGrid({
  weatherBucket,
  threatBucket,
}: {
  /** The environmental tier E (named `weatherBucket` for backward-compat). */
  weatherBucket: RiskLevel | null;
  /** null = no fire in range → 'none' column. */
  threatBucket: RiskLevel | null;
}) {
  return (
    <TierMatrixGrid<ThreatTier>
      rows={W_ROWS}
      cols={T_COLS}
      lookup={(r, c) => COMPOSITE[r][c]}
      userRow={weatherBucket}
      userCol={threatBucket ?? 'none'}
      rowLabel={(r) => TIER_SHORT[r]}
      colLabel={(c) => COL_SHORT[c]}
    />
  );
}

/** Stage 1: Fire Weather (W) × Ignition Likelihood (I). */
export function EnvMatrixGrid({
  weatherBucket,
  ignitionBucket,
}: {
  weatherBucket: RiskLevel | null;
  ignitionBucket: RiskLevel | null;
}) {
  return (
    <TierMatrixGrid<RiskLevel>
      rows={W_ROWS}
      cols={I_COLS}
      lookup={(r, c) => ENV[r][c]}
      userRow={weatherBucket}
      userCol={ignitionBucket}
      rowLabel={(r) => TIER_SHORT[r]}
      colLabel={(c) => TIER_SHORT[c]}
    />
  );
}

// ─── Generic grid ──────────────────────────────────────────────────────────

function TierMatrixGrid<C extends string>({
  rows,
  cols,
  lookup,
  userRow,
  userCol,
  rowLabel,
  colLabel,
}: {
  rows: RiskLevel[];
  cols: C[];
  lookup: (row: RiskLevel, col: C) => RiskLevel;
  userRow: RiskLevel | null;
  userCol: C | null;
  rowLabel: (row: RiskLevel) => string;
  colLabel: (col: C) => string;
}) {
  const { ae } = useAesthetic();
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `52px repeat(${cols.length}, 1fr)`,
        gap: 4,
        marginTop: 6,
      }}
    >
      <div />
      {cols.map((c) => {
        const isUserCol = c === userCol;
        return (
          <div
            key={`hdr-${c}`}
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9.5,
              fontWeight: isUserCol ? 800 : 600,
              color: isUserCol ? ae.text : ae.textMute,
              letterSpacing: '0.14em',
              textAlign: 'center',
              paddingBottom: 4,
              borderBottom: isUserCol ? `1.5px solid ${ae.text}` : `0.5px solid ${ae.line}`,
            }}
          >
            {colLabel(c)}
          </div>
        );
      })}

      {rows.map((w) => (
        <RowFragment
          key={w}
          ae={ae}
          w={w}
          cols={cols}
          userCol={userCol}
          lookup={lookup}
          rowLabel={rowLabel}
          isUserRow={w === userRow}
          isLoaded={userRow != null}
        />
      ))}
    </div>
  );
}

function RowFragment<C extends string>({
  ae,
  w,
  cols,
  userCol,
  lookup,
  rowLabel,
  isUserRow,
  isLoaded,
}: {
  ae: Ae;
  w: RiskLevel;
  cols: C[];
  userCol: C | null;
  lookup: (row: RiskLevel, col: C) => RiskLevel;
  rowLabel: (row: RiskLevel) => string;
  isUserRow: boolean;
  isLoaded: boolean;
}) {
  return (
    <>
      <div
        style={{
          fontFamily: ae.fontMono,
          fontSize: 9.5,
          fontWeight: isUserRow ? 800 : 600,
          color: isUserRow ? ae.text : ae.textMute,
          letterSpacing: '0.14em',
          textAlign: 'right',
          alignSelf: 'center',
          paddingRight: 8,
          borderRight: isUserRow ? `1.5px solid ${ae.text}` : `0.5px solid ${ae.line}`,
        }}
      >
        {rowLabel(w)}
      </div>
      {cols.map((c) => {
        const isUserCell = isUserRow && c === userCol && isLoaded;
        const isUserAxis = (isUserRow || c === userCol) && isLoaded;
        return <MatrixCell key={`${w}-${c}`} ae={ae} output={lookup(w, c)} isUserCell={isUserCell} isUserAxis={isUserAxis} />;
      })}
    </>
  );
}

function MatrixCell({
  ae,
  output,
  isUserCell,
  isUserAxis,
}: {
  ae: Ae;
  output: RiskLevel;
  isUserCell: boolean;
  isUserAxis: boolean;
}) {
  const tone = RISK_LEVELS[output];
  const rgb = hexToRgb(tone.color);
  const fillAlpha = isUserCell ? 0.32 : isUserAxis ? 0.16 : 0.08;
  const borderAlpha = isUserCell ? 0.85 : isUserAxis ? 0.32 : 0.18;
  const labelAlpha = isUserCell ? 1.0 : isUserAxis ? 0.85 : 0.5;

  return (
    <div
      aria-current={isUserCell ? 'true' : undefined}
      style={{
        position: 'relative',
        height: 38,
        borderRadius: 6,
        background: `linear-gradient(180deg, rgba(${rgb}, ${fillAlpha + 0.05}), rgba(${rgb}, ${fillAlpha - 0.03}))`,
        border: isUserCell ? `1.5px solid rgba(${rgb}, ${borderAlpha})` : `0.5px solid rgba(${rgb}, ${borderAlpha})`,
        boxShadow: isUserCell ? `0 0 18px rgba(${rgb}, 0.45)` : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: ae.fontMono,
        fontSize: 10,
        fontWeight: isUserCell ? 800 : 700,
        letterSpacing: '0.12em',
        color: `rgba(${rgb}, ${labelAlpha})`,
        transition: 'background 0.3s ease, box-shadow 0.3s ease',
      }}
    >
      {TIER_SHORT[output]}
    </div>
  );
}
