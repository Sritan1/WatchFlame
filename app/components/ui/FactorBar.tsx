import { Text, View } from 'react-native';

/**
 * One row of the Factor Breakdown — a numbered index, a colored bullet,
 * the factor label, the weight/value meta on the right, and a horizontal
 * gradient bar underneath showing the factor's strength.
 *
 * Match for the screens.jsx Risk Calculator's factor row. The label gets
 * `flex: 1` and shrinks; the meta is given fixed `flexShrink: 0` so it
 * always renders in full. With a long label ("Vapor Pressure Deficit") on
 * a narrow screen, the label wraps to two lines beneath the dot — bar +
 * meta still align to the indented column under the label.
 */
export function FactorBar({
  label,
  factor,
  weightPct,
  color,
  index,
}: {
  label: string;
  factor: number;
  weightPct: number;
  color: string;
  /** 1-based row index ("01", "02", …). Renders dimmer mono before the dot. */
  index?: number;
}) {
  const pct = Math.round(Math.max(0, Math.min(factor, 1)) * 100);
  // Indent for the meta + bar under the label — past the index column + dot.
  const contentIndent = index != null ? 38 : 18;
  return (
    <View>
      {/* Header row: index, dot, label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {index != null ? (
          <Text
            style={{
              fontSize: 10,
              fontWeight: '600',
              letterSpacing: 0.6,
              color: '#4b5563',
              width: 20,
              textAlign: 'right',
            }}
          >
            {String(index).padStart(2, '0')}
          </Text>
        ) : null}
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color,
          }}
        />
        <Text
          style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#f8fafc' }}
        >
          {label}
        </Text>
      </View>
      {/* Meta line directly under the label (replaces side-by-side layout
       *  that truncated "Vapor Pressure Deficit" on narrow screens). */}
      <Text
        style={{
          marginLeft: contentIndent,
          marginTop: 4,
          fontSize: 11,
          color: '#9ca3af',
          letterSpacing: 0.2,
        }}
      >
        {weightPct}% weight · factor {factor.toFixed(2)}
      </Text>
      {/* Strength bar */}
      <View
        style={{
          marginTop: 8,
          marginLeft: contentIndent,
          height: 6,
          borderRadius: 3,
          overflow: 'hidden',
          backgroundColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: 3,
          }}
        />
      </View>
    </View>
  );
}
