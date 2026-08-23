import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';

import { DisclaimerGate } from '@/components/DisclaimerGate';
import { AestheticProvider } from '@/lib/aesthetic';
import { QueryProvider } from '@/lib/query-provider';
import { SavedLocationsProvider } from '@/lib/use-saved-locations';
import { UnitsProvider } from '@/lib/use-units';

import './globals.css';

// Geist covers both body and display. One family reads cleaner here than
// mixing three, and the 300 weight gives light captions against heavy data.
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'WatchFlame · Wildfire Intelligence',
  description: 'Real-time wildfire risk monitoring, evacuation planning, and federal advisory tracking.',
};

export const viewport: Viewport = {
  // Keep both. A custom viewport export replaces the default, and without them a
  // phone renders at about 980px so no breakpoint ever fires.
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B0E12',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <QueryProvider>
          <AestheticProvider>
            <DisclaimerGate />
            <UnitsProvider>
              <SavedLocationsProvider>{children}</SavedLocationsProvider>
            </UnitsProvider>
          </AestheticProvider>
        </QueryProvider>
        {/* Cookieless and first-party, so the CSP 'self' rule covers it. Does
            nothing off Vercel. */}
        <Analytics />
      </body>
    </html>
  );
}
