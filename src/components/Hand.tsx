'use client';
import { useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import type { ClientView } from '@/server/view';
import { PlayingCard } from './PlayingCard';

export function Hand({ view, onSee, busy }: { view: ClientView; onSee: () => void; busy: boolean }) {
  const game = view.room.game;
  const priv = view.me.private;
  const inRound = !!priv?.inRound && !!game && game.round === view.room.round;
  const jokers = game?.jokerRanks ?? [];
  if (!inRound || !priv) return <div className="h-[110px]" />;
  const cards = priv.cards;
  return (
    <div className="flex flex-col items-center gap-1" data-testid="hand">
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <PlayingCard
            key={`${game!.round}-${i}`}
            card={cards?.[i] ?? null}
            faceDown={!cards}
            size="lg"
            delay={i * 0.12}
            joker={!!cards?.[i] && jokers.includes(cards[i]!.rank)}
            dim={priv.folded}
          />
        ))}
      </div>
      <div className="flex h-7 items-center gap-2 text-sm">
        {priv.folded ? (
          <span className="text-muted">You packed</span>
        ) : cards ? (
          <span className="font-display text-gold-soft" data-testid="hand-label">{priv.handLabel}</span>
        ) : (
          <button className="btn btn-ghost !min-h-8 inline-flex items-center gap-1 !px-3 text-sm" onClick={onSee} disabled={busy} data-testid="see-cards">
            <Eye size={14} /> See cards
          </button>
        )}
        <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted" data-testid="seen-indicator">
          {priv.folded ? 'Packed' : priv.seen ? 'Seen' : 'Blind'}
        </span>
      </div>
    </div>
  );
}

export function useDismissed() {
  const [d, setD] = useState<string | null>(null);
  return useMemo(() => ({ dismissed: d, dismiss: setD }), [d]);
}
