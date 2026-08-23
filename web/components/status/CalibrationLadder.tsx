'use client';

// The ladder inside the calibration modal, showing what one score means in every
// fitted state. Each row is a state code, a bar split at that state's tier
// boundaries, and a chip for where the user lands. Presentation only.

import { useMemo } from 'react';

import type { CalibrationInfo, StateCalibration } from '@/lib/api';
import { useAesthetic } from '@/lib/aesthetic';
import { hexToRgb, RISK_LEVELS, type RiskLevel } from '@/lib/theme';

type Tier = 'low' | 'moderate' | 'high' | 'extreme';

const TIER_LABEL: Record<Tier, string> = {
  low: 'Low',
  moderate: 'Mod',
  high: 'High',
  extreme: 'Ext',
};

/** Bucket a score against one state's thresholds, mirroring the backend. The high
 *  threshold is informational and not a boundary. */
function tierAt(score: number | null, t: StateCalibration['thresholds']): Tier | null {
  if (score == null) return null;
  if (score < t.low) return 'low';
  if (score < t.moderate) return 'moderate';
  if (score < t.extreme) return 'high';
  return 'extreme';
}

function tierColor(tier: Tier | null): { color: string; rgb: string } {
  if (tier == null) return { color: 'rgba(255,255,255,0.35)', rgb: '255,255,255' };
  const lvl = RISK_LEVELS[tier as RiskLevel];
  return { color: lvl.color, rgb: hexToRgb(lvl.color) };
}

/** How wide each of a state's four bands should draw, as fractions of its bar. */
function stateSegments(t: StateCalibration['thresholds']): Array<{
  tier: Tier;
  width: number;
  start: number;
}> {
  const max = 1.0;
  return [
    { tier: 'low',      start: 0,           width: t.low / max },
    { tier: 'moderate', start: t.low / max, width: (t.moderate - t.low) / max },
    { tier: 'high',     start: t.moderate / max, width: (t.extreme - t.moderate) / max },
    { tier: 'extreme',  start: t.extreme / max,  width: (max - t.extreme) / max },
  ];
}

export function CalibrationLadder({
  data,
  userState,
  userScore,
  liveLocation = true,
}: {
  data: CalibrationInfo;
  /** The user's own state, or null if we have no fit for where they are. */
  userState: string | null;
  /** Their current raw score. Null while it loads. */
  userScore: number | null;
  /** True on Status, where the location is still resolving. The what-if screen
   *  passes false. There the region is the user's own choice. */
  liveLocation?: boolean;
}) {
  const { ae } = useAesthetic();

  // Ordered so the extreme band visibly grows as you scan down, the same gradient
  // the README chart uses.
  const ordered = useMemo(() => {
    return Object.entries(data.states)
      .map(([code, cal]) => ({ code, ...cal }))
      .sort((a, b) => b.thresholds.extreme - a.thresholds.extreme);
  }, [data.states]);

  const scorePct =
    userScore != null
      ? Math.min(100, Math.max(0, userScore * 100))
      : null;

  // A state we have no fit for is shown as the global fallback, not dropped.
  const userIsCalibrated =
    userState != null && Boolean(data.states[userState]);

  // With no home row to pin it to, mark the score on every row instead.
  const showAllMarkers = userScore != null && !userIsCalibrated;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Header strip. Lines the score chip up over the bar column so the eye
          follows the number down into the colored bands. */}
      <LadderHeader
        ae={ae}
        scorePct={scorePct}
        userScore={userScore}
      />

      {/* With a calibrated state picked, that row carries its own score dash. In
          Global mode one straight line runs across every row instead. */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {ordered.map((s) => (
            <LadderRow
              key={s.code}
              ae={ae}
              code={s.code}
              thresholds={s.thresholds}
              isUser={s.code === userState}
              userScore={userScore}
              showMarker={s.code === userState}
            />
          ))}
        </div>
        {showAllMarkers && userScore != null ? (
          // Same grid as the rows, so the line falls exactly in the bar column.
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              padding: '0 8px',
              display: 'grid',
              gridTemplateColumns: ROW_TEMPLATE,
              columnGap: ROW_GAP,
              pointerEvents: 'none',
            }}
          >
            <span />
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: `${Math.min(100, Math.max(0, userScore * 100))}%`,
                  top: 0,
                  bottom: 0,
                  transform: 'translateX(-50%)',
                  width: 2.5,
                  borderRadius: 99,
                  background: '#fff',
                  boxShadow: '0 0 10px rgba(255,255,255,0.45)',
                }}
              />
            </div>
            <span />
          </div>
        ) : null}
      </div>

      {/* A footnote for the cases with no highlighted row. An unfitted state names
          itself, a location still resolving says so, everything else falls back to
          the global cutoffs. */}
      {userIsCalibrated ? null : userState != null ? (
        <p style={{ ...captionStyle(ae), marginTop: 14 }}>
          {userState} isn&apos;t one of the 17 fitted states yet. Your score
          buckets via the global cutoffs (LOW &lt;{data.global_thresholds.low.toFixed(2)} ·
          MOD &lt;{data.global_thresholds.moderate.toFixed(2)} ·
          EXT &ge;{data.global_thresholds.extreme.toFixed(2)}) until calibration
          extends to your region.
        </p>
      ) : liveLocation && userScore == null ? (
        <p style={{ ...captionStyle(ae), marginTop: 14 }}>
          Your location hasn&apos;t resolved yet. Once it does, your state&apos;s
          row will be highlighted.
        </p>
      ) : (
        <p style={{ ...captionStyle(ae), marginTop: 14 }}>
          No state calibration applies. Your score buckets via the global
          cutoffs (LOW &lt;{data.global_thresholds.low.toFixed(2)} ·
          MOD &lt;{data.global_thresholds.moderate.toFixed(2)} ·
          EXT &ge;{data.global_thresholds.extreme.toFixed(2)}).
        </p>
      )}
    </div>
  );
}

// Score chip and axis hint

function LadderHeader({
  ae,
  scorePct,
  userScore,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  scorePct: number | null;
  userScore: number | null;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: ROW_TEMPLATE,
        columnGap: ROW_GAP,
        alignItems: 'end',
        marginBottom: 4,
      }}
    >
      <span />
      <div style={{ position: 'relative', height: 22 }}>
        {scorePct != null ? (
          <div
            style={{
              position: 'absolute',
              left: `${scorePct}%`,
              top: 0,
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 8px',
              borderRadius: 99,
              background: 'rgba(255,255,255,0.06)',
              border: `0.5px solid ${ae.lineStrong}`,
              fontFamily: ae.fontMono,
              fontSize: 10,
              fontWeight: 700,
              color: ae.text,
              letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            your score{' '}
            <span style={{ color: ae.text }}>{userScore?.toFixed(2)}</span>
          </div>
        ) : null}
      </div>
      <span />
    </div>
  );
}

// Single state row

function LadderRow({
  ae,
  code,
  thresholds,
  isUser,
  userScore,
  showMarker,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  code: string;
  thresholds: StateCalibration['thresholds'];
  isUser: boolean;
  userScore: number | null;
  /** Whether to mark the score on this row. */
  showMarker: boolean;
}) {
  const segments = stateSegments(thresholds);
  const tier = tierAt(userScore, thresholds);
  const tierTone = tierColor(tier);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: ROW_TEMPLATE,
        columnGap: ROW_GAP,
        alignItems: 'center',
        padding: isUser ? '7px 8px' : '4px 8px',
        borderRadius: 8,
        background: isUser ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: isUser
          ? `0.5px solid rgba(${tierTone.rgb}, 0.32)`
          : '0.5px solid transparent',
        transition: 'background 0.2s ease',
      }}
    >
      {/* State code */}
      <span
        style={{
          fontFamily: ae.fontMono,
          fontSize: 11,
          fontWeight: isUser ? 800 : 600,
          letterSpacing: '0.14em',
          color: isUser ? ae.text : ae.textMute,
          textTransform: 'uppercase',
        }}
      >
        {code}
      </span>

      {/* Segmented bar */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            gap: 3,
            height: isUser ? 10 : 7,
            transition: 'height 0.2s ease',
          }}
        >
          {segments.map((s) => {
            const tone = tierColor(s.tier);
            const isActiveTier = tier === s.tier;
            // The user's row is full strength and the rest muted. Within any row,
            // the tier their score lands in lifts a little.
            const bg = isUser
              ? `linear-gradient(180deg, rgba(${tone.rgb}, ${
                  isActiveTier ? 0.70 : 0.50
                }), rgba(${tone.rgb}, ${isActiveTier ? 0.30 : 0.20}))`
              : `linear-gradient(180deg, rgba(${tone.rgb}, ${
                  isActiveTier ? 0.45 : 0.28
                }), rgba(${tone.rgb}, ${isActiveTier ? 0.18 : 0.10}))`;
            const borderAlpha = isUser
              ? isActiveTier
                ? 0.55
                : 0.32
              : isActiveTier
                ? 0.32
                : 0.16;
            return (
              <div
                key={s.tier}
                style={{
                  width: `${s.width * 100}%`,
                  background: bg,
                  border: `0.5px solid rgba(${tone.rgb}, ${borderAlpha})`,
                  borderRadius: 99,
                  transition: 'background 0.3s ease',
                }}
              />
            );
          })}
        </div>

        {/* Score marker. Sits on the home row, or on every row in Global mode
            where there is no home state. Hidden until the score resolves. */}
        {showMarker && userScore != null ? (
          <div
            style={{
              position: 'absolute',
              left: `${Math.min(100, Math.max(0, userScore * 100))}%`,
              top: -3,
              transform: 'translateX(-50%)',
              width: 2.5,
              height: 16,
              borderRadius: 99,
              background: '#fff',
              boxShadow: `0 0 10px ${tierTone.color}`,
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </div>

      {/* Tier-at-your-score chip */}
      <span
        style={{
          justifySelf: 'end',
          fontFamily: ae.fontMono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.16em',
          color: tier ? tierTone.color : ae.textMute,
          textTransform: 'uppercase',
        }}
      >
        {tier ? TIER_LABEL[tier] : '—'}
      </span>
    </div>
  );
}

// Tokens

const ROW_TEMPLATE = '32px 1fr 48px';
const ROW_GAP = 12;

function captionStyle(ae: ReturnType<typeof useAesthetic>['ae']): React.CSSProperties {
  return {
    margin: 0,
    fontFamily: ae.fontBody,
    fontSize: 12.5,
    lineHeight: 1.5,
    color: ae.textDim,
  };
}
