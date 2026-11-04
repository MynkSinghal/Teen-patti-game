'use client';
import { motion, useReducedMotion } from 'motion/react';
import { rankChar } from '@/engine/cards';
import type { Card } from '@/engine/types';

const SUIT: Record<string, { ch: string; red: boolean }> = {
  S: { ch: '♠', red: false },
  H: { ch: '♥', red: true },
  D: { ch: '♦', red: true },
  C: { ch: '♣', red: false },
};

interface Props {
  card?: Card | null;
  faceDown?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Delay in seconds for the deal-in animation. */
  delay?: number;
  joker?: boolean;
  dim?: boolean;
}

const DIM = { xs: 'w-5 h-7 rounded-[3px]', sm: 'w-9 h-[52px] rounded-md', md: 'w-[58px] h-[84px] rounded-lg', lg: 'w-[76px] h-[110px] rounded-lg ls:w-[58px] ls:h-[84px] short:w-[50px] short:h-[72px]' };
const TXT = { xs: 'text-[0px]', sm: 'text-[13px]', md: 'text-lg', lg: 'text-2xl' };

export function PlayingCard({ card, faceDown, size = 'md', delay = 0, joker, dim }: Props) {
  const reduce = useReducedMotion();
  const down = faceDown || !card;
  const suit = card ? SUIT[card.suit]! : null;
  return (
    <motion.div
      initial={reduce ? false : { y: -60, opacity: 0, rotate: -8 }}
      animate={{ y: 0, opacity: dim ? 0.45 : 1, rotate: 0 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 24 }}
      style={{ perspective: 600 }}
      className={`relative shrink-0 ${DIM[size]}`}
      data-testid={down ? 'card-back' : 'card-face'}
    >
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ rotateY: down ? 180 : 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.45 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div
          className={`absolute inset-0 ${DIM[size]} bg-paper text-ink shadow-md ring-1 ring-black/20 flex flex-col items-center justify-center ${joker ? 'ring-2 ring-gold' : ''}`}
          style={{ backfaceVisibility: 'hidden' }}
        >
          {card && suit && (
            <>
              <span className={`absolute left-1 top-0.5 font-bold leading-none ${TXT[size]} ${suit.red ? 'text-[#b3261e]' : 'text-ink'}`}>{rankChar(card.rank)}</span>
              <span className={`${size === 'sm' ? 'text-lg' : size === 'md' ? 'text-3xl' : 'text-4xl'} ${suit.red ? 'text-[#b3261e]' : 'text-ink'}`}>{suit.ch}</span>
              {joker && <span className="absolute bottom-0.5 text-[8px] font-bold tracking-wider text-gold">JOKER</span>}
            </>
          )}
        </div>
        <div
          className={`absolute inset-0 ${DIM[size]} card-back shadow-md ring-1 ring-gold/50`}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        />
      </motion.div>
    </motion.div>
  );
}
