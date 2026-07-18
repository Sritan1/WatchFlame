'use client';

// Top-level layout: floating 220px glass sidebar (14px inset on all sides) +
// sticky floating 56px topbar dock + content slot. Pages render INTO this
// shell — they don't repeat sidebar/topbar. Content offset = 14 (gutter) +
// 220 (sidebar) + 14 (gap) = 248px from the viewport's left edge.

import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { Icon } from '@/components/Icon';
import { MobileNav } from '@/components/MobileNav';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { useAesthetic } from '@/lib/aesthetic';
import { useUserLocation } from '@/lib/use-location';
import { useSavedLocations } from '@/lib/use-saved-locations';

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
      </div>
    </div>
  );
}

/** Thin global banner shown when we've fallen back to the Berkeley default, for
 *  one of two reasons: the browser denied/cannot provide geolocation, OR the
 *  device GPS resolved to a location OUTSIDE the US (the app's incident /
 *  shelter / FEMA / calibration data is US-only). Either way the user should
 *  know the data isn't for their actual location. Suppressed when a saved
 *  location is active: that's a deliberate choice, not a silent fallback.
 *  Dismissible for the session. */
function LocationNotice() {
  const { ae } = useAesthetic();
  const loc = useUserLocation();
  const { activeId } = useSavedLocations();
  const [dismissed, setDismissed] = useState(false);

  // Dismissing hides the banner for the CURRENT location only — if the user
  // switches to a different location and back, it should reappear. Reset the
  // dismiss whenever the active selection changes, using React's "adjust state
  // during render on a changed value" pattern (no effect, converges in one extra
  // render since the next render sees dismissedFor === activeId).
  const [dismissedFor, setDismissedFor] = useState<string | null>(activeId);
  if (dismissedFor !== activeId) {
    setDismissedFor(activeId);
    setDismissed(false);
  }

  const permissionOff =
    loc.isFallback &&
    (loc.permission === 'denied' || loc.permission === 'unavailable');
  // outsideUs implies permission 'granted' (GPS worked, just abroad), so the two
  // reasons are mutually exclusive. `dismissed` hides it for the session once the
  // user closes it with the × button.
  if ((!permissionOff && !loc.outsideUs) || dismissed) return null;

  const message = loc.outsideUs ? (
    <>
      WatchFlame currently covers the United States. Showing{' '}
      <strong style={{ color: ae.text }}>{loc.label}</strong>{' '}as a default. Search for a US city
      above to set your location.
    </>
  ) : (
    <>
      Location access is off. Showing <strong style={{ color: ae.text }}>{loc.label}</strong>{' '}as a
      default. Enable location, or pick a saved place, for data about where you actually are.
    </>
  );

  const SLATE = '148, 163, 184';
  return (
    <div
      role="status"
      style={{
        // Lift above the page's fixed background canvases (zIndex 0). Without a
        // position + z-index this static banner is painted over by them and is
        // invisible — it sits below the Topbar (zIndex 20), above the backdrop.
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        // flex-start (not center) so on a phone, where the message wraps to
        // several lines, the icon + × sit beside the FIRST line instead of
        // floating in the middle of the block.
        alignItems: 'flex-start',
        gap: 10,
        margin: '0 24px',
        padding: '8px 14px',
        borderRadius: 10,
        // Translucent glass so it reads clearly over whatever background is behind.
        background: `linear-gradient(180deg, rgba(${SLATE}, 0.12), rgba(${SLATE}, 0.06)), rgba(11, 14, 18, 0.6)`,
        backdropFilter: 'blur(10px)',
        border: `0.5px solid rgba(${SLATE}, 0.28)`,
        fontFamily: ae.fontBody,
        fontSize: 12.5,
        color: ae.textDim,
      }}
    >
      <Icon name="warn" size={14} color="#E8B339" strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 2 }} />
      <span style={{ flex: 1, minWidth: 0 }}>{message}</span>
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

