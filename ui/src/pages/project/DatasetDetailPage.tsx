import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Database, Calendar, ImageIcon,
  Loader2, AlertCircle, RefreshCw, FileWarning, Maximize2,
  X,
} from 'lucide-react';
import { api, type DatasetVersion, type DatasetImage } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { formatDate } from '../../lib/utils';
import { useLang } from '../../contexts/LangContext';

const PAGE_SIZE = 4;

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// ── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ image, onClose }: { image: DatasetImage; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="relative max-w-4xl max-h-[90vh] w-full flex flex-col gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-300 font-mono truncate">{image.filename}</p>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <img
            src={image.url}
            alt={image.filename}
            className="max-h-[80vh] w-full object-contain rounded-xl border border-zinc-800"
          />
          <p className="text-xs text-zinc-600 text-right">{formatBytes(image.size_bytes)}</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Image card ────────────────────────────────────────────────────────────────

function ImageCard({ image, index, onClick }: {
  image: DatasetImage;
  index: number;
  onClick: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError]   = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
      onClick={onClick}
      className="group relative aspect-square rounded-xl overflow-hidden border border-zinc-800/80 bg-zinc-900 cursor-pointer hover:border-zinc-600 transition-colors duration-150"
    >
      {/* Skeleton */}
      {!loaded && !error && (
        <div className="absolute inset-0 bg-zinc-800/60 animate-pulse" />
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-zinc-600">
          <FileWarning className="w-6 h-6" />
          <p className="text-[10px]">Load failed</p>
        </div>
      )}

      {/* Image */}
      {!error && (
        <img
          src={image.url}
          alt={image.filename}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* Hover overlay */}
      {loaded && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-150 flex items-end">
          <div className="w-full p-2.5 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
            <p className="text-[10px] text-white font-mono truncate leading-none">{image.filename}</p>
            <p className="text-[9px] text-zinc-400 mt-0.5">{formatBytes(image.size_bytes)}</p>
          </div>
          <Maximize2 className="absolute top-2 right-2 w-3.5 h-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
        </div>
      )}
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function DatasetDetailPage() {
  const { id, dvId } = useParams<{ id: string; dvId: string }>();
  const navigate      = useNavigate();
  const { t }         = useLang();
  const projectId     = Number(id);
  const datasetId     = Number(dvId);

  const [dv, setDv]           = useState<DatasetVersion | null>(null);
  const [images, setImages]   = useState<DatasetImage[]>([]);
  const [total, setTotal]     = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset]   = useState(0);

  const [loadingMeta,   setLoadingMeta]   = useState(true);
  const [loadingImages, setLoadingImages] = useState(true);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [error,         setError]         = useState('');
  const [lightbox,      setLightbox]      = useState<DatasetImage | null>(null);

  // Fetch dataset version metadata
  useEffect(() => {
    setLoadingMeta(true);
    api.datasetVersions.get(datasetId)
      .then(setDv)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingMeta(false));
  }, [datasetId]);

  // Fetch first page of images
  const fetchImages = useCallback(async (currentOffset: number, append = false) => {
    if (!append) setLoadingImages(true);
    else         setLoadingMore(true);
    try {
      const res = await api.datasetVersions.listImages(datasetId, currentOffset, PAGE_SIZE);
      setImages((prev) => append ? [...prev, ...res.items] : res.items);
      setTotal(res.total);
      setHasMore(res.has_more);
      setOffset(currentOffset + res.items.length);
    } catch (e: unknown) {
      if (!append) setError((e as Error).message);
    } finally {
      setLoadingImages(false);
      setLoadingMore(false);
    }
  }, [datasetId]);

  useEffect(() => { fetchImages(0); }, [fetchImages]);

  const handleLoadMore = () => fetchImages(offset, true);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loadingMeta) {
    return (
      <div className="flex flex-col items-center justify-center py-28 gap-3 text-zinc-600">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500/50" />
        <span className="text-sm">{t('loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-5 bg-red-500/8 border border-red-500/20 rounded-xl text-red-400 text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!dv) return null;

  return (
    <div className="flex flex-col gap-12">

      {/* ── Back nav ─────────────────────────────────────────────── */}
      <button
        onClick={() => navigate(`/projects/${projectId}/datasets`)}
        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200 transition-colors group w-fit"
      >
        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform duration-150" />
        Back to Datasets
      </button>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-start gap-5">
        <div className="w-12 h-12 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center shrink-0 mt-0.5">
          <Database className="w-5 h-5 text-zinc-400" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">{dv.name}</h1>
            <Badge variant="muted">{dv.version}</Badge>
            <Badge variant={dv.label_type === 'human' ? 'success' : 'warning'} dot>
              {dv.label_type === 'human' ? t('dv_labeled') : t('dv_unlabeled')}
            </Badge>
          </div>
          {dv.description && (
            <p className="text-sm text-zinc-500 leading-relaxed">{dv.description}</p>
          )}
          <div className="flex items-center gap-5 flex-wrap">
            <span className="text-xs text-zinc-600 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              {formatDate(dv.created_at)}
            </span>
            <span className="text-xs text-zinc-600 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 shrink-0" />
              {loadingImages ? '…' : total} images
            </span>
          </div>
          <p className="text-xs text-zinc-700 font-mono bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 w-fit max-w-full truncate">
            {dv.storage_path}files/
          </p>
        </div>
      </div>

      {/* ── Image grid ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm font-medium text-zinc-300">
            {loadingImages
              ? 'Loading images…'
              : `Showing ${images.length} of ${total} images`}
          </p>
          <button
            onClick={() => fetchImages(0)}
            disabled={loadingImages}
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingImages ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Loading skeleton */}
        {loadingImages && images.length === 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="aspect-square rounded-xl bg-zinc-800/60 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loadingImages && images.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-zinc-800 rounded-xl">
            <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
              <ImageIcon className="w-6 h-6 text-zinc-600" />
            </div>
            <p className="text-base font-medium text-zinc-300">No images found</p>
            <p className="text-sm text-zinc-600 mt-2">Upload images to this dataset version to see them here.</p>
          </div>
        )}

        {/* Grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {images.map((img, i) => (
              <ImageCard
                key={img.key}
                image={img}
                index={i}
                onClick={() => setLightbox(img)}
              />
            ))}
            {/* Skeleton for load more in progress */}
            {loadingMore && Array.from({ length: 4 }).map((_, i) => (
              <div key={`skel-${i}`} className="aspect-square rounded-xl bg-zinc-800/60 animate-pulse" />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && !loadingImages && (
          <div className="flex justify-center mt-8">
            <Button
              variant="secondary"
              onClick={handleLoadMore}
              loading={loadingMore}
              icon={!loadingMore ? <ImageIcon className="w-3.5 h-3.5" /> : undefined}
            >
              {loadingMore ? 'Loading…' : `Load more  (${images.length} / ${total})`}
            </Button>
          </div>
        )}
      </div>

      {/* ── Lightbox ─────────────────────────────────────────────── */}
      {lightbox && <Lightbox image={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
