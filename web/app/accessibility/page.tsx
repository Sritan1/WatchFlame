import type { Metadata } from 'next';

import { LegalLayout } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Accessibility — Ember Watch',
  description: 'Ember Watch accessibility statement and how to report issues.',
};

export default function AccessibilityPage() {
  return (
    <LegalLayout title="Accessibility Statement" lastUpdated="June 17, 2026">
      <p>
        Ember Watch aims to be usable by everyone, and we work toward conformance with the{' '}
        <a
          href="https://www.w3.org/TR/WCAG21/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Web Content Accessibility Guidelines (WCAG) 2.1, Level AA
        </a>
        .
      </p>

      <h2>Measures we take</h2>
      <ul>
        <li>Semantic structure (headings, landmarks, a defined page language).</li>
        <li>Keyboard operability — interactive controls are reachable and operable by keyboard, with a
          visible focus indicator; dialogs trap focus and close on <strong>Escape</strong>.</li>
        <li>Risk levels are conveyed by a <strong>text label</strong> (e.g. &ldquo;HIGH&rdquo;), not by
          color alone.</li>
        <li>Decorative graphics are hidden from assistive technology, and the key data visualizations
          (risk orb, gauges, ignition likelihood, trajectory) expose a text description of their
          value.</li>
        <li>Color contrast for body and label text targets the WCAG AA minimum.</li>
      </ul>

      <h2>Known limitations</h2>
      <p>
        Some elements are rich, animated data visualizations. We provide text alternatives for their
        key values, but the detailed visual shape may not be fully conveyed to assistive technology.
        We are continuing to improve this.
      </p>

      <h2>Feedback</h2>
      <p>
        If you encounter an accessibility barrier, please tell us so we can fix it:{' '}
        <a href="mailto:konduru.sritan@gmail.com">konduru.sritan@gmail.com</a>. Include the page and a
        description of the issue.
      </p>
    </LegalLayout>
  );
}
