import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';

import { DisclaimerGate } from '@/components/DisclaimerGate';
import { AestheticProvider } from '@/lib/aesthetic';
import { QueryProvider } from '@/lib/query-provider';
import { SavedLocationsProvider } from '@/lib/use-saved-locations';
import { UnitsProvider } from '@/lib/use-units';

import './globals.css';

// Geist (Vercel's typeface) handles both body and display — single-family
// approach reads cleaner than Inter+Inter Tight + JetBrains Mono. The 300
// weight enables a light-caption / heavy-data contrast pattern.
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
  title: 'Ember Watch · Wildfire Intelligence',
  description: 'Real-time wildfire risk monitoring, evacuation planning, and federal advisory tracking.',
};

export const viewport: Viewport = {
  // width=device-width + initial-scale=1 is required for responsive breakpoints
  // to engage on mobile (and in DevTools device mode). A custom viewport export
  // that omits these drops the default, so the page renders at a ~980px desktop
  // width and @media (max-width:…) never matches.
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
        {/* Vercel Web Analytics — cookieless, first-party (served from
         *  /_vercel/insights on our own origin, so CSP 'self' covers it). No-op
         *  off Vercel (dev / non-Vercel host). See the privacy policy. */}
        <Analytics />
      </body>
    </html>
  );
}
