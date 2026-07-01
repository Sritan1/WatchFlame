import type { Metadata } from 'next';

import { LegalLayout } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Terms of Use — Ember Watch',
  description: 'Terms of use for Ember Watch, an informational wildfire-awareness tool.',
};

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Use" lastUpdated="June 17, 2026">
      <div className="legal-callout">
        <strong>Ember Watch is an informational tool, not an emergency service.</strong>{' '}It is not a
        substitute for official warnings from the National Weather Service, CAL FIRE, your local
        emergency management agency, or 911. In an emergency, call 911 and follow official
        evacuation orders.
      </div>

      <p>
        By accessing or using Ember Watch (the &ldquo;Service&rdquo;), you agree to these Terms of
        Use. If you do not agree, do not use the Service.
      </p>

      <h2>What Ember Watch is</h2>
      <p>
        Ember Watch is an independent, non-commercial project that aggregates publicly available
        wildfire, weather, drought, and vegetation data and presents an estimated fire-weather and
        proximity risk picture. It is provided for general informational and educational purposes
        only. It is <strong>not</strong>{' '}an official government service, is not affiliated with or
        endorsed by any agency whose data it displays, and does not provide professional, safety,
        or emergency advice.
      </p>

      <h2>No reliance for life-safety decisions</h2>
      <p>
        Do <strong>not</strong>{' '}rely on Ember Watch to make life-safety, evacuation, or property
        decisions. The risk scores, &ldquo;all clear&rdquo; indications, projected trajectories,
        suggested routing, and any other output are estimates derived from third-party data that may
        be delayed, incomplete, or inaccurate, and the underlying models are simplifications that do
        not capture every factor (smoke, ember spotting, rapidly changing conditions, and more).
        Always obtain guidance from official sources and emergency responders.
      </p>

      <h2>No warranty</h2>
      <p>
        The Service is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available,&rdquo;</strong>{' '}
        without warranties of any kind, express or implied, including but not limited to merchantability,
        fitness for a particular purpose, accuracy, timeliness, or non-infringement. We do not warrant
        that the Service will be uninterrupted, error-free, or that any information is correct or current.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, the project and its author shall not be liable for any
        indirect, incidental, special, consequential, or punitive damages, or any loss of property,
        injury, or harm, arising out of or related to your use of (or inability to use) the Service or
        any reliance on its content, even if advised of the possibility of such damages.
      </p>

      <h2>Third-party data</h2>
      <p>
        The Service displays data from third parties including NASA FIRMS, NIFC, CAL FIRE, FEMA,
        OpenWeatherMap, Open-Meteo, Copernicus / Sentinel-2, the U.S. Census Bureau, NCES, NLCD, and
        map tiles via MapTiler and OpenStreetMap (© OpenStreetMap contributors). We do not control and
        are not responsible for that data, and its display does not imply any endorsement by those
        providers. Their respective terms may also apply.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Use the Service lawfully and do not attempt to disrupt, overload, scrape at abusive volumes,
        reverse-engineer access controls, or misuse it. The Service is offered for personal,
        non-commercial use.
      </p>

      <h2>Changes</h2>
      <p>
        We may update the Service or these Terms at any time. Continued use after changes constitutes
        acceptance of the revised Terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms: <a href="mailto:watchflame.wildfire@gmail.com">watchflame.wildfire@gmail.com</a>.
      </p>
    </LegalLayout>
  );
}
