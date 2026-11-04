'use client';
import { motion } from 'motion/react';
import { Eye, WifiOff } from 'lucide-react';
import type { PublicRoomState } from '@/server/view';
import { Avatar } from './Avatar';
import { useSecondsLeft } from './Countdown';

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
  /** Smaller seat for crowded tables and short screens. */
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

/** Medallion + brass plaque + one status tag. Nothing else. */
export function Seat(p: Props) {
  const folded = !!p.gp?.folded;
  const left = useSecondsLeft(p.isTurn ? p.deadline : null);
  const progress = p.isTurn && left !== null ? left / Math.max(1, p.turnSeconds) : p.isTurn ? 1 : null;
  const last = describeLast(p.gp?.last ?? null);
  const status = last ?? (p.gp ? (p.gp.seen ? 'Seen' : 'Blind') : p.inRound ? null : 'Sitting out');
  const size = p.compact ? 34 : 42;
  return (
    <div className={`flex flex-col items-center ${p.compact ? 'w-[76px]' : 'w-[90px]'}`} data-testid={`seat-${p.name}`}>
      <motion.div
        animate={p.isTurn ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={p.isTurn ? { repeat: Infinity, duration: 1.8 } : undefined}
        className={`relative ${folded ? 'opacity-50 grayscale' : ''}`}
      >
        <Avatar name={p.name} size={size} progress={progress} danger={left !== null && left <= 10} crown={p.winner} />
        {p.isDealer && <span className="absolute right-0 bottom-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-paper text-[9px] font-extrabold text-[#2a1a08] shadow ring-[1.5px] ring-gold" title="Dealer" data-testid="dealer-chip">D</span>}
        {p.gp?.seen && !folded && <span className="absolute left-0 bottom-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-[#1a1209] text-gold-soft ring-[1.5px] ring-gold"><Eye size={10} /></span>}
        {p.gp?.allIn && !folded && <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-maroon px-1.5 text-[8.5px] font-extrabold tracking-wider text-gold-soft ring-1 ring-gold" data-testid="allin-chip">ALL-IN</span>}
      </motion.div>
      <div className={`plaque -mt-1 w-full px-1 py-[3px] text-center ${folded ? 'opacity-60' : ''} ${p.isTurn ? '!shadow-[inset_0_0_0_1.5px_#f3dc95,0_0_12px_rgba(243,220,149,.35)]' : ''} ${p.winner ? '!shadow-[inset_0_0_0_2px_#f3dc95]' : ''}`}>
        <div className="flex items-center justify-center gap-1">
          <span className={`font-display truncate font-semibold text-paper ${p.compact ? 'max-w-[58px] text-[9.5px]' : 'max-w-[70px] text-[10.5px]'}`}>{p.isMe ? 'You' : p.name}</span>
          {!p.connected && <WifiOff size={9} className="text-danger" aria-label="Disconnected" />}
        </div>
        <div className={`num leading-none text-gold-soft ${p.compact ? 'text-[13px]' : 'text-[15px]'}`} data-testid="balance">{p.balance.toLocaleString()}</div>
      </div>
      <div className="mt-[3px] h-[15px]">
        {status && (
          <motion.span
            key={status}
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            className={`inline-block max-w-[88px] truncate rounded-full px-2 py-[1px] text-[9px] font-bold uppercase tracking-wide ${folded ? 'bg-[#2a2218] text-[#8f8166]' : last ? 'tag-gold' : 'bg-[#1a1209] text-muted ring-1 ring-line'}`}
            data-testid={last ? 'last-action' : 'seat-status'}
          >
            {status}
          </motion.span>
        )}
      </div>
    </div>
  );
}
