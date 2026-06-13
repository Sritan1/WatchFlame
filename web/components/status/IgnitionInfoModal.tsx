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
        This card is powered by a <strong style={{ color: ae.text }}>machine-learning model</strong> —
        separate from the rule-based Fire Weather index. It estimates how much today&apos;s conditions
        resemble the days wildfires have actually started.
      </p>

      <Section ae={ae} title="What it predicts">
        <p style={textBody(ae)}>
          It&apos;s a gradient-boosted decision-tree model trained on <strong style={{ color: ae.text }}>~4,900
          real historical fire days</strong> to tell a <em>fire-start day</em> apart from an ordinary day, and it
          reports the result as a <strong style={{ color: ae.text }}>calibrated percentile</strong> — a relative
          likelihood, not an absolute &quot;% chance.&quot; A 70th-percentile reading means today looks more
          fire-start-like than 70% of days in the historical record. It answers
          <em> &quot;do conditions look like a day fires start?&quot;</em> (occurrence) — complementing the
          Fire Weather index, which grades how severe a fire could get.
        </p>
      </Section>

      <Section ae={ae} title="What it looks at">
        <Bullet ae={ae} k="Dryness" v="vapor-pressure deficit, humidity, and temperature" />
        <Bullet ae={ae} k="Drought" v="the KBDI drought index and days since rain" />
        <Bullet ae={ae} k="Wind" v="how strong the wind is" />
        <Bullet ae={ae} k="Time of year" v="season and month" />
        <Bullet ae={ae} k="Land cover" v="the fuel actually on the ground — forest, grass, shrub, developed, etc." />
      </Section>

      <p style={{ ...textBody(ae), marginTop: 20, fontSize: 12.5, color: ae.textMute }}>
        It&apos;s an informational, relative index — not a prediction that a fire will or won&apos;t start, and
        not an emergency tool.
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
        <span style={{ fontFamily: ae.fontBody, fontSize: 13, color: ae.textDim, marginLeft: 6, lineHeight: 1.55 }}>— {v}</span>
      </div>
    </div>
  );
}

function textBody(ae: Ae): React.CSSProperties {
  return { margin: 0, fontFamily: ae.fontBody, fontSize: 14, lineHeight: 1.6, color: ae.textDim };
}
