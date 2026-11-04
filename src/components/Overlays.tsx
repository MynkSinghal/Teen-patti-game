'use client';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronUp, Eye, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CommandInput } from '@/hooks/useRoom';
import { jokerNote } from '@/lib/cards-ui';
import type { ClientView } from '@/server/view';
import { Confetti } from './Confetti';
import { PlayingCard } from './PlayingCard';
import { RoundStarter } from './RoundStarter';

const SHARE: Record<string, string> = { high: 'high', low: 'low' };

/** Centred Victory panel over the table. Everything on one screen; the dealer opens the game picker from here. */
export function RoundEnd({ view, send, busy }: { view: ClientView; send: (c: CommandInput) => Promise<boolean>; busy: boolean }) {
  const { room, me } = view;
  const game = room.game;
  const ended = !!game && game.phase === 'ended' && !!game.result;
  const [open, setOpen] = useState(true);
  const [picker, setPicker] = useState(false);
  useEffect(() => { setOpen(true); setPicker(false); }, [game?.round]);
  if (!ended || !game?.result) return null;
  const r = game.result;
  const gp = (id: string) => game.players.find((p) => p.id === id);
  const name = (id: string) => (id === me.playerId ? 'You' : room.players.find((p) => p.id === id)?.name ?? gp(id)?.name ?? 'Player');
  const meP = room.players.find((p) => p.id === me.playerId);
  const myPayout = r.payouts.filter((p) => p.playerId === me.playerId).reduce((s, p) => s + p.amount, 0);
  const myIn = gp(me.playerId)?.committed ?? 0;
  const iWon = myPayout > 0;
  const net = myPayout - myIn;
  const winnerIds = [...new Set(r.payouts.map((p) => p.playerId))];
  const multi = winnerIds.length > 1;
  const revealed = new Map(r.reveal.map((x) => [x.playerId, x]));
  const standing = game.players.filter((p) => !p.folded);
  const canReveal = r.reason === 'last_standing' && winnerIds.includes(me.playerId) && !revealed.has(me.playerId);
  const nets = game.players.map((p) => ({ p, n: r.payouts.filter((x) => x.playerId === p.id).reduce((s, x) => s + x.amount, 0) - p.committed })).sort((a, b) => b.n - a.n);
  const dealer = room.players.find((p) => p.id === room.nextDealerId);
  const iDeal = dealer?.id === me.playerId || (me.isHost && room.settings.variationChooser === 'host') || (me.isHost && room.settings.variation !== 'dealers_choice');
  const low = !!meP && meP.balance < room.settings.startingChips && meP.balance < room.settings.boot * 3;
  const rebuysLeft = meP ? room.settings.maxRebuys - meP.rebuys : 0;
  const title = iWon ? (multi ? 'Shared win' : 'Victory') : multi ? 'Pot shared' : 'Round over';
  const reasonText = r.reason === 'show' ? 'Decided by a show' : r.reason === 'showdown' ? 'All-in showdown' : 'Everyone else packed';

  return (
    <>
      {iWon && open && <Confetti />}
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-30 grid place-items-center bg-black/70 p-2 backdrop-blur-[1px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} className="mh-panel-strong relative w-full max-w-[560px] px-5 py-3.5" data-testid="round-result">
              <button aria-label="View the table" className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full text-muted ring-1 ring-line" onClick={() => setOpen(false)}><X size={14} /></button>
              <h2 className="text-center font-display text-[28px] font-extrabold uppercase leading-none tracking-[0.28em]" style={{ background: 'linear-gradient(#fff4c6,#d8b45a 55%,#8f6d22)', WebkitBackgroundClip: 'text', color: 'transparent' }}>{title}</h2>
              <p className="caps mt-1 text-center text-[9.5px] text-[#cdb87a]" data-testid="winner-text">
                {multi ? r.payouts.map((p) => `${name(p.playerId)} +${p.amount}${p.share && SHARE[p.share] ? ` (${SHARE[p.share]})` : ''}`).join(' · ') : `${name(winnerIds[0]!)} won ${r.payouts[0]!.amount}`} · {reasonText}
              </p>

              <div className="mt-2.5 flex justify-center gap-2.5 overflow-x-auto pb-1" data-testid="end-hands">
                {standing.map((p) => {
                  const rev = revealed.get(p.id);
                  const own = p.id === me.playerId ? me.private?.cards ?? null : null;
                  const win = winnerIds.includes(p.id);
                  return (
                    <div key={p.id} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-center ${win ? 'bg-[rgba(216,180,90,.12)] shadow-[inset_0_0_0_1px_#d8b45a]' : 'bg-[#120c06] shadow-[inset_0_0_0_1px_#3a2c18]'}`}>
                      <p className="font-display text-[10.5px] font-semibold">{win && '👑 '}{name(p.id)}</p>
                      <div className="mt-1 flex justify-center gap-1">{[0, 1, 2].map((i) => <PlayingCard key={i} card={rev?.cards[i] ?? (own ? own[i] : null)} faceDown={!rev && !own} size="sm" delay={i * 0.1} />)}</div>
                      <p className={`num mt-0.5 text-[14px] leading-tight ${win ? 'text-gold-soft' : 'text-[#cdb87a]'}`}>{rev ? rev.label : own ? 'Your hand (private)' : 'Not shown'}</p>
                      {rev && jokerNote(rev.jokerAs) && <p className="text-[9.5px] text-gold-soft" data-testid="end-joker-note">{jokerNote(rev.jokerAs)}</p>}
                    </div>
                  );
                })}
              </div>
              {r.pots && r.pots.length > 1 && (
                <p className="mt-1 text-center text-[10.5px] text-[#cdb87a]" data-testid="pots">
                  {r.pots.map((pt, i) => `${i === 0 ? 'Main pot' : `Side pot ${i}`} ${pt.amount} → ${pt.winners.map(name).join(', ')}`).join(' · ')}
                </p>
              )}

              <div className="mt-2.5 flex items-center gap-3">
                <div className="shrink-0 text-center" data-testid="my-net">
                  <p className={`num text-[30px] leading-none ${net >= 0 ? 'text-gold-soft' : 'text-danger'}`}>{myIn > 0 ? `${net >= 0 ? '+' : ''}${net}` : '·'}</p>
                  <p className="caps text-[8px] text-muted">{myIn > 0 ? (iWon ? `You won ${myPayout}` : `You lost ${myIn}`) : 'Watching'}</p>
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-0.5 text-[10.5px]" data-testid="scoreboard">
                  {nets.map(({ p, n }) => (
                    <span key={p.id} className={p.folded ? 'text-muted' : ''}>{name(p.id)}{p.folded ? ' · packed' : ''}{p.allIn ? ' · all-in' : ''} <b className={n > 0 ? 'text-gold-soft' : n < 0 ? 'text-danger' : 'text-muted'}>{n > 0 ? '+' : ''}{n}</b></span>
                  ))}
                </div>
                <div className="flex w-[170px] shrink-0 flex-col gap-1.5">
                  {canReveal && <button className="btn btn-ghost !min-h-[34px] text-[11px] inline-flex items-center justify-center gap-1" disabled={busy} onClick={() => send({ type: 'reveal' })} data-testid="reveal-btn"><Eye size={13} /> Show my cards</button>}
                  {low && (rebuysLeft > 0
                    ? <button className="btn btn-ghost !min-h-[34px] text-[11px]" disabled={busy} onClick={() => send({ type: 'rebuy' })} data-testid="rebuy">Top up ({rebuysLeft} left)</button>
                    : <p className="text-center text-[10px] text-muted" data-testid="no-rebuys">No top-ups left</p>)}
                  {iDeal ? (
                    <button className="btn btn-gold !min-h-[40px] text-[12.5px]" onClick={() => setPicker(true)} data-testid="choose-game">Pick next game</button>
                  ) : (
                    <p className="text-center text-[10.5px] leading-snug text-muted" data-testid="waiting-dealer">{dealer ? <>Waiting for <b className="text-paper">{dealer.name}</b> to pick the next game</> : 'Waiting for the next round'}</p>
                  )}
                  {!iDeal && me.isHost && <button className="text-[10px] text-gold underline" onClick={() => setPicker(true)}>Host: pick for them</button>}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {!open && (
        <button className="btn btn-gold fixed bottom-3 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-1 !min-h-[34px] text-[11px]" onClick={() => setOpen(true)} data-testid="reopen-result"><ChevronUp size={14} /> Round result</button>
      )}
      <AnimatePresence>
        {picker && (
          <motion.div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPicker(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="mh-panel-strong w-full max-w-[560px] p-4" onClick={(e) => e.stopPropagation()} data-testid="game-picker">
              <RoundStarter view={view} send={send} busy={busy} startLabel="Deal next round" onStarted={() => setPicker(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
