import { cn } from '../../lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'info' | 'muted';
  dot?: boolean;
  className?: string;
}

const variants = {
  default: {
    wrap: 'bg-violet-500/10 text-violet-300 border-violet-500/20 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.15)]',
    dot: 'bg-violet-400',
  },
  success: {
    wrap: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.12)]',
    dot: 'bg-emerald-400',
  },
  warning: {
    wrap: 'bg-amber-500/10 text-amber-300 border-amber-500/20 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.12)]',
    dot: 'bg-amber-400',
  },
  info: {
    wrap: 'bg-sky-500/10 text-sky-300 border-sky-500/20 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.12)]',
    dot: 'bg-sky-400',
  },
  muted: {
    wrap: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20 shadow-[inset_0_0_0_1px_rgba(113,113,122,0.12)]',
    dot: 'bg-zinc-500',
  },
};

export function Badge({ children, variant = 'default', dot, className }: BadgeProps) {
  const v = variants[variant];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-wide border',
        v.wrap,
        className,
      )}
    >
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 animate-pulse', v.dot)} />
      )}
      {children}
    </span>
  );
}
