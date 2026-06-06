import { cn } from '../../lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'info' | 'muted';
  dot?: boolean;
  className?: string;
}

const variants = {
  default: {
    wrap: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    dot: 'bg-violet-400',
  },
  success: {
    wrap: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
  warning: {
    wrap: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    dot: 'bg-amber-400',
  },
  info: {
    wrap: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    dot: 'bg-sky-400',
  },
  muted: {
    wrap: 'bg-zinc-800/80 text-zinc-500 border-zinc-700/50',
    dot: 'bg-zinc-500',
  },
};

export function Badge({ children, variant = 'default', dot, className }: BadgeProps) {
  const v = variants[variant];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide border',
        v.wrap,
        className,
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', v.dot)} />}
      {children}
    </span>
  );
}
