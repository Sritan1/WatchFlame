'use client';

// Generic centered dialog. Click backdrop or press Escape to close.
// Renders via React portal into document.body so z-index ordering is correct
// regardless of where the trigger lives. Constrained max-width for readability.

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@/components/Icon';
import { useAesthetic } from '@/lib/aesthetic';
import { popModalOpen, pushModalOpen } from '@/lib/modal-state';
import { hexToRgb } from '@/lib/theme';

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  maxWidth = 560,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  maxWidth?: number;
}) {
  const { ae } = useAesthetic();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Keep the latest onClose in a ref so the trap effect doesn't depend on it.
  // Callers pass inline-arrow onClose handlers whose identity changes on every
  // parent render; depending on it would tear down + re-run the whole focus
  // trap (stealing focus and churning the modal-open store) on each render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    pushModalOpen(); // signal ambient background work (e.g. Status waves) to pause
    // Restore focus to whatever was focused before the dialog opened (a11y).
    const prevFocused = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] => {
      const panel = panelRef.current;
      if (!panel) return [];
      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
        // getClientRects() is empty for display:none but non-empty for visible
        // elements including position:fixed ones (offsetParent is null for
        // fixed, which would wrongly drop them from the tab cycle).
      ).filter((el) => el.getClientRects().length > 0);
    };

    // Move focus into the dialog so screen-reader / keyboard users land inside it.
    (focusables()[0] ?? panelRef.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      // Trap Tab focus within the dialog.
      const f = focusables();
      if (f.length === 0) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      prevFocused?.focus?.();
      popModalOpen();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const bgRgb = hexToRgb(ae.bg);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={!title ? (eyebrow ?? 'Dialog') : undefined}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `rgba(${bgRgb}, 0.78)`,
        backdropFilter: 'blur(12px) saturate(140%)',
        WebkitBackdropFilter: 'blur(12px) saturate(140%)',
        padding: 24,
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth,
          maxHeight: 'calc(100vh - 48px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
          border: ae.cardBorder,
          borderRadius: ae.radiusLg,
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        }}
      >
        {/* Header */}
        {(title || eyebrow) ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px 24px',
              borderBottom: `0.5px solid ${ae.line}`,
              gap: 16,
            }}
          >
            <div style={{ minWidth: 0 }}>
              {eyebrow ? (
                <div
                  style={{
                    fontFamily: ae.fontMono,
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: '0.18em',
                    color: ae.textMute,
                    textTransform: ae.chipUpper ? 'uppercase' : 'none',
                    marginBottom: title ? 6 : 0,
                  }}
                >
                  {eyebrow}
                </div>
              ) : null}
              {title ? (
                <h2
                  id={titleId}
                  style={{
                    margin: 0,
                    fontFamily: ae.fontDisplay,
                    fontSize: 20,
                    fontWeight: ae.titleWeight,
                    letterSpacing: ae.titleTracking,
                    color: ae.text,
                  }}
                >
                  {title}
                </h2>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: `0.5px solid ${ae.line}`,
                background: 'rgba(255, 255, 255, 0.04)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: ae.textDim,
              }}
            >
              <Icon name="plus" size={16} color={ae.textDim} style={{ transform: 'rotate(45deg)' }} />
            </button>
          </div>
        ) : null}

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: 24 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
