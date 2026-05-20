import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Text, View } from 'react-native';

import { compassBearing } from '@/lib/geo';
import { formatSpeed, useUnits } from '@/lib/units';

/**
 * Wind-driven spread direction indicator.
 *
 * @param windDeg  Direction the wind is coming FROM, 0-360°
 * @param windKph  Wind speed in km/h
 *
 * Fire spreads in the OPPOSITE direction of where wind comes from.
 */
export function SpreadArrow({
  windDeg,
  windKph,
}: {
  windDeg: number;
  windKph: number;
}) {
  const { units } = useUnits();
  // Visual rotation: native arrow icon points "up" (toward 0°/N).
  // Add 180° because the wind FROM angle is opposite the SPREAD direction.
  const spreadDeg = (windDeg + 180) % 360;
  const cardinal = compassBearing(spreadDeg);
  return (
    <View className="flex-row items-center rounded-xl bg-ink-900/85 px-3 py-2">
      <View
        style={{ transform: [{ rotate: `${spreadDeg}deg` }] }}
        className="mr-3 h-7 w-7 items-center justify-center rounded-full bg-risk-extreme"
      >
        <FontAwesome name="long-arrow-up" size={16} color="#f8fafc" />
      </View>
      <View>
        <Text className="text-sm font-bold text-chalk-50">{cardinal}</Text>
        <Text className="text-[10px] uppercase tracking-[2px] text-chalk-400">
          {formatSpeed(windKph, units.speed)} wind
        </Text>
      </View>
    </View>
  );
}
