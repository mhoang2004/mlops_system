import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Calendar, Trash2, Loader2, AlertCircle, FolderOpen, ChevronRight } from 'lucide-react';
import { api, type DatasetVersion } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { CreateDatasetVersionModal } from '../../components/CreateDatasetVersionModal';
import { UploadLabelsModal } from '../../components/UploadLabelsModal';
import { formatDate } from '../../lib/utils';
import { useLang } from '../../contexts/LangContext';

export function DatasetsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const projectId = Number(id);
  const { t }     = useLang();

  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api.datasetVersions.list(projectId)
      .then(setVersions)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleCreated = (dv: DatasetVersion) => setVersions((prev) => [dv, ...prev]);

  const handleLabelsUploaded = (updated: DatasetVersion) =>
    setVersions((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));

  const handleDelete = async (dvId: number) => {
    if (!confirm(t('dv_confirm_delete'))) return;
    setDeletingId(dvId);
    try {
      await api.datasetVersions.delete(dvId);
      setVersions((prev) => prev.filter((v) => v.id !== dvId));
    } catch { alert(t('delete_failed')); }
    finally { setDeletingId(null); }
  };

  return (
    <div className="flex flex-col gap-12">

      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">
            {t('project_tab_datasets')}
          </h1>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
            {t('dv_empty_hint')}
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <CreateDatasetVersionModal projectId={projectId} onCreated={handleCreated} />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-28 gap-3 text-zinc-600">
          <Loader2 className="w-6 h-6 animate-spin text-violet-500/50" />
          <span className="text-sm">{t('loading')}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-5 bg-red-500/8 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{t('projects_api_error')}: {error}</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && versions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-zinc-800 rounded-xl">
          <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
            <FolderOpen className="w-6 h-6 text-zinc-600" />
          </div>
          <p className="text-base font-medium text-zinc-300">{t('dv_empty')}</p>
          <p className="text-sm text-zinc-600 mt-2 leading-relaxed">{t('dv_empty_hint')}</p>
        </div>
      )}

      {/* List */}
      {!loading && versions.length > 0 && (
        <div className="flex flex-col gap-4">
          <AnimatePresence>
            {versions.map((dv, i) => (
              <motion.div
                key={dv.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, delay: i * 0.05 }}
              >
                <Card className="p-6 flex items-start gap-5 hover:border-zinc-700/60 transition-colors duration-150 group">

                  {/* Clickable area → detail page */}
                  <div
                    className="flex items-start gap-5 flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/projects/${projectId}/datasets/${dv.id}`)}
                  >
                    <div className="w-10 h-10 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0 mt-0.5">
                      <Database className="w-4.5 h-4.5 text-zinc-400" strokeWidth={2} />
                    </div>

                    <div className="flex-1 min-w-0 space-y-2.5">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-sm font-semibold text-zinc-100 group-hover:text-violet-300 transition-colors">
                          {dv.name}
                        </span>
                        <Badge variant="muted">{dv.version}</Badge>
                        <Badge variant={dv.label_type === 'human' ? 'success' : 'warning'} dot>
                          {dv.label_type === 'human' ? t('dv_labeled') : t('dv_unlabeled')}
                        </Badge>
                      </div>
                      {dv.description && (
                        <p className="text-sm text-zinc-500 leading-relaxed line-clamp-1">{dv.description}</p>
                      )}
                      <p className="text-xs text-zinc-600 font-mono leading-relaxed truncate">{dv.storage_path}</p>
                      <p className="text-xs text-zinc-600 flex items-center gap-1.5 pt-0.5">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        {formatDate(dv.created_at)}
                      </p>
                    </div>

                    <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all duration-150 shrink-0 mt-3" />
                  </div>

                  {/* Action buttons — not part of the clickable area */}
                  <div
                    className="flex items-center gap-3 shrink-0 pt-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <UploadLabelsModal datasetVersion={dv} onUploaded={handleLabelsUploaded} />
                    <Button
                      size="sm"
                      variant="danger"
                      icon={deletingId === dv.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                      onClick={() => handleDelete(dv.id)}
                      disabled={deletingId === dv.id}
                    >
                      {t('delete')}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
