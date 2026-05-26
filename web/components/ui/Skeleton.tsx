'use client';

// Loading placeholder — solid #26262a block that pulses opacity 0.55→1 every
// 800ms. Ported from app/components/ui/Skeleton.tsx. Use anywhere a query is
// in flight and the slot has a known size (most numeric readouts + headlines).

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
        // background is animated by the `skeleton-pulse` keyframe between two
        // shades for a more refined tonal pulse than a flat opacity fade.
        animation: 'skeleton-pulse 1.2s ease-in-out infinite',
        ...style,
      }}
    />
  );
}
