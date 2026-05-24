import { useEffect, useState } from 'react';
import { Cpu, Trash2, Loader2, AlertCircle, Calendar, BarChart3, Plus, Upload } from 'lucide-react';
import { api, type Checkpoint } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { DropZone } from '../components/ui/DropZone';
import { formatDate } from '../lib/utils';
import { useLang } from '../contexts/LangContext';

function UploadCheckpointModal({ onCreated }: { onCreated: (c: Checkpoint) => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !name.trim() || files.length === 0) {
      setError(t('error_checkpoint_fields'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('project_id', projectId);
      form.append('name', name.trim());
      form.append('file', files[0]);
      const c = await api.checkpoints.upload(form);
      onCreated(c);
      setOpen(false);
      setProjectId(''); setName(''); setFiles([]);
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
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="ckpt-project-id"
              label={t('ckpt_project_id')}
              type="number"
              placeholder="VD: 1"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            />
            <Input
              id="ckpt-name"
              label={t('ckpt_name')}
              placeholder="VD: yolov8n_pretrained"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
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

export function CheckpointsPage() {
  const { t } = useLang();
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    api.checkpoints
      .list()
      .then(setCheckpoints)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleCreated = (c: Checkpoint) => setCheckpoints((prev) => [c, ...prev]);

  const handleDelete = async (id: number) => {
    if (!confirm(t('ckpt_delete_confirm'))) return;
    setDeletingId(id);
    try {
      await api.checkpoints.delete(id);
      setCheckpoints((prev) => prev.filter((c) => c.id !== id));
    } catch {
      alert(t('delete_failed'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-10 py-10">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-slate-900/20 p-8 md:p-10 rounded-3xl border border-slate-800/40 backdrop-blur-sm shadow-md">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">{t('ckpt_title')}</h1>
          <p className="text-slate-400 text-sm mt-2">{t('ckpt_subtitle')}</p>
        </div>
        <UploadCheckpointModal onCreated={handleCreated} />
      </div>

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

      {!loading && !error && checkpoints.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 text-center bg-slate-900/30 rounded-3xl border border-dashed border-slate-800/85 p-12">
          <div className="w-20 h-20 rounded-3xl bg-slate-800 border border-slate-700/60 flex items-center justify-center mb-6 shadow-xl shadow-slate-950/20">
            <Cpu className="w-9 h-9 text-slate-500" />
          </div>
          <p className="text-slate-200 font-semibold text-lg">{t('ckpt_empty')}</p>
          <p className="text-slate-500 text-sm mt-2 max-w-sm">{t('ckpt_empty_hint')}</p>
        </div>
      )}

      {!loading && checkpoints.length > 0 && (
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
                  <Badge variant="muted" className="px-2.5 py-1 text-xs font-semibold">{t('ckpt_project_id')}: #{ck.project_id}</Badge>
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
                  icon={deletingId === ck.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  onClick={() => handleDelete(ck.id)}
                  disabled={deletingId === ck.id}
                >
                  {t('delete')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
