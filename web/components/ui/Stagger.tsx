/** Word-by-word fade-up/blur-in stagger, pair with big headlines.
 *  CSS keyframe `px-word-in` is defined in globals.css. */
export function Stagger({
  text,
  baseDelay = 60,
  startDelay = 0,
  style,
}: {
  text: string;
  baseDelay?: number;
  startDelay?: number;
  style?: React.CSSProperties;
}) {
  const words = text.split(' ');
  return (
    <span style={style}>
      {words.map((w, i) => (
        // Keyed by position, so a re-render on a risk change replays the animation
        // instead of leaving the words settled. The replay is wanted.
        <span key={i} className="px-word" style={{ animationDelay: `${startDelay + i * baseDelay}ms` }}>
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}
