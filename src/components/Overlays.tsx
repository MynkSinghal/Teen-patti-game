'use client';
import { motion } from 'motion/react';
import { Crown, Eye, Trophy } from 'lucide-react';
import { useState } from 'react';
import type { CommandInput } from '@/hooks/useRoom';
import type { ClientView } from '@/server/view';
import { jokerNote } from '@/lib/cards-ui';
import { Avatar } from './Avatar';
import { Confetti } from './Confetti';
import { PlayingCard } from './PlayingCard';
import { RoundStarter } from './RoundStarter';

const SHARE: Record<string, string> = { high: 'High hand', low: 'Low hand' };

export function RoundEnd({ view, send, busy }: { view: ClientView; send: (c: CommandInput) => Promise<boolean>; busy: boolean }) {
  const { room, me } = view;
  const game = room.game;
  if (!game || game.phase !== 'ended' || !game.result) return null;
  const r = game.result;
  const gp = (id: string) => game.players.find((p) => p.id === id);
  const name = (id: string) => (id === me.playerId ? 'You' : room.players.find((p) => p.id === id)?.name ?? gp(id)?.name ?? 'Player');
  const meP = room.players.find((p) => p.id === me.playerId);
  const broke = !!meP && meP.balance < room.settings.boot;
  const myPayout = r.payouts.filter((p) => p.playerId === me.playerId).reduce((s, p) => s + p.amount, 0);
  const myIn = gp(me.playerId)?.committed ?? 0;
  const iWon = myPayout > 0;
  const net = myPayout - myIn;
  const winnerIds = [...new Set(r.payouts.map((p) => p.playerId))];
  const multi = winnerIds.length > 1;
  const revealed = new Map(r.reveal.map((x) => [x.playerId, x]));
  // Everyone who did not pack: show their cards if revealed, otherwise a face-down hand.
  const standing = game.players.filter((p) => !p.folded);
  const canReveal = r.reason === 'last_standing' && winnerIds.includes(me.playerId) && !revealed.has(me.playerId);
  const sessionProfit = (id: string) => {
    const v = room.players.find((x) => x.id === id)?.profit;
    return v === undefined ? '' : `${v > 0 ? '+' : ''}${v}`;
  };
  const nets = game.players
    .map((p) => ({ p, net: r.payouts.filter((x) => x.playerId === p.id).reduce((s, x) => s + x.amount, 0) - p.committed }))
    .sort((a, b) => b.net - a.net);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 rounded-2xl border border-gold/50 bg-panel p-4" data-testid="round-result">
      {iWon && <Confetti />}
      <div className="text-center">
        <Trophy className="mx-auto text-gold" size={24} />
        <p className="mt-1 font-display text-2xl text-gold-soft" data-testid="winner-text">
          {multi ? 'Pot shared' : `${name(winnerIds[0]!)} won ${r.payouts[0]!.amount}`}
        </p>
        <p className="text-xs text-muted">{r.reason === 'show' ? 'Decided by a show' : r.reason === 'showdown' ? 'All-in showdown' : 'Everyone else packed'} · pot {r.pot}</p>
        <p className={`mt-1 text-sm font-semibold ${net >= 0 ? 'text-gold-soft' : 'text-danger'}`} data-testid="my-net">
          {myIn > 0 ? (iWon ? `You won ${myPayout} (net ${net >= 0 ? '+' : ''}${net})` : `You lost ${myIn}`) : ''}
        </p>
      </div>

      {r.pots && r.pots.length > 1 && (
        <ul className="space-y-1 rounded-xl bg-panel-2 p-2 text-xs" data-testid="pots">
          {r.pots.map((pt, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="text-muted">{i === 0 ? 'Main pot' : `Side pot ${i}`} · {pt.amount}</span>
              <span className="truncate text-right text-gold-soft">{pt.winners.map((id) => name(id)).join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
      <ul className="space-y-1.5" data-testid="winners">
        {r.payouts.map((p, i) => {
          const rev = revealed.get(p.playerId);
          return (
            <li key={i} className="flex items-center gap-3 rounded-xl bg-gold/10 px-3 py-2 ring-1 ring-gold/40">
              <Avatar name={name(p.playerId)} size={34} crown />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{name(p.playerId)}{multi && <span className="ml-1 text-xs text-gold-soft">{p.share && SHARE[p.share] ? `· ${SHARE[p.share]}` : '· tie'}</span>}</p>
                {rev && <p className="text-[11px] text-paper/70">{rev.label}</p>}
              </div>
              <span className="font-display text-xl text-gold-soft tabular-nums">+{p.amount}</span>
            </li>
          );
        })}
      </ul>

      <div>
        <p className="label">Hands at the end</p>
        <ul className="space-y-2" data-testid="end-hands">
          {standing.map((p) => {
            const rev = revealed.get(p.id);
            const isWinner = winnerIds.includes(p.id);
            const isMe = p.id === me.playerId;
            const own = isMe ? me.private?.cards ?? null : null;
            return (
              <li key={p.id} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${isWinner ? 'bg-gold/10' : 'bg-panel-2'}`}>
                <span className="flex w-[74px] items-center gap-1 text-xs"><Crown size={12} className={isWinner ? 'text-gold' : 'invisible'} /><span className="truncate">{name(p.id)}</span></span>
                <span className="flex gap-0.5">
                  {[0, 1, 2].map((i) => <PlayingCard key={i} card={rev?.cards[i] ?? (own ? own[i] : null)} faceDown={!rev && !own} size="sm" delay={i * 0.12} />)}
                </span>
                <span className="min-w-0 flex-1 text-right text-[11px] text-paper/80">
                  {rev ? rev.label : own ? 'Your hand (private)' : 'Not shown'}
                  {rev && jokerNote(rev.jokerAs) && <span className="block text-gold-soft" data-testid="end-joker-note">{jokerNote(rev.jokerAs)}</span>}
                </span>
              </li>
            );
          })}
        </ul>
        {game.players.some((p) => p.folded) && <p className="mt-1 text-[11px] text-muted">Packed hands stay private.</p>}
        {canReveal && (
          <button className="btn btn-ghost mt-2 flex w-full items-center justify-center gap-2" disabled={busy} onClick={() => send({ type: 'reveal' })} data-testid="reveal-btn">
            <Eye size={16} /> Show my cards to the table
          </button>
        )}
      </div>

      <div>
        <p className="label">Round result</p>
        <ul className="divide-y divide-line text-sm" data-testid="scoreboard">
          {nets.map(({ p, net: n }) => (
            <li key={p.id} className="flex items-center justify-between py-1">
              <span className={p.folded ? 'text-muted' : ''}>{name(p.id)}{p.folded && ' · packed'}{p.allIn && ' · all-in'}</span>
              <span className="flex items-baseline gap-3">
                <span className={`tabular-nums ${n > 0 ? 'text-gold-soft' : n < 0 ? 'text-danger' : 'text-muted'}`}>{n > 0 ? '+' : ''}{n}</span>
                <span className="w-16 text-right text-[11px] text-muted" title="Net result over the whole session">total {sessionProfit(p.id)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {meP && meP.balance < room.settings.startingChips && (broke || meP.balance < room.settings.startingChips / 2) && <TopUp room={room} me={meP} send={send} busy={busy} />}
      <RoundStarter view={view} send={send} busy={busy} startLabel="Deal next round" />
      {room.nextRoundAt && <p className="text-center text-xs text-muted">The next round starts automatically soon.</p>}
    </motion.div>
  );
}

function TopUp({ room, me, send, busy }: { room: ClientView['room']; me: ClientView['room']['players'][number]; send: (c: CommandInput) => Promise<boolean>; busy: boolean }) {
  const left = room.settings.maxRebuys - me.rebuys;
  if (left <= 0) {
    return <p className="rounded-xl bg-panel-2 p-2 text-center text-xs text-muted" data-testid="no-rebuys">No top-ups left{room.settings.maxRebuys === 0 ? ' (turned off at this table)' : ''}. You have {me.balance.toLocaleString()} chips.</p>;
  }
  return (
    <button className="btn btn-ghost w-full" disabled={busy} onClick={() => send({ type: 'rebuy' })} data-testid="rebuy">
      Top up to {room.settings.startingChips.toLocaleString()} · {left} left <span className="opacity-70">(counts against your profit)</span>
    </button>
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
          <span className="block text-[10px] text-muted">You: {last.yourLabel}{jokerNote(last.yourJokerAs) ? ` · ${jokerNote(last.yourJokerAs)}` : ''}</span>
        </div>
        <div>
          <div className="flex gap-0.5">{last.otherCards.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)}</div>
          <span className="block text-[10px] text-muted">{other}: {last.otherLabel}{jokerNote(last.otherJokerAs) ? ` · ${jokerNote(last.otherJokerAs)}` : ''}</span>
        </div>
      </div>
      <button className="mt-2 text-xs text-gold underline" onClick={() => setDismissed(key)}>Dismiss</button>
    </motion.div>
  );
}
