'use client';

// "How is this calculated?" — opens from FactorBreakdown's footer.
// Plain-English methodology overview matching the mobile app's ExplainerModal.

import { Modal } from '@/components/ui/Modal';
import { useAesthetic } from '@/lib/aesthetic';
import { RISK_LEVELS } from '@/lib/theme';

export function ExplainerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ae } = useAesthetic();
  return (
    <Modal open={open} onClose={onClose} eyebrow="Methodology" title="How is the risk score calculated?" maxWidth={620}>
      <p style={textBody(ae)}>
        The risk score is the <strong style={{ color: ae.text }}>fire-weather</strong> half of
        the picture — a rule-based, weighted index of the local environment. No machine learning.
        Three meteorological factors combine multiplicatively, then a vegetation signal scales
        the result. Reproducible from the same public data the National Weather Service uses.
      </p>
      <p style={{ ...textBody(ae), marginTop: 10 }}>
        On the <strong style={{ color: ae.text }}>Status</strong> page this score is one of two
        inputs to your <strong style={{ color: ae.text }}>Personal Threat composite</strong> —
        the other being proximity, size, wind alignment, and containment of any active fires
        near you. The Risk Calculator isolates this fire-weather half so you can see exactly
        how the environment is contributing.
      </p>

      <Section title="The three base factors" ae={ae}>
        <Bullet
          ae={ae}
          color="#FF7A3A"
          k="Vapor Pressure Deficit · 50% weight"
          v="Combines temperature and humidity into a single measure of how aggressively the air pulls moisture from fuels. Hot + dry = high VPD = primed to burn."
        />
        <Bullet
          ae={ae}
          color="#4FA8FF"
          k="Wind · 30% weight"
          v="Sustained 10-minute average wind speed. Faster wind drives spread and makes containment harder. Capped at a 30 mph plateau."
        />
        <Bullet
          ae={ae}
          color="#E8B339"
          k="Drought (KBDI) · 20% weight"
          v="Keetch-Byram Drought Index, 0–800. Tracks soil-moisture deficit. Higher values mean fuels stay drier between rain events."
        />
      </Section>

      <Section title="The vegetation multiplier" ae={ae}>
        <p style={textBody(ae)}>
          When Sentinel-2 satellite imagery is available, the weighted score is scaled by an{' '}
          <strong style={{ color: ae.text }}>NDVI anomaly</strong> — how stressed the live
          vegetation is right now compared to the 3-year average for this month. Drier than
          normal pushes the multiplier above 1.0; greener than normal pulls it below. If a
          cloud-blocked pass leaves NDVI unavailable, the app falls back to a coarse season
          factor (<Mono ae={ae}>winter 0.40</Mono>, <Mono ae={ae}>spring 0.80</Mono>,{' '}
          <Mono ae={ae}>summer 1.00</Mono>, <Mono ae={ae}>fall 0.90</Mono>).
        </p>
      </Section>

      <Section title="Score → level bucket" ae={ae}>
        <p style={textBody(ae)}>
          The continuous score (typically 0.00–1.00) buckets into four bands. With{' '}
          <strong style={{ color: ae.text }}>global</strong> defaults: LOW &lt;0.3, MOD &lt;0.6,
          HIGH &lt;0.8, EXT ≥0.8. In one of the{' '}
          <strong style={{ color: ae.text }}>17 fitted states</strong>, those bands shift to
          that state&apos;s historical 50th / 75th / 97th-percentile fire-day scores — a 0.40
          might be HIGH in CA but EXTREME in MA, reflecting that the same conditions are more
          dangerous in some places than others.
        </p>
      </Section>

      <Section title="What it&apos;s NOT" ae={ae}>
        <p style={textBody(ae)}>
          A red-flag warning, a spread forecast, or a substitute for{' '}
          <a
            href="https://www.spc.noaa.gov/products/fire_wx/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: RISK_LEVELS.low.color, textDecoration: 'none' }}
          >
            NWS Storm Prediction Center fire products
          </a>
          . The index helps you understand the conditions around you — it does not predict where
          or when a fire will start.
        </p>
      </Section>
    </Modal>
  );
}

function Section({ title, ae, children }: { title: string; ae: { fontDisplay: string; titleWeight: number; titleTracking: string; text: string; lineStrong: string }; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <h3
        style={{
          margin: 0,
          fontFamily: ae.fontDisplay,
          fontSize: 15,
          fontWeight: ae.titleWeight,
          letterSpacing: ae.titleTracking,
          color: ae.text,
          paddingBottom: 6,
          borderBottom: `0.5px solid ${ae.lineStrong}`,
          marginBottom: 12,
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function Bullet({
  ae,
  color,
  k,
  v,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  color: string;
  k: string;
  v: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 99,
          background: color,
          boxShadow: `0 0 8px ${color}`,
          marginTop: 7,
          flexShrink: 0,
        }}
      />
      <div>
        <div
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 14,
            fontWeight: 600,
            color: ae.text,
            letterSpacing: ae.titleTracking,
          }}
        >
          {k}
        </div>
        <div
          style={{
            marginTop: 3,
            fontFamily: ae.fontBody,
            fontSize: 13,
            color: ae.textDim,
            lineHeight: 1.5,
          }}
        >
          {v}
        </div>
      </div>
    </div>
  );
}

function Mono({ ae, children }: { ae: ReturnType<typeof useAesthetic>['ae']; children: React.ReactNode }) {
  return (
    <code
      style={{
        fontFamily: ae.fontMono,
        fontSize: 12,
        background: 'rgba(255, 255, 255, 0.05)',
        padding: '1px 6px',
        borderRadius: 4,
        border: `0.5px solid ${ae.line}`,
        color: ae.text,
      }}
    >
      {children}
    </code>
  );
}

function textBody(ae: ReturnType<typeof useAesthetic>['ae']): React.CSSProperties {
  return {
    margin: 0,
    fontFamily: ae.fontBody,
    fontSize: 14,
    lineHeight: 1.6,
    color: ae.textDim,
  };
}
