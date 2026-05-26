'use client';

// "Immediate Preparation" — 6 prep actions with custom checkboxes, IndexBadge,
// time pill, and a ProgressArc header showing X/6 complete + remaining minutes.

import { useMemo, useState } from 'react';

import { Icon } from '@/components/Icon';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { IndexBadge } from '@/components/ui/IndexBadge';
import { ProgressArc } from '@/components/ui/ProgressArc';
import { useAesthetic } from '@/lib/aesthetic';
import { getRisk, type RiskLevel } from '@/lib/theme';

interface ChecklistItem {
  id: string;
  label: string;
  time: string;
  /** Minutes used for "X min remaining" math. */
  minutes: number;
  desc: string;
}

const CHECKLIST: ChecklistItem[] = [
  { id: 'gobag',   label: "Pack emergency 'Go Bag'",          time: '20 min', minutes: 20, desc: 'IDs, meds, water, charger, flashlight, paper map.' },
  { id: 'devices', label: 'Charge all mobile devices',         time: '5 min',  minutes: 5,  desc: 'Phones, radios, battery packs to 100%.' },
  { id: 'windows', label: 'Close all windows and doors',       time: '10 min', minutes: 10, desc: 'Including pet doors, attic vents, garage.' },
  { id: 'gutters', label: 'Clear leaves from gutters',         time: '30 min', minutes: 30, desc: 'Remove combustible debris within 5 ft of home.' },
  { id: 'pets',    label: 'Confirm pets and family contacts',  time: '10 min', minutes: 10, desc: 'Carriers ready, ICE numbers updated, kids briefed.' },
  { id: 'meds',    label: 'Gather essential medications',      time: '5 min',  minutes: 5,  desc: '7-day supply of prescriptions and basics.' },
];

export function ChecklistCard({ riskLevel }: { riskLevel: RiskLevel }) {
  const { ae, accent } = useAesthetic();
  const r = getRisk(riskLevel, accent);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const done = useMemo(() => CHECKLIST.filter((c) => checked[c.id]).length, [checked]);
  const remainingMin = useMemo(
    () => CHECKLIST.filter((c) => !checked[c.id]).reduce((sum, c) => sum + c.minutes, 0),
    [checked],
  );

  const toggle = (id: string) =>
    setChecked((s) => ({ ...s, [id]: !s[id] }));

  return (
    <div
      className="ember-card"
      style={{
        background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
        border: ae.cardBorder,
        borderRadius: ae.radiusLg,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '22px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          borderBottom: `0.5px solid ${ae.line}`,
        }}
      >
        <div>
          <Eyebrow color={r.color}>Action Checklist</Eyebrow>
          <h2
            style={{
              margin: '6px 0 0',
              fontFamily: ae.fontDisplay,
              fontSize: 26,
              fontWeight: ae.titleWeight,
              letterSpacing: '-0.02em',
              color: ae.text,
              lineHeight: 1,
            }}
          >
            Immediate Preparation
          </h2>
          <div
            style={{
              marginTop: 6,
              fontFamily: ae.fontMono,
              fontSize: 11,
              color: ae.textDim,
              letterSpacing: '0.06em',
            }}
          >
            {done}/{CHECKLIST.length} complete · ~{remainingMin} min remaining
          </div>
        </div>
        <ProgressArc value={done} total={CHECKLIST.length} color={r.color} size={92} />
      </div>

      {/* Rows */}
      <div>
        {CHECKLIST.map((it, i) => {
          const isChecked = !!checked[it.id];
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => toggle(it.id)}
              style={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: '32px 1fr 22px',
                gap: 16,
                alignItems: 'center',
                padding: '16px 24px',
                borderTop: i === 0 ? 'none' : `0.5px solid ${ae.line}`,
                cursor: 'pointer',
                transition: 'background 0.15s',
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <IndexBadge n={i + 1} color={isChecked ? r.color : ae.textMute} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      border: isChecked
                        ? `1.5px solid ${r.color}`
                        : `1.5px solid ${ae.lineStrong}`,
                      background: isChecked
                        ? `linear-gradient(180deg, rgba(${r.glow}, 1), rgba(${r.glow}, 0.78))`
                        : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: isChecked
                        ? `0 0 12px rgba(${r.glow}, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)`
                        : 'none',
                      transition: 'all 0.18s',
                    }}
                  >
                    {isChecked ? <Icon name="check" size={13} color="#fff" strokeWidth={2.5} /> : null}
                  </div>
                  <span
                    style={{
                      fontFamily: ae.fontDisplay,
                      fontSize: 15,
                      fontWeight: 600,
                      color: isChecked ? ae.textMute : ae.text,
                      letterSpacing: ae.titleTracking,
                      textDecoration: isChecked ? 'line-through' : 'none',
                    }}
                  >
                    {it.label}
                  </span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 99,
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: `0.5px solid ${ae.line}`,
                      fontFamily: ae.fontMono,
                      fontSize: 9.5,
                      fontWeight: 600,
                      color: ae.textMute,
                      letterSpacing: '0.10em',
                    }}
                  >
                    {it.time}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 4,
                    marginLeft: 32,
                    fontFamily: ae.fontBody,
                    fontSize: 12.5,
                    color: ae.textMute,
                    lineHeight: 1.4,
                  }}
                >
                  {it.desc}
                </div>
              </div>
              <Icon name="chevron" size={13} color={ae.textMute} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
