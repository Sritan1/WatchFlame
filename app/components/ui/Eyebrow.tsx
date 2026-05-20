import { Text } from 'react-native';

type Tone = 'green' | 'red' | 'amber' | 'muted';

const toneColor: Record<Tone, string> = {
  green: 'text-risk-low',
  red: 'text-risk-extreme',
  amber: 'text-warn',
  muted: 'text-chalk-400',
};

/** Small uppercase tracked label — the app's signature instrument-style label.
 *  Mono-leaning weight + wider tracking than typical UI to evoke a HUD/console
 *  feel. Optionally preceded by a status dot. */
export function Eyebrow({
  children,
  tone = 'muted',
  withDot = false,
}: {
  children: string;
  tone?: Tone;
  withDot?: boolean;
}) {
  return (
    <Text className={`text-[10.5px] font-semibold tracking-[2.5px] ${toneColor[tone]}`}>
      {withDot ? '●  ' : ''}
      {children.toUpperCase()}
    </Text>
  );
}
