import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart, Plus, Trash2, Loader2, AlertCircle, Calendar,
  Clock, Server as ServerIcon, ChevronDown, ChevronUp, CheckCircle2,
} from 'lucide-react';
import {
  api,
  type Evaluation, type EvaluationStatus, type EvaluationDatasetResult,
  type DatasetVersion, type Server, type MLModel, type Checkpoint,
} from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { formatDate } from '../../lib/utils';
import { useLang } from '../../contexts/LangContext';

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<EvaluationStatus, 'muted' | 'info' | 'default' | 'success' | 'warning'> = {
  PENDING:   'muted',
  RUNNING:   'default',
  COMPLETED: 'success',
  FAILED:    'warning',
};

const selectCls =
  'w-full px-3 py-2.5 rounded-lg text-sm text-zinc-100 ' +
  'bg-zinc-900/60 border border-zinc-800 outline-none ' +
  'hover:border-zinc-700 focus:border-violet-500/50 ' +
  'focus:ring-2 focus:ring-violet-500/10 transition-all duration-150';

// ── Metric display helpers ────────────────────────────────────────────────────

const METRIC_DISPLAY: Record<string, string> = {
  mAP50:          'mAP@50',
  'mAP50-95':     'mAP@50-95',
  precision:      'Precision',
  recall:         'Recall',
  num_images:     'Images',
  num_annotations:'Annotations',
};

function fmtMetric(key: string, val: number): string {
  if (key === 'num_images' || key === 'num_annotations') return String(Math.round(val));
  return (val * 100).toFixed(1) + '%';
}

// ── Create Evaluation Modal ───────────────────────────────────────────────────

function CreateEvaluationModal({
  projectId,
  onCreated,
}: {
  projectId: number;
  onCreated: (ev: Evaluation) => void;
}) {
  const { t } = useLang();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [dvList, setDvList]           = useState<DatasetVersion[]>([]);
  const [servers, setServers]         = useState<Server[]>([]);
  const [mlModels, setMlModels]       = useState<MLModel[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);

  const [name, setName]             = useState('');
  const [desc, setDesc]             = useState('');
  const [modelId, setModelId]       = useState('');
  const [checkpointId, setCheckpointId] = useState('');
  const [serverId, setServerId]     = useState('');
  const [selectedDvIds, setSelectedDvIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    api.datasetVersions.list(projectId).then(setDvList).catch(() => {});
    api.servers.list().then(setServers).catch(() => {});
    api.checkpoints.list(projectId).then(setCheckpoints).catch(() => {});
    api.mlModels.list(projectId).then((models) => {
      setMlModels(models);
      if (models.length > 0 && !modelId) {
        setModelId(String(models[0].id));
      }
    }).catch(() => {});
  }, [open, projectId]);

  const filteredCheckpoints = checkpoints.filter(
    (c) => !modelId || c.ml_model_id === parseInt(modelId) || c.source === 'pretrained',
  );

  const toggleDv = (id: string) =>
    setSelectedDvIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const resetForm = () => {
    setName(''); setDesc(''); setModelId(''); setCheckpointId('');
    setServerId(''); setSelectedDvIds(new Set()); setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!modelId)      { setError(t('eval_val_model'));      return; }
    if (!checkpointId) { setError(t('eval_val_checkpoint')); return; }
    if (selectedDvIds.size === 0) { setError(t('eval_val_datasets')); return; }

    setLoading(true);
    try {
      const result = await api.evaluations.create({
        project_id:          projectId,
        name:                name.trim(),
        description:         desc.trim() || undefined,
        ml_model_id:         parseInt(modelId),
        checkpoint_id:       parseInt(checkpointId),
        server_id:           serverId,
        dataset_version_ids: Array.from(selectedDvIds).map(Number),
      });
      onCreated(result);
      setOpen(false);
      resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setOpen(true)}>
        {t('eval_create')}
      </Button>

      <Modal
        open={open}
        onClose={() => { setOpen(false); resetForm(); }}
        title={t('eval_create_title')}
        className="max-w-xl"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-h-[72vh] overflow-y-auto pr-1">

          <Input
            id="eval-name"
            label={t('eval_name')}
            placeholder="Eval run 01"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            id="eval-desc"
            label={t('eval_desc')}
            placeholder="Mục tiêu đánh giá..."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />

          {/* Model */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
              {t('eval_model')}
            </label>
            {mlModels.length === 0 ? (
              <p className="text-xs text-zinc-600 italic px-1">{t('eval_no_models')}</p>
            ) : (
              <select
                className={selectCls}
                value={modelId}
                onChange={(e) => { setModelId(e.target.value); setCheckpointId(''); }}
                required
              >
                <option value="">Chọn model...</option>
                {mlModels.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.name}{m.trainer ? ` (${m.trainer.name})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Checkpoint */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
              {t('eval_checkpoint')}
            </label>
            {filteredCheckpoints.length === 0 ? (
              <p className="text-xs text-zinc-600 italic px-1">{t('eval_no_checkpoints')}</p>
            ) : (
              <select
                className={selectCls}
                value={checkpointId}
                onChange={(e) => setCheckpointId(e.target.value)}
                required
              >
                <option value="">Chọn checkpoint...</option>
                {filteredCheckpoints.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    [{c.source === 'pretrained' ? 'Pretrained' : 'Experiment'}] {c.name}
                    {c.metrics && Object.keys(c.metrics).length > 0
                      ? ` (${Object.entries(c.metrics).slice(0, 2).map(([k, v]) => `${k}=${v}`).join(', ')})`
                      : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Server */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
              {t('eval_server')}
            </label>
            {servers.length > 0 ? (
              <select
                className={selectCls}
                value={serverId}
                onChange={(e) => setServerId(e.target.value)}
                required
              >
                <option value="">Chọn server...</option>
                {servers.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name} — {s.status}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="eval-server"
                placeholder="gpu-node-01"
                value={serverId}
                onChange={(e) => setServerId(e.target.value)}
                required
              />
            )}
          </div>

          {/* Dataset versions — multi-select checkboxes */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
              {t('eval_datasets')}
            </label>
            {dvList.length === 0 ? (
              <p className="text-xs text-zinc-600 italic">{t('eval_no_datasets')}</p>
            ) : (
              <div className="flex flex-col gap-1 max-h-44 overflow-y-auto border border-zinc-800 rounded-lg p-2">
                {dvList.map((dv) => {
                  const id = String(dv.id);
                  const checked = selectedDvIds.has(id);
                  return (
                    <label
                      key={dv.id}
                      className={`flex items-center gap-3 px-2.5 py-2 rounded-md cursor-pointer transition-colors ${
                        checked ? 'bg-violet-500/10 text-violet-200' : 'hover:bg-zinc-800/60 text-zinc-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-violet-500"
                        checked={checked}
                        onChange={() => toggleDv(id)}
                      />
                      <span className="text-sm">
                        {dv.name} <span className="text-zinc-600">v{dv.version}</span>
                      </span>
                      {dv.label_type === 'human' ? (
                        <Badge variant="success" className="ml-auto text-[10px]">labeled</Badge>
                      ) : (
                        <Badge variant="muted" className="ml-auto text-[10px]">unlabeled</Badge>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
            {selectedDvIds.size > 0 && (
              <p className="text-xs text-zinc-600">{selectedDvIds.size} dataset version(s) selected</p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-zinc-800/60">
            <Button type="button" variant="ghost" onClick={() => { setOpen(false); resetForm(); }}>
              {t('cancel')}
            </Button>
            <Button type="submit" loading={loading} icon={<LineChart className="w-3.5 h-3.5" />}>
              {t('eval_create')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function DetailModal({
  evaluationId,
  open,
  onClose,
}: {
  evaluationId: number;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLang();
  const [ev, setEv]       = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEv(null);
    setLoading(true);
    api.evaluations.get(evaluationId).then(setEv).finally(() => setLoading(false));
  }, [open, evaluationId]);

  const metricKeys = ev?.overall_metrics
    ? Object.keys(ev.overall_metrics).filter((k) => k !== 'num_images' && k !== 'num_annotations')
    : [];

  return (
    <Modal open={open} onClose={onClose} title={ev?.name ?? '…'} className="max-w-3xl">
      {loading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-violet-500/50" />
        </div>
      )}

      {ev && (
        <div className="flex flex-col gap-6 max-h-[70vh] overflow-y-auto pr-1">

          {/* Meta */}
          <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
            {([
              ['Status',     ev.status],
              ['Model ID',   ev.ml_model_id],
              ['Checkpoint', ev.checkpoint_id],
              ['Server',     ev.server_id],
            ] as [string, string | number][]).map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-0.5">{k}</p>
                <p className="text-zinc-200 font-medium">{String(v)}</p>
              </div>
            ))}
          </div>

          {ev.description && (
            <p className="text-sm text-zinc-500 leading-relaxed">{ev.description}</p>
          )}

          {/* Overall metrics */}
          {ev.overall_metrics && Object.keys(ev.overall_metrics).length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
                {t('eval_overall')}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {metricKeys.map((k) => (
                  <div key={k} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                    <p className="text-sm font-semibold text-zinc-100">
                      {fmtMetric(k, ev.overall_metrics![k])}
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">{METRIC_DISPLAY[k] ?? k}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-dataset results */}
          {ev.dataset_results && ev.dataset_results.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
                {t('eval_per_dataset')}
              </p>
              <div className="overflow-hidden rounded-lg border border-zinc-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/60">
                      <th className="text-left px-3 py-2.5 text-zinc-500 font-medium">Dataset</th>
                      {metricKeys.map((k) => (
                        <th key={k} className="text-right px-3 py-2.5 text-zinc-500 font-medium">
                          {METRIC_DISPLAY[k] ?? k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ev.dataset_results.map((row: EvaluationDatasetResult) => (
                      <tr key={row.dataset_version_id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/40">
                        <td className="px-3 py-2.5 text-zinc-300">
                          <span className="font-medium">{row.name}</span>
                          <span className="text-zinc-600 ml-1.5 font-mono">#{row.dataset_version_id}</span>
                        </td>
                        {metricKeys.map((k) => (
                          <td key={k} className="px-3 py-2.5 text-right font-mono text-zinc-300">
                            {row.metrics[k] !== undefined ? fmtMetric(k, row.metrics[k]) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Image/annotation counts sidebar */}
              <div className="grid grid-cols-2 gap-2 mt-1">
                {ev.dataset_results.map((row: EvaluationDatasetResult) => (
                  <div key={row.dataset_version_id} className="bg-zinc-900/40 border border-zinc-800/60 rounded-lg px-3 py-2 text-xs text-zinc-500">
                    <span className="text-zinc-400 font-medium">{row.name}</span>
                    {row.metrics.num_images !== undefined && (
                      <span className="ml-2">{Math.round(row.metrics.num_images)} images</span>
                    )}
                    {row.metrics.num_annotations !== undefined && (
                      <span className="ml-2">{Math.round(row.metrics.num_annotations)} annotations</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {ev.error_message && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">{t('eval_error_msg')}</p>
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-xs text-amber-400 font-mono leading-relaxed whitespace-pre-wrap">
                {ev.error_message}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">{t('eval_timeline')}</p>
            <div className="grid grid-cols-3 gap-3 text-xs text-zinc-500">
              <div><span className="text-zinc-600">Created: </span>{formatDate(ev.created_at)}</div>
              <div><span className="text-zinc-600">Started: </span>{ev.started_at ? formatDate(ev.started_at) : '—'}</div>
              <div><span className="text-zinc-600">Finished: </span>{ev.finished_at ? formatDate(ev.finished_at) : '—'}</div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Evaluation Card ───────────────────────────────────────────────────────────

function EvaluationCard({
  ev,
  onDeleted,
  onDetail,
}: {
  ev: Evaluation;
  onDeleted: (id: number) => void;
  onDetail: (id: number) => void;
}) {
  const { t } = useLang();
  const [deleting, setDeleting]     = useState(false);
  const [showResults, setShowResults] = useState(false);

  const metricKeys = ev.overall_metrics
    ? Object.keys(ev.overall_metrics).filter((k) => k !== 'num_images' && k !== 'num_annotations')
    : [];

  const handleDelete = async () => {
    if (!confirm(t('eval_delete_confirm'))) return;
    setDeleting(true);
    try {
      await api.evaluations.delete(ev.id);
      onDeleted(ev.id);
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  };

  const iconBg =
    ev.status === 'RUNNING'   ? 'bg-violet-500/10 border-violet-500/25' :
    ev.status === 'COMPLETED' ? 'bg-emerald-500/10 border-emerald-500/25' :
    ev.status === 'FAILED'    ? 'bg-amber-500/10 border-amber-500/25' :
                                 'bg-zinc-800 border-zinc-700';
  const iconColor =
    ev.status === 'RUNNING'   ? 'text-violet-400' :
    ev.status === 'COMPLETED' ? 'text-emerald-400' :
    ev.status === 'FAILED'    ? 'text-amber-400' :
                                 'text-zinc-500';

  return (
    <Card className="p-6 flex items-start gap-5 hover:border-zinc-700/60 transition-colors duration-150">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${iconBg}`}>
        {ev.status === 'COMPLETED'
          ? <CheckCircle2 className={`w-4.5 h-4.5 ${iconColor}`} strokeWidth={2} />
          : <LineChart    className={`w-4.5 h-4.5 ${iconColor}`} strokeWidth={2} />
        }
      </div>

      <div className="flex-1 min-w-0 space-y-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-sm font-semibold text-zinc-100">{ev.name}</span>
          <Badge variant={STATUS_BADGE[ev.status]}>{ev.status}</Badge>
          <Badge variant="muted">model #{ev.ml_model_id}</Badge>
          <Badge variant="muted">ckpt #{ev.checkpoint_id}</Badge>
        </div>

        {ev.description && (
          <p className="text-xs text-zinc-500 leading-relaxed line-clamp-1">{ev.description}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-zinc-600">
          <span className="flex items-center gap-1">
            <ServerIcon className="w-3 h-3" /> {ev.server_id}
          </span>
        </div>

        {/* Overall metric pills */}
        {ev.overall_metrics && metricKeys.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            {metricKeys.map((k) => (
              <Badge key={k} variant="success">
                {METRIC_DISPLAY[k] ?? k}: {fmtMetric(k, ev.overall_metrics![k])}
              </Badge>
            ))}
          </div>
        )}

        {/* Expandable per-dataset */}
        {ev.dataset_results && ev.dataset_results.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowResults((p) => !p)}
              className="flex items-center gap-1 text-xs text-zinc-700 hover:text-zinc-400 transition-colors"
            >
              {showResults ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {ev.dataset_results.length} dataset(s)
            </button>
            {showResults && (
              <div className="overflow-hidden rounded-lg border border-zinc-800/80 mt-1">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/60">
                      <th className="text-left px-3 py-1.5 text-zinc-600 font-medium">Dataset</th>
                      {metricKeys.map((k) => (
                        <th key={k} className="text-right px-3 py-1.5 text-zinc-600 font-medium">
                          {METRIC_DISPLAY[k] ?? k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ev.dataset_results.map((row: EvaluationDatasetResult) => (
                      <tr key={row.dataset_version_id} className="border-b border-zinc-800/40 last:border-0">
                        <td className="px-3 py-1.5 text-zinc-400">{row.name}</td>
                        {metricKeys.map((k) => (
                          <td key={k} className="px-3 py-1.5 text-right font-mono text-zinc-400">
                            {row.metrics[k] !== undefined ? fmtMetric(k, row.metrics[k]) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {ev.error_message && (
          <p className="text-xs text-amber-500/80 font-mono line-clamp-1">{ev.error_message}</p>
        )}

        <p className="text-xs text-zinc-600 flex items-center gap-1.5 pt-0.5">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          {formatDate(ev.created_at)}
          {ev.finished_at && (
            <span className="flex items-center gap-1 ml-2">
              <Clock className="w-3 h-3" /> finished {formatDate(ev.finished_at)}
            </span>
          )}
        </p>
      </div>

      <div className="shrink-0 flex items-center gap-2 pt-0.5">
        <Button variant="ghost" size="sm" onClick={() => onDetail(ev.id)}>
          {t('eval_detail')}
        </Button>
        <Button
          variant="danger"
          size="sm"
          icon={deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          onClick={handleDelete}
          disabled={deleting || ev.status === 'RUNNING'}
        >
          {t('delete')}
        </Button>
      </div>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function EvaluationPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const { t } = useLang();

  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [detailId, setDetailId]       = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api.evaluations.list(projectId)
      .then(setEvaluations)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleCreated = (ev: Evaluation) => setEvaluations((prev) => [ev, ...prev]);
  const handleDeleted = (id: number)      => setEvaluations((prev) => prev.filter((e) => e.id !== id));

  return (
    <div className="flex flex-col gap-12">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">{t('eval_title')}</h1>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">{t('eval_subtitle')}</p>
        </div>
        <div className="shrink-0 pt-1">
          <CreateEvaluationModal projectId={projectId} onCreated={handleCreated} />
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-28 gap-3 text-zinc-600">
          <Loader2 className="w-6 h-6 animate-spin text-violet-500/50" />
          <span className="text-sm">{t('loading')}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-5 bg-red-500/8 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {t('projects_api_error')}: {error}
        </div>
      )}

      {!loading && !error && evaluations.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-zinc-800 rounded-xl"
        >
          <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
            <LineChart className="w-6 h-6 text-zinc-600" />
          </div>
          <p className="text-base font-medium text-zinc-300">{t('eval_empty')}</p>
          <p className="text-sm text-zinc-600 mt-2 leading-relaxed">{t('eval_empty_hint')}</p>
        </motion.div>
      )}

      {!loading && evaluations.length > 0 && (
        <div className="flex flex-col gap-4">
          <AnimatePresence>
            {evaluations.map((ev, i) => (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18, delay: i * 0.04 }}
              >
                <EvaluationCard
                  ev={ev}
                  onDeleted={handleDeleted}
                  onDetail={setDetailId}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {detailId !== null && (
        <DetailModal
          evaluationId={detailId}
          open={detailId !== null}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}
