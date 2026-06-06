import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, Tag, Calendar,
  Loader2, AlertCircle, Plus, ArrowUpRight
} from 'lucide-react';
import { api, type Project } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { CreateProjectModal } from '../components/CreateProjectModal';
import { formatDate } from '../lib/utils';
import { useLang } from '../contexts/LangContext';

const containerVariants = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

const PROJECT_COLORS = [
  'from-violet-500/20 to-violet-600/5',
  'from-cyan-500/20 to-cyan-600/5',
  'from-emerald-500/20 to-emerald-600/5',
  'from-amber-500/20 to-amber-600/5',
  'from-rose-500/20 to-rose-600/5',
  'from-indigo-500/20 to-indigo-600/5',
];

const PROJECT_ICON_COLORS = [
  'text-violet-400 bg-violet-500/10 border-violet-500/20',
  'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'text-rose-400 bg-rose-500/10 border-rose-500/20',
  'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
];

export function ProjectsPage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.projects
      .list()
      .then(setProjects)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleCreated = (p: Project) => setProjects((prev) => [p, ...prev]);

  return (
    <div className="flex flex-col gap-12">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">
            {t('projects_title')}
          </h1>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
            {t('projects_subtitle')}
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <CreateProjectModal onCreated={handleCreated} />
        </div>
      </div>

      {/* ── Loading ──────────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-28 text-zinc-600 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-violet-500/50" />
          <span className="text-sm">{t('loading')}</span>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 p-5 bg-red-500/8 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{t('projects_api_error')}: {error}</span>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────── */}
      {!loading && !error && projects.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-zinc-800 rounded-xl"
        >
          <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
            <LayoutGrid className="w-6 h-6 text-zinc-600" />
          </div>
          <p className="text-base font-medium text-zinc-300">{t('projects_empty')}</p>
          <p className="text-sm text-zinc-600 mt-2 mb-7 leading-relaxed">{t('projects_empty_hint')}</p>
          <CreateProjectModal onCreated={handleCreated} />
        </motion.div>
      )}

      {/* ── Project grid ─────────────────────────────────────────── */}
      {!loading && projects.length > 0 && (
        <motion.div
          variants={containerVariants}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
        >
          <AnimatePresence>
            {projects.map((p, i) => {
              const colorIdx = i % PROJECT_COLORS.length;
              const gradient = PROJECT_COLORS[colorIdx];
              const iconColor = PROJECT_ICON_COLORS[colorIdx];

              return (
                <motion.div key={p.id} variants={itemVariants} className="h-full">
                  <Card
                    hoverable
                    glow
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="group h-full p-6 flex flex-col gap-5"
                  >
                    {/* Icon + arrow */}
                    <div className="flex items-start justify-between">
                      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${iconColor}`}>
                        <LayoutGrid className="w-4.5 h-4.5" />
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-zinc-700 group-hover:text-zinc-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
                    </div>

                    {/* Name + date */}
                    <div className="space-y-1.5">
                      <h2 className="text-sm font-semibold text-zinc-100 truncate group-hover:text-violet-200 transition-colors duration-200 leading-snug">
                        {p.name}
                      </h2>
                      <p className="text-xs text-zinc-600 flex items-center gap-1.5 leading-none">
                        <Calendar className="w-3 h-3 shrink-0" />
                        {formatDate(p.created_at)}
                      </p>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-zinc-800/60" />

                    {/* Labels */}
                    <div className="mt-auto">
                      {p.labels && p.labels.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {p.labels.slice(0, 4).map((l, li) => (
                            <Badge key={li} variant="muted" className="gap-1">
                              <Tag className="w-2.5 h-2.5" />
                              {l.name}
                            </Badge>
                          ))}
                          {p.labels.length > 4 && (
                            <Badge variant="muted">+{p.labels.length - 4}</Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-700 leading-none">{t('projects_no_labels')}</span>
                      )}
                    </div>

                    {/* Bottom gradient accent */}
                    <div className={`absolute inset-x-0 bottom-0 h-[1px] rounded-b-xl bg-gradient-to-r ${gradient} opacity-70`} />
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* New project tile */}
          <motion.div variants={itemVariants} className="h-full">
            <button
              onClick={() => document.querySelector<HTMLButtonElement>('[data-create-project]')?.click()}
              className="group w-full h-full min-h-[200px] rounded-xl border border-dashed border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/30 transition-all duration-200 flex flex-col items-center justify-center gap-3 p-8"
            >
              <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 group-hover:border-zinc-700 flex items-center justify-center transition-all duration-200">
                <Plus className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
              </div>
              <span className="text-sm text-zinc-600 group-hover:text-zinc-400 transition-colors font-medium">
                {t('projects_create')}
              </span>
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
