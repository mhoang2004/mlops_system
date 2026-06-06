import { useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, description, children, className }: ModalProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-modal
            aria-labelledby="modal-title"
            className={cn(
              'relative w-full max-w-lg',
              'bg-[#111113] rounded-xl',
              'border border-zinc-800',
              'shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_24px_64px_rgba(0,0,0,0.7)]',
              className,
            )}
          >
            <div className="absolute inset-x-0 top-0 h-px rounded-t-xl bg-gradient-to-r from-transparent via-white/8 to-transparent pointer-events-none" />

            {/* Modal header — well-padded */}
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b border-zinc-800/80">
              <div>
                <h2 id="modal-title" className="text-sm font-semibold text-zinc-100 tracking-tight">
                  {title}
                </h2>
                {description && (
                  <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">{description}</p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Đóng"
                className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all duration-150"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body — generous padding */}
            <div className="px-6 py-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
