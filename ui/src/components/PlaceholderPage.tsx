import type { ElementType } from 'react';

interface Props {
  icon: ElementType;
  title: string;
  hint: string;
  accent?: 'violet' | 'cyan' | 'emerald' | 'amber';
}

const accents = {
  violet:  'bg-violet-500/8 border-violet-500/20 text-violet-400',
  cyan:    'bg-cyan-500/8 border-cyan-500/20 text-cyan-400',
  emerald: 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400',
  amber:   'bg-amber-500/8 border-amber-500/20 text-amber-400',
};

export function PlaceholderPage({ icon: Icon, title, hint, accent = 'violet' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className={`w-14 h-14 rounded-xl border flex items-center justify-center mb-5 ${accents[accent]}`}>
        <Icon className="w-6 h-6" strokeWidth={2} />
      </div>
      <p className="text-base font-semibold text-zinc-200">{title}</p>
      <p className="text-sm text-zinc-500 mt-2 max-w-xs leading-relaxed">{hint}</p>
    </div>
  );
}
