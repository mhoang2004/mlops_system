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

export function DropZone({
  onFilesChange,
  accept,
  multiple = true,
  label,
  hint,
  files = [],
}: DropZoneProps) {
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
      return <Image className="w-3.5 h-3.5 text-violet-400 shrink-0" />;
    return <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  };

  return (
    <div className="flex flex-col gap-2.5">
      {label && (
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{label}</p>
      )}

      {/* Drop area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        className={cn(
          'relative rounded-2xl p-8 text-center transition-all duration-200 cursor-pointer group',
          'border-2 border-dashed',
          dragging
            ? 'border-violet-500 bg-violet-500/8 scale-[1.01]'
            : cn(
                'border-zinc-800 bg-zinc-900/40',
                'hover:border-zinc-700 hover:bg-zinc-900/60',
              ),
        )}
      >
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          onChange={(e) => addFiles(e.target.files)}
        />

        {/* Icon */}
        <div
          className={cn(
            'w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center transition-all duration-200',
            dragging
              ? 'bg-violet-500/20 shadow-[0_0_0_8px_rgba(124,58,237,0.08)]'
              : 'bg-zinc-800 group-hover:bg-zinc-700/80',
          )}
        >
          <Upload
            className={cn(
              'w-5 h-5 transition-all duration-200',
              dragging ? 'text-violet-400 -translate-y-0.5' : 'text-zinc-500 group-hover:text-zinc-400',
            )}
          />
        </div>

        <p className="text-sm text-zinc-400 leading-snug">
          {dragging ? (
            <span className="text-violet-400 font-medium">Thả file vào đây</span>
          ) : (
            <>
              Kéo thả file vào đây hoặc{' '}
              <span className="text-violet-400 font-medium group-hover:text-violet-300 transition-colors">
                chọn file
              </span>
            </>
          )}
        </p>
        {hint && <p className="text-xs text-zinc-600 mt-1.5">{hint}</p>}
      </div>

      {/* File list */}
      {files.length > 0 && (
        <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {files.map((f, i) => (
            <li
              key={i}
              className={cn(
                'flex items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors duration-150',
                'bg-zinc-900/60 border border-zinc-800/80',
                'hover:border-zinc-700/80',
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {getIcon(f)}
                <span className="text-xs text-zinc-300 truncate">{f.name}</span>
                <span className="text-[10px] text-zinc-600 shrink-0 tabular-nums">
                  {formatSize(f.size)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-zinc-700 hover:text-red-400 transition-colors shrink-0 p-0.5 rounded-md hover:bg-red-400/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-zinc-600">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          {files.length} file đã chọn
        </p>
      )}
    </div>
  );
}
