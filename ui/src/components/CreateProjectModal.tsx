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
  const [description, setDescription] = useState('');
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
        description.trim() || undefined,
      );
      onCreated(p);
      setOpen(false);
      setName('');
      setDescription('');
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
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input
            id="project-name"
            label={t('cp_name')}
            placeholder={t('cp_name_placeholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
              Mô tả / Quy tắc gán nhãn
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả project, quy tắc gán nhãn, ghi chú cho annotator..."
              rows={4}
              className="w-full rounded-lg bg-zinc-800/60 border border-zinc-700/60 text-sm text-zinc-200 placeholder:text-zinc-500 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/40"
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
              {t('cp_labels')}
            </label>
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
              <div className="flex flex-wrap gap-2 pt-1">
                {labels.map((l) => (
                  <span
                    key={l}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/10 text-violet-300 border border-violet-500/20"
                  >
                    <Tag className="w-3 h-3" />
                    {l}
                    <button
                      type="button"
                      onClick={() => removeLabel(l)}
                      className="hover:text-red-400 transition-colors ml-0.5 text-sm leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
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
