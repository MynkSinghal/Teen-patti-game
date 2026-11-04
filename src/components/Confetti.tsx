'use client';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';

const COLORS = ['#c9a24b', '#e3c97f', '#f6f1e4', '#d9534f', '#2f9e6e'];

/** Gold shower for winners. Skipped entirely when the user prefers reduced motion. */
export function Confetti({ count = 44 }: { count?: number }) {
  const reduce = useReducedMotion();
  // height of the visible (possibly rotated) screen
  const [h] = useState(() => (typeof document !== 'undefined' && document.documentElement.dataset.fl ? window.innerWidth : typeof window !== 'undefined' ? window.innerHeight : 800));
  if (reduce) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden data-testid="confetti">
      {Array.from({ length: count }).map((_, i) => {
        const left = (i * 37) % 100;
        const delay = (i % 11) * 0.09;
        const size = 6 + (i % 4) * 3;
        return (
          <motion.span
            key={i}
            initial={{ y: -30, x: 0, rotate: 0, opacity: 1 }}
            animate={{ y: h * 1.05, x: ((i % 7) - 3) * 22, rotate: 360 + i * 40, opacity: [1, 1, 0.9, 0] }}
            transition={{ duration: 2.4 + (i % 5) * 0.3, delay, ease: 'easeIn' }}
            className="absolute top-0 block"
            style={{ left: `${left}%`, width: size, height: size * 0.6, background: COLORS[i % COLORS.length], borderRadius: 2 }}
          />
        );
      })}
    </div>
  );
}
