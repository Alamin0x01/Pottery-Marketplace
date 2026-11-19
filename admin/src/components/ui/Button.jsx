import { forwardRef } from 'react';
import { Spinner } from './States.jsx';

const BASE = 'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60';
const VARIANTS = {
  primary: 'bg-terracotta-500 text-white shadow-sm hover:bg-terracotta-600',
  secondary: 'border border-line bg-white text-charcoal shadow-sm hover:bg-stone-50',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
  dangerOutline: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
};

export const Button = forwardRef(function Button({ variant = 'secondary', loading = false, disabled, children, className = '', type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={`${BASE} ${VARIANTS[variant]} ${className}`} {...rest}>
      {loading && <Spinner className="h-4 w-4 !text-current" />}
      {children}
    </button>
  );
});

export { BASE as BUTTON_BASE, VARIANTS as BUTTON_VARIANTS };
