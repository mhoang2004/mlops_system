import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Plus, Trash2, Loader2, AlertCircle, Calendar,
  XCircle, ChevronDown, ChevronUp, BarChart3, Clock, Server as ServerIcon, ExternalLink,
} from 'lucide-react';
import {
  api,
  type Experiment, type ExperimentDataset, type ExperimentStatus,
  type DatasetVersion, type Server, type MLModel, type Checkpoint,
} from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { TrainParamsForm, defaultsFromSchema } from '../../components/TrainParamsForm';
import { formatDate } from '../../lib/utils';
import { useLang } from '../../contexts/LangContext';

const MLFLOW_URL = (import.meta.env.VITE_MLFLOW_URL as string | undefined) ?? 'http://localhost:5000';

// ── Status helpers ───────────────────────────────────────────────────────────

const STATUS_BADGE: Record<ExperimentStatus, 'muted' | 'info' | 'default' | 'success' | 'warning'> = {
  PENDING:     'muted',
  DOWNLOADING: 'info',
  RUNNING:     'default',
  COMPLETED:   'success',
  FAILED:      'warning',
  CANCELLED:   'muted',
};

const ACTIVE_STATUSES: ExperimentStatus[] = ['PENDING', 'DOWNLOADING', 'RUNNING'];

const selectCls =
  'w-full px-3 py-2.5 rounded-lg text-sm text-zinc-100 ' +
  'bg-zinc-900/60 border border-zinc-800 outline-none ' +
  'hover:border-zinc-700 focus:border-violet-500/50 ' +
  'focus:ring-2 focus:ring-violet-500/10 transition-all duration-150';

// ── Create modal ─────────────────────────────────────────────────────────────

interface DvRow { dvId: string; role: 'TRAIN' | 'VALIDATION' | 'TEST'; weight: string }

function CreateExperimentModal({
  projectId,
  onCreated,
}: {
  projectId: number;
  onCreated: (e: Experiment) => void;
}) {
  const { t } = useLang();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [dvList, setDvList]       = useState<DatasetVersion[]>([]);
  const [servers, setServers]     = useState<Server[]>([]);
  const [mlModels, setMlModels]   = useState<MLModel[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);

  const [name, setName]           = useState('');
  const [desc, setDesc]           = useState('');
  const [modelId, setModelId]     = useState('');
  const [serverId, setServerId]   = useState('');
  const [strategy, setStrategy]   = useState('CONCAT');
  const [ckptId, setCkptId]       = useState('');
  const [trainParams, setTrainParams] = useState<Record<string, unknown>>({});
  const [serverBusy, setServerBusy] = useState<{ id: number; name: string; status: string }[]>([]);
  const [rows, setRows] = useState<DvRow[]>([
    { dvId: '', role: 'TRAIN', weight: '1' },
    { dvId: '', role: 'TEST',  weight: '1' },
  ]);

  useEffect(() => {
    if (!open) return;
    api.datasetVersions.list(projectId).then(setDvList).catch(() => {});
    api.servers.list().then(setServers).catch(() => {});
    api.checkpoints.list(projectId).then(setCheckpoints).catch(() => {});
    api.mlModels.list(projectId).then((models) => {
      setMlModels(models);
      if (models.length > 0 && !modelId) {
        const first = models[0];
        setModelId(String(first.id));
        if (first.trainer?.train_params_schema) {
          setTrainParams(defaultsFromSchema(first.trainer.train_params_schema));
        }
      }
    }).catch(() => {});
  }, [open, projectId]);

  // When model changes, load its trainer schema for the form
  const handleModelChange = (id: string) => {
    setModelId(id);
    const m = mlModels.find((x) => String(x.id) === id);
    if (m?.trainer?.train_params_schema) {
      setTrainParams(defaultsFromSchema(m.trainer.train_params_schema));
    } else {
      setTrainParams({});
    }
  };

  const selectedModel = mlModels.find((m) => String(m.id) === modelId);
  const schema = selectedModel?.trainer?.train_params_schema ?? null;

  const addRow = () => setRows((r) => [...r, { dvId: '', role: 'VALIDATION', weight: '1' }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<DvRow>) =>
    setRows((r) => r.map((row, idx) => {
      if (idx !== i) return row;
      const merged = { ...row, ...patch };
      if (patch.role && patch.role !== 'TRAIN') merged.weight = '1';
      return merged;
    }));

  const filteredCheckpoints = checkpoints.filter(
    (c) => c.source === 'pretrained' || (modelId && c.ml_model_id === parseInt(modelId)),
  );

  const handleServerChange = (id: string) => {
    setServerId(id);
    setServerBusy([]);
    if (!id) return;
    api.experiments.activeOnServer(id).then(setServerBusy).catch(() => {});
  };

  const resetForm = () => {
    setName(''); setDesc(''); setModelId(''); setServerId('');
    setStrategy('CONCAT'); setCkptId(''); setTrainParams({});
    setServerBusy([]);
    setRows([{ dvId: '', role: 'TRAIN', weight: '1' }, { dvId: '', role: 'TEST', weight: '1' }]);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!modelId) { setError('Vui lòng chọn ML model'); return; }
    const hasTrainRole = rows.some((r) => r.role === 'TRAIN' && r.dvId);
    const hasTestRole  = rows.some((r) => r.role === 'TEST'  && r.dvId);
    if (!hasTrainRole || !hasTestRole) { setError(t('exp_val_datasets')); return; }
    if (rows.some((r) => !r.dvId))    { setError(t('exp_val_dv'));        return; }

    setLoading(true);
    try {
      const result = await api.experiments.create({
        project_id:         projectId,
        name:               name.trim(),
        description:        desc.trim() || undefined,
        ml_model_id:        parseInt(modelId),
        server_id:          serverId,
        datasets:           rows.map((r) => ({
          dataset_version_id: parseInt(r.dvId),
          role:               r.role,
          sampling_weight:    parseFloat(r.weight) || 1,
        })),
        sampling_strategy:  strategy,
        pretrained_ckpt_id: ckptId ? parseInt(ckptId) : null,
        train_params:       trainParams,
      });
      // API returns { experiment, warnings } or the experiment directly
      const exp = (result as any).experiment ?? result as Experiment;
      onCreated(exp);
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
        {t('exp_create')}
      </Button>

      <Modal
        open={open}
        onClose={() => { setOpen(false); resetForm(); }}
        title={t('exp_create_title')}
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-h-[72vh] overflow-y-auto pr-1">

          {/* ── Basic info ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="exp-name"
              label={t('exp_name')}
              placeholder="YOLO training run 01"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
                ML Model
              </label>
              {mlModels.length === 0 ? (
                <p className="text-xs text-zinc-600 italic px-1 pt-2">
                  Chưa có model — tạo model trong tab Models trước
                </p>
              ) : (
                <select
                  className={selectCls}
                  value={modelId}
                  onChange={(e) => handleModelChange(e.target.value)}
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
          </div>

          {/* ── Server + Strategy ──────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
                {t('exp_server')}
              </label>
              {servers.length > 0 ? (
                <select
                  className={selectCls}
                  value={serverId}
                  onChange={(e) => handleServerChange(e.target.value)}
                  required
                >
                  <option value="">{t('exp_server_hint')}</option>
                  {servers.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name} — {s.status}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="exp-server"
                  placeholder="gpu-node-01"
                  value={serverId}
                  onChange={(e) => handleServerChange(e.target.value)}
                  required
                />
              )}
              {serverBusy.length > 0 && (
                <div className="flex items-start gap-2 mt-1 p-2.5 bg-amber-500/8 border border-amber-500/25 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-400 leading-relaxed">
                    Server này đang bận:
                    {serverBusy.map((e) => (
                      <span key={e.id} className="block font-medium">
                        · {e.name} <span className="font-normal opacity-70">({e.status})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
                {t('exp_strategy')}
                <span className="ml-2 normal-case text-zinc-700 font-normal tracking-normal">
                  — cách ghép các bộ TRAIN
                </span>
              </label>
              <select className={selectCls} value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                <option value="CONCAT">CONCAT — gộp tuần tự</option>
                <option value="WEIGHTED">WEIGHTED — lấy mẫu theo weight</option>
                <option value="ROUND_ROBIN">ROUND_ROBIN — xoay vòng</option>
              </select>
            </div>
          </div>

          <Input
            id="exp-desc"
            label={t('exp_desc')}
            placeholder="Mô tả mục tiêu của experiment..."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
              {t('exp_pretrained')}
            </label>
            <select
              className={selectCls}
              value={ckptId}
              onChange={(e) => setCkptId(e.target.value)}
            >
              <option value="">— Không dùng pretrained —</option>
              {filteredCheckpoints.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  [{c.source === 'pretrained' ? 'Pretrained' : 'Experiment'}] {c.name}
                  {c.metrics && Object.keys(c.metrics).length > 0
                    ? ` (${Object.entries(c.metrics).slice(0, 2).map(([k, v]) => `${k}=${v}`).join(', ')})`
                    : ''}
                </option>
              ))}
            </select>
          </div>

          {/* ── Datasets ───────────────────────────────────────────── */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
                {t('exp_datasets')}
              </label>
              <button
                type="button"
                onClick={addRow}
                className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                + {t('exp_add_dataset')}
              </button>
            </div>

            {dvList.length === 0 && (
              <p className="text-xs text-zinc-600 italic">{t('exp_no_datasets')}</p>
            )}

            <div className={`grid gap-2 px-0.5 ${strategy === 'WEIGHTED' ? 'grid-cols-[1fr_130px_72px_32px]' : 'grid-cols-[1fr_130px_32px]'}`}>
              <p className="text-[10px] text-zinc-700 uppercase tracking-wider">Dataset version</p>
              <p className="text-[10px] text-zinc-700 uppercase tracking-wider">Role</p>
              {strategy === 'WEIGHTED' && (
                <p className="text-[10px] text-zinc-700 uppercase tracking-wider">Weight</p>
              )}
              <p />
            </div>

            <div className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <div key={i} className={`grid gap-2 items-center ${strategy === 'WEIGHTED' ? 'grid-cols-[1fr_130px_72px_32px]' : 'grid-cols-[1fr_130px_32px]'}`}>
                  <select className={selectCls} value={row.dvId} onChange={(e) => updateRow(i, { dvId: e.target.value })}>
                    <option value="">{t('exp_dv_select')}</option>
                    {dvList.map((dv) => (
                      <option key={dv.id} value={String(dv.id)}>{dv.name} v{dv.version}</option>
                    ))}
                  </select>
                  <select className={selectCls} value={row.role} onChange={(e) => updateRow(i, { role: e.target.value as DvRow['role'] })}>
                    <option value="TRAIN">TRAIN</option>
                    <option value="VALIDATION">VALIDATION</option>
                    <option value="TEST">TEST</option>
                  </select>
                  {strategy === 'WEIGHTED' && (
                    row.role === 'TRAIN' ? (
                      <input
                        type="number" min="1" step="1"
                        value={row.weight}
                        onChange={(e) => updateRow(i, { weight: e.target.value })}
                        className={`${selectCls} text-center px-2`}
                      />
                    ) : (
                      <div className="flex items-center justify-center text-sm text-zinc-700 select-none">—</div>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={rows.length <= 2}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/8 transition-all disabled:opacity-25"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Training params (dynamic form) ─────────────────────── */}
          {schema && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest shrink-0">
                  {t('exp_train_params')}
                </p>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>
              <TrainParamsForm schema={schema} values={trainParams} onChange={setTrainParams} />
            </div>
          )}

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
            <Button type="submit" loading={loading} icon={<FlaskConical className="w-3.5 h-3.5" />}>
              {t('exp_create')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Detail modal ─────────────────────────────────────────────────────────────

function DetailModal({
  experimentId,
  open,
  onClose,
}: {
  experimentId: number;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLang();
  const [exp, setExp] = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setExp(null);
    setLoading(true);
    api.experiments.get(experimentId)
      .then(setExp)
      .finally(() => setLoading(false));
  }, [open, experimentId]);

  return (
    <Modal open={open} onClose={onClose} title={exp?.name ?? '…'} className="max-w-2xl">
      {loading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-violet-500/50" />
        </div>
      )}

      {exp && (
        <div className="flex flex-col gap-6 max-h-[70vh] overflow-y-auto pr-1">

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {([
              ['Model ID',      exp.ml_model_id],
              ['Server',        exp.server_id],
              ['Strategy',      exp.sampling_strategy],
              ['Status',        exp.status],
              ['Pretrained ckpt', exp.pretrained_ckpt_id ?? '—'],
              ['Output ckpt',   exp.output_ckpt_id ?? '—'],
            ] as [string, string | number][]).map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-0.5">{k}</p>
                <p className="text-zinc-200 font-medium">{String(v)}</p>
              </div>
            ))}
          </div>

          {exp.description && (
            <p className="text-sm text-zinc-500 leading-relaxed">{exp.description}</p>
          )}

          {exp.datasets && exp.datasets.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
                {t('exp_datasets_used')}
              </p>
              <div className="overflow-hidden rounded-lg border border-zinc-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/60">
                      <th className="text-left px-3 py-2 text-zinc-500 font-medium">Dataset version</th>
                      <th className="text-left px-3 py-2 text-zinc-500 font-medium">Role</th>
                      <th className="text-right px-3 py-2 text-zinc-500 font-medium">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exp.datasets.map((d: ExperimentDataset) => (
                      <tr key={d.id} className="border-b border-zinc-800/50 last:border-0">
                        <td className="px-3 py-2 text-zinc-300 font-mono">#{d.dataset_version_id}</td>
                        <td className="px-3 py-2">
                          <Badge variant={d.role === 'TRAIN' ? 'default' : d.role === 'TEST' ? 'warning' : 'info'}>
                            {d.role}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-400">{d.sampling_weight}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {exp.metrics && Object.keys(exp.metrics).length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
                {t('exp_metrics')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(exp.metrics).map(([k, v]) => (
                  <div key={k} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                    <p className="text-sm font-semibold text-zinc-100">{String(v)}</p>
                    <p className="text-xs text-zinc-600 mt-0.5">{k}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {exp.error_message && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
                {t('exp_error_msg')}
              </p>
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-xs text-amber-400 font-mono leading-relaxed whitespace-pre-wrap">
                {exp.error_message}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
              {t('exp_train_params')}
            </p>
            <pre className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg text-xs text-zinc-400 overflow-x-auto">
              {JSON.stringify(exp.train_params, null, 2)}
            </pre>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
              {t('exp_timeline')}
            </p>
            <div className="grid grid-cols-3 gap-3 text-xs text-zinc-500">
              <div><span className="text-zinc-600">Created: </span>{formatDate(exp.created_at)}</div>
              <div><span className="text-zinc-600">Started: </span>{exp.started_at ? formatDate(exp.started_at) : '—'}</div>
              <div><span className="text-zinc-600">Finished: </span>{exp.finished_at ? formatDate(exp.finished_at) : '—'}</div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Experiment card ──────────────────────────────────────────────────────────

function ExperimentCard({
  exp,
  onCancelled,
  onDeleted,
  onDetail,
}: {
  exp: Experiment;
  onCancelled: (id: number) => void;
  onDeleted: (id: number) => void;
  onDetail: (id: number) => void;
}) {
  const { t } = useLang();
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [showParams, setShowParams] = useState(false);
  const isActive = ACTIVE_STATUSES.includes(exp.status);

  const handleCancel = async () => {
    if (!confirm(t('exp_cancel_confirm'))) return;
    setCancelling(true);
    try {
      await api.experiments.cancel(exp.id);
      onCancelled(exp.id);
    } catch { /* ignore */ }
    finally { setCancelling(false); }
  };

  const handleDelete = async () => {
    if (!confirm(t('exp_delete_confirm'))) return;
    setDeleting(true);
    try {
      await api.experiments.delete(exp.id);
      onDeleted(exp.id);
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  };

  const iconBg =
    exp.status === 'RUNNING'   ? 'bg-violet-500/10 border-violet-500/25' :
    exp.status === 'COMPLETED' ? 'bg-emerald-500/10 border-emerald-500/25' :
    exp.status === 'FAILED'    ? 'bg-amber-500/10 border-amber-500/25' :
                                  'bg-zinc-800 border-zinc-700';

  const iconColor =
    exp.status === 'RUNNING'   ? 'text-violet-400' :
    exp.status === 'COMPLETED' ? 'text-emerald-400' :
    exp.status === 'FAILED'    ? 'text-amber-400' :
                                  'text-zinc-500';

  return (
    <Card className="p-6 flex items-start gap-5 hover:border-zinc-700/60 transition-colors duration-150">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${iconBg}`}>
        <FlaskConical className={`w-4.5 h-4.5 ${iconColor}`} strokeWidth={2} />
      </div>

      <div className="flex-1 min-w-0 space-y-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-sm font-semibold text-zinc-100">{exp.name}</span>
          <Badge variant={STATUS_BADGE[exp.status]}>{exp.status}</Badge>
          <Badge variant="muted">model #{exp.ml_model_id}</Badge>
        </div>

        {exp.description && (
          <p className="text-xs text-zinc-500 leading-relaxed line-clamp-1">{exp.description}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-zinc-600 flex-wrap">
          <span className="flex items-center gap-1">
            <ServerIcon className="w-3 h-3" /> {exp.server_id}
          </span>
          <span className="flex items-center gap-1">
            <BarChart3 className="w-3 h-3" /> {exp.sampling_strategy}
          </span>
        </div>

        {exp.metrics && Object.keys(exp.metrics).length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            {Object.entries(exp.metrics).slice(0, 4).map(([k, v]) => (
              <Badge key={k} variant="success">{k}: {String(v)}</Badge>
            ))}
          </div>
        )}

        {exp.error_message && (
          <p className="text-xs text-amber-500/80 font-mono line-clamp-1">{exp.error_message}</p>
        )}

        <button
          type="button"
          onClick={() => setShowParams((p) => !p)}
          className="flex items-center gap-1 text-xs text-zinc-700 hover:text-zinc-400 transition-colors"
        >
          {showParams ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          train_params
        </button>
        {showParams && (
          <pre className="text-[10px] text-zinc-600 font-mono bg-zinc-900/50 border border-zinc-800/60 rounded-lg px-3 py-2 overflow-x-auto">
            {JSON.stringify(exp.train_params, null, 2)}
          </pre>
        )}

        <p className="text-xs text-zinc-600 flex items-center gap-1.5 pt-0.5">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          {formatDate(exp.created_at)}
          {exp.started_at && (
            <span className="flex items-center gap-1 ml-2">
              <Clock className="w-3 h-3" /> started {formatDate(exp.started_at)}
            </span>
          )}
        </p>
      </div>

      <div className="shrink-0 flex items-center gap-2 pt-0.5">
        <Button variant="ghost" size="sm" onClick={() => onDetail(exp.id)}>
          {t('exp_detail')}
        </Button>
        {isActive && (
          <Button
            variant="ghost"
            size="sm"
            icon={cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
            onClick={handleCancel}
            disabled={cancelling}
          >
            {t('exp_cancel')}
          </Button>
        )}
        <Button
          variant="danger"
          size="sm"
          icon={deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          onClick={handleDelete}
          disabled={deleting || isActive}
        >
          {t('delete')}
        </Button>
      </div>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ExperimentsPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const { t }     = useLang();

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [detailId, setDetailId]       = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api.experiments.list(projectId)
      .then(setExperiments)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleCreated   = (exp: Experiment) => setExperiments((prev) => [exp, ...prev]);
  const handleCancelled = (id: number) =>
    setExperiments((prev) => prev.map((e) => e.id === id ? { ...e, status: 'CANCELLED' as ExperimentStatus } : e));
  const handleDeleted = (id: number) =>
    setExperiments((prev) => prev.filter((e) => e.id !== id));

  return (
    <div className="flex flex-col gap-12">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">
            {t('exp_title')}
          </h1>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
            {t('exp_subtitle')}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2 pt-1">
          <a href={MLFLOW_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" icon={<ExternalLink className="w-3.5 h-3.5" />}>
              MLflow
            </Button>
          </a>
          <CreateExperimentModal projectId={projectId} onCreated={handleCreated} />
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

      {!loading && !error && experiments.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-zinc-800 rounded-xl"
        >
          <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
            <FlaskConical className="w-6 h-6 text-zinc-600" />
          </div>
          <p className="text-base font-medium text-zinc-300">{t('exp_empty')}</p>
          <p className="text-sm text-zinc-600 mt-2 leading-relaxed">{t('exp_empty_hint')}</p>
        </motion.div>
      )}

      {!loading && experiments.length > 0 && (
        <div className="flex flex-col gap-4">
          <AnimatePresence>
            {experiments.map((exp, i) => (
              <motion.div
                key={exp.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18, delay: i * 0.04 }}
              >
                <ExperimentCard
                  exp={exp}
                  onCancelled={handleCancelled}
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
          experimentId={detailId}
          open={detailId !== null}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}
