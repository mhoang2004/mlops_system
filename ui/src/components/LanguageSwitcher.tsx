import { useLang } from '../contexts/LangContext';
import { cn } from '../lib/utils';

export function LanguageSwitcher() {
  const { lang, setLang } = useLang();

  return (
    <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-0.5">
      {(['vi', 'en'] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all duration-200',
            lang === l
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          <span>{l === 'vi' ? '🇻🇳' : '🇬🇧'}</span>
          <span>{l === 'vi' ? 'VI' : 'EN'}</span>
        </button>
      ))}
    </div>
  );
}
