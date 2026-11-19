import { Icon } from './Icon.jsx';

/** − 1 + control. `max` is the available stock; the buttons disable at the limits. */
export function QuantityStepper({ value, max = 50, min = 1, onChange, label = 'Quantity', disabled = false }) {
  const set = (n) => onChange(Math.min(max, Math.max(min, n)));
  return (
    <div className="inline-flex items-center rounded-full border border-sand bg-white/80" role="group" aria-label={label}>
      <button type="button" onClick={() => set(value - 1)} disabled={disabled || value <= min} aria-label="Decrease quantity" className="rounded-full p-2.5 text-clay-brown transition hover:bg-beige disabled:opacity-35">
        <Icon name="minus" className="h-4 w-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ''));
          if (Number.isFinite(n) && n > 0) set(n);
        }}
        className="w-10 bg-transparent text-center text-sm font-medium focus:outline-none"
      />
      <button type="button" onClick={() => set(value + 1)} disabled={disabled || value >= max} aria-label="Increase quantity" className="rounded-full p-2.5 text-clay-brown transition hover:bg-beige disabled:opacity-35">
        <Icon name="plus" className="h-4 w-4" />
      </button>
    </div>
  );
}
