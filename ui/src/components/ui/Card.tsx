import { cn } from '../../lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export function Card({ children, className, onClick, hoverable }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative bg-zinc-900/70 backdrop-blur-md rounded-2xl p-6 md:p-8',
        'border border-zinc-800/80',
        'shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset,0_2px_4px_rgba(0,0,0,0.2)]',
        hoverable && [
          'cursor-pointer transition-all duration-200',
          'hover:bg-zinc-900/90 hover:border-zinc-700/80',
          'hover:shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_8px_32px_rgba(0,0,0,0.3),0_0_0_1px_rgba(124,58,237,0.12)]',
          'hover:-translate-y-0.5',
          'active:translate-y-0 active:scale-[0.995]',
        ],
        className,
      )}
    >
      {/* Subtle top edge highlight */}
      <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-white/6 to-transparent pointer-events-none" />
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('mb-4', className)}>{children}</div>;
}

export function CardTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={cn('text-[15px] font-semibold text-zinc-100 tracking-tight', className)}>
      {children}
    </h3>
  );
}

export function CardContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('text-zinc-500 text-sm leading-relaxed', className)}>{children}</div>;
}
