'use client';

// Sticky top bar — breadcrumb left, Refresh + LIVE timestamp right.

import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { Icon } from '@/components/Icon';
import { useAesthetic } from '@/lib/aesthetic';
import { hexToRgb, RISK_LEVELS } from '@/lib/theme';

const ROUTE_META: Record<string, { group: string; title: string }> = {
  '/':         { group: 'Operations', title: 'Command Center' },
  '/map':      { group: 'Operations', title: 'Live Map' },
  '/risk':     { group: 'Planning',   title: 'Risk Forecast' },
  '/safety':   { group: 'Planning',   title: 'Safety Plan' },
  '/settings': { group: 'Account',    title: 'Settings' },
};

export function Topbar() {
  const { ae } = useAesthetic();
  const pathname = usePathname();
  const meta = ROUTE_META[pathname] ?? ROUTE_META['/'];
  const bgRgb = hexToRgb(ae.bg);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      // Spin for at least 400ms so the user sees feedback even when mocks resolve instantly.
      setTimeout(() => setRefreshing(false), 400);
    }
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        height: 64,
        zIndex: 20,
        background: `linear-gradient(180deg, rgba(${bgRgb}, 0.92), rgba(${bgRgb}, 0.72))`,
        borderBottom: `0.5px solid ${ae.line}`,
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
      }}
    >
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            fontFamily: ae.fontMono,
            fontSize: 11.5,
            fontWeight: 500,
            letterSpacing: '0.12em',
            textTransform: ae.chipUpper ? 'uppercase' : 'none',
            color: ae.textMute,
          }}
        >
          {meta.group}
        </span>
        <span style={{ color: ae.textMute, fontFamily: ae.fontMono, fontSize: 13 }}>/</span>
        <span
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: ae.titleTracking,
            color: ae.text,
          }}
        >
          {meta.title}
        </span>
      </div>

      {/* Right cluster — Refresh + LIVE timestamp. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={handleRefresh}
          aria-label="Refresh data"
          disabled={refreshing}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            cursor: refreshing ? 'progress' : 'pointer',
            background: 'rgba(255, 255, 255, 0.03)',
            border: `0.5px solid ${ae.line}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: ae.textDim,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              animation: refreshing ? 'px-rotate 0.9s linear infinite' : 'none',
            }}
          >
            <Icon name="refresh" size={14} color={ae.textDim} strokeWidth={1.7} />
          </span>
        </button>
        <div
          style={{
            height: 32,
            padding: '0 12px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
            border: `0.5px solid ${ae.line}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 99,
              background: RISK_LEVELS.low.color,
              boxShadow: `0 0 8px ${RISK_LEVELS.low.color}`,
              animation: 'ember-flicker 2.4s ease-in-out infinite',
            }}
          />
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 10.5,
              fontWeight: 600,
              color: ae.textDim,
              letterSpacing: '0.14em',
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}
          >
            Live
          </span>
          <span
            style={{
              fontFamily: ae.fontMono,
              fontSize: 10.5,
              color: ae.textMute,
              letterSpacing: '0.04em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            14:32 PT
          </span>
        </div>
      </div>
    </header>
  );
}
