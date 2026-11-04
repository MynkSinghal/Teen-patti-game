'use client';
import { motion } from 'motion/react';
import { Coins, Crown, Eye, WifiOff } from 'lucide-react';
import type { PublicRoomState } from '@/server/view';
import { PlayingCard } from './PlayingCard';
import { Countdown } from './Countdown';

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
  gp?: GP;
  inRound: boolean;
  winner?: boolean;
  pendingFrom?: boolean;
}

export function Seat(p: Props) {
  const folded = p.gp?.folded;
  return (
    <div className="flex w-[84px] flex-col items-center gap-1" data-testid={`seat-${p.name}`}>
      {p.inRound && !p.isMe && (
        <div className="flex -space-x-3 h-7">
          {[0, 1, 2].map((i) => (
            <PlayingCard key={i} faceDown size="xs" delay={0.05 * i} dim={folded} />
          ))}
        </div>
      )}
      <motion.div
        animate={p.isTurn ? { boxShadow: '0 0 0 2px #c9a24b, 0 0 18px rgba(201,162,75,.5)' } : { boxShadow: '0 0 0 1px #26322d' }}
        className={`relative w-full rounded-xl bg-panel/95 px-2 py-1.5 text-center ${folded ? 'opacity-50' : ''} ${p.winner ? 'ring-2 ring-gold-soft' : ''}`}
      >
        <div className="flex items-center justify-center gap-1 text-[12px] font-semibold leading-tight">
          {p.isHost && <Crown size={11} className="text-gold" aria-label="Host" />}
          <span className="max-w-[60px] truncate">{p.isMe ? 'You' : p.name}</span>
          {!p.connected && <WifiOff size={11} className="text-danger" aria-label="Disconnected" />}
        </div>
        <div className="flex items-center justify-center gap-1 text-[12px] text-gold-soft tabular-nums" data-testid="balance">
          <Coins size={11} />
          {p.balance.toLocaleString()}
        </div>
        <div className="h-[14px] text-[10px] uppercase tracking-wider text-muted">
          {folded ? 'Packed' : p.gp ? (p.gp.seen ? <span className="inline-flex items-center gap-0.5 text-gold-soft"><Eye size={9} />Seen</span> : 'Blind') : p.inRound ? '' : 'Waiting'}
          {p.isTurn && p.deadline && (
            <>
              {' '}
              <Countdown deadline={p.deadline} />
            </>
          )}
        </div>
        {p.isDealer && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-paper text-[10px] font-bold text-ink" title="Dealer">D</span>
        )}
      </motion.div>
    </div>
  );
}
