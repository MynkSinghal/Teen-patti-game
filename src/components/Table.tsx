'use client';
import { motion } from 'motion/react';
import { Coins } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { rankChar } from '@/engine/cards';
import { useUI } from '@/store/ui';
import type { ClientView } from '@/server/view';
import { ChipFlights } from './Chips';
import { RulesButton } from './RulesSheet';
import { Seat } from './Seat';

function PotStack({ pot, boot }: { pot: number; boot: number }) {
  const n = Math.max(1, Math.min(7, Math.round(pot / Math.max(1, boot) / 2)));
  return (
    <div className="relative mx-auto h-8 w-14" aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <motion.span
          key={i}
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="absolute left-1/2 h-[7px] w-9 -translate-x-1/2 rounded-full border border-gold-soft/60 bg-gradient-to-b from-gold-soft to-gold shadow"
          style={{ bottom: i * 3 }}
        />
      ))}
    </div>
  );
}

export function Table({ view }: { view: ClientView }) {
  const { room, me } = view;
  const game = room.game;
  const live = room.status === 'playing' || room.status === 'between';
  const players = room.players;
  const n = players.length;
  const meIdx = Math.max(0, players.findIndex((p) => p.id === me.playerId));

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    players.forEach((p, i) => {
      const k = (i - meIdx + n) % n;
      const a = Math.PI / 2 + (k * 2 * Math.PI) / n; // me at the bottom, others clockwise
      map.set(p.id, { x: 50 + 40 * Math.cos(a), y: 46 + 38 * Math.sin(a) });
    });
    return map;
  }, [players, meIdx, n]);
  const seatPos = useCallback((id: string) => positions.get(id) ?? null, [positions]);
  const winners = new Set(game?.phase === 'ended' ? game.result?.payouts.map((p) => p.playerId) : []);
  const gameIds = new Set(game?.players.map((p) => p.id) ?? []);

  return (
    <div className="relative mx-auto w-full max-w-md" style={{ height: 'min(41dvh, 360px)', minHeight: 290 }} data-testid="table">
      <div className="felt absolute inset-x-[8%] inset-y-[9%] rounded-[50%]" />
      <div className="absolute inset-x-[8%] inset-y-[9%] rounded-[50%] ring-1 ring-inset ring-gold/20" style={{ margin: 7 }} />
      <button
        className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 text-center"
        onClick={() => useUI.getState().open('pot')}
        aria-label="Pot breakdown"
        data-testid="pot-btn"
      >
        {live && game ? (
          <>
            <div className="text-[10px] uppercase tracking-[0.25em] text-gold-soft/80">Pot</div>
            <div className="flex items-center justify-center gap-1 font-display text-4xl text-paper tabular-nums" data-testid="pot">
              <Coins size={20} className="text-gold" />
              <motion.span key={game.pot} initial={{ scale: 1.25 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}>{game.pot.toLocaleString()}</motion.span>
            </div>
            <PotStack pot={game.pot} boot={room.settings.boot} />
            <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[11px] text-gold-soft/90">
              {game.variationName}
              <RulesButton variation={game.variation} className="!h-5 !w-5" />
            </div>
            {game.jokerRanks.length > 0 && <div className="mt-0.5 text-[10px] text-paper/70">Jokers: {game.jokerRanks.map((r) => rankChar(r)).join(' ')}</div>}
            {game.lowestCardJoker && <div className="mt-0.5 text-[10px] text-paper/70">Lowest card is joker</div>}
            {game.phase === 'sideshow' && <div className="mt-1 text-[11px] font-semibold text-gold-soft">Sideshow requested…</div>}
          </>
        ) : (
          <div className="font-display text-lg text-paper/80">Waiting for the round</div>
        )}
      </button>

      {players.map((p) => {
        const pos = positions.get(p.id)!;
        const gp = game?.players.find((x) => x.id === p.id);
        return (
          <div key={p.id} className="absolute" style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%,-50%)' }}>
            <Seat
              name={p.name}
              balance={p.balance}
              isMe={p.id === me.playerId}
              isHost={p.isHost}
              connected={p.connected}
              isDealer={!!game && live && gp?.seat === game.dealerSeat}
              isTurn={!!game && game.phase !== 'ended' && (game.phase === 'sideshow' ? game.pending?.responderId === p.id : game.turnId === p.id)}
              deadline={game?.turnDeadline ?? null}
              turnSeconds={game?.phase === 'sideshow' ? 30 : room.settings.turnSeconds}
              gp={gp}
              inRound={gameIds.has(p.id)}
              winner={winners.has(p.id)}
            />
          </div>
        );
      })}
      {game && <ChipFlights game={game} seatPos={seatPos} />}
    </div>
  );
}
