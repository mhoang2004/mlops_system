import { useState } from 'react';
import { Tag } from 'lucide-react';
import { api, type DatasetVersion } from '../lib/api';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { DropZone } from './ui/DropZone';
import { useLang } from '../contexts/LangContext';

interface Props {
  datasetVersion: DatasetVersion;
  onUploaded: (dv: DatasetVersion) => void;
}

export function UploadLabelsModal({ datasetVersion, onUploaded }: Props) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) { setError(t('error_empty_files')); return; }
    setLoading(true);
    setError('');
    try {
      const updated = await api.datasetVersions.uploadLabels(datasetVersion.id, files);
      onUploaded(updated);
      setOpen(false);
      setFiles([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        icon={<Tag className="w-3.5 h-3.5" />}
        onClick={() => setOpen(true)}
      >
        {t('dv_upload_labels')}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${t('dv_upload_labels')} — ${datasetVersion.name} ${datasetVersion.version}`}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="bg-zinc-900/60 rounded-xl px-5 py-4 text-sm text-zinc-400 border border-zinc-800 space-y-2">
            <p className="font-semibold text-zinc-300">{t('dv_info')}</p>
            <p>{t('dv_storage_path')}: <code className="text-violet-400 text-xs">{datasetVersion.storage_path}</code></p>
            <p>{t('dv_label_status')}:{' '}
              <span className={datasetVersion.label_type === 'human' ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
                {datasetVersion.label_type === 'human' ? t('dv_labeled') : t('dv_unlabeled')}
              </span>
            </p>
          </div>

          <DropZone
            label={t('dv_label_file_hint')}
            hint={t('dv_label_hint')}
            accept=".json,.txt,.yaml,.yml"
            files={files}
            onFilesChange={setFiles}
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" loading={loading} icon={<Tag className="w-4 h-4" />}>
              {t('upload')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
