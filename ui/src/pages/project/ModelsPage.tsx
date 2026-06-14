import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Box, Plus, Trash2, Loader2, AlertCircle, Brain, Calendar } from 'lucide-react';
import { api, type MLModel, type Trainer } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { formatDate } from '../../lib/utils';
import { useLang } from '../../contexts/LangContext';

const selectCls =
  'w-full px-3 py-2.5 rounded-lg text-sm text-zinc-100 ' +
  'bg-zinc-900/60 border border-zinc-800 outline-none ' +
  'hover:border-zinc-700 focus:border-violet-500/50 ' +
  'focus:ring-2 focus:ring-violet-500/10 transition-all duration-150';

// ── Create model modal ────────────────────────────────────────────────────────

function CreateModelModal({
  projectId,
  onCreated,
}: {
  projectId: number;
  onCreated: (m: MLModel) => void;
}) {
  const { t } = useLang();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [trainerId, setTrainerId] = useState('');
  const [name, setName]       = useState('');
  const [desc, setDesc]       = useState('');

  useEffect(() => {
    if (!open) return;
    api.trainers.list().then((list) => {
      setTrainers(list);
      if (list.length > 0 && !trainerId) setTrainerId(String(list[0].id));
    }).catch(() => {});
  }, [open]);

  const resetForm = () => { setName(''); setDesc(''); setError(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError(t('error_empty_name')); return; }
    if (!trainerId)   { setError('Vui lòng chọn trainer'); return; }

    setLoading(true);
    try {
      const m = await api.mlModels.create({
        project_id: projectId,
        trainer_id: parseInt(trainerId),
        name:        name.trim(),
        description: desc.trim() || undefined,
      });
      onCreated(m);
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
        Tạo Model
      </Button>

      <Modal
        open={open}
        onClose={() => { setOpen(false); resetForm(); }}
        title="Tạo ML Model mới"
        className="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          <Input
            id="model-name"
            label="Tên Model"
            placeholder="football_detection, text_recognition, ..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
              Trainer
            </label>
            {trainers.length === 0 ? (
              <p className="text-xs text-zinc-600 italic px-1 pt-1">
                Chưa có trainer nào — training worker chưa khởi động hoặc chưa đăng ký trainer.
              </p>
            ) : (
              <select
                className={selectCls}
                value={trainerId}
                onChange={(e) => setTrainerId(e.target.value)}
                required
              >
                {trainers.map((tr) => (
                  <option key={tr.id} value={String(tr.id)}>
                    {tr.name} ({tr.key})
                  </option>
                ))}
              </select>
            )}
            {trainerId && trainers.find(t => String(t.id) === trainerId)?.description && (
              <p className="text-[10px] text-zinc-600 leading-snug px-1">
                {trainers.find(t => String(t.id) === trainerId)?.description}
              </p>
            )}
          </div>

          <Input
            id="model-desc"
            label="Mô tả (tuỳ chọn)"
            placeholder="Mô tả mục đích của model này..."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />

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
            <Button type="submit" loading={loading} icon={<Box className="w-3.5 h-3.5" />}>
              Tạo Model
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Model card ────────────────────────────────────────────────────────────────

function ModelCard({
  model,
  onDeleted,
}: {
  model: MLModel;
  onDeleted: (id: number) => void;
}) {
  const { t } = useLang();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Xóa model này? Hành động này không thể hoàn tác.')) return;
    setDeleting(true);
    try {
      await api.mlModels.delete(model.id);
      onDeleted(model.id);
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  };

  return (
    <Card className="p-6 flex items-start gap-5 hover:border-zinc-700/60 transition-colors duration-150">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border bg-violet-500/10 border-violet-500/25">
        <Box className="w-4.5 h-4.5 text-violet-400" strokeWidth={2} />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-sm font-semibold text-zinc-100">{model.name}</span>
          {model.trainer && (
            <Badge variant="info">{model.trainer.name}</Badge>
          )}
        </div>

        {model.description && (
          <p className="text-xs text-zinc-500 leading-relaxed">{model.description}</p>
        )}

        {model.trainer?.description && !model.description && (
          <p className="text-xs text-zinc-600 leading-relaxed line-clamp-1">{model.trainer.description}</p>
        )}

        <p className="text-xs text-zinc-600 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          {formatDate(model.created_at)}
        </p>
      </div>

      <div className="shrink-0">
        <Button
          variant="danger"
          size="sm"
          icon={deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          onClick={handleDelete}
          disabled={deleting}
        >
          {t('delete')}
        </Button>
      </div>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ModelsPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

  const [models, setModels]   = useState<MLModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    setLoading(true);
    api.mlModels.list(projectId)
      .then(setModels)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleCreated = (m: MLModel) => setModels((prev) => [m, ...prev]);
  const handleDeleted = (id: number) => setModels((prev) => prev.filter((m) => m.id !== id));

  return (
    <div className="flex flex-col gap-12">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Models</h1>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
            Quản lý các ML model trong project. Mỗi model gắn với 1 trainer và có thể có nhiều experiment.
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <CreateModelModal projectId={projectId} onCreated={handleCreated} />
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-28 gap-3 text-zinc-600">
          <Loader2 className="w-6 h-6 animate-spin text-violet-500/50" />
          <span className="text-sm">Đang tải...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-5 bg-red-500/8 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Không kết nối được API: {error}
        </div>
      )}

      {!loading && !error && models.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-zinc-800 rounded-xl"
        >
          <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
            <Brain className="w-6 h-6 text-zinc-600" />
          </div>
          <p className="text-base font-medium text-zinc-300">Chưa có model nào</p>
          <p className="text-sm text-zinc-600 mt-2 leading-relaxed">
            Tạo model đầu tiên để bắt đầu training experiments
          </p>
        </motion.div>
      )}

      {!loading && models.length > 0 && (
        <div className="flex flex-col gap-4">
          <AnimatePresence>
            {models.map((model, i) => (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18, delay: i * 0.04 }}
              >
                <ModelCard model={model} onDeleted={handleDeleted} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
