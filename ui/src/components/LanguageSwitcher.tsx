import { useLang } from '../contexts/LangContext';
import { cn } from '../lib/utils';

export function LanguageSwitcher() {
  const { lang, setLang } = useLang();

  return (
    <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
      {(['vi', 'en'] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150',
            lang === l
              ? 'bg-zinc-800 text-zinc-200 shadow-sm'
              : 'text-zinc-600 hover:text-zinc-400',
          )}
        >
          <span>{l === 'vi' ? '🇻🇳' : '🇬🇧'}</span>
          <span>{l.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}
