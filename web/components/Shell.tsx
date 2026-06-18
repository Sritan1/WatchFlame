'use client';

// Top-level layout: floating 220px glass sidebar (14px inset on all sides) +
// sticky floating 56px topbar dock + content slot. Pages render INTO this
// shell — they don't repeat sidebar/topbar. Content offset = 14 (gutter) +
// 220 (sidebar) + 14 (gap) = 248px from the viewport's left edge.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { Icon } from '@/components/Icon';
import { MobileNav } from '@/components/MobileNav';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { useAesthetic } from '@/lib/aesthetic';
import { useUserLocation } from '@/lib/use-location';

export function Shell({ children }: { children: ReactNode }) {
  const { ae } = useAesthetic();
  const pathname = usePathname();
  return (
    <div style={{ background: ae.bg, color: ae.text, minHeight: '100vh' }}>
      <Sidebar />
      <MobileNav />
      <div className="app-content" style={{ marginLeft: 248 }}>
        <Topbar />
        <LocationNotice />
        {/* `key={pathname}` re-mounts the main on route change, replaying the
         *  ember-route-fade animation so each page entrance gets a 220ms
         *  fade+lift instead of a snap. */}
        <main
          key={pathname}
          className="ember-route-fade"
          style={{ background: ae.bg, minHeight: 'calc(100vh - 80px)' }}
        >
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}

/** Thin global banner shown when the browser denied/cannot provide geolocation
 *  AND we've fallen back to the Berkeley default — so the user knows the data
 *  they're seeing isn't for their actual location. Suppressed when a saved
 *  location is active (isFallback === false): that's a deliberate choice, not a
 *  silent fallback. Dismissible for the session. */
function LocationNotice() {
  const { ae } = useAesthetic();
  const loc = useUserLocation();
  const [dismissed, setDismissed] = useState(false);

  const usingFallback =
    loc.isFallback &&
    (loc.permission === 'denied' || loc.permission === 'unavailable');
  if (!usingFallback || dismissed) return null;

  const SLATE = '148, 163, 184';
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        margin: '0 24px',
        padding: '8px 14px',
        borderRadius: 10,
        background: `linear-gradient(180deg, rgba(${SLATE}, 0.07), rgba(${SLATE}, 0.03))`,
        border: `0.5px solid rgba(${SLATE}, 0.28)`,
        fontFamily: ae.fontBody,
        fontSize: 12.5,
        color: ae.textDim,
      }}
    >
      <Icon name="warn" size={14} color="#E8B339" strokeWidth={1.8} />
      <span style={{ flex: 1, minWidth: 0 }}>
        Location access is off — showing <strong style={{ color: ae.text }}>{loc.label}</strong> as
        a default. Enable location (or pick a saved place) for data about where you actually are.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: 6,
          background: 'transparent',
          border: `0.5px solid rgba(${SLATE}, 0.30)`,
          color: ae.textMute,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          lineHeight: 1,
          fontSize: 13,
        }}
      >
        ×
      </button>
    </div>
  );
}

function Footer() {
  const { ae } = useAesthetic();
  return (
    <footer
      className="app-footer"
      style={{
        minHeight: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 14,
        rowGap: 6,
        padding: '8px 24px',
        borderTop: `0.5px solid ${ae.line}`,
        background: ae.bg,
        fontFamily: ae.fontMono,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.16em',
        color: ae.textMute,
        textTransform: 'uppercase',
      }}
    >
      <span>Ember Watch · v4 · Built 2026</span>
      <nav style={{ display: 'flex', gap: 16 }} aria-label="Legal">
        {[
          { href: '/terms', label: 'Terms' },
          { href: '/privacy', label: 'Privacy' },
          { href: '/accessibility', label: 'Accessibility' },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="web-footer-link"
            style={{ color: ae.textDim, textDecoration: 'none', letterSpacing: '0.14em' }}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
