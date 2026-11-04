'use client';
import { useMemo } from 'react';
import { rankChar } from '@/engine/cards';
import { choiceKeepsBest, resolveHand, type JokerAssign } from '@/engine/variations/base';
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
  const keeps = (c: Card) => choiceKeepsBest(cards, ctx, { ...base, [String(index)]: c });
  const choose = async (c: Card | null) => {
    if (await send({ type: 'set_joker', index, as: c })) close();
  };
  return (
    <Sheet open onClose={close} title="Set your joker" testId="joker-sheet">
      <p className="text-sm text-paper/80">
        Your <b className="text-gold-soft">{cardText(cards[index]!)}</b> is a joker. It <b>already counts as your best possible card</b>, so you never lose by not choosing.
        <br /><span className="text-muted">Picking only decides which card you announce. Everyone sees it if your hand is shown. Only picks that keep your best hand are allowed.</span>
      </p>
      <button className={`btn mt-3 w-full !min-h-[38px] ${current === null ? 'btn-gold' : 'btn-ghost'}`} disabled={busy} onClick={() => choose(null)} data-testid="joker-auto">
        Auto (best hand) <span className="ml-2 text-xs opacity-75">→ {preview(null)}</span>
      </button>
      <p className="label mt-3">Cards you can announce</p>
      <div className="flex flex-wrap gap-1.5" data-testid="joker-grid">
        {SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit }))).filter((c) => keeps(c)).map(({ rank, suit }) => {
          const sel = current?.rank === rank && current.suit === suit;
          const red = suit === 'H' || suit === 'D';
          return (
            <button
              key={`${rank}${suit}`}
              disabled={busy}
              onClick={() => choose({ rank, suit })}
              aria-label={`${rankChar(rank)} of ${suit}`}
              className={`num grid h-[46px] w-[34px] place-items-center rounded-md text-[17px] leading-none ${sel ? 'ring-2 ring-gold-soft' : ''}`}
              style={{ background: sel ? 'linear-gradient(#f6e3a2,#d8b45a)' : 'linear-gradient(160deg,#fffaf0,#efe3c6)', color: red ? '#9b1b1b' : '#1c1209' }}
              data-testid={`jk-${rankChar(rank)}${suit}`}
            >
              <span>{rankChar(rank) === 'T' ? '10' : rankChar(rank)}<br /><span className="text-[13px]">{SUIT_CHAR[suit]}</span></span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-muted">Currently: <b className="text-paper">{priv.handLabel}</b></p>
    </Sheet>
  );
}
