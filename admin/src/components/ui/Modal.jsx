import { useEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal dialog: focus moves into it and returns afterwards, Tab stays inside, Escape closes it
 * (unless `locked`, used while a request is running or a one-time secret must be acknowledged).
 */
export function Modal({ title, description, onClose, locked = false, children, footer, size = 'max-w-md' }) {
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useEffect(() => {
    const previous = document.activeElement;
    const first = panel.current?.querySelector('[data-autofocus]') ?? panel.current?.querySelector(FOCUSABLE);
    first?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && !lockedRef.current) closeRef.current?.();
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll(FOCUSABLE)];
      if (items.length === 0) return;
      const [head, tail] = [items[0], items.at(-1)];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-charcoal/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && !locked && onClose?.()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} className={`w-full ${size} rounded-xl border border-line bg-white shadow-xl`}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-charcoal">{title}</h2>
            {description && <p className="mt-1 text-sm text-charcoal-soft">{description}</p>}
          </div>
          {!locked && (
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500">
              <Icon name="close" className="h-5 w-5" />
            </button>
          )}
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-stone-50/60 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
