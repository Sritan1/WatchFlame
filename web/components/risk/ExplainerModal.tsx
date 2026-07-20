'use client';

// "How is this calculated?" — opens from FactorBreakdown's footer.
// Plain-English methodology overview matching the mobile app's ExplainerModal.

import { Modal } from '@/components/ui/Modal';
import { useAesthetic } from '@/lib/aesthetic';
import { FACTOR_COLORS, RISK_LEVELS } from '@/lib/theme';
import { V4_WEIGHT_PCT } from '@/lib/v4-weights';

export function ExplainerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ae } = useAesthetic();
  return (
    <Modal open={open} onClose={onClose} eyebrow="How it works" title="How is the fire-weather score calculated?" maxWidth={620}>
      <p style={textBody(ae)}>
        This score rates the <strong style={{ color: ae.text }}>fire weather</strong>{' '}around you:
        how much today&apos;s conditions favor a fire starting and spreading. Three weather factors
        combine, then a vegetation factor adjusts the result. The weights aren&apos;t guesses. They
        come from <strong style={{ color: ae.text }}>about 500 real past fires</strong>.
      </p>
      <p style={{ ...textBody(ae), marginTop: 10 }}>
        On the <strong style={{ color: ae.text }}>Status</strong>{' '}page, this is one part of
        your <strong style={{ color: ae.text }}>overall risk</strong>. There it&apos;s combined with
        how likely a fire is to start and with any active fires nearby (how close, how big, the wind
        direction, how contained). This screen shows the fire-weather part on its own.
      </p>

      <Section title="The three base factors" ae={ae}>
        <Bullet
          ae={ae}
          color={FACTOR_COLORS.vpd.color}
          k={`Vapor Pressure Deficit · ${V4_WEIGHT_PCT.vpd}% weight`}
          v="Hot, dry air pulls moisture out of plants and fuels. The hotter and drier it gets, the more ready they are to burn."
        />
        <Bullet
          ae={ae}
          color={FACTOR_COLORS.wind.color}
          k={`Wind · ${V4_WEIGHT_PCT.wind}% weight`}
          v="Faster wind spreads fire and makes it harder to contain. It matters almost as much as how dry the air is."
        />
        <Bullet
          ae={ae}
          color={FACTOR_COLORS.drought.color}
          k={`Drought (KBDI) · ${V4_WEIGHT_PCT.drought}% weight`}
          v="How much moisture the soil has lost since the last good rain. Drier soil keeps fuels dry for longer."
        />
      </Section>

      <Section title="The vegetation factor" ae={ae}>
        <p style={textBody(ae)}>
          When recent satellite imagery is available, the score factors in how healthy the plants
          around you look compared with a normal year for this month. Drier than usual raises the
          score. Greener than usual lowers it. If clouds hide the view, a rough seasonal estimate is
          used instead.
        </p>
      </Section>

      <Section title="From score to level" ae={ae}>
        <p style={textBody(ae)}>
          The score runs from about 0 to 1 and falls into four levels: Low, Moderate, High, and
          Extreme. The cutoffs aren&apos;t the same everywhere. In the{' '}
          <strong style={{ color: ae.text }}>17 calibrated states</strong>, the cutoffs are
          based on that state&apos;s own fire history, so a 0.40 might be High in California but
          Extreme in Massachusetts. The same weather is more dangerous in some places than
          others.
        </p>
      </Section>

      <Section title="What this score isn&apos;t" ae={ae}>
        <p style={textBody(ae)}>
          This isn&apos;t a red flag warning or a prediction of where a fire will start. It&apos;s
          here to help you understand the conditions around you. For official fire-weather alerts,
          check the{' '}
          <a
            href="https://www.spc.noaa.gov/products/fire_wx/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: RISK_LEVELS.low.color, textDecoration: 'none' }}
          >
            NWS Storm Prediction Center
          </a>
          .
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

function textBody(ae: ReturnType<typeof useAesthetic>['ae']): React.CSSProperties {
  return {
    margin: 0,
    fontFamily: ae.fontBody,
    fontSize: 14,
    lineHeight: 1.6,
    color: ae.textDim,
  };
}
