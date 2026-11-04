'use client';
import { AnimatePresence, motion } from 'motion/react';
import { Trophy } from 'lucide-react';
import { useState } from 'react';
import type { CommandInput } from '@/hooks/useRoom';
import type { ClientView } from '@/server/view';
import { Countdown } from './Countdown';
import { PlayingCard } from './PlayingCard';

export function RoundEnd({ view, send, busy }: { view: ClientView; send: (c: CommandInput) => Promise<boolean>; busy: boolean }) {
  const { room, me } = view;
  const game = room.game;
  const [dealerPick, setDealerPick] = useState('classic');
  if (!game || game.phase !== 'ended' || !game.result) return null;
  const r = game.result;
  const name = (id: string) => room.players.find((p) => p.id === id)?.name ?? 'Player';
  const meP = room.players.find((p) => p.id === me.playerId);
  const broke = !!meP && meP.balance < room.settings.boot;
  const iWon = r.payouts.some((p) => p.playerId === me.playerId);
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-gold/50 bg-panel p-4 text-center"
        data-testid="round-result"
      >
        <Trophy className="mx-auto text-gold" size={22} />
        <p className="mt-1 font-display text-xl text-gold-soft" data-testid="winner-text">
          {r.payouts.map((p) => `${p.playerId === me.playerId ? 'You' : name(p.playerId)} won ${p.amount}${p.share && p.share !== 'all' ? ` (${p.share})` : ''}`).join(' · ')}
        </p>
        <p className="text-xs text-muted">
          {r.reason === 'show' ? 'Decided by a show' : 'Everyone else packed'}
          {iWon ? ' — nice hand!' : ''}
        </p>
        {r.reveal.length > 0 && (
          <ul className="mt-2 space-y-2">
            {r.reveal.map((x) => (
              <li key={x.playerId} className="flex items-center justify-center gap-2 text-sm">
                <span className="w-16 truncate text-right text-muted">{name(x.playerId)}</span>
                <span className="flex gap-0.5">{x.cards.map((c, i) => <PlayingCard key={i} card={c} size="sm" delay={i * 0.08} />)}</span>
                <span className="w-28 text-left text-xs text-paper/80">{x.label}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 space-y-2">
          {broke && (
            <button className="btn btn-ghost w-full" disabled={busy} onClick={() => send({ type: 'rebuy' })} data-testid="rebuy">Top up to {room.settings.startingChips} chips</button>
          )}
          {me.isHost ? (
            <>
              {room.settings.variation === 'dealers_choice' && (
                <select className="input" value={dealerPick} onChange={(e) => setDealerPick(e.target.value)} aria-label="Next variation">
                  {['classic', 'muflis', 'ak47', 'joker', 'nine99', 'ten20', 'hilo'].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              )}
              <button className="btn btn-gold w-full" disabled={busy} onClick={() => send({ type: 'start_round', ...(room.settings.variation === 'dealers_choice' ? { variation: dealerPick as never } : {}) })} data-testid="next-round">
                Next round
              </button>
            </>
          ) : (
            <p className="text-xs text-muted">Waiting for the host to deal the next round…</p>
          )}
          {room.nextRoundAt && (
            <p className="text-xs text-muted">Next round starts automatically in <Countdown deadline={room.nextRoundAt} />.</p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export function SideshowNote({ view }: { view: ClientView }) {
  const notes = view.me.private?.notes ?? [];
  const last = notes.at(-1);
  const key = `${view.room.round}-${notes.length}`;
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!last || dismissed === key) return null;
  const other = view.room.players.find((p) => p.id === last.otherId)?.name ?? 'opponent';
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="rounded-xl border border-line bg-panel-2 p-3 text-center" data-testid="sideshow-result">
      <p className="text-sm">
        Sideshow vs <b>{other}</b>: you <b className={last.outcome === 'lost' ? 'text-danger' : 'text-gold-soft'}>{last.outcome === 'tied' ? 'tied' : last.outcome}</b>
      </p>
      <div className="mt-2 flex items-center justify-center gap-4">
        <div>
          <div className="flex gap-0.5">{last.yourCards.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)}</div>
          <span className="text-[10px] text-muted">{last.yourLabel}</span>
        </div>
        <div>
          <div className="flex gap-0.5">{last.otherCards.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)}</div>
          <span className="text-[10px] text-muted">{last.otherLabel}</span>
        </div>
      </div>
      <button className="mt-2 text-xs text-gold underline" onClick={() => setDismissed(key)}>Dismiss</button>
    </motion.div>
  );
}
