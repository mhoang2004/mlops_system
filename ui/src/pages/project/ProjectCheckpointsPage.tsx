import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, Trash2, Loader2, AlertCircle, Calendar, BarChart3, Plus, Upload, Download } from 'lucide-react';
import { api, type Checkpoint } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { DropZone } from '../../components/ui/DropZone';
import { formatDate } from '../../lib/utils';
import { useLang } from '../../contexts/LangContext';

function UploadModal({ projectId, onCreated }: { projectId: number; onCreated: (c: Checkpoint) => void }) {
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
    } finally { setLoading(false); }
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

export function ProjectCheckpointsPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const { t } = useLang();

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api.checkpoints.list(projectId)
      .then(setCheckpoints)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleCreated = (c: Checkpoint) => setCheckpoints((prev) => [c, ...prev]);

  const handleDownload = async (ckptId: number) => {
    setDownloadingId(ckptId);
    try {
      const { url, filename } = await api.checkpoints.getDownloadUrl(ckptId);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch { alert(t('error_occurred')); }
    finally { setDownloadingId(null); }
  };

  const handleDelete = async (ckptId: number) => {
    if (!confirm(t('ckpt_delete_confirm'))) return;
    setDeletingId(ckptId);
    try {
      await api.checkpoints.delete(ckptId);
      setCheckpoints((prev) => prev.filter((c) => c.id !== ckptId));
    } catch { alert(t('delete_failed')); }
    finally { setDeletingId(null); }
  };

  return (
    <div className="flex flex-col gap-12">

      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">
            {t('project_tab_checkpoints')}
          </h1>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
            {t('ckpt_empty_hint')}
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <UploadModal projectId={projectId} onCreated={handleCreated} />
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
      {!loading && !error && checkpoints.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-zinc-800 rounded-xl">
          <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
            <Cpu className="w-6 h-6 text-zinc-600" />
          </div>
          <p className="text-base font-medium text-zinc-300">{t('ckpt_empty')}</p>
          <p className="text-sm text-zinc-600 mt-2 leading-relaxed">{t('ckpt_empty_hint')}</p>
        </div>
      )}

      {/* List */}
      {!loading && checkpoints.length > 0 && (
        <div className="flex flex-col gap-4">
          <AnimatePresence>
            {checkpoints.map((ck, i) => (
              <motion.div
                key={ck.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, delay: i * 0.05 }}
              >
                <Card className="p-6 flex items-start gap-5 hover:border-zinc-700/60 transition-colors duration-150">

                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Cpu className="w-4.5 h-4.5 text-violet-400" strokeWidth={2} />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-semibold text-zinc-100">{ck.name}</span>
                      <Badge variant={ck.source === 'pretrained' ? 'info' : 'success'}>
                        {ck.source === 'pretrained' ? t('ckpt_pretrained') : t('ckpt_experiment')}
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-600 font-mono leading-relaxed truncate">{ck.file_path}</p>
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

                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={downloadingId === ck.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Download className="w-3.5 h-3.5" />}
                      onClick={() => handleDownload(ck.id)}
                      disabled={downloadingId === ck.id}
                    >
                      {t('ckpt_download')}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      icon={deletingId === ck.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                      onClick={() => handleDelete(ck.id)}
                      disabled={deletingId === ck.id}
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
