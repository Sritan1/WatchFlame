import type { Metadata } from 'next';

import { LegalLayout } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Terms of Use · WatchFlame',
  description: 'Terms of use for WatchFlame, an informational wildfire-awareness tool.',
};

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Use" lastUpdated="July 17, 2026">
      <div className="legal-callout">
        <strong>WatchFlame is an informational tool, not an emergency service.</strong>{' '}It is not a
        substitute for official warnings from the National Weather Service, CAL FIRE, your local
        emergency management agency, or 911. In an emergency, call 911 and follow official
        evacuation orders.
      </div>

      <p>
        By accessing or using WatchFlame (the &ldquo;Service&rdquo;), you agree to these Terms of
        Use. If you do not agree, do not use the Service.
      </p>

      <h2>What WatchFlame is</h2>
      <p>
        WatchFlame is an independent, non-commercial project that aggregates publicly available
        wildfire, weather, drought, and vegetation data and presents an estimated fire-weather and
        proximity risk picture. It is provided for general informational and educational purposes
        only. It is <strong>not</strong>{' '}an official government service, is not affiliated with or
        endorsed by any agency whose data it displays, and does not provide professional, safety,
        or emergency advice.
      </p>

      <h2>No reliance for life-safety decisions</h2>
      <p>
        Do <strong>not</strong>{' '}rely on WatchFlame to make life-safety, evacuation, or property
        decisions. The risk scores, &ldquo;all clear&rdquo; indications, projected trajectories,
        suggested routing, and any other output are estimates derived from third-party data that may
        be delayed, incomplete, or inaccurate, and the underlying models are simplifications that do
        not capture every factor (smoke, ember spotting, rapidly changing conditions, and more).
        Always obtain guidance from official sources and emergency responders.
      </p>

      <h2>No warranty</h2>
      <p className="legal-emphatic">
        THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo; WITHOUT
        WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO MERCHANTABILITY,
        FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, TIMELINESS, OR NON-INFRINGEMENT. WE DO NOT
        WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT ANY INFORMATION IS
        CORRECT OR CURRENT.
      </p>

      <h2>Limitation of liability</h2>
      <p className="legal-emphatic">
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE PROJECT AND ITS AUTHOR SHALL NOT BE LIABLE FOR
        ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
        PROPERTY, INJURY, OR HARM, ARISING OUT OF OR RELATED TO YOUR USE OF (OR INABILITY TO USE)
        THE SERVICE OR ANY RELIANCE ON ITS CONTENT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
        DAMAGES.
      </p>

      <h2>Third-party data</h2>
      <p>
        The Service displays data from third parties including NASA FIRMS, NIFC, CAL FIRE, FEMA,
        OpenWeatherMap, Open-Meteo, Copernicus / Sentinel-2, the U.S. Census Bureau, NCES, NLCD, and
        map tiles via MapTiler and OpenStreetMap (© OpenStreetMap contributors). We do not control and
        are not responsible for that data, and its display does not imply any endorsement by those
        providers. Their respective terms may also apply.
      </p>

      <h2>Who may use the Service</h2>
      <p>
        You may use the Service only if you can form a binding agreement under applicable law and are
        not barred from doing so. The Service is intended for a general audience and is not directed to
        children under 13.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Use the Service lawfully and do not attempt to disrupt, overload, scrape at abusive volumes,
        reverse-engineer access controls, or misuse it. The Service is offered for personal,
        non-commercial use.
      </p>

      <h2>Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of Illinois, without regard to its
        conflict-of-law rules. Any dispute arising out of or relating to the Service or these Terms
        will be brought exclusively in the state or federal courts located in Illinois, and you
        consent to their jurisdiction. Nothing here limits any right you may have under the mandatory
        consumer-protection laws of the place where you live.
      </p>

      <h2>Severability and waiver</h2>
      <p>
        If any part of these Terms is found unenforceable, that part will be limited or removed to the
        smallest extent needed, and the rest stays in full effect. Our failure to enforce any part is
        not a waiver of it.
      </p>

      <h2>Entire agreement</h2>
      <p>
        These Terms, together with the Privacy Policy, are the entire agreement between you and the
        project regarding the Service, and they replace any earlier understanding on that subject.
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
