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
        The risk score is a weighted, rule-based fire-weather index — no machine learning, no
        opaque models. Three meteorological factors combine into a base score, which is then
        scaled by a vegetation/season multiplier. The whole calculation is reproducible from the
        same public data sources used by the National Weather Service.
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

      <Section title="The season multiplier" ae={ae}>
        <p style={textBody(ae)}>
          The weighted sum is multiplied by a coarse season factor:{' '}
          <Mono ae={ae}>winter 0.40</Mono>, <Mono ae={ae}>spring 0.80</Mono>,{' '}
          <Mono ae={ae}>summer 1.00</Mono>, <Mono ae={ae}>fall 0.90</Mono>. When satellite NDVI
          imagery is available, the app substitutes an NDVI-anomaly factor instead — a more
          direct measure of how stressed the live vegetation is right now.
        </p>
      </Section>

      <Section title="Score → level bucket" ae={ae}>
        <p style={textBody(ae)}>
          The continuous score (typically 0.00–0.70) buckets into four bands. With{' '}
          <strong style={{ color: ae.text }}>global</strong> defaults: LOW &lt;0.27, MOD &lt;0.33,
          HIGH &lt;0.42, EXT ≥0.42. When you pick a state with calibrated thresholds, those bands
          shift to that state&apos;s historical 50th/75th/90th-percentile fire-day scores —
          a 0.40 might be HIGH in CA but EXTREME in MA, reflecting that the same conditions are
          more dangerous in some places than others.
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
