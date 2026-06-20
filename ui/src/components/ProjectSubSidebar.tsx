import { NavLink, useNavigate } from 'react-router-dom';
import {
  Database, Cpu, FlaskConical, CheckSquare,
  LineChart, ChevronLeft, Zap, Box, ScanSearch,
} from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  projectId: number;
  projectName?: string;
}

export function ProjectSubSidebar({ projectId, projectName }: Props) {
  const navigate = useNavigate();
  const base = `/projects/${projectId}`;

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-[#0c0c0e] border-r border-zinc-800/60 h-screen sticky top-0">

      {/* Logo — same as main sidebar for consistency */}
      <div className="flex items-center gap-3 px-6 py-7 border-b border-zinc-800/60">
        <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shadow-[0_0_16px_rgba(124,58,237,0.5)] shrink-0">
          <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-100 leading-none tracking-tight">MLOps</p>
          <p className="text-[11px] text-zinc-600 leading-none mt-1">Platform</p>
        </div>
      </div>

      {/* Back + project name */}
      <div className="px-5 pt-5 pb-4 border-b border-zinc-800/40 space-y-2">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors group"
        >
          <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform duration-150" />
          All Projects
        </button>

        <div className="flex items-center gap-2.5 px-1 pt-1">
          <div className="w-6 h-6 rounded-md bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0">
            <Box className="w-3 h-3 text-violet-400" strokeWidth={2} />
          </div>
          <p className="text-sm font-semibold text-zinc-100 truncate leading-none">
            {projectName ?? '—'}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col p-4 flex-1 gap-0.5 overflow-y-auto">

        {/* Datasets — end=false so it stays active on /datasets/:dvId */}
        <SideNavItem to={`${base}/datasets`} icon={Database} end={false}>Datasets</SideNavItem>

        {/* Model section */}
        <SectionLabel>Model</SectionLabel>
        <SideNavItem to={`${base}/models`}      icon={Box} indent>Models</SideNavItem>
        <SideNavItem to={`${base}/checkpoints`} icon={Cpu} indent>Checkpoints</SideNavItem>

        {/* Analysis section */}
        <SectionLabel>Analysis</SectionLabel>
        <SideNavItem to={`${base}/experiments`} icon={FlaskConical}>Experiments</SideNavItem>
        <SideNavItem to={`${base}/tasks`}       icon={CheckSquare}>Tasks</SideNavItem>
        <SideNavItem to={`${base}/evaluation`}  icon={LineChart}>Evaluation</SideNavItem>
        <SideNavItem to={`${base}/visualize`}   icon={ScanSearch}>Visualize</SideNavItem>

      </nav>
    </aside>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-zinc-700 uppercase tracking-[0.1em] px-3 pt-5 pb-2">
      {children}
    </p>
  );
}

function SideNavItem({
  to,
  icon: Icon,
  children,
  indent = false,
  end = true,
}: {
  to: string;
  icon: React.ElementType;
  children: React.ReactNode;
  indent?: boolean;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
          indent ? 'pl-7 pr-3' : 'px-3',
          isActive
            ? 'bg-violet-500/10 text-violet-300 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.2)]'
            : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50',
        )
      }
    >
      <Icon className="w-4 h-4 shrink-0" strokeWidth={2} />
      {children}
    </NavLink>
  );
}
