import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Tag, Calendar, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { api, type Project } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { CreateProjectModal } from '../components/CreateProjectModal';
import { formatDate } from '../lib/utils';
import { useLang } from '../contexts/LangContext';

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
    <div className="flex flex-col gap-10 py-10">
      {/* Header */}
      <div className="flex items-start justify-between bg-slate-900/20 p-8 md:p-10 rounded-3xl border border-slate-800/40 backdrop-blur-sm shadow-md">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">{t('projects_title')}</h1>
          <p className="text-slate-400 text-sm mt-2">{t('projects_subtitle')}</p>
        </div>
        <CreateProjectModal onCreated={handleCreated} />
      </div>

      {/* States */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-28 text-slate-500 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-sm font-medium">{t('loading')}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-5 bg-red-500/10 border border-red-500/25 rounded-2xl text-red-400 text-sm shadow-lg shadow-red-500/5">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
          <span>{t('projects_api_error')}: {error}</span>
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 text-center bg-slate-900/30 rounded-3xl border border-dashed border-slate-800/80 p-8">
          <div className="w-20 h-20 rounded-3xl bg-slate-800 border border-slate-700/60 flex items-center justify-center mb-6 shadow-xl shadow-slate-950/20">
            <LayoutGrid className="w-9 h-9 text-slate-500" />
          </div>
          <p className="text-slate-200 font-semibold text-lg">{t('projects_empty')}</p>
          <p className="text-slate-500 text-sm mt-2 max-w-sm">{t('projects_empty_hint')}</p>
        </div>
      )}

      {/* Grid */}
      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 md:gap-10">
          {projects.map((p) => (
            <Card
              key={p.id}
              hoverable
              onClick={() => navigate(`/projects/${p.id}`)}
              className="group flex flex-col justify-between min-h-[220px] shadow-md shadow-slate-950/10 hover:shadow-indigo-500/5"
            >
              <div>
                {/* Top row */}
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center shadow-inner">
                    <LayoutGrid className="w-6 h-6 text-indigo-400" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all duration-250" />
                </div>

                {/* Name */}
                <h2 className="text-lg font-bold text-white mb-3 truncate group-hover:text-indigo-300 transition-colors">{p.name}</h2>
                <p className="text-xs text-slate-500 mb-4 flex items-center gap-1.5 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-slate-600" />
                  {t('projects_created_at')} {formatDate(p.created_at)}
                </p>
              </div>

              {/* Labels */}
              {p.labels && p.labels.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-auto">
                  {p.labels.slice(0, 3).map((l, i) => (
                    <Badge key={i} variant="info" className="px-2.5 py-1 text-xs">
                      <Tag className="w-3 h-3 mr-1 shrink-0" />
                      {l.name}
                    </Badge>
                  ))}
                  {p.labels.length > 3 && (
                    <Badge variant="muted" className="px-2 py-1 text-xs">+{p.labels.length - 3}</Badge>
                  )}
                </div>
              ) : (
                <Badge variant="muted" className="px-2.5 py-1 text-xs mt-auto">{t('projects_no_labels')}</Badge>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
