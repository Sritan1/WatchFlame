'use client';

// Every fitted state, plus a Global option that uses the default cutoffs.

import { Modal } from '@/components/ui/Modal';
import { useAesthetic } from '@/lib/aesthetic';
import { RISK_LEVELS } from '@/lib/theme';

/** The states with a fitted calibration, in display order. */
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
  /** Null means Global, with no per-state calibration. */
  value: string | null;
  onChange: (state: string | null) => void;
}) {
  const { ae } = useAesthetic();

  const select = (code: string | null) => {
    onChange(code);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} eyebrow="Fire-Weather What-If" title="What your level is based on" maxWidth={560}>
      <p
        style={{
          margin: 0,
          fontFamily: ae.fontBody,
          fontSize: 13.5,
          lineHeight: 1.5,
          color: ae.textDim,
        }}
      >
        Pick a state and your score is graded against that state&apos;s own fire history instead of
        one nationwide scale. The number stays the same. Only the level it lands in changes.
      </p>

      <Row
        label="Global (default)"
        sub="One scale for the whole country, not tuned to a state."
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
        Calibrated states · {FITTED_STATES.length}
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
