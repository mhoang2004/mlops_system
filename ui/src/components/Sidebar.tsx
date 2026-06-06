import { NavLink } from 'react-router-dom';
import { LayoutGrid, Server, Brain, BarChart2, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';

const NAV = [
  { to: '/',          label: 'Projects',   icon: LayoutGrid, end: true  },
  { to: '/servers',   label: 'Servers',    icon: Server,     end: false },
  { to: '/trainers',  label: 'Trainers',   icon: Brain,      end: false },
  { to: '/visualize', label: 'Visualize',  icon: BarChart2,  end: false },
] as const;

export function Sidebar() {
  return (
    <aside className="w-64 shrink-0 flex flex-col bg-[#0c0c0e] border-r border-zinc-800/60 h-screen sticky top-0">

      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-7 border-b border-zinc-800/60">
        <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shadow-[0_0_16px_rgba(124,58,237,0.5)] shrink-0">
          <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-100 leading-none tracking-tight">MLOps</p>
          <p className="text-[11px] text-zinc-600 leading-none mt-1">Platform</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col p-4 pt-5 flex-1 gap-0.5">
        {NAV.map(({ to, label, icon: Icon, end: isEnd }) => (
          <NavLink
            key={to}
            to={to}
            end={isEnd}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-violet-500/10 text-violet-300 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.2)]'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50',
              )
            }
          >
            <Icon className="w-4 h-4 shrink-0" strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-6 border-t border-zinc-800/60 space-y-4">
        <LanguageSwitcher />
        <p className="text-[11px] text-zinc-700 font-mono truncate">
          {import.meta.env.VITE_API_URL || 'localhost:8000'}
        </p>
      </div>
    </aside>
  );
}
