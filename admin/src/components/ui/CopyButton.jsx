import { useRef, useState } from 'react';
import { Button } from './Button.jsx';

/** Copies text with the Clipboard API; falls back to selecting nothing silently if the browser refuses. */
export function CopyButton({ text, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Button onClick={copy} className={className} aria-live="polite">
      {copied ? 'Copied' : label}
    </Button>
  );
}
