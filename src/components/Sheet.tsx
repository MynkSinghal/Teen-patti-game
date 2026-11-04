'use client';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect } from 'react';

/** Bottom sheet (or right drawer) with backdrop, ESC to close and focus-friendly semantics. */
export function Sheet({ open, onClose, title, children, side = 'bottom', testId }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; side?: 'bottom' | 'right'; testId?: string }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const panel = side === 'bottom'
    ? 'inset-x-0 bottom-0 mx-auto max-h-[calc(var(--app-h)*0.92)] max-w-xl !rounded-b-none'
    : 'inset-y-0 right-0 w-[min(92%,380px)] !rounded-r-none';
  const from = side === 'bottom' ? { y: '100%' } : { x: '100%' };
  const to = side === 'bottom' ? { y: 0 } : { x: 0 };
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
          <motion.div className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className={`mh-panel-strong absolute flex flex-col ${panel}`}
            initial={reduce ? false : from}
            animate={to}
            exit={reduce ? { opacity: 0 } : from}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-3">
              <h2 className="font-display text-[17px] font-extrabold uppercase tracking-[0.18em] text-gold">{title}</h2>
              <button aria-label="Close" onClick={onClose} className="medallion grid h-8 w-8 place-items-center text-gold-soft"><X size={16} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 safe-bottom">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
