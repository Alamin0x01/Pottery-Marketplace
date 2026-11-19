import { useId } from 'react';

const INPUT = 'block w-full rounded-xl border bg-white/80 px-3.5 py-2.5 text-sm text-clay-brown shadow-sm placeholder:text-clay-soft/60 focus:border-terracotta-500 focus:outline-none focus:ring-2 focus:ring-terracotta-500/30 disabled:bg-beige/50 disabled:text-clay-soft';

function Wrapper({ id, label, hint, error, required, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-clay-brown">
        {label}
        {required && <span className="text-terracotta-600" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-700">{error}</p>
      ) : (
        hint && <p id={`${id}-hint`} className="mt-1 text-xs text-clay-soft">{hint}</p>
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
      <Tag id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy(id, error, hint)} className={`${INPUT} ${error ? 'border-red-400' : 'border-sand'}`} rows={multiline ? 3 : undefined} {...rest} />
    </Wrapper>
  );
}

export function SelectField({ label, hint, error, required, options, placeholder, ...rest }) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} required={required}>
      <select id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy(id, error, hint)} className={`${INPUT} ${error ? 'border-red-400' : 'border-sand'}`} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const { value, label: text } = typeof o === 'string' ? { value: o, label: o } : o;
          return <option key={value} value={value}>{text}</option>;
        })}
      </select>
    </Wrapper>
  );
}

export const inputClass = INPUT;
