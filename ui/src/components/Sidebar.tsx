import { NavLink } from 'react-router-dom';
import { LayoutGrid, Cpu, BrainCircuit } from 'lucide-react';
import { cn } from '../lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useLang } from '../contexts/LangContext';

export function Sidebar() {
  const { t } = useLang();

  const nav = [
    { to: '/', label: t('nav_projects'), icon: LayoutGrid, end: true },
    { to: '/checkpoints', label: t('nav_checkpoints'), icon: Cpu },
  ];

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-slate-900 border-r border-slate-800 h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-slate-800">
        <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/40">
          <BrainCircuit className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-none">MLOps</p>
          <p className="text-[10px] text-slate-500 leading-none mt-1">Platform</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-2 p-4 flex-1">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800',
              )
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer: language + api url */}
      <div className="px-4 py-5 border-t border-slate-800 flex flex-col gap-3">
        <LanguageSwitcher />
        <p className="text-xs text-slate-600">
          {t('api_url_label')}: {import.meta.env.VITE_API_URL || 'http://localhost:8000'}
        </p>
      </div>
    </aside>
  );
}
