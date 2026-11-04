'use client';
import { motion } from 'motion/react';
import { Eye } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { rankChar } from '@/engine/cards';
import { useLs } from '@/hooks/useLs';
import type { CommandInput } from '@/hooks/useRoom';
import { cardText } from '@/lib/cards-ui';
import { useUI } from '@/store/ui';
import type { ClientView } from '@/server/view';
import { ChipFlights } from './Chips';
import { PlayingCard } from './PlayingCard';
import { RulesButton } from './RulesSheet';
import { Seat } from './Seat';

/** Your three cards, fanned over the bottom rim, with one ribbon underneath (hand name, or See cards). */
function MyHand({ view, send, busy }: { view: ClientView; send: (c: CommandInput) => Promise<boolean>; busy: boolean }) {
  const game = view.room.game!;
  const priv = view.me.private;
  if (!priv?.inRound) return null;
  const cards = priv.cards;
  const jokers = priv.jokers;
  const rot = [-8, 0, 8];
  return (
    <div className="absolute bottom-0 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center" data-testid="hand">
      <div className="flex items-end">
        {[0, 1, 2].map((i) => {
          const isJoker = !!cards?.[i] && !!jokers?.indexes.includes(i);
          const auto = jokers?.auto[i] ?? true;
          const as = jokers?.as[i] ?? null;
          const card = (
            <PlayingCard key={`${game.round}-${i}`} card={cards?.[i] ?? null} faceDown={!cards} size="lg" delay={i * 0.12} joker={isJoker} dim={priv.folded} />
          );
          const style = { transform: `rotate(${rot[i]}deg) translateY(${i === 1 ? 0 : 6}px)`, margin: '0 -5px' };
          if (!isJoker || priv.folded || game.phase === 'ended') return <div key={i} style={style}>{card}</div>;
          return (
            <button key={i} type="button" style={style} onClick={() => useUI.getState().openJoker(i)} className={`relative ${auto ? 'joker-glow' : ''}`} aria-label={`Joker: choose which card to announce`} data-testid={`joker-${i}`}>
              {card}
              <span className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1a1209] px-1.5 text-[9.5px] font-bold text-gold-soft ring-1 ring-gold" data-testid="joker-as">
                {as ? `= ${cardText(as)}${auto ? '' : ' ✓'}` : 'joker'}
              </span>
            </button>
          );
        })}
      </div>
      <div className="relative z-10 -mt-1 h-[22px]">
        {priv.folded ? (
          <span className="caps rounded-sm bg-[#2a2218] px-3 py-[3px] text-[9.5px] text-[#8f8166]">You packed</span>
        ) : cards ? (
          <span className="caps tag-gold inline-block px-3 py-[3px] text-[9.5px] font-semibold" style={{ clipPath: 'polygon(6% 0,94% 0,100% 50%,94% 100%,6% 100%,0 50%)' }} data-testid="hand-label">{priv.handLabel}</span>
        ) : (
          <button className="btn btn-gold !min-h-[24px] !px-3 !text-[10.5px] inline-flex items-center gap-1" onClick={() => send({ type: 'see' })} disabled={busy} data-testid="see-cards">
            <Eye size={12} /> See cards
          </button>
        )}
      </div>
    </div>
  );
}

export function Table({ view, send, busy }: { view: ClientView; send: (c: CommandInput) => Promise<boolean>; busy: boolean }) {
  const { room, me } = view;
  const game = room.game;
  const live = room.status === 'playing' || room.status === 'between';
  const players = room.players;
  const n = players.length;
  const meIdx = Math.max(0, players.findIndex((p) => p.id === me.playerId));
  const ls = useLs();
  const compact = n >= 6 || (ls && n >= 5);

  // Others spread over the arc above; you sit bottom-left of your own cards.
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const others = players.filter((_, i) => i !== meIdx);
    const order = [...players.slice(meIdx + 1), ...players.slice(0, meIdx)];
    const k = order.length;
    const start = 168;
    const end = 372;
    order.forEach((p, j) => {
      const deg = k === 1 ? 270 : start + ((end - start) * j) / (k - 1);
      const a = (deg * Math.PI) / 180;
      map.set(p.id, { x: 50 + 43 * Math.cos(a), y: 45 + 38 * Math.sin(a) });
    });
    void others;
    map.set(players[meIdx]!.id, { x: 50 - (ls ? 26 : 30), y: 81 });
    return map;
  }, [players, meIdx, ls]);
  const seatPos = useCallback((id: string) => positions.get(id) ?? null, [positions]);
  const winners = new Set(game?.phase === 'ended' ? game.result?.payouts.map((p) => p.playerId) : []);
  const gameIds = new Set(game?.players.map((p) => p.id) ?? []);

  return (
    <div className="relative mx-auto h-[min(calc(var(--app-h)*0.5),400px)] min-h-[300px] w-full max-w-md ls:h-full ls:min-h-0 ls:max-w-none" data-testid="table">
      <div className="rim absolute inset-x-[6%] top-[9%] bottom-[16%] rounded-[50%]">
        <div className="felt absolute inset-[3.5%] rounded-[50%]" />
      </div>
      <div className="absolute left-1/2 top-[44%] z-10 -translate-x-1/2 -translate-y-1/2 text-center" data-testid="pot-btn">
        {live && game ? (
          <>
            <button onClick={() => useUI.getState().open('pot')} aria-label="Pot breakdown" className="block" data-testid="pot-open">
              <div className="caps text-[8.5px] text-[#cdb87a]">The pot</div>
              <motion.div key={game.pot} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className="num text-[44px] leading-[.9] text-gold-soft short:text-[38px]" style={{ textShadow: '0 2px 0 rgba(0,0,0,.45), 0 0 18px rgba(243,220,149,.3)' }} data-testid="pot">
                {game.pot.toLocaleString()}
              </motion.div>
            </button>
            <div className="mt-1 flex items-center justify-center gap-1.5">
              <span className="caps text-[9px] text-[#cdb87a]">{game.variationName}</span>
              <RulesButton variation={game.variation} className="!h-[18px] !w-[18px]" />
            </div>
            {game.jokerRanks.length > 0 && <div className="mt-0.5 text-[10px] text-[#cdb87a]">Jokers: {game.jokerRanks.map((r) => rankChar(r)).join(' ')}</div>}
            {game.lowestCardJoker && <div className="mt-0.5 text-[10px] text-[#cdb87a]">Lowest card is joker</div>}
          </>
        ) : (
          <div className="font-display text-sm text-paper/80">Waiting for the round</div>
        )}
      </div>

      {players.map((p) => {
        const pos = positions.get(p.id)!;
        const gp = game?.players.find((x) => x.id === p.id);
        return (
          <div key={p.id} className="absolute z-10" style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%,-50%)' }}>
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
              compact={compact}
            />
          </div>
        );
      })}
      {game && <MyHand view={view} send={send} busy={busy} />}
      {game && <ChipFlights game={game} seatPos={seatPos} />}
    </div>
  );
}
