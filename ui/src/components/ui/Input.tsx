import { cn } from '../../lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className, id, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          className={cn(
            'w-full px-4 py-2.5 rounded-lg text-sm text-zinc-100',
            'bg-zinc-900/60 border border-zinc-800',
            'placeholder:text-zinc-600',
            'outline-none transition-all duration-150',
            'hover:border-zinc-700 hover:bg-zinc-900',
            'focus:border-violet-500/50 focus:bg-zinc-900',
            'focus:ring-2 focus:ring-violet-500/10',
            error && 'border-red-500/50 focus:border-red-500/60 focus:ring-red-500/10',
            className,
          )}
          {...props}
        />
      </div>
      {hint && !error && <p className="text-[11px] text-zinc-600">{hint}</p>}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Textarea({ label, error, hint, className, id, ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={cn(
          'w-full px-4 py-2.5 rounded-lg text-sm text-zinc-100 resize-none',
          'bg-zinc-900/60 border border-zinc-800',
          'placeholder:text-zinc-600',
          'outline-none transition-all duration-150',
          'hover:border-zinc-700',
          'focus:border-violet-500/50 focus:bg-zinc-900',
          'focus:ring-2 focus:ring-violet-500/10',
          error && 'border-red-500/50',
          className,
        )}
        {...props}
      />
      {hint && !error && <p className="text-[11px] text-zinc-600">{hint}</p>}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
