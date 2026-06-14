import { useEffect, useState } from 'react';
import { Brain, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { api, type Trainer } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { formatDate } from '../lib/utils';

function SchemaViewer({ schema }: { schema: object }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 text-xs text-zinc-700 hover:text-zinc-400 transition-colors self-start"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        train_params_schema
      </button>
      {open && (
        <pre className="text-[10px] text-zinc-600 font-mono bg-zinc-900/50 border border-zinc-800/60 rounded-lg px-3 py-2 overflow-x-auto max-h-64">
          {JSON.stringify(schema, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function TrainersPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.trainers.list()
      .then(setTrainers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Trainers</h1>
        <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
          Các trainer đã đăng ký — tự động phát hiện khi training worker khởi động.
        </p>
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

      {!loading && !error && trainers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-zinc-800 rounded-xl">
          <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
            <Brain className="w-6 h-6 text-zinc-600" />
          </div>
          <p className="text-base font-medium text-zinc-300">Chưa có trainer nào</p>
          <p className="text-sm text-zinc-600 mt-2 max-w-sm leading-relaxed">
            Khởi động training worker để tự động đăng ký trainer.
            Chạy: <code className="text-violet-400">docker compose up training-worker</code>
          </p>
        </div>
      )}

      {!loading && trainers.length > 0 && (
        <div className="flex flex-col gap-4">
          {trainers.map((tr) => (
            <Card key={tr.id} className="p-6 flex items-start gap-5 hover:border-zinc-700/60 transition-colors">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border bg-violet-500/10 border-violet-500/25">
                <Brain className="w-4.5 h-4.5 text-violet-400" strokeWidth={2} />
              </div>

              <div className="flex-1 min-w-0 space-y-2.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-sm font-semibold text-zinc-100">{tr.name}</span>
                  <Badge variant="muted">{tr.key}</Badge>
                  <Badge variant={tr.is_active ? 'success' : 'warning'}>
                    {tr.is_active ? 'active' : 'inactive'}
                  </Badge>
                </div>

                {tr.description && (
                  <p className="text-xs text-zinc-500 leading-relaxed">{tr.description}</p>
                )}

                <div className="text-xs text-zinc-600 flex items-center gap-3">
                  <span>
                    {Object.keys(tr.train_params_schema?.properties ?? {}).length} train params
                  </span>
                  <span>·</span>
                  <span>Registered {formatDate(tr.created_at)}</span>
                </div>

                <SchemaViewer schema={tr.train_params_schema} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
