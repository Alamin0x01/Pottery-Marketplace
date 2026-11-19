import { useEffect, useRef, useState } from 'react';

/** Calls `onOutside` on a click outside `ref` or on Escape; active only while `active` is true. */
export function useDismiss(ref, active, onOutside) {
  useEffect(() => {
    if (!active) return undefined;
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && onOutside();
    const onKey = (e) => e.key === 'Escape' && onOutside();
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, active, onOutside]);
}

/** Wrapper with a trigger button and a dismissible popover panel (used by the bell and the user menu). */
export function Popover({ label, trigger, children, align = 'right', panelClassName = 'w-72' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, open, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        className="rounded-lg p-2 text-charcoal-soft transition-colors hover:bg-stone-100 hover:text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500"
      >
        {trigger}
      </button>
      {open && (
        <div className={`absolute z-50 mt-2 rounded-xl border border-line bg-white shadow-lg ${align === 'right' ? 'right-0' : 'left-0'} ${panelClassName}`}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}
