'use client';
import { useMemo } from 'react';
import { rankChar } from '@/engine/cards';
import { resolveHand, type JokerAssign } from '@/engine/variations/base';
import type { Card, VariationContext } from '@/engine/types';
import type { CommandInput } from '@/hooks/useRoom';
import { cardText, SUIT_CHAR } from '@/lib/cards-ui';
import { useUI } from '@/store/ui';
import type { ClientView } from '@/server/view';
import { Sheet } from './Sheet';

const RANKS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const SUITS = ['S', 'H', 'D', 'C'] as const;

/** Tap a joker card in your hand, then choose the card it stands for (or leave it on Auto = your best hand). */
export function JokerSheet({ view, send, busy }: { view: ClientView; send: (c: CommandInput) => Promise<boolean>; busy: boolean }) {
  const sheet = useUI((s) => s.sheet);
  const index = useUI((s) => s.jokerIndex);
  const close = useUI((s) => s.close);
  const game = view.room.game;
  const priv = view.me.private;
  const open = sheet === 'joker' && index !== null && !!priv?.cards && !!priv.jokers && !!game;

  const ctx = useMemo<VariationContext | null>(
    () =>
      game
        ? { id: 'joker', name: game.variationName, jokerRanks: game.jokerRanks, lowestCardJoker: game.lowestCardJoker, naturalBeatsJoker: true, hiLoMode: 'split', aceLowSequence: view.room.settings.aceLowSequence, tenTwentyMin: 10, tenTwentyMax: 20 }
        : null,
    [game, view.room.settings.aceLowSequence],
  );

  if (!open || !ctx || !priv?.cards || !priv.jokers || index === null) return <Sheet open={false} onClose={close} title="Set your joker">{null}</Sheet>;
  const cards = priv.cards;
  const j = priv.jokers;
  const current = j.auto[index] ? null : j.as[index];
  // everything else the player already fixed stays fixed in the preview
  const base: JokerAssign = {};
  j.indexes.forEach((i) => { if (!j.auto[i] && j.as[i]) base[String(i)] = j.as[i]!; });
  const preview = (c: Card | null) => {
    const a = { ...base };
    if (c) a[String(index)] = c; else delete a[String(index)];
    return resolveHand(cards, ctx, a).score.label;
  };
  const choose = async (c: Card | null) => {
    if (await send({ type: 'set_joker', index, as: c })) close();
  };
  return (
    <Sheet open onClose={close} title="Set your joker" testId="joker-sheet">
      <p className="text-sm text-paper/80">
        This <b className="text-gold-soft">{cardText(cards[index]!)}</b> is a joker: choose any card for it to stand for.
        <br /><span className="text-muted">Whatever you set here is what gets compared at a show or sideshow, and everyone sees it at the show. <b>Auto</b> picks your best hand.</span>
      </p>
      <button className={`btn mt-3 w-full ${current === null ? 'btn-gold' : 'btn-ghost'}`} disabled={busy} onClick={() => choose(null)} data-testid="joker-auto">
        Auto (best hand) <span className="ml-2 text-xs opacity-75">→ {preview(null)}</span>
      </button>
      <div className="mt-3 space-y-1.5" data-testid="joker-grid">
        {SUITS.map((suit) => (
          <div key={suit} className="grid grid-cols-13 gap-1" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
            {RANKS.map((rank) => {
              const sel = current?.rank === rank && current.suit === suit;
              const red = suit === 'H' || suit === 'D';
              return (
                <button
                  key={rank}
                  disabled={busy}
                  onClick={() => choose({ rank, suit })}
                  aria-label={`${rankChar(rank)} of ${suit}`}
                  className={`aspect-[3/4] rounded-md text-[11px] font-bold leading-none ${sel ? 'bg-gold text-ink ring-2 ring-gold-soft' : 'bg-paper'} ${!sel && red ? 'text-[#b3261e]' : !sel ? 'text-ink' : ''}`}
                  data-testid={`jk-${rankChar(rank)}${suit}`}
                >
                  <span className="block">{rankChar(rank)}</span>
                  <span className="block text-[10px]">{SUIT_CHAR[suit]}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted">Currently: <b className="text-paper">{priv.handLabel}</b></p>
    </Sheet>
  );
}
