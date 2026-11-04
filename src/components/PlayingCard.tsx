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

const DIM = { xs: 'w-4 h-[22px] rounded-[3px]', sm: 'w-10 h-[56px] rounded-md', md: 'w-[58px] h-[84px] rounded-lg', lg: 'w-[72px] h-[104px] rounded-lg ls:w-[64px] ls:h-[92px] short:w-[56px] short:h-[80px]' };
const TXT = { xs: 'text-[0px]', sm: 'text-[16px]', md: 'text-[22px]', lg: 'text-[26px] short:text-[22px]' };

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
          className={`absolute inset-0 ${DIM[size]} flex flex-col items-center justify-center text-[#1c1209] ${joker ? 'ring-2 ring-gold' : ''}`}
          style={{ backfaceVisibility: 'hidden', background: 'linear-gradient(160deg,#fffaf0,#efe3c6)', boxShadow: '0 0 0 1px #c9b27a, 0 6px 14px rgba(0,0,0,.55)' }}
        >
          {card && suit && (
            <>
              <span className={`num absolute left-[5px] top-0 leading-none ${TXT[size]} ${suit.red ? 'text-[#9b1b1b]' : 'text-[#1c1209]'}`}>{rankChar(card.rank) === 'T' ? '10' : rankChar(card.rank)}</span>
              <span className={`absolute ${size === 'sm' ? 'left-[6px] top-[18px] text-[10px]' : 'left-[7px] top-[24px] text-[12px] short:top-[21px]'} ${suit.red ? 'text-[#9b1b1b]' : 'text-[#1c1209]'}`}>{suit.ch}</span>
              <span className={`absolute right-[5px] bottom-[2px] ${size === 'sm' ? 'text-xl' : size === 'md' ? 'text-3xl' : 'text-[34px] short:text-[28px]'} ${suit.red ? 'text-[#9b1b1b]' : 'text-[#1c1209]'}`}>{suit.ch}</span>
              {joker && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded-sm bg-[#6d1222] px-1 text-[7.5px] font-bold tracking-widest text-[#f3dc95]">JOKER</span>}
            </>
          )}
        </div>
        <div
          className={`absolute inset-0 ${DIM[size]} card-back`}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', boxShadow: '0 0 0 1px #d8b45a, 0 4px 10px rgba(0,0,0,.6)' }}
        >
          {size !== 'xs' && <span className="absolute inset-[3px] rounded-[4px] border border-[rgba(243,220,149,.7)]" />}
        </div>
      </motion.div>
    </motion.div>
  );
}
