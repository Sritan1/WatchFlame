import Slider from '@react-native-community/slider';
import { Text, View } from 'react-native';

import { tap } from '@/lib/haptics';

import { InputCard } from './InputCard';
import { Skeleton } from './Skeleton';

/** Labeled slider with a live numeric readout — one row of the Risk
 *  Calculator. Wrapped in the shared InputCard chrome (slate gradient +
 *  inset top hairline) so every input on the screen reads as the same
 *  material.
 *
 *  Pass `isLoading` while the parent is waiting to seed the slider with
 *  authoritative values (e.g. switching saved locations) — renders a
 *  skeleton placeholder at the same dimensions so the page doesn't reflow.
 *
 *  Pass `index` (1-based) to render a small mono badge in the top-right
 *  corner, matching the numbered-input pattern in the screens.jsx Risk
 *  Calculator mock (01, 02, 03, …). */
export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  isLoading = false,
  index,
  bigValue = false,
  resetKey,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  isLoading?: boolean;
  index?: number;
  /** Render the value as the big hero number (28–32px) shown in the
   *  screens.jsx Risk mock, instead of the compact 16px readout. */
  bigValue?: boolean;
  /** When this changes, the inner native Slider remounts and re-reads the
   *  `value` prop fresh. Use this to push externally-set values (e.g. a
   *  "Reset to my area" seed) into the slider, which otherwise treats
   *  `value` as initial-only and ignores updates to it. User dragging
   *  shouldn't change this — only programmatic resets should. */
  resetKey?: string | number;
}) {
  const indexBadge =
    index != null ? (
      <Text
        style={{
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.6,
          color: '#4b5563',
        }}
      >
        {String(index).padStart(2, '0')}
      </Text>
    ) : null;
  if (isLoading) {
    return (
      <InputCard padding={16}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Skeleton width={90} height={12} rounded="sm" />
          {indexBadge}
        </View>
        <View style={{ marginTop: 12 }}>
          <Skeleton width={120} height={bigValue ? 30 : 18} rounded="sm" />
        </View>
        <View style={{ marginTop: 14, marginBottom: 8 }}>
          <Skeleton width={'100%'} height={6} rounded="full" />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Skeleton width={28} height={10} rounded="sm" />
          <Skeleton width={28} height={10} rounded="sm" />
        </View>
      </InputCard>
    );
  }
  // Derive readout precision from the step so a step of 0.01 shows two
  // decimals (e.g. NDVI anomaly of 0.05), step of 1 shows none (temp = 25),
  // etc. The old `step < 1 ? 10 : 1` heuristic clamped everything to one
  // decimal, which made the NDVI slider read "0.0" for values up to 0.04.
  const decimals = step >= 1 ? 0 : Math.max(0, Math.ceil(-Math.log10(step)));
  return (
    <InputCard padding={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: '600',
            letterSpacing: 2,
            color: '#9ca3af',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
        {indexBadge}
      </View>
      {bigValue ? (
        <Text
          style={{
            marginTop: 6,
            fontSize: 30,
            fontWeight: '800',
            color: '#f8fafc',
            letterSpacing: -0.5,
          }}
        >
          {value.toFixed(decimals)}
          {unit ? (
            <Text style={{ fontSize: 14, color: '#9ca3af', fontWeight: '600' }}> {unit}</Text>
          ) : null}
        </Text>
      ) : (
        <Text style={{ marginTop: 6, fontSize: 16, fontWeight: '800', color: '#f8fafc' }}>
          {value.toFixed(decimals)}
          {unit ? <Text style={{ color: '#9ca3af' }}> {unit}</Text> : null}
        </Text>
      )}
      <Slider
        key={resetKey}
        style={{ marginTop: 4, height: 36 }}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onChange}
        onSlidingStart={tap.selection}
        onSlidingComplete={tap.light}
        minimumTrackTintColor="#ef4444"
        maximumTrackTintColor="#26262a"
        thumbTintColor="#f8fafc"
        accessibilityLabel={label}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 10, color: '#6b7280' }}>
          {min}{unit}
        </Text>
        <Text style={{ fontSize: 10, color: '#6b7280' }}>
          {max}{unit}
        </Text>
      </View>
    </InputCard>
  );
}
