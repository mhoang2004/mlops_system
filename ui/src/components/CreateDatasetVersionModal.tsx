import { useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { api, type DatasetVersion } from '../lib/api';
import { Modal } from './ui/Modal';
import { Input, Textarea } from './ui/Input';
import { Button } from './ui/Button';
import { DropZone } from './ui/DropZone';
import { useLang } from '../contexts/LangContext';

const CHUNK_SIZE = 10;

interface Props {
  projectId: number;
  onCreated: (dv: DatasetVersion) => void;
}

export function CreateDatasetVersionModal({ projectId, onCreated }: Props) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('v1');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<{ uploaded: number; total: number } | null>(null);

  const resetForm = () => {
    setName(''); setVersion('v1'); setDescription(''); setFiles([]);
    setProgress(null); setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError(t('error_empty_name')); return; }
    if (!version.trim()) { setError(t('error_empty_version')); return; }
    setLoading(true);
    setError('');

    try {
      const firstChunk = files.slice(0, CHUNK_SIZE);
      const form = new FormData();
      form.append('project_id', String(projectId));
      form.append('name', name.trim());
      form.append('version', version.trim());
      if (description.trim()) form.append('description', description.trim());
      firstChunk.forEach((f) => form.append('files', f));

      const dv = await api.datasetVersions.create(form);

      let uploaded = firstChunk.length;
      const total = files.length;
      if (total > 0) setProgress({ uploaded, total });

      for (let i = CHUNK_SIZE; i < total; i += CHUNK_SIZE) {
        const chunk = files.slice(i, i + CHUNK_SIZE);
        await api.datasetVersions.uploadFiles(dv.id, chunk);
        uploaded += chunk.length;
        setProgress({ uploaded, total });
      }

      onCreated(dv);
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
      <div className="flex justify-end">
        <Button
          className="px-6 py-3"
          icon={<Plus className="w-4 h-4 shrink-0" />}
          onClick={() => setOpen(true)}
        >
          {t('dv_create')}
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('dv_create')}
        className="max-w-xl"
      >
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4 gap-y-5">
            <Input
              id="dv-name"
              label={t('dv_name')}
              placeholder="VD: traffic_signs"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <Input
              id="dv-version"
              label={t('dv_version')}
              placeholder="v1"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </div>

          <Textarea
            id="dv-desc"
            label={t('dv_desc')}
            placeholder={t('dv_desc_placeholder')}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <DropZone
            label={t('dv_upload_images')}
            hint={t('dv_upload_images_hint')}
            accept="image/*"
            files={files}
            onFilesChange={setFiles}
          />

          {progress && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Đang tải lên...</span>
                <span className="tabular-nums">{progress.uploaded} / {progress.total} files</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((progress.uploaded / progress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" loading={loading} icon={<Upload className="w-3.5 h-3.5" />}>
              {t('dv_create_upload')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
