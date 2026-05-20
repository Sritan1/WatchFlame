import { Text, View } from 'react-native';

import { DangerLevel } from '@/lib/types';

const styles: Record<DangerLevel, { border: string; text: string; glow: string }> = {
  LOW:      { border: 'border-risk-low',     text: 'text-risk-low',     glow: 'shadow-[0_0_12px_rgba(126,231,135,0.45)]' },
  MODERATE: { border: 'border-risk-moderate',text: 'text-risk-moderate',glow: 'shadow-[0_0_12px_rgba(251,191,36,0.45)]' },
  HIGH:     { border: 'border-risk-high',    text: 'text-risk-high',    glow: 'shadow-[0_0_12px_rgba(251,146,60,0.45)]' },
  EXTREME:  { border: 'border-risk-extreme', text: 'text-risk-extreme', glow: 'shadow-[0_0_12px_rgba(239,68,68,0.55)]' },
};

/** Risk-level pill. Default is the full-width "RISK LEVEL: X" badge from the
 *  original mockup. `compact` is a smaller dot-prefixed variant that sits
 *  beneath the HeroOrb on the Status screen. */
export function DangerPill({
  level,
  compact = false,
}: {
  level: DangerLevel;
  compact?: boolean;
}) {
  const s = styles[level];
  if (compact) {
    return (
      <View
        className={`flex-row items-center self-center rounded-full border ${s.border} bg-ink-900/80 px-3.5 py-1.5`}
      >
        <View className={`mr-1.5 h-1.5 w-1.5 rounded-full bg-current ${s.text}`} />
        <Text className={`text-[11px] font-semibold uppercase tracking-[2.5px] ${s.text}`}>
          {level}
        </Text>
      </View>
    );
  }
  return (
    <View
      className={`flex-row items-center justify-center rounded-full border-2 ${s.border} ${s.glow} bg-ink-900 px-6 py-3.5`}
    >
      <Text className={`mr-2 ${s.text} text-base`}>🛡</Text>
      <Text className={`text-base font-semibold tracking-wider ${s.text}`}>
        RISK LEVEL: {level}
      </Text>
    </View>
  );
}
