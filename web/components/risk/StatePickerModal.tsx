'use client';

// All 17 fitted states + a "Global" option (uses default cutoffs).
// Replaces the inline 4-button row in the Risk hero with a single dropdown
// trigger that opens this modal.

import { Modal } from '@/components/ui/Modal';
import { useAesthetic } from '@/lib/aesthetic';
import { RISK_LEVELS } from '@/lib/theme';

/** Mirrors app/components/ui/StatePicker.tsx FITTED_STATES. */
export const FITTED_STATES: { code: string; name: string }[] = [
  { code: 'AZ', name: 'Arizona' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'ID', name: 'Idaho' },
  { code: 'MT', name: 'Montana' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NV', name: 'Nevada' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'WA', name: 'Washington' },
  { code: 'WY', name: 'Wyoming' },
];

export function StatePickerModal({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  /** null = Global (no per-state calibration). */
  value: string | null;
  onChange: (state: string | null) => void;
}) {
  const { ae } = useAesthetic();

  const select = (code: string | null) => {
    onChange(code);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} eyebrow="Risk Forecast" title="Calibration scope" maxWidth={560}>
      <p
        style={{
          margin: 0,
          fontFamily: ae.fontBody,
          fontSize: 13.5,
          lineHeight: 1.5,
          color: ae.textDim,
        }}
      >
        Pick a state to bucket the score using that state&apos;s historical fire-day distribution
        instead of the default global cutoffs. The numeric score doesn&apos;t change — only what
        counts as &quot;EXTREME&quot; does.
      </p>

      <Row
        label="Global (no calibration)"
        sub="Default 0–1 thresholds: LOW <0.3, MOD <0.6, HIGH <0.8, EXT ≥0.8"
        selected={value === null}
        onPress={() => select(null)}
        ae={ae}
      />

      <div
        style={{
          marginTop: 18,
          padding: '6px 4px',
          fontFamily: ae.fontMono,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.18em',
          color: ae.textMute,
          textTransform: ae.chipUpper ? 'uppercase' : 'none',
        }}
      >
        Fitted states · {FITTED_STATES.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {FITTED_STATES.map((s) => (
          <Row
            key={s.code}
            label={s.name}
            sub={s.code}
            selected={value === s.code}
            onPress={() => select(s.code)}
            ae={ae}
          />
        ))}
      </div>
    </Modal>
  );
}

function Row({
  label,
  sub,
  selected,
  onPress,
  ae,
}: {
  label: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
  ae: ReturnType<typeof useAesthetic>['ae'];
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={selected}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 6px',
        background: 'transparent',
        border: 'none',
        borderBottom: `0.5px solid ${ae.line}`,
        cursor: 'pointer',
        color: 'inherit',
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: ae.fontDisplay,
            fontSize: 15,
            fontWeight: selected ? 700 : 600,
            color: selected ? RISK_LEVELS.low.color : ae.text,
            letterSpacing: ae.titleTracking,
          }}
        >
          {label}
        </div>
        <div
          style={{
            marginTop: 2,
            fontFamily: ae.fontMono,
            fontSize: 10.5,
            color: ae.textMute,
            letterSpacing: '0.04em',
          }}
        >
          {sub}
        </div>
      </div>
      {selected ? (
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 99,
            background: 'rgba(126, 231, 135, 0.16)',
            border: '0.5px solid rgba(126, 231, 135, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: RISK_LEVELS.low.color,
            fontFamily: 'monospace',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          ✓
        </span>
      ) : null}
    </button>
  );
}
