/** Word-by-word fade-up/blur-in stagger — pair with big headlines.
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
        // Words use position-based keys; same headline may render twice on
        // risk-level changes but the key reset is intentional (replays the anim).
        // eslint-disable-next-line react/no-array-index-key
        <span key={i} className="px-word" style={{ animationDelay: `${startDelay + i * baseDelay}ms` }}>
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}
