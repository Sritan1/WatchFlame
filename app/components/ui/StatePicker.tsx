import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tap } from '@/lib/haptics';

import { InputCard } from './InputCard';
import { Skeleton } from './Skeleton';

// The 17 fitted states (kept in sync with api/data/regional_thresholds.json
// and the CalibrationModal copy on Status). Add a state here when calibration
// expands beyond CONUS West + Southeast.
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

function nameFor(code: string | null): string {
  if (!code) return 'Global (no calibration)';
  return FITTED_STATES.find((s) => s.code === code)?.name ?? code;
}

/** Single-select picker for the Risk Calculator's calibration scope. `null`
 *  means "global" (use the default 0.3 / 0.6 / 0.8 cutoffs). Picking a state
 *  flips the response's regional_level + thresholds to that state's
 *  percentile-derived cutoffs. */
export function StatePicker({
  value,
  onChange,
  isLoading = false,
}: {
  value: string | null;
  onChange: (state: string | null) => void;
  /** Render a skeleton placeholder at the same dimensions while the parent
   *  is waiting to auto-select the user's state from a new location. */
  isLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <InputCard padding={14}>
        <Skeleton width={80} height={10} rounded="sm" />
        <View style={{ marginTop: 6 }}>
          <Skeleton width={140} height={16} rounded="sm" />
        </View>
      </InputCard>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => {
          tap.selection();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Calibration scope: ${nameFor(value)}. Tap to change.`}
      >
        <InputCard padding={14}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  letterSpacing: 2,
                  color: '#9ca3af',
                  textTransform: 'uppercase',
                }}
              >
                Calibrated for
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 15,
                  fontWeight: '700',
                  color: '#f8fafc',
                }}
              >
                {nameFor(value)}
              </Text>
            </View>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderWidth: 0.5,
                borderColor: 'rgba(255,255,255,0.10)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FontAwesome name="chevron-down" size={10} color="#9ca3af" />
            </View>
          </View>
        </InputCard>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-ink-950" edges={['top']}>
          <View className="flex-row items-center justify-between border-b border-ink-800 px-5 pb-3 pt-2">
            <Text className="text-base font-extrabold tracking-[3px] text-chalk-50">
              CALIBRATION SCOPE
            </Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityLabel="Close">
              <FontAwesome name="times" size={20} color="#f8fafc" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
            <Text className="px-6 pt-4 text-sm text-chalk-400">
              Pick a state to bucket the score using that state&apos;s historical
              fire-day distribution instead of the global cutoffs. The numeric
              score doesn&apos;t change — only what counts as
              &quot;EXTREME&quot; does.
            </Text>

            <Row
              label="Global (no calibration)"
              sublabel="Default 0–1 thresholds: LOW <0.3, MOD 0.3–0.6, HIGH 0.6–0.8, EXTREME ≥0.8"
              selected={value === null}
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
            />
            <View className="mt-2 px-6">
              <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-chalk-500">
                Fitted states · {FITTED_STATES.length}
              </Text>
            </View>
            {FITTED_STATES.map((s) => (
              <Row
                key={s.code}
                label={s.name}
                sublabel={s.code}
                selected={value === s.code}
                onPress={() => {
                  onChange(s.code);
                  setOpen(false);
                }}
              />
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function Row({
  label,
  sublabel,
  selected,
  onPress,
}: {
  label: string;
  sublabel: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        tap.light();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="mt-2 flex-row items-center justify-between px-6 py-3"
    >
      <View className="flex-1 pr-3">
        <Text className={`text-base ${selected ? 'font-extrabold text-risk-low' : 'font-semibold text-chalk-50'}`}>
          {label}
        </Text>
        <Text className="mt-0.5 text-[11px] text-chalk-500">{sublabel}</Text>
      </View>
      {selected ? (
        <FontAwesome name="check" size={16} color="#7ee787" />
      ) : null}
    </Pressable>
  );
}
