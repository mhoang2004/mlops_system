import { useState } from 'react';
import { Plus, Tag } from 'lucide-react';
import { api, type Project } from '../lib/api';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { useLang } from '../contexts/LangContext';

interface Props {
  onCreated: (p: Project) => void;
}

export function CreateProjectModal({ onCreated }: Props) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addLabel = () => {
    const trimmed = labelInput.trim();
    if (trimmed && !labels.includes(trimmed)) {
      setLabels([...labels, trimmed]);
      setLabelInput('');
    }
  };

  const removeLabel = (l: string) => setLabels(labels.filter((x) => x !== l));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError(t('error_empty_name')); return; }
    setLoading(true);
    setError('');
    try {
      const p = await api.projects.create(
        name.trim(),
        labels.map((name) => ({ name })),
      );
      onCreated(p);
      setOpen(false);
      setName('');
      setLabels([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button icon={<Plus className="w-4 h-4" />} onClick={() => setOpen(true)}>
        {t('projects_create')}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={t('cp_title')}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <Input
            id="project-name"
            label={t('cp_name')}
            placeholder={t('cp_name_placeholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error}
          />

          <div className="flex flex-col gap-2.5">
            <label className="text-sm font-medium text-slate-300">{t('cp_labels')}</label>
            <div className="flex gap-2">
              <Input
                id="label-input"
                placeholder={t('cp_label_placeholder')}
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }}
                className="flex-1"
              />
              <Button type="button" variant="secondary" onClick={addLabel} size="md">
                {t('cp_label_add')}
              </Button>
            </div>
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-2.5 mt-3">
                {labels.map((l) => (
                  <span
                    key={l}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                  >
                    <Tag className="w-3 h-3" />
                    {l}
                    <button
                      type="button"
                      onClick={() => removeLabel(l)}
                      className="hover:text-red-400 transition-colors ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" loading={loading}>
              {t('cp_create')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
