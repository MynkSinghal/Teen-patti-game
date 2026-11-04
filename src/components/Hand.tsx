'use client';
import { useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import type { ClientView } from '@/server/view';
import { cardText } from '@/lib/cards-ui';
import { useUI } from '@/store/ui';
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
      <div className="flex items-start gap-2">
        {[0, 1, 2].map((i) => {
          const isJoker = !!cards?.[i] && !!priv.jokers?.indexes.includes(i);
          const as = priv.jokers?.as[i] ?? null;
          const auto = priv.jokers?.auto[i] ?? true;
          const card = (
            <PlayingCard
              key={`${game!.round}-${i}`}
              card={cards?.[i] ?? null}
              faceDown={!cards}
              size="lg"
              delay={i * 0.12}
              joker={isJoker || (!!cards?.[i] && jokers.includes(cards[i]!.rank))}
              dim={priv.folded}
            />
          );
          if (!isJoker || priv.folded || game!.phase === 'ended') return <div key={i}>{card}</div>;
          return (
            <button key={i} type="button" onClick={() => useUI.getState().openJoker(i)} className="flex flex-col items-center gap-1 rounded-lg" aria-label={`Joker card ${i + 1}: tap to choose its value`} data-testid={`joker-${i}`}>
              {card}
              <span className={`rounded-full px-2 py-[1px] text-[10px] font-bold ${auto ? 'bg-panel-2 text-gold-soft ring-1 ring-gold/40' : 'bg-gold text-ink'}`} data-testid="joker-as">
                {as ? `= ${cardText(as)}${auto ? ' · auto' : ''}` : 'tap to set'}
              </span>
            </button>
          );
        })}
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
