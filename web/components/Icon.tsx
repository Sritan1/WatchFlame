// Custom line-based icon set — 24px viewBox, 1.6 default stroke.
// Ported from primitives.jsx so visual identity matches the reference exactly
// (Lucide drifts on a few of these — especially flame, warn, and navArrow).

import type { ReactNode } from 'react';

export type IconName =
  | 'flame' | 'map' | 'shield' | 'bell' | 'pin' | 'chevron' | 'chevronUp'
  | 'arrow' | 'check' | 'circle' | 'dot' | 'wind' | 'clock' | 'share'
  | 'download' | 'settings' | 'layers' | 'plus' | 'minus' | 'crosshair'
  | 'grid' | 'package' | 'battery' | 'route' | 'info' | 'menu' | 'external'
  | 'refresh' | 'warn' | 'arrowUp' | 'navArrow' | 'caret' | 'search';

const PATHS: Record<IconName, ReactNode> = {
  flame:     <path d="M12 3c0 4-5 5-5 10a5 5 0 0010 0c0-2-1-3-2-4 0 2-1 3-2 3 0-3 1-5-1-9z" />,
  map:       (<><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" /><path d="M9 4v14M15 6v14" /></>),
  shield:    <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z" />,
  bell:      (<><path d="M6 16V11a6 6 0 1112 0v5l1.5 2H4.5L6 16z" /><path d="M10 20a2 2 0 004 0" /></>),
  pin:       (<><path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" /><circle cx="12" cy="9" r="2.5" /></>),
  chevron:   <path d="M9 6l6 6-6 6" />,
  chevronUp: <path d="M6 15l6-6 6 6" />,
  arrow:     <path d="M5 12h14M13 6l6 6-6 6" />,
  check:     <path d="M5 12l5 5 9-11" />,
  circle:    <circle cx="12" cy="12" r="9" />,
  dot:       <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />,
  wind:      <path d="M3 8h11a3 3 0 100-6M3 16h15a3 3 0 110 6M3 12h8" />,
  clock:     (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  share:     (<><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8 11l8-4M8 13l8 4" /></>),
  download:  <path d="M12 4v12M6 12l6 6 6-6M5 20h14" />,
  settings:  (<><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 00-2-1.2L14 3h-4l-.6 2.6a7 7 0 00-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2 1.2L10 21h4l.6-2.6c.7-.3 1.4-.7 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" /></>),
  layers:    (<><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5M3 18l9 5 9-5" /></>),
  plus:      <path d="M12 5v14M5 12h14" />,
  minus:     <path d="M5 12h14" />,
  crosshair: (<><circle cx="12" cy="12" r="9" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><circle cx="12" cy="12" r="2" /></>),
  grid:      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />,
  package:   (<><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7M12 11v10" /></>),
  battery:   (<><rect x="3" y="8" width="16" height="8" rx="1.5" /><path d="M21 11v2" /><rect x="5" y="10" width="10" height="4" fill="currentColor" stroke="none" rx="0.5" /></>),
  route:     (<><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M6 8v4a4 4 0 004 4h4a4 4 0 014 4" /></>),
  info:      (<><circle cx="12" cy="12" r="9" /><path d="M12 8v.01M11 12h1v5h1" /></>),
  menu:      <path d="M3 7h18M3 12h18M3 17h18" />,
  external:  <path d="M14 4h6v6M20 4l-9 9M19 13v6a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h6" />,
  refresh:   <path d="M3 12a9 9 0 0115-6.7L21 7M21 4v3h-3M21 12a9 9 0 01-15 6.7L3 17M3 20v-3h3" />,
  warn:      (<><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5" /><circle cx="12" cy="17.5" r="0.7" fill="currentColor" stroke="none" /></>),
  arrowUp:   <path d="M12 19V5M6 11l6-6 6 6" />,
  navArrow:  <path d="M3 21l9-18 4 9 5 2-18 7z" />,
  caret:     <path d="M6 9l6 6 6-6" />,
  search:    (<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>),
};

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({
  name,
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.6,
  className,
  style,
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
