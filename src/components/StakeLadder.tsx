'use client';
import { motion } from 'motion/react';
import type { PublicRoomState } from '@/server/view';

type Game = NonNullable<PublicRoomState['game']>;

/** Shows every stake level from the boot to the table max, the current one, and who raised last. */
export function StakeLadder({ game, names }: { game: Game; names: Map<string, string> }) {
  const { minStake, maxStake, raiseFactor } = game.rules;
  const steps: number[] = [];
  for (let s = minStake; s <= maxStake && steps.length < 12; s = Math.ceil(s * raiseFactor)) {
    steps.push(s);
    if (raiseFactor <= 1) break;
  }
  const lastRaise = [...game.log].reverse().find((e) => e.type === 'raise');
  const atMax = game.stake >= maxStake;
  return (
    <div className="rounded-xl border border-line bg-panel/80 px-3 py-1.5" data-testid="stake-ladder">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted">
        <span>Stake</span>
        <span>
          {lastRaise?.playerId ? `Last raise: ${names.get(lastRaise.playerId) ?? '?'} → ${lastRaise.stake}` : 'No raises yet'}
          {atMax ? ' · max' : ''}
        </span>
      </div>
      <div className="mt-1.5 flex items-end gap-1">
        {steps.map((s, i) => {
          const done = s <= game.stake;
          const current = s === game.stake;
          return (
            <div key={s} className="flex flex-1 flex-col items-center gap-1">
              <motion.div
                layout
                animate={{ height: 6 + i * 3, opacity: done ? 1 : 0.28 }}
                className={`w-full rounded-sm ${current ? 'bg-gold shadow-[0_0_10px_rgba(201,162,75,.8)]' : done ? 'bg-gold/60' : 'bg-line'}`}
              />
              <span className={`text-[10px] tabular-nums ${current ? 'font-bold text-gold-soft' : 'text-muted'}`}>{s}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-paper/70">
        <span>Blind pays <b className="text-paper">{game.blindCost}</b></span>
        <span>Seen pays <b className="text-paper">{game.seenCost}</b></span>
      </div>
    </div>
  );
}
