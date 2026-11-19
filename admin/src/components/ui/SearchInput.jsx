import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { useDebounce } from '../../hooks/useDebounce.js';

/** Search field that reports its (debounced) value; `value` is the committed value from the URL. */
export function SearchInput({ value, onCommit, label, placeholder, maxLength = 60 }) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  const debounced = useDebounce(text.trim(), 350);

  useEffect(() => {
    if (debounced !== committed.current) {
      committed.current = debounced;
      onCommit(debounced);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Follow URL changes made elsewhere (back button, a link carrying ?q=) but never overwrite what the user just typed.
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);

  return (
    <div className="relative min-w-52 flex-1 sm:max-w-sm">
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        maxLength={maxLength}
        onChange={(e) => setText(e.target.value)}
        className="block w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm text-charcoal shadow-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-terracotta-500"
      />
    </div>
  );
}
