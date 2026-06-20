import { useCallback, useState } from 'react';
import { Upload, X, FileText, Image, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DropZoneProps {
  onFilesChange: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
  files?: File[];
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DropZone({ onFilesChange, accept, multiple = true, label, hint, files = [] }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const addFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) return;
      const arr = Array.from(incoming);
      onFilesChange(multiple ? [...files, ...arr] : arr);
    },
    [files, multiple, onFilesChange],
  );

  const removeFile = (idx: number) => {
    onFilesChange(files.filter((_, i) => i !== idx));
  };

  const getIcon = (file: File) => {
    if (file.type.startsWith('image/'))
      return <Image className="w-3 h-3 text-violet-400 shrink-0" />;
    return <FileText className="w-3 h-3 text-amber-400 shrink-0" />;
  };

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">{label}</p>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        className={cn(
          'relative rounded-xl px-8 py-8 text-center transition-all duration-150 cursor-pointer group',
          'border border-dashed',
          dragging
            ? 'border-violet-500/60 bg-violet-500/5'
            : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50',
        )}
      >
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          onChange={(e) => addFiles(e.target.files)}
        />

        <div className={cn(
          'w-9 h-9 rounded-xl mx-auto mb-2.5 flex items-center justify-center transition-all duration-150',
          dragging ? 'bg-violet-500/15' : 'bg-zinc-800/80 group-hover:bg-zinc-800',
        )}>
          <Upload className={cn('w-4 h-4 transition-all duration-150', dragging ? 'text-violet-400 -translate-y-0.5' : 'text-zinc-500 group-hover:text-zinc-400')} />
        </div>

        <p className="text-xs text-zinc-500 leading-snug">
          {dragging ? (
            <span className="text-violet-400 font-medium">Thả file vào đây</span>
          ) : (
            <>
              Kéo thả file hoặc{' '}
              <span className="text-violet-400 font-medium">chọn file</span>
            </>
          )}
        </p>
        {hint && <p className="text-[11px] text-zinc-700 mt-1">{hint}</p>}
      </div>

      {files.length > 0 && (
        <>
          <ul className="flex flex-col gap-1">
            {files.slice(0, 5).map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700/80 transition-colors">
                <div className="flex items-center gap-1.5 min-w-0">
                  {getIcon(f)}
                  <span className="text-xs text-zinc-400 truncate">{f.name}</span>
                  <span className="text-[10px] text-zinc-600 shrink-0 tabular-nums">{formatSize(f.size)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-zinc-700 hover:text-red-400 transition-colors shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1 text-[11px] text-zinc-600">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              {files.length > 5
                ? `${files.length} files đã chọn (hiển thị 5 đầu tiên)`
                : `${files.length} file đã chọn`}
            </p>
            <button
              type="button"
              onClick={() => onFilesChange([])}
              className="text-[11px] text-zinc-700 hover:text-red-400 transition-colors"
            >
              Xóa tất cả
            </button>
          </div>
        </>
      )}
    </div>
  );
}
