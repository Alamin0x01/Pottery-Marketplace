import { useId } from 'react';

const INPUT = 'block w-full rounded-lg border bg-white px-3 py-2 text-sm text-charcoal shadow-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-terracotta-500 disabled:bg-stone-50 disabled:text-stone-500';

function Wrapper({ id, label, hint, error, required, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-charcoal">
        {label}
        {required && <span className="text-terracotta-600" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-700">{error}</p>
      ) : (
        hint && <p id={`${id}-hint`} className="mt-1 text-xs text-charcoal-soft">{hint}</p>
      )}
    </div>
  );
}

const describedBy = (id, error, hint) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

export function TextField({ label, hint, error, required, multiline = false, ...rest }) {
  const id = useId();
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} required={required}>
      <Tag id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy(id, error, hint)} required={required} className={`${INPUT} ${error ? 'border-red-400' : 'border-line'}`} rows={multiline ? 3 : undefined} {...rest} />
    </Wrapper>
  );
}

export function SelectField({ label, hint, error, required, options, placeholder, ...rest }) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} required={required}>
      <select id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy(id, error, hint)} required={required} className={`${INPUT} ${error ? 'border-red-400' : 'border-line'}`} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const { value, label: text } = typeof o === 'string' ? { value: o, label: o } : o;
          return <option key={value} value={value}>{text}</option>;
        })}
      </select>
    </Wrapper>
  );
}

/** Compact filter control (no visible label; `label` is used for screen readers). */
export function FilterSelect({ label, options, placeholder, ...rest }) {
  return (
    <select aria-label={label} className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-charcoal shadow-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500" {...rest}>
      <option value="">{placeholder}</option>
      {options.map((o) => {
        const { value, label: text } = typeof o === 'string' ? { value: o, label: o } : o;
        return <option key={value} value={value}>{text}</option>;
      })}
    </select>
  );
}
