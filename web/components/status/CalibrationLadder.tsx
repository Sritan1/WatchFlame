'use client';

// 17-state "same score, different tier" comparison ladder, rendered inside
// the Status calibration modal. Visual language ported from the Status Fire
// Weather card's segmented gauge (3px gaps, gradient fills, pill segments)
// so it reads as part of the same design system.
//
// Per-state row: state code · segmented bar (segments sized to the state's
// fitted percentile boundaries) · tier-at-your-score chip on the right.
//
// The user's home state row is highlighted (brighter segment fills + border
// + score marker dot on the bar). Non-user rows are muted so the comparison
// pops without the eye getting lost.
//
// Pure presentational component — data comes via props. Empty / loading
// states are handled by the parent modal.

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

/** Bucket a raw score under a state's calibrated thresholds. Mirrors
 *  `_bucket` in api/core/regional_calibration.py — note `t.high` (90th
 *  percentile) is informational only and NOT a bucket boundary; HIGH→EXT
 *  cuts at `t.extreme` (97th). */
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

/** Width-of-band fractions for one state's 4 calibrated segments, in
 *  display order (LOW / MOD / HIGH / EXT). Each segment sized to its
 *  span on a 0..score_max axis (score_max defaults to 1.0 for display). */
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
}: {
  data: CalibrationInfo;
  /** State code (e.g. "CA") for the user's current location. Null when the
   *  user is outside the 17 fitted states or location hasn't resolved yet. */
  userState: string | null;
  /** User's current raw V4 score. Null while risk data is loading. */
  userScore: number | null;
}) {
  const { ae } = useAesthetic();

  // Sort ascending by EXT threshold — fire-prone West (high EXT) sits at top,
  // humid SE belt (low EXT) lands at bottom. The reader scans down and sees
  // the "extreme" band grow visibly as states get more fire-prone — the same
  // visual gradient as the README chart so the two read consistently.
  const ordered = useMemo(() => {
    return Object.entries(data.states)
      .map(([code, cal]) => ({ code, ...cal }))
      .sort((a, b) => b.thresholds.extreme - a.thresholds.extreme);
  }, [data.states]);

  const scorePct =
    userScore != null
      ? Math.min(100, Math.max(0, userScore * 100))
      : null;

  // Decides whether the modal got a useful state code. State codes outside
  // the fitted set are surfaced as "global fallback" rather than dropped.
  const userIsCalibrated =
    userState != null && Boolean(data.states[userState]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Header strip — anchors the vertical alignment of the score chip
          above the bar column, so the reader's eye reads "0.45 from the
          chip flows down into the colored bands below." */}
      <LadderHeader
        ae={ae}
        scorePct={scorePct}
        userScore={userScore}
      />

      {/* State rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {ordered.map((s) => (
          <LadderRow
            key={s.code}
            ae={ae}
            code={s.code}
            thresholds={s.thresholds}
            isUser={s.code === userState}
            userScore={userScore}
          />
        ))}
      </div>

      {/* Global-fallback footnote when the user isn't in one of the 17 */}
      {!userIsCalibrated && userState == null ? (
        <p style={{ ...captionStyle(ae), marginTop: 14 }}>
          Your location hasn&apos;t resolved yet — once it does, your state&apos;s
          row will be highlighted.
        </p>
      ) : !userIsCalibrated ? (
        <p style={{ ...captionStyle(ae), marginTop: 14 }}>
          {userState} isn&apos;t one of the 17 fitted states yet. Your score
          buckets via the global cutoffs (LOW &lt;{data.global_thresholds.low.toFixed(2)} ·
          MOD &lt;{data.global_thresholds.moderate.toFixed(2)} ·
          EXT &ge;{data.global_thresholds.extreme.toFixed(2)}) until calibration
          extends to your region.
        </p>
      ) : null}
    </div>
  );
}

// ─── Header (score chip + axis hint) ─────────────────────────────────────

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

// ─── Single state row ────────────────────────────────────────────────────

function LadderRow({
  ae,
  code,
  thresholds,
  isUser,
  userScore,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  code: string;
  thresholds: StateCalibration['thresholds'];
  isUser: boolean;
  userScore: number | null;
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
            // Brightness: user row is full strength; others use a softer
            // muted treatment so the user's row clearly leads visually.
            // Within a row, the tier the user's score lands in pops a hair.
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

        {/* Score marker — only on the user's home row, in the user's tier color */}
        {isUser && userScore != null ? (
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

// ─── Tokens ──────────────────────────────────────────────────────────────

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
