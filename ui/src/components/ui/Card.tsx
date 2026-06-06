import { cn } from '../../lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
  glow?: boolean;
}

export function Card({ children, className, onClick, hoverable, glow }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative bg-[#111113] rounded-xl',
        'border border-zinc-800/80',
        'shadow-[0_1px_3px_rgba(0,0,0,0.3)]',
        hoverable && [
          'cursor-pointer transition-all duration-200',
          'hover:border-zinc-700/80',
          'hover:shadow-[0_8px_32px_rgba(0,0,0,0.35)]',
          glow && 'hover:shadow-[0_8px_32px_rgba(0,0,0,0.35),0_0_0_1px_rgba(139,92,246,0.12)]',
          'hover:-translate-y-px active:translate-y-0 active:scale-[0.998]',
        ],
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px rounded-t-xl bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mb-4', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-sm font-semibold text-zinc-100 tracking-tight', className)}>
      {children}
    </h3>
  );
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('text-zinc-500 text-sm leading-relaxed', className)}>{children}</div>;
}
