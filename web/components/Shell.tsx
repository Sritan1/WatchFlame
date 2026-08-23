'use client';

// The layout every page renders into, so no page repeats the chrome. The content
// offset clears the sidebar rail and its gutters.

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
        {/* The key re-mounts main on a route change, replaying the fade so a page
            arrives on a short lift instead of snapping in. */}
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

/** Says the default location is showing and not theirs, because GPS was denied or
 *  resolved outside the US. A saved location hides it. That one they picked. */
function LocationNotice() {
  const { ae } = useAesthetic();
  const loc = useUserLocation();
  const { activeId } = useSavedLocations();
  const [dismissed, setDismissed] = useState(false);

  // Dismissing only covers the current location, so switching away and back brings
  // it back. Adjusted during render, not in an effect.
  const [dismissedFor, setDismissedFor] = useState<string | null>(activeId);
  if (dismissedFor !== activeId) {
    setDismissedFor(activeId);
    setDismissed(false);
  }

  const permissionOff =
    loc.isFallback &&
    (loc.permission === 'denied' || loc.permission === 'unavailable');
  // Being abroad means location worked, so the two reasons never overlap.
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
        // Above the page's background canvases, which would paint over it, and
        // still below the topbar.
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        // Top-aligned, so on a phone where the message wraps the icon and close
        // button sit beside the first line and not halfway down.
        alignItems: 'flex-start',
        gap: 10,
        margin: '0 24px',
        padding: '8px 14px',
        borderRadius: 10,
        // Frosted, so it stays legible over whatever is behind it.
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

