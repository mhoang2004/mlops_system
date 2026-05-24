import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Database, Tag, Calendar, Trash2,
  Loader2, AlertCircle, FolderOpen, CheckCircle2, Clock,
  Cpu, BarChart3, FlaskConical, LineChart, Plus, Upload
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
    if (!name.trim() || files.length === 0) {
      setError(t('error_checkpoint_fields'));
      return;
    }
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
      <Button icon={<Plus className="w-4 h-4" />} onClick={() => setOpen(true)}>
        {t('ckpt_upload')}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('ckpt_upload_title')}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <Input
            id="ckpt-name"
            label={t('ckpt_name')}
            placeholder="VD: yolov8n_pretrained"
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
            <Button type="submit" loading={loading} icon={<Upload className="w-4 h-4" />}>
              {t('upload')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

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

  // Tabs state
  const [activeTab, setActiveTab] = useState<TabType>('datasets');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.projects.get(projectId),
      api.datasetVersions.list(projectId),
      api.checkpoints.list(projectId),
    ])
      .then(([proj, dvs, ckpts]) => {
        setProject(proj);
        setVersions(dvs);
        setCheckpoints(ckpts);
      })
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
    } catch (e) {
      alert(t('delete_failed'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleCheckpointDelete = async (ckptId: number) => {
    if (!confirm(t('ckpt_delete_confirm'))) return;
    setDeletingCkptId(ckptId);
    try {
      await api.checkpoints.delete(ckptId);
      setCheckpoints((prev) => prev.filter((c) => c.id !== ckptId));
    } catch (e) {
      alert(t('delete_failed'));
    } finally {
      setDeletingCkptId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-slate-500 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="text-sm font-medium">{t('loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-5 bg-red-500/10 border border-red-500/25 rounded-2xl text-red-400 text-sm shadow-lg shadow-red-500/5">
        <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 py-10">
      {/* Back button & Header */}
      <div>
        <button
          onClick={() => navigate('/')}
          className="group flex items-center gap-2.5 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-8 font-semibold"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-200" /> {t('project_back')}
        </button>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-slate-900/20 p-8 md:p-10 rounded-3xl border border-slate-800/40 backdrop-blur-sm shadow-md">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-extrabold text-white tracking-tight truncate">{project?.name}</h1>
            <p className="text-slate-400 text-sm mt-3.5 flex items-center gap-2 font-medium">
              <Calendar className="w-4 h-4 text-slate-500" />
              {t('projects_created_at')} {project && formatDate(project.created_at)}
            </p>
            {project?.labels && project.labels.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-5">
                {project.labels.map((l, i) => (
                  <Badge key={i} variant="info" className="px-3 py-1 text-xs">
                    <Tag className="w-3.5 h-3.5 mr-1.5" />
                    {l.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 mt-2 md:mt-0">
            {activeTab === 'datasets' && (
              <CreateDatasetVersionModal projectId={projectId} onCreated={handleDatasetCreated} />
            )}
            {activeTab === 'checkpoints' && (
              <ProjectUploadCheckpointModal projectId={projectId} onCreated={handleCheckpointCreated} />
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: t('project_stat_total_versions'), value: versions.length, icon: Database },
          { label: t('project_stat_labeled'), value: versions.filter((v) => v.label_type === 'human').length, icon: CheckCircle2 },
          { label: t('project_stat_unlabeled'), value: versions.filter((v) => v.label_type === 'unlabeled').length, icon: Clock },
          { label: t('project_stat_checkpoints'), value: checkpoints.length, icon: Cpu },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-slate-800/35 border border-slate-700/40 rounded-2xl p-6 md:p-7 flex items-center gap-5 hover:border-slate-700/80 transition-all duration-200 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center shrink-0 shadow-inner">
              <Icon className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-slate-800/80 p-1.5 bg-slate-900/40 rounded-2xl max-w-fit gap-3">
        {([
          { id: 'datasets', label: t('project_tab_datasets'), icon: Database },
          { id: 'checkpoints', label: t('project_tab_checkpoints'), icon: Cpu },
          { id: 'experiments', label: t('project_tab_experiments'), icon: FlaskConical },
          { id: 'evaluations', label: t('project_tab_evaluations'), icon: LineChart },
        ] as const).map(({ id: tabId, label, icon: Icon }) => {
          const active = activeTab === tabId;
          return (
            <button
              key={tabId}
              onClick={() => setActiveTab(tabId)}
              className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-250 cursor-pointer ${
                active
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="min-h-[300px]">
        {/* Datasets Tab Panel */}
        {activeTab === 'datasets' && (
          versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center bg-slate-900/10 rounded-3xl border border-dashed border-slate-800 p-12">
              <div className="w-20 h-20 rounded-3xl bg-slate-800 border border-slate-700/60 flex items-center justify-center mb-6 shadow-xl shadow-slate-950/20">
                <FolderOpen className="w-8 h-8 text-slate-500" />
              </div>
              <p className="text-slate-200 font-semibold text-lg">{t('dv_empty')}</p>
              <p className="text-slate-500 text-sm mt-2 max-w-sm">{t('dv_empty_hint')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {versions.map((dv) => (
                <Card key={dv.id} className="flex flex-col md:flex-row items-start md:items-center gap-8 shadow-sm hover:shadow-indigo-500/5">
                  <div className="w-14 h-14 rounded-xl bg-slate-800/90 border border-slate-700/50 flex items-center justify-center shrink-0">
                    <Database className="w-7 h-7 text-slate-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-4">
                      <span className="text-lg font-extrabold text-white truncate">{dv.name}</span>
                      <Badge variant="muted" className="px-2.5 py-1 text-xs font-semibold">{dv.version}</Badge>
                      <Badge variant={dv.label_type === 'human' ? 'success' : 'warning'} className="px-2.5 py-1 text-xs font-semibold">
                        {dv.label_type === 'human' ? t('dv_labeled') : t('dv_unlabeled')}
                      </Badge>
                    </div>
                    {dv.description && (
                      <p className="text-sm text-slate-400 mb-3 leading-relaxed">{dv.description}</p>
                    )}
                    <p className="text-xs text-slate-500 font-mono truncate bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-800/80 max-w-fit">{dv.storage_path}</p>
                    <p className="text-xs text-slate-500 mt-5 flex items-center gap-1.5 font-semibold">
                      <Calendar className="w-4 h-4 text-slate-600" />
                      {formatDate(dv.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 w-full md:w-auto justify-end mt-4 md:mt-0 border-t border-slate-800/50 md:border-t-0 pt-4 md:pt-0">
                    <UploadLabelsModal datasetVersion={dv} onUploaded={handleLabelsUploaded} />
                    <Button
                      size="md"
                      variant="danger"
                      className="px-4 py-2.5"
                      icon={deletingId === dv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      onClick={() => handleDatasetDelete(dv.id)}
                      disabled={deletingId === dv.id}
                    >
                      {t('delete')}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}

        {/* Checkpoints Tab Panel */}
        {activeTab === 'checkpoints' && (
          checkpoints.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center bg-slate-900/10 rounded-3xl border border-dashed border-slate-800 p-12">
              <div className="w-20 h-20 rounded-3xl bg-slate-800 border border-slate-700/60 flex items-center justify-center mb-6 shadow-xl shadow-slate-950/20">
                <Cpu className="w-8 h-8 text-slate-500" />
              </div>
              <p className="text-slate-200 font-semibold text-lg">{t('ckpt_empty')}</p>
              <p className="text-slate-500 text-sm mt-2 max-w-sm">{t('ckpt_empty_hint')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {checkpoints.map((ck) => (
                <Card key={ck.id} className="flex flex-col md:flex-row items-start md:items-center gap-8 shadow-sm hover:shadow-indigo-500/5">
                  <div className="w-14 h-14 rounded-xl bg-slate-800/90 border border-slate-700/50 flex items-center justify-center shrink-0">
                    <Cpu className="w-7 h-7 text-indigo-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-4">
                      <span className="text-lg font-extrabold text-white truncate">{ck.name}</span>
                      <Badge variant={ck.source === 'pretrained' ? 'info' : 'success'} className="px-2.5 py-1 text-xs font-semibold">
                        {ck.source === 'pretrained' ? t('ckpt_pretrained') : t('ckpt_experiment')}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 font-mono truncate bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-800/80 max-w-fit">{ck.file_path}</p>
                    {ck.metrics && Object.keys(ck.metrics).length > 0 && (
                      <div className="flex items-center gap-2 mt-4 flex-wrap">
                        <BarChart3 className="w-4 h-4 text-slate-500 shrink-0 mr-1" />
                        {Object.entries(ck.metrics).map(([k, v]) => (
                          <Badge key={k} variant="muted" className="px-2.5 py-1 text-xs font-semibold">
                            {k}: {String(v)}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-slate-500 mt-5 flex items-center gap-1.5 font-semibold">
                      <Calendar className="w-4 h-4 text-slate-600" />
                      {formatDate(ck.created_at)}
                    </p>
                  </div>

                  <div className="w-full md:w-auto flex justify-end mt-4 md:mt-0 border-t border-slate-800/50 md:border-t-0 pt-4 md:pt-0">
                    <Button
                      size="md"
                      variant="danger"
                      className="px-4 py-2.5"
                      icon={deletingCkptId === ck.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      onClick={() => handleCheckpointDelete(ck.id)}
                      disabled={deletingCkptId === ck.id}
                    >
                      {t('delete')}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}

        {/* Experiments Tab Panel (Placeholder) */}
        {activeTab === 'experiments' && (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-slate-900/20 rounded-3xl border border-slate-800/60 p-12 shadow-inner">
            <div className="w-24 h-24 rounded-3xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/5 animate-pulse">
              <FlaskConical className="w-10 h-10 text-indigo-400" />
            </div>
            <h3 className="text-xl font-extrabold text-white">{t('project_coming_soon')}</h3>
            <p className="text-slate-500 text-sm mt-3 max-w-sm leading-relaxed">{t('project_coming_soon_hint')}</p>

            {/* Simulated experiments view */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-12 w-full max-w-3xl text-left opacity-35 select-none pointer-events-none">
              <Card className="border-slate-800 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider font-mono">EXP-001</span>
                  <Badge variant="success" className="px-2.5 py-1 text-xs">Running</Badge>
                </div>
                <h4 className="text-base font-extrabold text-slate-300">YOLOv8n Train Session</h4>
                <p className="text-xs text-slate-500 mt-2 font-medium">Epoch 45/100 · loss: 0.043</p>
                <div className="w-full bg-slate-800 h-2 rounded-full mt-5 overflow-hidden">
                  <div className="bg-indigo-500 h-full w-[45%]" />
                </div>
              </Card>

              <Card className="border-slate-800 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">EXP-002</span>
                  <Badge variant="muted" className="px-2.5 py-1 text-xs">Finished</Badge>
                </div>
                <h4 className="text-base font-extrabold text-slate-300">YOLOv8s Baseline</h4>
                <p className="text-xs text-slate-500 mt-2 font-medium">100 epochs · mAP50-95: 0.684</p>
                <div className="w-full bg-slate-800 h-2 rounded-full mt-5 overflow-hidden">
                  <div className="bg-emerald-500 h-full w-full" />
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Evaluations Tab Panel (Placeholder) */}
        {activeTab === 'evaluations' && (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-slate-900/20 rounded-3xl border border-slate-800/60 p-12 shadow-inner">
            <div className="w-24 h-24 rounded-3xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/5 animate-pulse">
              <LineChart className="w-10 h-10 text-emerald-400" />
            </div>
            <h3 className="text-xl font-extrabold text-white">{t('project_coming_soon')}</h3>
            <p className="text-slate-500 text-sm mt-3 max-w-sm leading-relaxed">{t('project_coming_soon_hint')}</p>

            {/* Simulated evaluation metrics view */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 mt-12 w-full max-w-3xl text-left opacity-35 select-none pointer-events-none shadow-lg">
              <div className="flex items-center justify-between mb-5 border-b border-slate-850 pb-4">
                <span className="text-base font-bold text-slate-300">Model Performance Chart</span>
                <Badge variant="info" className="px-2.5 py-1 text-xs">Confusion Matrix</Badge>
              </div>
              <div className="h-56 bg-slate-955 rounded-2xl flex items-end justify-between p-6 gap-3">
                <div className="w-full bg-slate-800 h-[30%] rounded-lg" />
                <div className="w-full bg-slate-800 h-[45%] rounded-lg" />
                <div className="w-full bg-indigo-500/40 h-[60%] rounded-lg" />
                <div className="w-full bg-slate-800 h-[50%] rounded-lg" />
                <div className="w-full bg-indigo-500 h-[85%] rounded-lg" />
                <div className="w-full bg-emerald-500 h-[92%] rounded-lg" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
