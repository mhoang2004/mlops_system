import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

const variants = {
  primary: cn(
    'relative bg-violet-600 text-white border border-violet-500/50',
    'shadow-[0_1px_0_rgba(255,255,255,0.07)_inset,0_2px_12px_rgba(124,58,237,0.25)]',
    'hover:bg-violet-500 hover:shadow-[0_1px_0_rgba(255,255,255,0.1)_inset,0_4px_20px_rgba(124,58,237,0.4)]',
    'active:scale-[0.97] active:shadow-none',
    'before:absolute before:inset-0 before:rounded-[inherit] before:bg-gradient-to-b before:from-white/8 before:to-transparent before:pointer-events-none',
  ),
  secondary: cn(
    'bg-zinc-900 text-zinc-200 border border-zinc-700/80',
    'shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]',
    'hover:bg-zinc-800 hover:border-zinc-600/80 hover:text-zinc-100',
    'active:scale-[0.97]',
  ),
  ghost: cn(
    'bg-transparent text-zinc-400 border border-transparent',
    'hover:bg-zinc-800/60 hover:text-zinc-200 hover:border-zinc-700/40',
    'active:scale-[0.97]',
  ),
  danger: cn(
    'bg-red-500/8 text-red-400 border border-red-500/25',
    'hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/40',
    'active:scale-[0.97]',
  ),
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'px-4 py-2 text-sm gap-2 rounded-lg',
  lg: 'px-6 py-2.5 text-sm gap-2.5 rounded-lg',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center font-medium transition-all duration-150 cursor-pointer',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading
        ? <Loader2 className="w-3 h-3 animate-spin shrink-0 opacity-60" />
        : icon && <span className="shrink-0 opacity-75">{icon}</span>
      }
      {children}
    </button>
  );
}
