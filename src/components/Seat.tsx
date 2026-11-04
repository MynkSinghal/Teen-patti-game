'use client';
import { motion } from 'motion/react';
import { Eye, WifiOff } from 'lucide-react';
import type { PublicRoomState } from '@/server/view';
import { Avatar } from './Avatar';
import { useSecondsLeft } from './Countdown';
import { PlayingCard } from './PlayingCard';

type GP = NonNullable<PublicRoomState['game']>['players'][number];

interface Props {
  name: string;
  balance: number;
  isMe: boolean;
  isHost: boolean;
  connected: boolean;
  isDealer: boolean;
  isTurn: boolean;
  deadline: number | null;
  turnSeconds: number;
  gp?: GP;
  inRound: boolean;
  winner?: boolean;
  left?: boolean;
  /** Smaller seat for crowded tables (5+ players) and small screens. */
  compact?: boolean;
}

export function describeLast(last: GP['last']): string | null {
  if (!last) return null;
  switch (last.type) {
    case 'bet': return `Bet ${last.amount}`;
    case 'raise': return `Raised to ${last.stake}`;
    case 'allin': return `All-in ${last.amount}`;
    case 'pack': return 'Packed';
    case 'show': return `Show ${last.amount ?? ''}`.trim();
    case 'sideshow_request': return 'Asked sideshow';
    default: return null;
  }
}

export function Seat(p: Props) {
  if (p.compact) return <CompactSeat {...p} />;
  const folded = !!p.gp?.folded;
  const left = useSecondsLeft(p.isTurn ? p.deadline : null);
  const progress = p.isTurn && left !== null ? left / Math.max(1, p.turnSeconds) : p.isTurn ? 1 : null;
  const last = describeLast(p.gp?.last ?? null);
  return (
    <div className="flex w-[92px] flex-col items-center ls:origin-center ls:scale-[.78]" data-testid={`seat-${p.name}`}>
      {p.inRound && !p.isMe && !folded && (
        <div className="-mb-3 flex -space-x-3.5">
          {[0, 1, 2].map((i) => <PlayingCard key={i} faceDown size="xs" delay={0.07 * i} />)}
        </div>
      )}
      <motion.div
        animate={p.isTurn ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={p.isTurn ? { repeat: Infinity, duration: 1.8 } : undefined}
        className={`relative ${folded ? 'opacity-45 grayscale' : ''}`}
      >
        <Avatar name={p.name} size={42} progress={progress} danger={left !== null && left <= 10} crown={p.winner} />
        {p.isDealer && <span className="absolute -right-1 bottom-0 grid h-5 w-5 place-items-center rounded-full bg-paper text-[10px] font-extrabold text-ink shadow" title="Dealer" data-testid="dealer-chip">D</span>}
        {p.gp?.allIn && !folded && <span className="absolute -top-1 -left-2 rounded-full bg-danger px-1.5 py-[1px] text-[9px] font-extrabold tracking-wide text-white shadow" data-testid="allin-chip">ALL-IN</span>}
        {p.gp?.seen && !folded && <span className="absolute -left-1 bottom-0 grid h-5 w-5 place-items-center rounded-full bg-panel text-gold-soft ring-1 ring-gold/50"><Eye size={11} /></span>}
      </motion.div>
      <div className={`-mt-0.5 w-full rounded-lg bg-panel/95 px-1.5 py-1 text-center ring-1 ${p.isTurn ? 'ring-gold' : 'ring-line'} ${p.winner ? 'ring-2 !ring-gold-soft' : ''}`}>
        <div className="flex items-center justify-center gap-1 text-[12px] font-semibold leading-tight">
          <span className="max-w-[64px] truncate">{p.isMe ? 'You' : p.name}</span>
          {!p.connected && <WifiOff size={10} className="text-danger" aria-label="Disconnected" />}
        </div>
        <div className="text-[12px] tabular-nums text-gold-soft" data-testid="balance">{p.balance.toLocaleString()}</div>
        {p.gp && <div className="text-[10px] leading-tight text-muted" data-testid="committed">in {p.gp.committed.toLocaleString()}</div>}
      </div>
      <div className="mt-0.5 h-[18px]">
        {last && (
          <motion.span
            key={last}
            initial={{ opacity: 0, y: -4, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`inline-block rounded-full px-2 py-[1px] text-[10px] font-semibold ${folded ? 'bg-panel-2 text-muted' : 'bg-gold/90 text-ink'}`}
            data-testid="last-action"
          >
            {last}
          </motion.span>
        )}
        {!last && !p.inRound && <span className="text-[10px] uppercase tracking-wider text-muted">{p.left ? 'Left' : 'Sitting out'}</span>}
      </div>
    </div>
  );
}

/** Avatar + one tight pill (name / chips) + a tiny status chip. Built to fit 8 around a small table. */
function CompactSeat(p: Props) {
  const folded = !!p.gp?.folded;
  const left = useSecondsLeft(p.isTurn ? p.deadline : null);
  const progress = p.isTurn && left !== null ? left / Math.max(1, p.turnSeconds) : p.isTurn ? 1 : null;
  const last = describeLast(p.gp?.last ?? null);
  return (
    <div className="flex w-[74px] flex-col items-center" data-testid={`seat-${p.name}`}>
      <div className={`relative ${folded ? 'opacity-45 grayscale' : ''}`}>
        <Avatar name={p.name} size={30} progress={progress} danger={left !== null && left <= 10} crown={p.winner} />
        {p.isDealer && <span className="absolute -right-1.5 bottom-0 grid h-4 w-4 place-items-center rounded-full bg-paper text-[9px] font-extrabold text-ink shadow" data-testid="dealer-chip">D</span>}
        {p.gp?.seen && !folded && <span className="absolute -left-1.5 bottom-0 grid h-4 w-4 place-items-center rounded-full bg-panel text-gold-soft ring-1 ring-gold/50"><Eye size={9} /></span>}
        {p.gp?.allIn && !folded && <span className="absolute -top-1 -left-3 rounded-full bg-danger px-1 text-[8px] font-extrabold text-white" data-testid="allin-chip">ALL-IN</span>}
      </div>
      <div className={`-mt-0.5 w-full rounded-md bg-panel/95 px-1 py-0.5 text-center leading-none ring-1 ${p.isTurn ? 'ring-gold' : 'ring-line'} ${p.winner ? '!ring-2 !ring-gold-soft' : ''} ${folded ? 'opacity-60' : ''}`}>
        <div className="flex items-center justify-center gap-0.5 text-[10.5px] font-semibold">
          <span className="max-w-[56px] truncate">{p.isMe ? 'You' : p.name}</span>
          {!p.connected && <WifiOff size={8} className="text-danger" aria-label="Disconnected" />}
        </div>
        <div className="mt-0.5 text-[10.5px] tabular-nums text-gold-soft" data-testid="balance">{p.balance.toLocaleString()}</div>
        {p.gp && <div className="mt-0.5 text-[8.5px] text-muted" data-testid="committed">in {p.gp.committed.toLocaleString()}</div>}
      </div>
      <div className="mt-0.5 h-3.5">
        {last ? <span key={last} className={`inline-block max-w-[74px] truncate rounded-full px-1.5 text-[9px] font-semibold ${folded ? 'bg-panel-2 text-muted' : 'bg-gold/90 text-ink'}`} data-testid="last-action">{last}</span>
          : !p.inRound ? <span className="text-[8.5px] uppercase tracking-wider text-muted">{p.left ? 'Left' : 'Out'}</span> : null}
      </div>
    </div>
  );
}
