'use client';

// Floating glass dock — sticky 56px pill with breadcrumb left, Refresh + LIVE
// timestamp right. Sits inside a 14px-padded sticky wrapper so it floats
// above content rather than reading as a flush bar.

import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Icon } from '@/components/Icon';
import { LocationsModal } from '@/components/location/LocationsModal';
import { useAesthetic } from '@/lib/aesthetic';
import { hexToRgb, RISK_LEVELS } from '@/lib/theme';

const ROUTE_META: Record<string, { group: string; title: string }> = {
  '/':            { group: 'Operations', title: 'Status' },
  '/map':         { group: 'Operations', title: 'Live Map' },
  '/fire-detail': { group: 'Operations', title: 'Fire Detail' },
  '/risk':        { group: 'Planning',   title: 'Fire-Weather What-If' },
  '/safety':      { group: 'Planning',   title: 'Safety' },
  '/settings':    { group: 'Account',    title: 'Settings' },
};

const DEFAULT_ACCENT = '#FFA76A';

export function Topbar() {
  const { ae } = useAesthetic();
  const pathname = usePathname();
  const meta = ROUTE_META[pathname] ?? ROUTE_META['/'];

  const accent = DEFAULT_ACCENT;
  const accentRgb = hexToRgb(accent);
  const bgRgb = hexToRgb(ae.bg);

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);
  // Mobile-only location entry — the sidebar's "Watching" picker is hidden on
  // mobile, so the Topbar surfaces the same LocationsModal there.
  const [locOpen, setLocOpen] = useState(false);

  // Live wall-clock — initialized lazily so SSR doesn't mismatch.
  const [now, setNow] = useState<string>('');
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZoneName: 'short',
      });
    setNow(fmt());
    const id = setInterval(() => setNow(fmt()), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      refreshTimer.current = setTimeout(() => setRefreshing(false), 400);
    }
  };

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        padding: '14px 24px 10px',
        background: `linear-gradient(180deg, rgba(${bgRgb}, 0.65), rgba(${bgRgb}, 0))`,
      }}
    >
      <header
        style={{
          position: 'relative',
          height: 56,
          borderRadius: 18,
          background: `
            radial-gradient(120% 200% at 100% 0%, rgba(${accentRgb}, 0.06), transparent 65%),
            linear-gradient(180deg, rgba(${bgRgb}, 0.70), rgba(${bgRgb}, 0.50))
          `,
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          border: '0.5px solid rgba(255,255,255,0.10)',
          boxShadow: `
            0 12px 40px rgba(0,0,0,0.40),
            0 2px 10px rgba(0,0,0,0.25),
            inset 0 1px 0 rgba(255,255,255,0.10),
            inset 0 -1px 0 rgba(0,0,0,0.25)
          `,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px 0 18px',
          overflow: 'hidden',
        }}
      >
        {/* Inner top hairline highlight */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            borderRadius: 'inherit',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.05), transparent 30%)',
          }}
        />

        {/* Breadcrumb — group label · chevron · active pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
          {/* Mobile-only brand — the sidebar (which carries the wordmark on
              desktop) is hidden on phones, so surface WatchFlame here in place
              of the screen-title pill (the bottom nav already shows the screen). */}
          <span
            className="app-show-mobile"
            aria-label="WatchFlame"
            style={{ display: 'none', alignItems: 'center', gap: 8 }}
          >
            <span
              aria-hidden
              style={{
                width: 24,
                height: 24,
                borderRadius: 7,
                flexShrink: 0,
                background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.45), transparent 60%), radial-gradient(circle at 60% 60%, ${accent}, rgba(${accentRgb}, 0.6) 70%)`,
                border: `0.5px solid rgba(${accentRgb}, 0.55)`,
                boxShadow: `0 0 14px rgba(${accentRgb}, 0.4), inset 0 1px 0 rgba(255,255,255,0.35)`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="flame" size={13} color="#fff" strokeWidth={2} />
            </span>
            <span
              style={{
                fontFamily: ae.fontDisplay,
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '0.01em',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: ae.text }}>Watch</span>
              <span style={{ color: accent }}>Flame</span>
            </span>
          </span>
          <span
            className="app-hide-mobile"
            style={{
              fontFamily: ae.fontMono,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.14em',
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
              color: ae.textMute,
            }}
          >
            {meta.group}
          </span>
          <svg
            className="app-hide-mobile"
            width="8"
            height="14"
            viewBox="0 0 8 14"
            fill="none"
            style={{ opacity: 0.4 }}
            aria-hidden
          >
            <path
              d="M1 1l5 6-5 6"
              stroke={ae.textMute}
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          <span
            className="app-hide-mobile"
            style={{
              position: 'relative',
              padding: '5px 12px 5px 11px',
              borderRadius: 9,
              background: `linear-gradient(180deg, rgba(${accentRgb}, 0.14), rgba(${accentRgb}, 0.04))`,
              border: `0.5px solid rgba(${accentRgb}, 0.30)`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 10px rgba(${accentRgb}, 0.12)`,
              fontFamily: ae.fontDisplay,
              fontSize: 13.5,
              fontWeight: 600,
              letterSpacing: ae.titleTracking,
              color: ae.text,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: accent,
                boxShadow: `0 0 10px ${accent}, 0 0 3px ${accent}`,
              }}
            />
            {meta.title}
          </span>
        </div>

        {/* Right cluster — Refresh icon button + LIVE timestamp capsule */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            position: 'relative',
          }}
        >
          {/* Mobile-only: change location (replaces the hidden sidebar picker) */}
          <button
            type="button"
            onClick={() => setLocOpen(true)}
            aria-label="Change location"
            className="web-icon-btn app-show-mobile"
            style={{
              display: 'none',
              width: 36,
              height: 36,
              borderRadius: 11,
              cursor: 'pointer',
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
              border: '0.5px solid rgba(255,255,255,0.08)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
              alignItems: 'center',
              justifyContent: 'center',
              color: ae.textDim,
            }}
          >
            <Icon name="pin" size={14} color={accent} strokeWidth={1.8} />
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh data"
            className="web-icon-btn"
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              cursor: refreshing ? 'progress' : 'pointer',
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
              border: '0.5px solid rgba(255,255,255,0.08)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
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

          {/* LIVE capsule with aurora glow + ping ring */}
          <div
            style={{
              position: 'relative',
              height: 36,
              padding: '0 12px 0 11px',
              borderRadius: 11,
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.012))',
              border: '0.5px solid rgba(255,255,255,0.08)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              overflow: 'hidden',
            }}
          >
            <span
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                background: `radial-gradient(80% 200% at 0% 50%, rgba(${RISK_LEVELS.low.glow}, 0.10), transparent 60%)`,
              }}
            />
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 99,
                  background: RISK_LEVELS.low.color,
                  boxShadow: `0 0 10px ${RISK_LEVELS.low.color}, 0 0 3px ${RISK_LEVELS.low.color}`,
                  animation: 'ember-flicker 2.4s ease-in-out infinite',
                }}
              />
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: -3,
                  borderRadius: 99,
                  border: `1px solid ${RISK_LEVELS.low.color}`,
                  opacity: 0.6,
                  animation: 'web-ping 2.4s ease-out infinite',
                }}
              />
            </span>
            <span
              style={{
                position: 'relative',
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                fontWeight: 700,
                color: ae.textDim,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}
            >
              Live
            </span>
            <span
              className="app-hide-mobile"
              style={{
                width: 1,
                height: 14,
                background: 'rgba(255,255,255,0.10)',
                margin: '0 2px',
              }}
            />
            <span
              className="app-hide-mobile"
              style={{
                position: 'relative',
                fontFamily: ae.fontMono,
                fontSize: 10.5,
                color: ae.textMute,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {now || '—'}
            </span>
          </div>
        </div>
      </header>
      <LocationsModal open={locOpen} onClose={() => setLocOpen(false)} />
    </div>
  );
}
