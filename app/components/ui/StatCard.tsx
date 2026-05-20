import { Text, View } from 'react-native';

/** Reusable "label on top, big number below" card. Matches the SIZE / CONTAINMENT
 *  / PERSONNEL tiles in the Marshall Canyon mockup. */
export function StatCard({
  label,
  value,
  unit,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'default' | 'extreme';
}) {
  const valueColor = tone === 'extreme' ? 'text-risk-extreme' : 'text-chalk-50';
  return (
    <View className="flex-1 rounded-xl bg-ink-800 p-4">
      <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-chalk-400">
        {label}
      </Text>
      <View className="mt-2 flex-row items-baseline">
        <Text className={`text-2xl font-bold ${valueColor}`}>{value}</Text>
        {unit ? (
          <Text className="ml-1 text-xs uppercase tracking-wide text-chalk-400">{unit}</Text>
        ) : null}
      </View>
    </View>
  );
}
