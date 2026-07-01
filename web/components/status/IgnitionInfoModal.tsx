'use client';

// Opens from the info button on the Ignition Likelihood (ML) card.
// A short, plain-English explainer: what the model is, what it predicts, the
// factors it uses, and how well it does. Deliberately not exhaustive — the full
// write-up lives in the model card.

import { Modal } from '@/components/ui/Modal';
import { useAesthetic } from '@/lib/aesthetic';
import { RISK_LEVELS } from '@/lib/theme';

type Ae = ReturnType<typeof useAesthetic>['ae'];

export function IgnitionInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ae } = useAesthetic();
  return (
    <Modal open={open} onClose={onClose} eyebrow="Machine learning" title="How Ignition Likelihood works" maxWidth={620}>
      <p style={textBody(ae)}>
        This reading comes from a <strong style={{ color: ae.text }}>machine-learning model</strong>,
        separate from the Fire Weather score. It estimates how much today resembles the days when
        wildfires have actually started.
      </p>

      <Section ae={ae} title="What it predicts">
        <p style={textBody(ae)}>
          The model was trained on about <strong style={{ color: ae.text }}>4,900 real fire days</strong>{' '}
          to find what those days had in common. The result is shown as a percentile. A reading of 70
          means today resembles past fire-start days more closely than 70% of days on record. It is a
          comparison, not a 70% chance that a fire starts.
        </p>
        <p style={{ ...textBody(ae), marginTop: 10 }}>
          This answers a different question than the Fire Weather score. Fire weather asks how severe
          a fire could get. This asks how likely one is to start.
        </p>
      </Section>

      <Section ae={ae} title="What it looks at">
        <Bullet ae={ae} k="Dryness" v="temperature and humidity" />
        <Bullet ae={ae} k="Drought" v="soil moisture and days since rain" />
        <Bullet ae={ae} k="Wind" v="current speed" />
        <Bullet ae={ae} k="Time of year" v="season and month" />
        <Bullet ae={ae} k="Land cover" v="what's on the ground: forest, grass, shrub, or developed land" />
      </Section>

      <p style={{ ...textBody(ae), marginTop: 20, fontSize: 12.5, color: ae.textMute }}>
        This is an informational guide, not a prediction that a fire will or won&apos;t start, and not
        an emergency tool.
      </p>
    </Modal>
  );
}

function Section({ ae, title, children }: { ae: Ae; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <h3
        style={{
          margin: '0 0 10px',
          fontFamily: ae.fontDisplay,
          fontSize: 15,
          fontWeight: ae.titleWeight,
          letterSpacing: ae.titleTracking,
          color: ae.text,
          paddingBottom: 6,
          borderBottom: `0.5px solid ${ae.lineStrong}`,
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function Bullet({ ae, k, v }: { ae: Ae; k: string; v: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
      <span style={{ width: 4, height: 4, borderRadius: 99, background: RISK_LEVELS.moderate.color, marginTop: 8, flexShrink: 0, boxShadow: `0 0 6px ${RISK_LEVELS.moderate.color}` }} />
      <div>
        <span style={{ fontFamily: ae.fontDisplay, fontSize: 13.5, fontWeight: 600, color: ae.text }}>{k}</span>
        <span style={{ fontFamily: ae.fontBody, fontSize: 13, color: ae.textDim, marginLeft: 6, lineHeight: 1.55 }}>· {v}</span>
      </div>
    </div>
  );
}

function textBody(ae: Ae): React.CSSProperties {
  return { margin: 0, fontFamily: ae.fontBody, fontSize: 14, lineHeight: 1.6, color: ae.textDim };
}
