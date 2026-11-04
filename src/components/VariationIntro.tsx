'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { rankChar } from '@/engine/cards';
import { VARIATION_DOCS } from '@/engine/variations';
import { useUI } from '@/store/ui';
import type { ClientView } from '@/server/view';

/** When a non-classic round starts, say plainly what's different, and for joker games exactly what to do. */
export function VariationIntro({ view }: { view: ClientView }) {
  const g = view.room.game;
  const key = g ? `tp_intro_${view.room.code}_${g.round}` : null;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!g || !key || g.phase === 'ended' || g.variation === 'classic') return;
    let seen = false;
    try { seen = sessionStorage.getItem(key) === '1'; } catch { /* ignore */ }
    if (!seen) setOpen(true);
  }, [key, g?.variation, g?.phase, g]);
  if (!g) return null;
  const close = () => { setOpen(false); try { if (key) sessionStorage.setItem(key, '1'); } catch { /* ignore */ } };
  const doc = VARIATION_DOCS[g.variation];
  const hasJokers = g.jokerRanks.length > 0 || g.lowestCardJoker;
  const jokerText = g.lowestCardJoker ? 'the lowest card in your hand' : g.jokerRanks.map((r) => `${rankChar(r)}s`).join(', ');
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} className="max-h-full w-full max-w-md overflow-y-auto rounded-3xl border border-gold/50 bg-panel p-5" role="dialog" aria-label="This round's game" data-testid="variation-intro">
            <p className="text-[11px] uppercase tracking-[0.25em] text-muted">This round</p>
            <h2 className="font-display text-3xl text-gold">{g.variationName}</h2>
            <p className="text-sm text-gold-soft">{doc?.tagline}</p>
            {hasJokers ? (
              <ol className="mt-4 space-y-2 text-sm">
                <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold font-bold text-ink">1</span><span><b>Jokers this round: {jokerText}.</b> A joker can stand in for any card.</span></li>
                <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold font-bold text-ink">2</span><span>Tap <b>See cards</b> to look at your hand.</span></li>
                <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold font-bold text-ink">3</span><span>Your jokers <b>automatically count as your best possible card</b>. You don't have to do anything.</span></li>
                <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold font-bold text-ink">4</span><span>Optional: <b>tap a glowing joker</b> to choose which card you announce. Everyone sees it if your hand is shown.</span></li>
              </ol>
            ) : (
              <ul className="mt-3 space-y-1.5 text-sm text-paper/90">{doc?.rules.slice(0, 3).map((r) => <li key={r} className="flex gap-2"><span className="text-gold">♠</span>{r}</li>)}</ul>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button className="btn btn-ghost" onClick={() => { close(); useUI.getState().open('rules', g.variation); }}>Full rules</button>
              <button className="btn btn-gold" onClick={close} data-testid="variation-intro-ok">Got it</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
