import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, Loader2, AlertCircle } from 'lucide-react';
import { api, type Project } from '../../lib/api';

export function TasksPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.projects.get(projectId)
      .then(setProject)
      .catch(() => setError('Không thể tải thông tin project'))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-violet-500/50" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-400 py-10 px-6">
        <AlertCircle className="w-4 h-4" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        <FileText className="w-4 h-4 text-violet-400" />
        <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-widest">
          Mô tả project & Quy tắc gán nhãn
        </h2>
      </div>

      {project?.description ? (
        <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-5">
          <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
            {project.description}
          </pre>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-700/50 bg-zinc-800/20 p-8 text-center">
          <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">
            Project này chưa có mô tả.
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            Chỉnh sửa project để thêm mô tả và quy tắc gán nhãn.
          </p>
        </div>
      )}
    </div>
  );
}
