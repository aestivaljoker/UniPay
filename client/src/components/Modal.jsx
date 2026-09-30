import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Bottom-sheet on phones, centred dialog on wide screens.
 * Handles Escape, scroll lock, and returns focus to whatever opened it.
 */
export function Modal({ open, onClose, title, subtitle, children, size = 'md', dismissable = true }) {
  const panelRef = useRef(null);
  const restoreFocusTo = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    restoreFocusTo.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && dismissable) onClose?.();
      if (e.key !== 'Tab' || !panelRef.current) return;

      // Trap focus: a payment confirmation must not let you tab into the page
      // behind it and click something else.
      const focusables = panelRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // Focus the panel itself so screen readers announce the dialog.
    const focusTimer = setTimeout(() => panelRef.current?.focus(), 30);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      clearTimeout(focusTimer);
      restoreFocusTo.current?.focus?.();
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  const width = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm animate-fade-up"
        onClick={() => dismissable && onClose?.()}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 w-full ${width} animate-fade-up overflow-hidden rounded-t-3xl border border-white/12
                    bg-ink-900 shadow-lift sm:rounded-3xl`}
      >
        {/* Drag handle — signals "swipe/tap away" on a phone. */}
        <div className="flex justify-center pt-3 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {(title || dismissable) && (
          <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
            <div className="min-w-0">
              {title && <h2 className="text-base font-extrabold tracking-tight text-white">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
            </div>
            {dismissable && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 -mt-1 rounded-lg p-2 text-slate-400 transition hover:bg-white/8 hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        <div className="max-h-[78vh] overflow-y-auto px-5 py-5 safe-bottom sm:pb-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
