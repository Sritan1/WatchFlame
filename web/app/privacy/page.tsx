import type { Metadata } from 'next';

import { LegalLayout } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Privacy Policy — Ember Watch',
  description: 'How Ember Watch handles location and technical data.',
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="June 17, 2026">
      <p>
        Ember Watch is built to need as little of your data as possible. It has{' '}
        <strong>no user accounts</strong>, sets <strong>no advertising or tracking cookies</strong>,
        and runs <strong>no third-party analytics</strong>. This policy explains the limited data the
        Service does handle.
      </p>

      <h2>Location</h2>
      <p>
        If you grant your browser&apos;s location permission, your approximate coordinates are sent to
        our backend solely to fetch local conditions (fire detections, weather, drought, vegetation)
        for your area. You can decline the permission and instead use a searched or saved location.
      </p>
      <ul>
        <li>Coordinates are used transiently to query public data providers and are cached only
          briefly, keyed by a <strong>coarse, rounded coordinate</strong> (not by you).</li>
        <li>They are <strong>never tied to an account or identity</strong> (there are none), and are
          <strong> never sold, rented, or shared</strong> for advertising.</li>
        <li><strong>Saved locations</strong> are stored only in your own browser (localStorage) on your
          device — they are not uploaded to or stored on our servers.</li>
      </ul>

      <h2>Technical / log data</h2>
      <p>
        Like any website, our hosting providers may record standard request logs (such as IP address,
        timestamp, and requested URL) for security and reliability. This is transient operational data,
        not used to profile you, and not combined with any identity.
      </p>

      <h2>Third parties that receive your coordinates</h2>
      <p>
        To return local data, your coordinates are passed to the relevant public data providers — e.g.
        OpenWeatherMap, Open-Meteo, NASA FIRMS, NIFC, CAL FIRE, Copernicus / Sentinel-2, the U.S.
        Census Bureau, NCES, FEMA, and map tiles via MapTiler / OpenStreetMap. Their own privacy terms
        govern their handling of that request.
      </p>

      <h2>Cookies &amp; tracking</h2>
      <p>
        We do not use advertising cookies, cross-site trackers, or analytics. Your preferences (units,
        theme, saved locations) live in your browser&apos;s local storage on your device.
      </p>

      <h2>Data retention</h2>
      <p>
        We keep as little as possible, for as short a time as possible:
      </p>
      <ul>
        <li><strong>Coordinates</strong> are held only in a temporary in-memory cache, keyed by a coarse
          rounded value, and expire automatically — they are never written to a persistent database.</li>
        <li><strong>Request logs</strong> (IP, timestamp, URL) are retained only for the short window our
          hosting providers keep standard logs — typically a few weeks — and are then rotated out
          automatically.</li>
        <li><strong>On-device data</strong> (saved locations, units, theme) stays in your browser until
          you clear it; we never receive or store it.</li>
      </ul>

      <h2>Your privacy rights (GDPR &amp; CCPA)</h2>
      <p>
        Because the Service has no accounts and holds coordinates only transiently — keyed by a coarse
        rounded value rather than by you — we generally hold no information that identifies you, so most
        data requests have nothing for us to act on. Where applicable, you still have the rights below.
      </p>
      <ul>
        <li><strong>If you are in the EU/EEA or UK (GDPR):</strong> rights of access, rectification,
          erasure, restriction, objection, and data portability. Our legal basis for handling the limited
          data above is our legitimate interest in delivering the local conditions you request and in
          operating the Service securely.</li>
        <li><strong>If you are in California (CCPA/CPRA):</strong> rights to know, delete, and correct
          personal information, and to opt out of its sale or sharing. <strong>We do not sell or share
          your personal information</strong> and never have, so there is nothing to opt out of.</li>
        <li><strong>On-device data</strong> (saved locations, preferences) is under your direct control —
          you can erase it yourself at any time by clearing this site&apos;s data in your browser.</li>
      </ul>
      <p>
        To make any request, email{' '}
        <a href="mailto:watchflame.wildfire@gmail.com">watchflame.wildfire@gmail.com</a>.
      </p>

      <h2>Children</h2>
      <p>
        The Service is not directed to children under 13 and does not knowingly collect their data.
      </p>

      <h2>Changes &amp; contact</h2>
      <p>
        We may update this policy as the Service evolves. Questions or requests:{' '}
        <a href="mailto:watchflame.wildfire@gmail.com">watchflame.wildfire@gmail.com</a>.
      </p>
    </LegalLayout>
  );
}
