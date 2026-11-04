'use client';
import { useCallback, useMemo } from 'react';
import type { ClientView } from '@/server/view';
import { PlayingCard } from './PlayingCard';
import { Seat } from './Seat';
import { ChipFlights } from './Chips';
import { Coins } from 'lucide-react';
import { rankChar } from '@/engine/cards';

export function Table({ view }: { view: ClientView }) {
  const { room, me } = view;
  const game = room.game;
  const live = room.status === 'playing' || room.status === 'between';
  const players = room.players;
  const meIdx = Math.max(0, players.findIndex((p) => p.id === me.playerId));
  const n = players.length;

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    players.forEach((p, i) => {
      const k = (i - meIdx + n) % n;
      const a = (Math.PI / 2) + (k * 2 * Math.PI) / n; // me at the bottom, others clockwise
      map.set(p.id, { x: 50 + 41 * Math.cos(a), y: 47 + 40 * Math.sin(a) });
    });
    return map;
  }, [players, meIdx, n]);
  const seatPos = useCallback((id: string) => positions.get(id) ?? null, [positions]);
  const winners = new Set(game?.phase === 'ended' ? game.result?.payouts.map((p) => p.playerId) : []);

  return (
    <div className="relative mx-auto w-full max-w-md" style={{ height: 'min(52dvh, 440px)', minHeight: 330 }} data-testid="table">
      <div className="felt absolute inset-x-[7%] inset-y-[8%] rounded-[50%]" />
      <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 text-center">
        {live && game ? (
          <>
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold-soft/80">Pot</div>
            <div className="flex items-center justify-center gap-1 font-display text-3xl text-paper tabular-nums" data-testid="pot">
              <Coins size={18} className="text-gold" />
              {game.pot.toLocaleString()}
            </div>
            <div className="mt-0.5 text-[11px] text-paper/70">
              Blind {game.blindCost} · Seen {game.seenCost}
            </div>
            <div className="mt-1 text-[11px] text-gold-soft/90">{game.variationName}</div>
            {game.jokerRanks.length > 0 && (
              <div className="mt-1 text-[10px] text-paper/70">
                Jokers: {game.jokerRanks.map((r) => rankChar(r)).join(' ')}
              </div>
            )}
            {game.lowestCardJoker && <div className="mt-1 text-[10px] text-paper/70">Lowest card is joker</div>}
            {game.phase === 'sideshow' && <div className="mt-1 text-[11px] text-gold-soft">Sideshow requested…</div>}
          </>
        ) : (
          <div className="font-display text-lg text-paper/80">Waiting for the round</div>
        )}
        {game?.phase === 'ended' && game.result?.reveal.length ? (
          <div className="mt-2 flex justify-center gap-3">
            {game.result.reveal.map((r) => (
              <div key={r.playerId} className="flex flex-col items-center">
                <div className="flex -space-x-2">{r.cards.map((c, i) => <PlayingCard key={i} card={c} size="sm" delay={i * 0.1} />)}</div>
                <span className="mt-0.5 max-w-[90px] truncate text-[9px] text-paper/80">{players.find((p) => p.id === r.playerId)?.name}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

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
              gp={gp}
              inRound={!!gp}
              winner={winners.has(p.id)}
            />
          </div>
        );
      })}
      {game && <ChipFlights game={game} seatPos={seatPos} />}
    </div>
  );
}
