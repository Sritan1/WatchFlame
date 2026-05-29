'use client';

// The 4 (weather tier) x 5 (threat tier: none + 4 risk levels) grid that
// powers the "Why this score?" explainer modal. Each cell is colored by its
// output tier from COMPOSITE_MATRIX. The user's actual (W, T) cell is
// highlighted with a brighter fill + colored border + glow, and labels
// next to the headers call out which row/column the user landed in.
//
// Pure presentational. The matrix data is hardcoded inline (it's identical
// to the published matrix in web/lib/composite-risk.ts and changes only
// when that file changes); duplicating it here keeps the component
// independent of the risk-logic import graph.

import type { RiskLevel } from '@/lib/theme';
import { useAesthetic } from '@/lib/aesthetic';
import { hexToRgb, RISK_LEVELS } from '@/lib/theme';

type ThreatTier = 'none' | RiskLevel;

const W_ROWS: RiskLevel[] = ['low', 'moderate', 'high', 'extreme'];
const T_COLS: ThreatTier[] = ['none', 'low', 'moderate', 'high', 'extreme'];

// Mirror of COMPOSITE_MATRIX in web/lib/composite-risk.ts.
// If you edit cells in one place, edit them here too.
const MATRIX: Record<RiskLevel, Record<ThreatTier, RiskLevel>> = {
  low:      { none: 'low',      low: 'low',      moderate: 'low',      high: 'moderate', extreme: 'high'    },
  moderate: { none: 'low',      low: 'moderate', moderate: 'moderate', high: 'high',     extreme: 'high'    },
  high:     { none: 'moderate', low: 'moderate', moderate: 'high',     high: 'high',     extreme: 'extreme' },
  extreme:  { none: 'moderate', low: 'high',     moderate: 'high',     high: 'extreme',  extreme: 'extreme' },
};

const TIER_SHORT: Record<RiskLevel, string> = {
  low: 'LOW',
  moderate: 'MOD',
  high: 'HIGH',
  extreme: 'EXT',
};

const COL_SHORT: Record<ThreatTier, string> = {
  none: 'NONE',
  low: 'LOW',
  moderate: 'MOD',
  high: 'HIGH',
  extreme: 'EXT',
};

export function CompositeMatrixGrid({
  weatherBucket,
  threatBucket,
}: {
  weatherBucket: RiskLevel | null;
  /** null = no fire in range; maps to the 'none' column. */
  threatBucket: RiskLevel | null;
}) {
  const { ae } = useAesthetic();
  const tCol: ThreatTier = threatBucket ?? 'none';

  return (
    <div
      style={{
        display: 'grid',
        // Row labels column + 5 cell columns
        gridTemplateColumns: '52px repeat(5, 1fr)',
        gap: 4,
        marginTop: 6,
      }}
    >
      {/* Top-left blank corner */}
      <div />
      {/* Column headers (threat tier) */}
      {T_COLS.map((tt) => {
        const isUserCol = tt === tCol;
        return (
          <div
            key={`hdr-${tt}`}
            style={{
              fontFamily: ae.fontMono,
              fontSize: 9.5,
              fontWeight: isUserCol ? 800 : 600,
              color: isUserCol ? ae.text : ae.textMute,
              letterSpacing: '0.14em',
              textAlign: 'center',
              paddingBottom: 4,
              borderBottom: isUserCol
                ? `1.5px solid ${ae.text}`
                : `0.5px solid ${ae.line}`,
            }}
          >
            {COL_SHORT[tt]}
          </div>
        );
      })}

      {/* Rows */}
      {W_ROWS.map((w) => {
        const isUserRow = w === weatherBucket;
        return (
          <RowFragment
            key={w}
            ae={ae}
            w={w}
            tCol={tCol}
            isUserRow={isUserRow}
            isLoaded={weatherBucket != null}
          />
        );
      })}

      {/* Axis labels: weather (W) bottom-left below the grid;
          threat (T) above the column headers — but those live in the
          parent so the column headers + bordered group reads cleanly. */}
    </div>
  );
}

function RowFragment({
  ae,
  w,
  tCol,
  isUserRow,
  isLoaded,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  w: RiskLevel;
  tCol: ThreatTier;
  isUserRow: boolean;
  isLoaded: boolean;
}) {
  return (
    <>
      {/* Row label (W tier) */}
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
          borderRight: isUserRow
            ? `1.5px solid ${ae.text}`
            : `0.5px solid ${ae.line}`,
        }}
      >
        {TIER_SHORT[w]}
      </div>
      {/* 5 cells in this row */}
      {T_COLS.map((tt) => {
        const out = MATRIX[w][tt];
        const isUserCell = isUserRow && tt === tCol && isLoaded;
        const isUserAxis = (isUserRow || tt === tCol) && isLoaded;
        return (
          <MatrixCell
            key={`${w}-${tt}`}
            ae={ae}
            output={out}
            isUserCell={isUserCell}
            isUserAxis={isUserAxis}
          />
        );
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
  ae: ReturnType<typeof useAesthetic>['ae'];
  output: RiskLevel;
  isUserCell: boolean;
  /** True when the cell is on the user's row OR column (cross-hatch context). */
  isUserAxis: boolean;
}) {
  const tone = RISK_LEVELS[output];
  const rgb = hexToRgb(tone.color);

  // Background opacity tiers — user cell is brightest, axis cells get a
  // mid tone (so the user can read down/across the grid easily), other
  // cells are dim.
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
        border: isUserCell
          ? `1.5px solid rgba(${rgb}, ${borderAlpha})`
          : `0.5px solid rgba(${rgb}, ${borderAlpha})`,
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

