'use client';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { PublicRoomState } from '@/server/view';

interface Flight {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  amount: number;
}

/** Chips fly from a seat to the pot on bets, and from the pot to the winners at round end. */
export function ChipFlights({
  game,
  seatPos,
}: {
  game: NonNullable<PublicRoomState['game']>;
  seatPos: (playerId: string) => { x: number; y: number } | null;
}) {
  const reduce = useReducedMotion();
  const lastSeq = useRef<number | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const round = useRef(game.round);

  useEffect(() => {
    if (round.current !== game.round) {
      round.current = game.round;
      lastSeq.current = null;
    }
    const maxSeq = game.log.at(-1)?.seq ?? 0;
    if (lastSeq.current === null) {
      lastSeq.current = maxSeq; // don't replay history on mount
      return;
    }
    const fresh = game.log.filter((e) => e.seq > lastSeq.current!);
    lastSeq.current = maxSeq;
    if (reduce || !fresh.length) return;
    const pot = { x: 50, y: 46 };
    const next: Flight[] = [];
    for (const e of fresh) {
      if (e.playerId && e.amount && ['bet', 'raise', 'show', 'sideshow_request'].includes(e.type)) {
        const from = seatPos(e.playerId);
        if (from) next.push({ id: e.seq, from, to: pot, amount: e.amount });
      }
      if (e.type === 'round_ended' && game.result) {
        for (const p of game.result.payouts) {
          const to = seatPos(p.playerId);
          if (to) next.push({ id: e.seq * 1000 + next.length, from: pot, to, amount: p.amount });
        }
      }
    }
    if (next.length) {
      setFlights((f) => [...f, ...next]);
      setTimeout(() => setFlights((f) => f.filter((x) => !next.includes(x))), 1100);
    }
  }, [game.log, game.round, game.result, reduce, seatPos]);

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <AnimatePresence>
        {flights.map((f) => (
          <motion.div
            key={f.id}
            initial={{ left: `${f.from.x}%`, top: `${f.from.y}%`, opacity: 1, scale: 1 }}
            animate={{ left: `${f.to.x}%`, top: `${f.to.y}%`, opacity: 0.9, scale: 0.9 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeInOut' }}
            className="absolute -ml-3 -mt-3 grid h-6 min-w-6 place-items-center rounded-full bg-gold px-1 text-[9px] font-bold text-ink shadow"
          >
            {f.amount}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
