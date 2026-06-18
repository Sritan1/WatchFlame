import type { CSSProperties, ReactNode } from 'react';

/** Consistent vertical rhythm + width clamp for every section on every page. */
export function PageSection({
  children,
  gutter = 32,
  top = 32,
  bottom = 32,
  maxWidth = 1320,
  style,
}: {
  children: ReactNode;
  gutter?: number;
  top?: number;
  bottom?: number;
  maxWidth?: number;
  style?: CSSProperties;
}) {
  return (
    <section
      className="app-section"
      style={{
        padding: `${top}px ${gutter}px ${bottom}px`,
        maxWidth,
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </section>
  );
}
