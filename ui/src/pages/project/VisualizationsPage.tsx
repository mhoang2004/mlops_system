import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanSearch, Plus, Trash2, Loader2, AlertCircle, Calendar,
  ChevronDown, ChevronUp, ImageIcon,
} from 'lucide-react';
import {
  api,
  type Visualization, type VisualizationStatus, type VisualizationResultImage,
  type Server, type MLModel, type Checkpoint,
} from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { formatDate } from '../../lib/utils';
import { useLang } from '../../contexts/LangContext';

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<VisualizationStatus, 'muted' | 'info' | 'default' | 'success' | 'warning'> = {
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

// ── Create modal ──────────────────────────────────────────────────────────────

function CreateVizModal({ projectId, onCreated }: { projectId: number; onCreated: (v: Visualization) => void }) {
  const { t } = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [servers, setServers]         = useState<Server[]>([]);
  const [mlModels, setMlModels]       = useState<MLModel[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);

  const [name, setName]       = useState('');
  const [modelId, setModelId] = useState('');
  const [ckptId, setCkptId]   = useState('');
  const [serverId, setServerId] = useState('');
  const [confidence, setConfidence] = useState(0.5);
  const [files, setFiles]     = useState<File[]>([]);

  useEffect(() => {
    if (!open) return;
    api.servers.list().then(setServers).catch(() => {});
    api.checkpoints.list(projectId).then(setCheckpoints).catch(() => {});
    api.mlModels.list(projectId).then((models) => {
      setMlModels(models);
      if (models.length > 0) setModelId(String(models[0].id));
    }).catch(() => {});
  }, [open, projectId]);

  const filteredCkpts = checkpoints.filter(
    (c) => c.source === 'pretrained' || (modelId && c.ml_model_id === parseInt(modelId)),
  );

  const resetForm = () => {
    setName(''); setModelId(''); setCkptId(''); setServerId('');
    setConfidence(0.5); setFiles([]); setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!modelId)       { setError(t('viz_val_model'));      return; }
    if (!ckptId)        { setError(t('viz_val_checkpoint'));  return; }
    if (files.length === 0) { setError(t('viz_val_images')); return; }

    const form = new FormData();
    form.append('project_id',    String(projectId));
    form.append('name',          name.trim() || `Viz ${new Date().toLocaleString()}`);
    form.append('ml_model_id',   modelId);
    form.append('checkpoint_id', ckptId);
    form.append('server_id',     serverId);
    form.append('confidence',    String(confidence));
    files.forEach((f) => form.append('images', f));

    setLoading(true);
    try {
      const viz = await api.visualizations.create(form);
      onCreated(viz);
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
        {t('viz_create')}
      </Button>

      <Modal
        open={open}
        onClose={() => { setOpen(false); resetForm(); }}
        title={t('viz_create_title')}
        className="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-h-[72vh] overflow-y-auto pr-1">

          <Input
            id="viz-name"
            label={t('viz_name')}
            placeholder="Detection run 01"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/* Model */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
              {t('viz_model')}
            </label>
            {mlModels.length === 0 ? (
              <p className="text-xs text-zinc-600 italic px-1">{t('viz_no_models')}</p>
            ) : (
              <select
                className={selectCls}
                value={modelId}
                onChange={(e) => { setModelId(e.target.value); setCkptId(''); }}
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
              {t('viz_checkpoint')}
            </label>
            {filteredCkpts.length === 0 ? (
              <p className="text-xs text-zinc-600 italic px-1">{t('viz_no_checkpoints')}</p>
            ) : (
              <select className={selectCls} value={ckptId} onChange={(e) => setCkptId(e.target.value)} required>
                <option value="">Chọn checkpoint...</option>
                {filteredCkpts.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    [{c.source === 'pretrained' ? 'Pretrained' : 'Experiment'}] {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Server */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
              {t('viz_server')}
            </label>
            {servers.length > 0 ? (
              <select className={selectCls} value={serverId} onChange={(e) => setServerId(e.target.value)} required>
                <option value="">Chọn server...</option>
                {servers.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.name} — {s.status}</option>
                ))}
              </select>
            ) : (
              <Input
                id="viz-server"
                placeholder="gpu-node-01"
                value={serverId}
                onChange={(e) => setServerId(e.target.value)}
                required
              />
            )}
          </div>

          {/* Confidence */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest flex items-center justify-between">
              <span>{t('viz_confidence')}</span>
              <span className="text-zinc-300 font-semibold normal-case tracking-normal">
                {confidence.toFixed(2)}
              </span>
            </label>
            <input
              type="range" min="0.1" max="0.95" step="0.05"
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              className="w-full accent-violet-500"
            />
          </div>

          {/* Images */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
              {t('viz_images')}
            </label>
            <div
              className="border border-dashed border-zinc-700 rounded-lg p-4 text-center cursor-pointer hover:border-violet-500/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
              {files.length === 0 ? (
                <p className="text-xs text-zinc-600">{t('viz_images_hint')}</p>
              ) : (
                <p className="text-xs text-zinc-400">
                  {files.length} file đã chọn:&nbsp;
                  <span className="text-zinc-500">{files.map((f) => f.name).join(', ')}</span>
                </p>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
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
            <Button type="submit" loading={loading} icon={<ScanSearch className="w-3.5 h-3.5" />}>
              {t('viz_create')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Result modal ──────────────────────────────────────────────────────────────

function ResultModal({ vizId, open, onClose }: { vizId: number; open: boolean; onClose: () => void }) {
  const { t } = useLang();
  const [items, setItems]   = useState<VisualizationResultImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setLoading(true);
    api.visualizations.resultImages(vizId)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, vizId]);

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <Modal open={open} onClose={onClose} title={t('viz_results')} className="max-w-4xl">
      {loading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-violet-500/50" />
        </div>
      )}

      {!loading && items.length === 0 && (
        <p className="text-sm text-zinc-600 text-center py-10">{t('viz_no_results')}</p>
      )}

      {!loading && items.length > 0 && (
        <div className="flex flex-col gap-5 max-h-[75vh] overflow-y-auto pr-1">
          {items.map((item, i) => (
            <div key={i} className="border border-zinc-800 rounded-xl overflow-hidden">
              {/* Annotated image */}
              {item.output_url ? (
                <img
                  src={item.output_url}
                  alt={item.filename}
                  className="w-full object-contain max-h-[420px] bg-zinc-950"
                />
              ) : (
                <div className="flex items-center justify-center h-32 bg-zinc-900/60 text-zinc-600 text-sm">
                  {item.filename}
                </div>
              )}

              {/* Detections */}
              <div className="p-3 bg-zinc-900/40">
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className="flex items-center justify-between w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <span className="font-medium">{item.filename}</span>
                  <span className="flex items-center gap-1.5">
                    {item.detections.length} detection{item.detections.length !== 1 ? 's' : ''}
                    {expanded.has(i) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </span>
                </button>

                {expanded.has(i) && item.detections.length > 0 && (
                  <div className="mt-2 overflow-hidden rounded-lg border border-zinc-800">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-900/60">
                          <th className="text-left px-3 py-1.5 text-zinc-500 font-medium">Class</th>
                          <th className="text-right px-3 py-1.5 text-zinc-500 font-medium">Score</th>
                          <th className="text-right px-3 py-1.5 text-zinc-500 font-medium">Box (xyxy)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.detections.map((d, j) => (
                          <tr key={j} className="border-b border-zinc-800/50 last:border-0">
                            <td className="px-3 py-1.5 text-zinc-200">{d.class_name}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-400 font-mono">
                              {(d.score * 100).toFixed(1)}%
                            </td>
                            <td className="px-3 py-1.5 text-right text-zinc-500 font-mono text-[10px]">
                              {d.box.map((v) => v.toFixed(0)).join(', ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {expanded.has(i) && item.detections.length === 0 && (
                  <p className="text-xs text-zinc-600 mt-2 italic">Không có detection nào</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ── Visualization card ────────────────────────────────────────────────────────

function VizCard({
  viz,
  onDeleted,
  onDetail,
}: {
  viz: Visualization;
  onDeleted: (id: number) => void;
  onDetail: (id: number) => void;
}) {
  const { t } = useLang();
  const [deleting, setDeleting] = useState(false);
  const [showKeys, setShowKeys] = useState(false);

  const handleDelete = async () => {
    if (!confirm(t('viz_delete_confirm'))) return;
    setDeleting(true);
    try {
      await api.visualizations.delete(viz.id);
      onDeleted(viz.id);
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  };

  const iconBg =
    viz.status === 'RUNNING'   ? 'bg-violet-500/10 border-violet-500/25' :
    viz.status === 'COMPLETED' ? 'bg-emerald-500/10 border-emerald-500/25' :
    viz.status === 'FAILED'    ? 'bg-amber-500/10 border-amber-500/25' :
                                  'bg-zinc-800 border-zinc-700';
  const iconColor =
    viz.status === 'RUNNING'   ? 'text-violet-400' :
    viz.status === 'COMPLETED' ? 'text-emerald-400' :
    viz.status === 'FAILED'    ? 'text-amber-400' : 'text-zinc-500';

  const totalDetections = viz.results?.reduce((sum, r) => sum + (r.detections?.length ?? 0), 0) ?? 0;

  return (
    <Card className="p-6 flex items-start gap-5 hover:border-zinc-700/60 transition-colors duration-150">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${iconBg}`}>
        <ScanSearch className={`w-4.5 h-4.5 ${iconColor}`} strokeWidth={2} />
      </div>

      <div className="flex-1 min-w-0 space-y-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-sm font-semibold text-zinc-100">{viz.name}</span>
          <Badge variant={STATUS_BADGE[viz.status]}>{viz.status}</Badge>
          <Badge variant="muted">model #{viz.ml_model_id}</Badge>
          <Badge variant="muted">conf {viz.confidence.toFixed(2)}</Badge>
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-600 flex-wrap">
          <span>{viz.server_id}</span>
          {viz.status === 'COMPLETED' && (
            <span className="text-zinc-500">
              {viz.results?.length ?? 0} ảnh · {totalDetections} detections
            </span>
          )}
        </div>

        {viz.error_message && (
          <p className="text-xs text-amber-500/80 font-mono line-clamp-1">{viz.error_message}</p>
        )}

        {viz.input_image_keys && viz.input_image_keys.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowKeys((p) => !p)}
              className="flex items-center gap-1 text-xs text-zinc-700 hover:text-zinc-400 transition-colors"
            >
              {showKeys ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {viz.input_image_keys.length} input image(s)
            </button>
            {showKeys && (
              <ul className="text-[10px] text-zinc-600 font-mono space-y-0.5 bg-zinc-900/50 border border-zinc-800/60 rounded-lg px-3 py-2">
                {viz.input_image_keys.map((k, i) => (
                  <li key={i} className="truncate">{k.split('/').pop()}</li>
                ))}
              </ul>
            )}
          </>
        )}

        <p className="text-xs text-zinc-600 flex items-center gap-1.5 pt-0.5">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          {formatDate(viz.created_at)}
        </p>
      </div>

      <div className="shrink-0 flex items-center gap-2 pt-0.5">
        {viz.status === 'COMPLETED' && (
          <Button variant="ghost" size="sm" onClick={() => onDetail(viz.id)}>
            {t('viz_detail')}
          </Button>
        )}
        <Button
          variant="danger"
          size="sm"
          icon={deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          onClick={handleDelete}
          disabled={deleting || viz.status === 'RUNNING'}
        >
          {t('delete')}
        </Button>
      </div>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function VisualizationsPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const { t } = useLang();

  const [vizList, setVizList] = useState<Visualization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [detailId, setDetailId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api.visualizations.list(projectId)
      .then(setVizList)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleCreated = (v: Visualization) => setVizList((prev) => [v, ...prev]);
  const handleDeleted = (id: number) => setVizList((prev) => prev.filter((v) => v.id !== id));

  return (
    <div className="flex flex-col gap-12">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">{t('viz_title')}</h1>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">{t('viz_subtitle')}</p>
        </div>
        <div className="shrink-0 pt-1">
          <CreateVizModal projectId={projectId} onCreated={handleCreated} />
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

      {!loading && !error && vizList.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-zinc-800 rounded-xl"
        >
          <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
            <ScanSearch className="w-6 h-6 text-zinc-600" />
          </div>
          <p className="text-base font-medium text-zinc-300">{t('viz_empty')}</p>
          <p className="text-sm text-zinc-600 mt-2 leading-relaxed">{t('viz_empty_hint')}</p>
        </motion.div>
      )}

      {!loading && vizList.length > 0 && (
        <div className="flex flex-col gap-4">
          <AnimatePresence>
            {vizList.map((viz, i) => (
              <motion.div
                key={viz.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18, delay: i * 0.04 }}
              >
                <VizCard viz={viz} onDeleted={handleDeleted} onDetail={setDetailId} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {detailId !== null && (
        <ResultModal
          vizId={detailId}
          open={detailId !== null}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}
