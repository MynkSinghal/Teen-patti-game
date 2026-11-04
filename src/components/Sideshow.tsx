'use client';
import { AnimatePresence, motion } from 'motion/react';
import { Swords } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CommandInput } from '@/hooks/useRoom';
import { jokerNote } from '@/lib/cards-ui';
import { haptic, play } from '@/lib/sound';
import type { ClientView } from '@/server/view';
import { Avatar } from './Avatar';
import { useSecondsLeft } from './Countdown';
import { PlayingCard } from './PlayingCard';

const nameOf = (view: ClientView, id?: string | null) =>
  !id ? 'Someone' : id === view.me.playerId ? 'You' : view.room.players.find((p) => p.id === id)?.name ?? view.room.game?.players.find((p) => p.id === id)?.name ?? 'Someone';

function Ring({ deadline, total }: { deadline: number | null; total: number }) {
  const left = useSecondsLeft(deadline) ?? 0;
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid h-14 w-14 place-items-center">
      <svg width="56" height="56" className="absolute -rotate-90">
        <circle cx="28" cy="28" r={r} stroke="rgba(255,255,255,.1)" strokeWidth="4" fill="none" />
        <circle cx="28" cy="28" r={r} stroke={left <= 8 ? '#e0584b' : '#c9a24b'} strokeWidth="4" fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, left / total))} style={{ transition: 'stroke-dashoffset .3s linear' }} />
      </svg>
      <span className="font-display text-lg tabular-nums">{left}</span>
    </div>
  );
}

/** The person being asked gets a big, unmissable decision; the asker waits; everyone else gets a quiet banner. */
export function SideshowLayer({ view, send, busy }: { view: ClientView; send: (c: CommandInput) => Promise<boolean>; busy: boolean }) {
  const g = view.room.game;
  const pend = g?.phase === 'sideshow' ? g.pending : null;
  const me = view.me.playerId;
  const asked = !!pend && pend.responderId === me;
  const asking = !!pend && pend.requesterId === me;
  const total = 30;

  useEffect(() => {
    if (asked) haptic([80, 60, 80, 60, 120]);
  }, [asked]);

  return (
    <AnimatePresence>
      {pend && asked && (
        <motion.div key="ask" className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
            className="w-full max-w-sm rounded-3xl border border-gold/60 bg-panel p-5 text-center shadow-[0_0_60px_rgba(201,162,75,.25)]"
            role="alertdialog" aria-label="Sideshow request" data-testid="sideshow-prompt"
          >
            <div className="flex items-center justify-center gap-3">
              <Avatar name={nameOf(view, pend.requesterId)} size={44} />
              <Swords className="text-gold" />
              <Avatar name={view.room.players.find((p) => p.id === me)?.name ?? 'You'} size={44} />
            </div>
            <h2 className="mt-3 font-display text-2xl text-gold">{nameOf(view, pend.requesterId)} wants a sideshow</h2>
            <p className="mt-1 text-sm text-paper/85">If you accept, your hand and theirs are compared <b>privately</b>. The weaker hand packs. Only you two see the cards.</p>
            {view.room.settings.tieHandling === 'challenger_loses' && <p className="mt-1 text-xs text-muted">On an exact tie, {nameOf(view, pend.requesterId)} (who asked) packs.</p>}
            <div className="mt-3 flex items-center justify-center"><Ring deadline={g!.turnDeadline} total={total} /></div>
            <p className="text-[11px] text-muted">No answer in time counts as Decline.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="btn btn-ghost !min-h-12" disabled={busy} onClick={() => send({ type: 'sideshow_respond', accept: false })} data-testid="sideshow-decline">Decline</button>
              <button className="btn btn-gold !min-h-12" disabled={busy} onClick={() => send({ type: 'sideshow_respond', accept: true })} data-testid="sideshow-accept">Accept</button>
            </div>
          </motion.div>
        </motion.div>
      )}
      {pend && asking && (
        <motion.div key="wait" className="fixed inset-x-0 top-14 z-30 mx-auto flex w-fit max-w-[92%] items-center gap-3 rounded-2xl border border-gold/50 bg-panel/95 px-4 py-2.5 shadow-xl" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} data-testid="sideshow-waiting">
          <Ring deadline={g!.turnDeadline} total={total} />
          <div className="text-sm">
            <p className="font-semibold">Sideshow asked</p>
            <p className="text-paper/80">Waiting for {nameOf(view, pend.responderId)} to accept or decline…</p>
          </div>
        </motion.div>
      )}
      {pend && !asked && !asking && (
        <motion.div key="spect" className="fixed inset-x-0 top-14 z-30 mx-auto w-fit max-w-[92%] rounded-full border border-line bg-panel/95 px-4 py-2 text-sm shadow-xl" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} data-testid="sideshow-spectator">
          <Swords size={14} className="mr-1.5 inline text-gold" />
          {nameOf(view, pend.requesterId)} asked {nameOf(view, pend.responderId)} for a sideshow…
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Private result for the two players involved: both hands side by side, clear verdict. */
export function SideshowResult({ view }: { view: ClientView }) {
  const notes = view.me.private?.notes ?? [];
  const key = `${view.room.round}:${notes.length}`;
  const seenKey = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (seenKey.current === null) { seenKey.current = key; return; } // don't pop old results on load
    if (key !== seenKey.current && notes.length > 0) {
      seenKey.current = key;
      setOpen(true);
      const last = notes.at(-1)!;
      play(last.outcome === 'lost' ? 'lose' : 'win');
    }
  }, [key, notes]);
  const last = notes.at(-1);
  if (!last) return null;
  const other = nameOf(view, last.otherId);
  const verdict = last.outcome === 'won' ? `You won. ${other} packs.` : last.outcome === 'lost' ? `You lost and packed. ${other} stays in.` : 'Exact tie: nobody packs.';
  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full max-w-md rounded-3xl border border-gold/50 bg-panel p-5 text-center" onClick={(e) => e.stopPropagation()} data-testid="sideshow-result">
              <p className="text-[11px] uppercase tracking-[0.25em] text-muted">Private sideshow · only you two see this</p>
              <h2 className={`mt-1 font-display text-3xl ${last.outcome === 'lost' ? 'text-danger' : 'text-gold-soft'}`}>{last.outcome === 'won' ? 'You won the sideshow' : last.outcome === 'lost' ? 'You lost the sideshow' : 'Sideshow tied'}</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  { who: 'You', cards: last.yourCards, label: last.yourLabel, jokers: last.yourJokerAs, win: last.outcome === 'won' },
                  { who: other, cards: last.otherCards, label: last.otherLabel, jokers: last.otherJokerAs, win: last.outcome === 'lost' },
                ].map((h) => (
                  <div key={h.who} className={`rounded-2xl p-3 ${h.win ? 'bg-gold/10 ring-1 ring-gold/60' : 'bg-panel-2'}`}>
                    <p className="text-sm font-semibold">{h.who}{h.win && ' 👑'}</p>
                    <div className="mt-2 flex justify-center gap-1">{h.cards.map((c, i) => <PlayingCard key={i} card={c} size="sm" delay={i * 0.1} />)}</div>
                    <p className="mt-2 text-xs text-paper/85">{h.label}</p>
                    {jokerNote(h.jokers) && <p className="text-[11px] text-gold-soft">{jokerNote(h.jokers)}</p>}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm">{verdict}</p>
              <button className="btn btn-gold mt-4 w-full" onClick={() => setOpen(false)} data-testid="sideshow-result-close">Got it</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {!open && view.room.game?.phase !== 'ended' && (
        <button className="w-full rounded-xl border border-line bg-panel-2 px-3 py-1.5 text-xs text-paper/85" onClick={() => setOpen(true)} data-testid="sideshow-result-chip">
          Sideshow vs {other}: <b className={last.outcome === 'lost' ? 'text-danger' : 'text-gold-soft'}>{last.outcome}</b> · tap to see cards
        </button>
      )}
    </>
  );
}

/** Short public banners so everyone understands what just happened (no private info). */
export function TableBanner({ view }: { view: ClientView }) {
  const g = view.room.game;
  const [msg, setMsg] = useState<string | null>(null);
  const last = useRef<{ round: number; seq: number } | null>(null);
  useEffect(() => {
    if (!g) return;
    const maxSeq = g.log.at(-1)?.seq ?? 0;
    const prev = last.current;
    last.current = { round: g.round, seq: maxSeq };
    if (!prev || prev.round !== g.round) return;
    const fresh = g.log.filter((e) => e.seq > prev.seq);
    let text: string | null = null;
    fresh.forEach((e, i) => {
      if (e.type === 'sideshow_accepted') {
        const packed = fresh.slice(i + 1).find((x) => x.type === 'pack');
        text = packed
          ? `${nameOf(view, e.playerId)} and ${nameOf(view, e.otherId)} compared cards privately. ${nameOf(view, packed.playerId)} packed.`
          : `${nameOf(view, e.playerId)} and ${nameOf(view, e.otherId)} compared cards privately: a tie, both stay in.`;
      }
      if (e.type === 'sideshow_declined') text = `${nameOf(view, e.playerId)} declined ${nameOf(view, e.otherId)}'s sideshow.`;
      if (e.type === 'sideshow_timeout') text = `${nameOf(view, e.playerId)} didn't answer the sideshow in time (declined).`;
      if (e.type === 'allin') text = `${nameOf(view, e.playerId)} is ALL-IN with ${e.amount}!`;
      if (e.type === 'timeout_pack') text = `${nameOf(view, e.playerId)} ran out of time and packed.`;
    });
    if (text) {
      setMsg(text);
      const t = setTimeout(() => setMsg(null), 4500);
      return () => clearTimeout(t);
    }
  }, [g, view]);
  return (
    <AnimatePresence>
      {msg && (
        <motion.div key={msg} className="fixed inset-x-0 top-14 z-30 mx-auto w-fit max-w-[92%] rounded-full border border-gold/40 bg-panel/95 px-4 py-2 text-center text-sm shadow-xl" initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} role="status" data-testid="table-banner">
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
