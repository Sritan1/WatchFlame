import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * Semicircular progress meter — fills clockwise from left to right.
 * Used on the Safety screen next to the "Immediate Preparation" heading
 * to show checklist completion. Match for the screens.jsx ProgressArc.
 *
 * Renders the count (e.g. "3/6") inside the arc.
 */
export function ProgressArc({
  value,
  total,
  color,
  size = 92,
}: {
  value: number;
  total: number;
  color: string;
  size?: number;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  const r = (size - 12) / 2;
  const c = size / 2;
  const arcLen = Math.PI * r;
  const dash = arcLen * pct;
  const height = size / 2 + 8;

  return (
    <View
      style={{
        position: 'relative',
        width: size,
        height,
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
      <Svg width={size} height={height} viewBox={`0 0 ${size} ${height}`}>
        {/* Track */}
        <Path
          d={`M 6 ${c} A ${r} ${r} 0 0 1 ${size - 6} ${c}`}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={4}
          strokeLinecap="round"
        />
        {/* Fill */}
        <Path
          d={`M 6 ${c} A ${r} ${r} 0 0 1 ${size - 6} ${c}`}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${arcLen}`}
        />
      </Svg>
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 22,
            fontWeight: '800',
            color: '#f8fafc',
            lineHeight: 24,
          }}
        >
          {value}
          <Text style={{ color: '#6b7280', fontWeight: '400' }}>/{total}</Text>
        </Text>
      </View>
    </View>
  );
}
