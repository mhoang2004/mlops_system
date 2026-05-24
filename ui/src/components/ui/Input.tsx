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
        <label htmlFor={id} className="text-xs font-medium text-zinc-400 tracking-wide uppercase">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          className={cn(
            'w-full px-3.5 py-2.5 rounded-xl text-sm text-zinc-100',
            'bg-zinc-900/80 border border-zinc-800',
            'placeholder:text-zinc-600',
            'shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]',
            'outline-none transition-all duration-150',
            'hover:border-zinc-700 hover:bg-zinc-900',
            'focus:border-violet-500/60 focus:bg-zinc-900',
            'focus:ring-[3px] focus:ring-violet-500/15',
            'focus:shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]',
            error && [
              'border-red-500/60 bg-red-500/5',
              'focus:ring-red-500/15 focus:border-red-500/70',
            ],
            className,
          )}
          {...props}
        />
      </div>
      {hint && !error && <p className="text-xs text-zinc-600">{hint}</p>}
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-400">
          <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
          {error}
        </p>
      )}
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
        <label htmlFor={id} className="text-xs font-medium text-zinc-400 tracking-wide uppercase">
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={cn(
          'w-full px-3.5 py-2.5 rounded-xl text-sm text-zinc-100 resize-none',
          'bg-zinc-900/80 border border-zinc-800',
          'placeholder:text-zinc-600',
          'shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]',
          'outline-none transition-all duration-150',
          'hover:border-zinc-700 hover:bg-zinc-900',
          'focus:border-violet-500/60 focus:bg-zinc-900',
          'focus:ring-[3px] focus:ring-violet-500/15',
          error && [
            'border-red-500/60 bg-red-500/5',
            'focus:ring-red-500/15 focus:border-red-500/70',
          ],
          className,
        )}
        {...props}
      />
      {hint && !error && <p className="text-xs text-zinc-600">{hint}</p>}
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-400">
          <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
