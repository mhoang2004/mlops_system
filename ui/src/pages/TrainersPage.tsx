import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Brain, Loader2, AlertCircle, ChevronDown, ChevronUp, BookOpen, X } from 'lucide-react';
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

function DocsModal({ trainer, onClose }: { trainer: Trainer; onClose: () => void }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    api.trainers.getDocs(trainer.key)
      .then(setContent)
      .catch(() => setError('Không tìm thấy tài liệu cho trainer này.'))
      .finally(() => setLoading(false));
  }, [trainer.key]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-3xl my-8 bg-[#111113] rounded-xl border border-zinc-800 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_24px_64px_rgba(0,0,0,0.7)]">
        <div className="absolute inset-x-0 top-0 h-px rounded-t-xl bg-gradient-to-r from-transparent via-white/8 to-transparent pointer-events-none" />

        <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-zinc-100">{trainer.name}</h2>
            <Badge variant="muted">{trainer.key}</Badge>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-8 py-7">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-violet-500/50" />
            </div>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!loading && !error && (
            <div className="docs-content">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-lg font-bold text-zinc-100 mb-1">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-sm font-semibold text-zinc-200 mt-7 mb-3 pb-2 border-b border-zinc-800">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-semibold text-zinc-300 mt-4 mb-2">{children}</h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-sm text-zinc-400 leading-relaxed mb-3">{children}</p>
                  ),
                  strong: ({ children }) => (
                    <strong className="text-zinc-200 font-semibold">{children}</strong>
                  ),
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">{children}</a>
                  ),
                  ul: ({ children }) => (
                    <ul className="text-sm text-zinc-400 leading-relaxed mb-3 space-y-1 list-none pl-0">{children}</ul>
                  ),
                  li: ({ children }) => (
                    <li className="flex gap-2 text-sm text-zinc-400">
                      <span className="text-violet-500 mt-1.5 shrink-0">·</span>
                      <span>{children}</span>
                    </li>
                  ),
                  code: ({ className, children, ...props }) => {
                    const isBlock = className?.includes('language-');
                    if (isBlock) {
                      return (
                        <code className="block text-[11px] text-zinc-300 font-mono bg-zinc-900/60 border border-zinc-800/60 rounded-lg px-4 py-3 overflow-x-auto whitespace-pre">
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code className="text-[11px] text-violet-300 font-mono bg-zinc-800/60 px-1.5 py-0.5 rounded" {...props}>
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => (
                    <pre className="mb-4 overflow-x-auto">{children}</pre>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-violet-500/40 pl-4 my-3 text-sm text-zinc-500 italic">{children}</blockquote>
                  ),
                  hr: () => <hr className="border-zinc-800 my-5" />,
                  table: ({ children }) => (
                    <div className="overflow-x-auto mb-4">
                      <table className="w-full text-xs border-collapse">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead>{children}</thead>,
                  tbody: ({ children }) => <tbody>{children}</tbody>,
                  tr: ({ children }) => (
                    <tr className="border-b border-zinc-800/60">{children}</tr>
                  ),
                  th: ({ children }) => (
                    <th className="text-left text-zinc-400 font-medium px-3 py-2 bg-zinc-900/50">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="text-zinc-400 px-3 py-2">{children}</td>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TrainersPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [docsTrainer, setDocsTrainer] = useState<Trainer | null>(null);

  useEffect(() => {
    api.trainers.list()
      .then(setTrainers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-12">
      {docsTrainer && (
        <DocsModal trainer={docsTrainer} onClose={() => setDocsTrainer(null)} />
      )}

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

              <button
                onClick={() => setDocsTrainer(tr)}
                className="shrink-0 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-violet-400 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-violet-500/8 border border-transparent hover:border-violet-500/20"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Docs
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
