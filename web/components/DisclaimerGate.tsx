'use client';

// First-launch safety disclaimer. A safety-adjacent app should make the "this is
// not an emergency service / don't rely on it for life-safety" notice impossible
// to miss — not bury it in Settings. Shown once per browser (localStorage), with
// a required acknowledgment, then never again. Links to the full Terms.

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Icon } from '@/components/Icon';
import { useAesthetic } from '@/lib/aesthetic';

const ACK_KEY = 'ember-disclaimer-ack-v1';
const AMBER = '#E8B339';
const AMBER_RGB = '232, 179, 57';

export function DisclaimerGate() {
  const { ae } = useAesthetic();
  // Default hidden so SSR + first paint never flash the gate; an effect reveals
  // it only when the ack flag is absent.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(ACK_KEY)) setOpen(true);
    } catch {
      // localStorage unavailable (private mode) — don't block the app.
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const acknowledge = () => {
    try {
      localStorage.setItem(ACK_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
      aria-describedby="disclaimer-body"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(7, 9, 12, 0.82)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
          border: `0.5px solid rgba(${AMBER_RGB}, 0.32)`,
          borderRadius: ae.radiusLg,
          boxShadow: '0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
          padding: '26px 24px 22px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              flexShrink: 0,
              background: `radial-gradient(circle at 30% 30%, rgba(${AMBER_RGB}, 0.3), rgba(${AMBER_RGB}, 0.08))`,
              border: `0.5px solid rgba(${AMBER_RGB}, 0.4)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="warn" size={20} color={AMBER} strokeWidth={1.7} />
          </div>
          <h2
            id="disclaimer-title"
            style={{
              margin: 0,
              fontFamily: ae.fontDisplay,
              fontSize: 19,
              fontWeight: ae.titleWeight,
              letterSpacing: ae.titleTracking,
              color: ae.text,
            }}
          >
            Before you start
          </h2>
        </div>

        <div
          id="disclaimer-body"
          style={{ fontFamily: ae.fontBody, fontSize: 14, lineHeight: 1.6, color: ae.textDim }}
        >
          <p style={{ margin: '0 0 12px' }}>
            Ember Watch is an <strong style={{ color: ae.text }}>informational tool</strong>{' '}that
            estimates wildfire risk from public data. It is{' '}
            <strong style={{ color: ae.text }}>not an emergency service</strong>{' '}and not a substitute
            for official warnings or 911.
          </p>
          <p style={{ margin: 0 }}>
            Don&apos;t rely on it for life-safety or evacuation decisions. Always follow the National
            Weather Service, CAL FIRE, and your local emergency authorities. See the{' '}
            <Link href="/terms" style={{ color: AMBER }}>
              Terms of Use
            </Link>
            .
          </p>
        </div>

        <button
          type="button"
          onClick={acknowledge}
          autoFocus
          style={{
            marginTop: 20,
            width: '100%',
            height: 46,
            borderRadius: 12,
            cursor: 'pointer',
            background: `linear-gradient(180deg, rgba(${AMBER_RGB}, 0.22), rgba(${AMBER_RGB}, 0.08))`,
            border: `0.5px solid rgba(${AMBER_RGB}, 0.45)`,
            color: ae.text,
            fontFamily: ae.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}
        >
          I understand
        </button>
      </div>
    </div>
  );
}
