'use client';

// Loading placeholder, a rounded block pulsing between two shades. Use anywhere a
// query is in flight and the slot has a known size.

export type SkeletonRounded = 'sm' | 'md' | 'lg' | 'full';

const RADIUS: Record<SkeletonRounded, number> = { sm: 6, md: 10, lg: 16, full: 9999 };

export function Skeleton({
  width,
  height,
  rounded = 'md',
  style,
}: {
  width?: number | string;
  height: number;
  rounded?: SkeletonRounded;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width,
        height,
        borderRadius: RADIUS[rounded],
        // Pulses between two shades instead of fading opacity.
        animation: 'skeleton-pulse 1.2s ease-in-out infinite',
        ...style,
      }}
    />
  );
}
