'use client';

// Primary / secondary / ghost button. Mouse-tracking radial highlight + slow
// conic sheen on primary variant — px-btn / px-primary rules in globals.css.

import type { CSSProperties, MouseEvent, ReactNode } from 'react';

import { Icon, type IconName } from '@/components/Icon';
import { useAesthetic } from '@/lib/aesthetic';
import { hexToRgb } from '@/lib/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export function Button({
  children,
  variant = 'secondary',
  icon,
  color,
  full,
  onClick,
  style,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  icon?: IconName;
  /** Override accent color (used to drive the colored primary). Hex only. */
  color?: string;
  full?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  const { ae } = useAesthetic();

  const base: CSSProperties = {
    height: 52,
    borderRadius: ae.radius,
    border: 'none',
    fontFamily: ae.fontDisplay,
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: ae.titleTracking,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: full ? '100%' : undefined,
    padding: '0 22px',
    transition: 'transform 0.12s ease, opacity 0.12s ease',
  };

  let look: CSSProperties = {};
  if (variant === 'primary') {
    look = {
      background: color ?? ae.text,
      color: color ? '#fff' : ae.bg,
      boxShadow: color ? `0 8px 24px rgba(${hexToRgb(color)}, 0.35)` : 'none',
    };
  } else if (variant === 'secondary') {
    look = { background: ae.surface, color: ae.text, border: ae.cardBorder };
  } else {
    look = { background: 'transparent', color: ae.textDim };
  }

  const onMove = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseMove={onMove}
      className={`px-btn ${variant === 'primary' ? 'px-primary' : ''}`}
      style={{ ...base, ...look, ...style }}
    >
      {icon ? (
        <span className="px-icon" style={{ display: 'inline-flex' }}>
          <Icon name={icon} size={18} />
        </span>
      ) : null}
      {children}
    </button>
  );
}
