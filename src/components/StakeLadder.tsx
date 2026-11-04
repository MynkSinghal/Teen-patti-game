'use client';
import type { PublicRoomState } from '@/server/view';

type Game = NonNullable<PublicRoomState['game']>;

/** Compact stake card: current stake, blind/seen price, progress to the table max, who raised last. */
export function StakeLadder({ game, names }: { game: Game; names: Map<string, string> }) {
  const { minStake, maxStake, raiseFactor } = game.rules;
  const levels = raiseFactor > 1 ? Math.max(1, Math.round(Math.log(maxStake / minStake) / Math.log(raiseFactor))) : 1;
  const at = raiseFactor > 1 ? Math.min(levels, Math.max(0, Math.round(Math.log(game.stake / minStake) / Math.log(raiseFactor)))) : 0;
  const lastRaise = [...game.log].reverse().find((e) => e.type === 'raise');
  const who = lastRaise?.playerId ? names.get(lastRaise.playerId) : null;
  const atMax = game.stake >= maxStake;
  return (
    <div className="mh-panel px-2.5 py-1.5" data-testid="stake-ladder" aria-label={`Stake ${game.stake}, blind pays ${game.blindCost}, seen pays ${game.seenCost}`}>
      <div className="flex items-baseline justify-between">
        <span className="caps text-[9px] text-[#cdb87a]">Stake</span>
        <span className="num text-[22px] leading-none text-gold-soft" data-testid="stake-value">{game.stake}</span>
      </div>
      <div className="flex justify-between text-[10px] text-[#cdb87a]">
        <span>Blind {game.blindCost} · Seen {game.seenCost}</span>
        <span>{atMax ? <b className="text-danger">max</b> : `max ${maxStake}`}</span>
      </div>
      <div className="mt-1 flex gap-[3px]" role="presentation">
        {Array.from({ length: levels + 1 }).map((_, i) => (
          <span key={i} className={`h-[3px] flex-1 rounded-full ${i <= at ? (atMax && i === levels ? 'bg-danger' : 'bg-gold') : 'bg-[#3a2e1a]'}`} />
        ))}
      </div>
      {who && <div className="mt-0.5 truncate text-[9.5px] text-[#a99467]">raised by <b className="text-paper/85">{who}</b></div>}
    </div>
  );
}
