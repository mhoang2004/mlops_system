import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Tag, Calendar, Trash2,
  Loader2, AlertCircle, FolderOpen, CheckCircle2, Clock,
  Cpu, BarChart3, FlaskConical, LineChart, Plus, Upload,
  ChevronLeft
} from 'lucide-react';
import { api, type Project, type DatasetVersion, type Checkpoint } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { CreateDatasetVersionModal } from '../components/CreateDatasetVersionModal';
import { UploadLabelsModal } from '../components/UploadLabelsModal';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { DropZone } from '../components/ui/DropZone';
import { formatDate } from '../lib/utils';
import { useLang } from '../contexts/LangContext';

type TabType = 'datasets' | 'checkpoints' | 'experiments' | 'evaluations';

function ProjectUploadCheckpointModal({ projectId, onCreated }: { projectId: number; onCreated: (c: Checkpoint) => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || files.length === 0) { setError(t('error_checkpoint_fields')); return; }
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('project_id', String(projectId));
      form.append('name', name.trim());
      form.append('file', files[0]);
      const c = await api.checkpoints.upload(form);
      onCreated(c);
      setOpen(false);
      setName(''); setFiles([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setOpen(true)}>
        {t('ckpt_upload')}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('ckpt_upload_title')}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input
            id="ckpt-name"
            label={t('ckpt_name')}
            placeholder="yolov8n_pretrained"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <DropZone
            label={t('ckpt_file_label')}
            hint={t('ckpt_file_hint')}
            accept=".pt,.pth,.weights,.onnx"
            multiple={false}
            files={files}
            onFilesChange={setFiles}
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Button>
            <Button type="submit" loading={loading} icon={<Upload className="w-3.5 h-3.5" />}>
              {t('upload')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

const TABS = [
  { id: 'datasets' as TabType, icon: Database },
  { id: 'checkpoints' as TabType, icon: Cpu },
  { id: 'experiments' as TabType, icon: FlaskConical },
  { id: 'evaluations' as TabType, icon: LineChart },
] as const;

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLang();
  const projectId = Number(id);

  const [project, setProject] = useState<Project | null>(null);
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingCkptId, setDeletingCkptId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('datasets');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.projects.get(projectId),
      api.datasetVersions.list(projectId),
      api.checkpoints.list(projectId),
    ])
      .then(([proj, dvs, ckpts]) => { setProject(proj); setVersions(dvs); setCheckpoints(ckpts); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleDatasetCreated = (dv: DatasetVersion) => setVersions((prev) => [dv, ...prev]);
  const handleLabelsUploaded = (updated: DatasetVersion) =>
    setVersions((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
  const handleCheckpointCreated = (c: Checkpoint) => setCheckpoints((prev) => [c, ...prev]);

  const handleDatasetDelete = async (dvId: number) => {
    if (!confirm(t('dv_confirm_delete'))) return;
    setDeletingId(dvId);
    try {
      await api.datasetVersions.delete(dvId);
      setVersions((prev) => prev.filter((v) => v.id !== dvId));
    } catch { alert(t('delete_failed')); }
    finally { setDeletingId(null); }
  };

  const handleCheckpointDelete = async (ckptId: number) => {
    if (!confirm(t('ckpt_delete_confirm'))) return;
    setDeletingCkptId(ckptId);
    try {
      await api.checkpoints.delete(ckptId);
      setCheckpoints((prev) => prev.filter((c) => c.id !== ckptId));
    } catch { alert(t('delete_failed')); }
    finally { setDeletingCkptId(null); }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-zinc-600 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500/50" />
        <span className="text-sm">{t('loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-5 bg-red-500/8 border border-red-500/20 rounded-xl text-red-400 text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  const stats = [
    { label: t('project_stat_total_versions'), value: versions.length, icon: Database, color: 'text-violet-400' },
    { label: t('project_stat_labeled'), value: versions.filter((v) => v.label_type === 'human').length, icon: CheckCircle2, color: 'text-emerald-400' },
    { label: t('project_stat_unlabeled'), value: versions.filter((v) => v.label_type === 'unlabeled').length, icon: Clock, color: 'text-amber-400' },
    { label: t('project_stat_checkpoints'), value: checkpoints.length, icon: Cpu, color: 'text-cyan-400' },
  ];

  return (
    <div className="flex flex-col gap-12">

      {/* ── Back nav ─────────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200 transition-colors group"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform duration-150" />
          {t('project_back')}
        </button>
      </div>

      {/* ── Project header ───────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-4 min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight truncate">
            {project?.name}
          </h1>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm text-zinc-500 flex items-center gap-1.5 leading-none">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              {project && formatDate(project.created_at)}
            </span>
            {project?.labels && project.labels.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {project.labels.slice(0, 5).map((l, i) => (
                  <Badge key={i} variant="info" className="gap-1">
                    <Tag className="w-2.5 h-2.5" />
                    {l.name}
                  </Badge>
                ))}
                {project.labels.length > 5 && (
                  <Badge variant="muted">+{project.labels.length - 5}</Badge>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 pt-1">
          {activeTab === 'datasets' && (
            <CreateDatasetVersionModal projectId={projectId} onCreated={handleDatasetCreated} />
          )}
          {activeTab === 'checkpoints' && (
            <ProjectUploadCheckpointModal projectId={projectId} onCreated={handleCheckpointCreated} />
          )}
        </div>
      </div>

      {/* ── Stats row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="bg-[#111113] border border-zinc-800/80 rounded-xl p-6 flex items-center gap-5"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
              <Icon className={`w-4.5 h-4.5 ${color}`} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-zinc-100 leading-none">{value}</p>
              <p className="text-xs text-zinc-500 mt-1.5 leading-snug">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-zinc-800/60 pb-px">
        {TABS.map(({ id: tabId, icon: Icon }) => {
          const label = t(`project_tab_${tabId}` as Parameters<typeof t>[0]);
          const active = activeTab === tabId;
          return (
            <button
              key={tabId}
              onClick={() => setActiveTab(tabId)}
              className={`relative flex items-center gap-2 px-4 py-3.5 text-sm font-medium transition-all duration-150 cursor-pointer ${
                active ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={2} />
              <span>{label}</span>
              {active && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute inset-x-0 bottom-[-1px] h-px bg-violet-500"
                  transition={{ duration: 0.2, type: "tween" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ──────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >

          {/* Datasets */}
          {activeTab === 'datasets' && (
            versions.length === 0
              ? <EmptyState icon={FolderOpen} title={t('dv_empty')} hint={t('dv_empty_hint')} />
              : (
                <div className="flex flex-col gap-4">
                  {versions.map((dv, i) => (
                    <motion.div
                      key={dv.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18, delay: i * 0.05 }}
                    >
                      <Card className="p-6 flex items-start gap-5 hover:border-zinc-700/60 transition-colors duration-150">
                        {/* Icon */}
                        <div className="w-10 h-10 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0 mt-0.5">
                          <Database className="w-4.5 h-4.5 text-zinc-400" strokeWidth={2} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0 space-y-2.5">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-sm font-semibold text-zinc-100">{dv.name}</span>
                            <Badge variant="muted">{dv.version}</Badge>
                            <Badge variant={dv.label_type === 'human' ? 'success' : 'warning'} dot>
                              {dv.label_type === 'human' ? t('dv_labeled') : t('dv_unlabeled')}
                            </Badge>
                          </div>
                          {dv.description && (
                            <p className="text-sm text-zinc-500 leading-relaxed line-clamp-1">
                              {dv.description}
                            </p>
                          )}
                          <p className="text-xs text-zinc-600 font-mono leading-relaxed truncate">
                            {dv.storage_path}
                          </p>
                          <p className="text-xs text-zinc-600 flex items-center gap-1.5 pt-0.5">
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            {formatDate(dv.created_at)}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 shrink-0 pt-0.5">
                          <UploadLabelsModal datasetVersion={dv} onUploaded={handleLabelsUploaded} />
                          <Button
                            size="sm"
                            variant="danger"
                            icon={deletingId === dv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            onClick={() => handleDatasetDelete(dv.id)}
                            disabled={deletingId === dv.id}
                          >
                            {t('delete')}
                          </Button>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )
          )}

          {/* Checkpoints */}
          {activeTab === 'checkpoints' && (
            checkpoints.length === 0
              ? <EmptyState icon={Cpu} title={t('ckpt_empty')} hint={t('ckpt_empty_hint')} />
              : (
                <div className="flex flex-col gap-4">
                  {checkpoints.map((ck, i) => (
                    <motion.div
                      key={ck.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18, delay: i * 0.05 }}
                    >
                      <Card className="p-6 flex items-start gap-5 hover:border-zinc-700/60 transition-colors duration-150">
                        {/* Icon */}
                        <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <Cpu className="w-4.5 h-4.5 text-violet-400" strokeWidth={2} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0 space-y-2.5">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-sm font-semibold text-zinc-100">{ck.name}</span>
                            <Badge variant={ck.source === 'pretrained' ? 'info' : 'success'}>
                              {ck.source === 'pretrained' ? t('ckpt_pretrained') : t('ckpt_experiment')}
                            </Badge>
                          </div>
                          <p className="text-xs text-zinc-600 font-mono leading-relaxed truncate">
                            {ck.file_path}
                          </p>
                          {ck.metrics && Object.keys(ck.metrics).length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap pt-0.5">
                              <BarChart3 className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                              {Object.entries(ck.metrics).map(([k, v]) => (
                                <Badge key={k} variant="muted">{k}: {String(v)}</Badge>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-zinc-600 flex items-center gap-1.5 pt-0.5">
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            {formatDate(ck.created_at)}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="shrink-0 pt-0.5">
                          <Button
                            size="sm"
                            variant="danger"
                            icon={deletingCkptId === ck.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            onClick={() => handleCheckpointDelete(ck.id)}
                            disabled={deletingCkptId === ck.id}
                          >
                            {t('delete')}
                          </Button>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )
          )}

          {/* Experiments placeholder */}
          {activeTab === 'experiments' && (
            <ComingSoonPlaceholder
              icon={FlaskConical}
              color="violet"
              title={t('project_coming_soon')}
              hint={t('project_coming_soon_hint')}
              previewSlot={
                <div className="grid grid-cols-2 gap-5 mt-10 opacity-25 select-none pointer-events-none w-full max-w-lg">
                  {[
                    { code: 'EXP-001', name: 'YOLOv8n Train', status: 'Running', progress: 45, statusVariant: 'success' as const },
                    { code: 'EXP-002', name: 'YOLOv8s Baseline', status: 'Finished', progress: 100, statusVariant: 'muted' as const },
                  ].map((exp) => (
                    <Card key={exp.code} className="p-5">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] font-bold text-violet-400 font-mono tracking-wide">{exp.code}</span>
                        <Badge variant={exp.statusVariant}>{exp.status}</Badge>
                      </div>
                      <p className="text-sm font-semibold text-zinc-200 mb-1">{exp.name}</p>
                      <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-4">
                        <div className="bg-violet-500 h-full rounded-full" style={{ width: `${exp.progress}%` }} />
                      </div>
                    </Card>
                  ))}
                </div>
              }
            />
          )}

          {/* Evaluations placeholder */}
          {activeTab === 'evaluations' && (
            <ComingSoonPlaceholder
              icon={LineChart}
              color="emerald"
              title={t('project_coming_soon')}
              hint={t('project_coming_soon_hint')}
              previewSlot={
                <div className="w-full max-w-lg mt-10 opacity-25 select-none pointer-events-none">
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <span className="text-sm font-semibold text-zinc-300">Model Performance</span>
                      <Badge variant="info">mAP50-95</Badge>
                    </div>
                    <div className="h-32 flex items-end justify-between gap-2">
                      {[30, 45, 60, 50, 85, 92].map((h, i) => (
                        <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, backgroundColor: i >= 4 ? '#10b981' : '#27272a' }} />
                      ))}
                    </div>
                  </Card>
                </div>
              }
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-zinc-800 rounded-xl">
      <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
        <Icon className="w-6 h-6 text-zinc-600" strokeWidth={2} />
      </div>
      <p className="text-base font-medium text-zinc-300">{title}</p>
      <p className="text-sm text-zinc-600 mt-2 leading-relaxed">{hint}</p>
    </div>
  );
}

function ComingSoonPlaceholder({
  icon: Icon,
  color,
  title,
  hint,
  previewSlot,
}: {
  icon: React.ElementType;
  color: 'violet' | 'emerald';
  title: string;
  hint: string;
  previewSlot?: React.ReactNode;
}) {
  const cls = color === 'violet'
    ? 'bg-violet-500/8 border-violet-500/20 text-violet-400'
    : 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400';

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className={`w-14 h-14 rounded-xl border flex items-center justify-center mb-5 ${cls}`}>
        <Icon className="w-6 h-6" strokeWidth={2} />
      </div>
      <p className="text-base font-semibold text-zinc-200">{title}</p>
      <p className="text-sm text-zinc-500 mt-2 max-w-xs leading-relaxed">{hint}</p>
      {previewSlot}
    </div>
  );
}
