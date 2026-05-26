import Slider from '@react-native-community/slider';
import { useEffect, useRef, useState } from 'react';
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
  displayValue,
  displayDecimals,
  displayMin,
  displayMax,
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
  /** Optional override for the big-number readout. Used by callers that
   *  scale the native slider's range (e.g. KBDI scaled 0–800 → 0–100 to
   *  dodge an iOS-only range-resolution bug) but still want to display the
   *  underlying unscaled value to the user. */
  displayValue?: number;
  /** Decimal places for the displayValue readout. Defaults to the precision
   *  derived from `step`. Only honored when `displayValue` is supplied. */
  displayDecimals?: number;
  /** Optional min/max overrides for the under-track labels. Same purpose as
   *  displayValue — only the native slider uses the actual min/max. */
  displayMin?: number;
  displayMax?: number;
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

  // ---- Native slider remount on programmatic value jumps -----------------
  // `@react-native-community/slider` (5.0.1, iOS) treats `value` as
  // initial-only and doesn't reposition the thumb when `value` updates via
  // props after mount. Symptom: KBDI slider mounted with value=400 shows
  // the thumb at the far left because the native UISlider initializes at
  // its own minimumValue=0 and ignores the subsequent JS-set `value`.
  //
  // Fix: bump `slideKeyBump` whenever `value` changes by more than a few
  // step units — that indicates a programmatic seed (Reset / location
  // change / mode toggle) rather than a drag tick. The native Slider then
  // remounts and reads the fresh `value` cleanly. Drag updates change
  // `value` by ~`step` per tick which falls under the threshold, so
  // dragging stays smooth (no flicker).
  const [slideKeyBump, setSlideKeyBump] = useState(0);
  const lastSeenValueRef = useRef<number | null>(null);
  useEffect(() => {
    const last = lastSeenValueRef.current;
    if (last === null) {
      // First mount with a real value — force a one-shot remount so the
      // native control picks up the initial value reliably.
      setSlideKeyBump((n) => n + 1);
    } else {
      // Heuristic: any jump > 10× the step value is almost certainly a
      // programmatic seed, not a user drag tick. NDVI step=0.001 ⇒ jump
      // > 0.01 remounts; KBDI step=1 ⇒ jump > 10 remounts; temperature
      // step=1 ⇒ jump > 10 remounts.
      const threshold = Math.max(step * 10, 1);
      if (Math.abs(value - last) > threshold) {
        setSlideKeyBump((n) => n + 1);
      }
    }
    lastSeenValueRef.current = value;
  }, [value, step]);
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
          {(displayValue ?? value).toFixed(displayDecimals ?? decimals)}
          {unit ? (
            <Text style={{ fontSize: 14, color: '#9ca3af', fontWeight: '600' }}> {unit}</Text>
          ) : null}
        </Text>
      ) : (
        <Text style={{ marginTop: 6, fontSize: 16, fontWeight: '800', color: '#f8fafc' }}>
          {(displayValue ?? value).toFixed(displayDecimals ?? decimals)}
          {unit ? <Text style={{ color: '#9ca3af' }}> {unit}</Text> : null}
        </Text>
      )}
      <Slider
        key={`${resetKey ?? 'rk'}-${slideKeyBump}`}
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
          {displayMin ?? min}{unit}
        </Text>
        <Text style={{ fontSize: 10, color: '#6b7280' }}>
          {displayMax ?? max}{unit}
        </Text>
      </View>
    </InputCard>
  );
}
