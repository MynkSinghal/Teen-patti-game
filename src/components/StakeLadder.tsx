'use client';
import { TrendingUp } from 'lucide-react';
import type { PublicRoomState } from '@/server/view';

type Game = NonNullable<PublicRoomState['game']>;

/** One slim line: current stake, what blind / seen players pay, who raised last, and how close the cap is. */
export function StakeLadder({ game, names }: { game: Game; names: Map<string, string> }) {
  const { minStake, maxStake, raiseFactor } = game.rules;
  const levels = raiseFactor > 1 ? Math.max(1, Math.round(Math.log(maxStake / minStake) / Math.log(raiseFactor))) : 1;
  const at = raiseFactor > 1 ? Math.min(levels, Math.max(0, Math.round(Math.log(game.stake / minStake) / Math.log(raiseFactor)))) : 0;
  const lastRaise = [...game.log].reverse().find((e) => e.type === 'raise');
  const who = lastRaise?.playerId ? names.get(lastRaise.playerId) : null;
  const atMax = game.stake >= maxStake;
  return (
    <div className="rounded-lg border border-line bg-panel/80 px-2.5 py-1.5" data-testid="stake-ladder" aria-label={`Stake ${game.stake}, blind pays ${game.blindCost}, seen pays ${game.seenCost}${atMax ? ', at the table maximum' : ''}`}>
      <div className="flex items-center gap-2 text-[11px] leading-none">
        <span className="flex items-center gap-1 text-muted"><TrendingUp size={12} className="text-gold" />Stake</span>
        <b className="font-display text-base leading-none text-gold-soft tabular-nums" data-testid="stake-value">{game.stake}</b>
        <span className="ml-auto flex gap-2 text-paper/80">
          <span>Blind <b className="text-paper tabular-nums">{game.blindCost}</b></span>
          <span>Seen <b className="text-paper tabular-nums">{game.seenCost}</b></span>
        </span>
      </div>
      <div className="mt-1.5 flex gap-[3px]" role="presentation">
        {Array.from({ length: levels + 1 }).map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= at ? (atMax && i === levels ? 'bg-danger' : 'bg-gold') : 'bg-line'}`} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] leading-none text-muted">
        <span>{who ? <>raised by <b className="text-paper/80">{who}</b></> : 'no raises yet'}</span>
        <span>{atMax ? <b className="text-danger">table max</b> : `max ${maxStake}`}</span>
      </div>
    </div>
  );
}
