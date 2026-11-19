import { forwardRef } from 'react';
import { Link } from 'react-router-dom';

const BASE = 'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:cursor-not-allowed disabled:opacity-55';
const VARIANTS = {
  primary: 'bg-terracotta-600 text-white shadow-sm hover:bg-terracotta-700 active:translate-y-px',
  dark: 'bg-clay-brown text-cream hover:bg-black/80',
  secondary: 'border border-sand bg-white/70 text-clay-brown hover:border-terracotta-200 hover:bg-white',
  ghost: 'text-clay-brown hover:bg-beige/70',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
};
const SIZES = { sm: '!px-3.5 !py-1.5 !text-xs', md: '', lg: '!px-7 !py-3 !text-base' };

export const buttonClass = (variant = 'primary', size = 'md', extra = '') => `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;

export const Button = forwardRef(function Button({ variant = 'primary', size = 'md', loading = false, disabled, className = '', type = 'button', children, ...rest }, ref) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={buttonClass(variant, size, className)} {...rest}>
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
      {children}
    </button>
  );
});

export function ButtonLink({ to, variant = 'primary', size = 'md', className = '', children, ...rest }) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
