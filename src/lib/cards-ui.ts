import { rankChar } from '@/engine/cards';
import type { Card } from '@/engine/types';

export const SUIT_CHAR: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const cardText = (c: Card) => `${rankChar(c.rank)}${SUIT_CHAR[c.suit]}`;

/** "joker as 2♣" / "jokers as 2♣, K♠" for the cards that were jokers. */
export function jokerNote(jokerAs?: (Card | null)[] | null): string | null {
  const vals = (jokerAs ?? []).filter((c): c is Card => !!c).map(cardText);
  if (!vals.length) return null;
  return `${vals.length > 1 ? 'jokers' : 'joker'} as ${vals.join(', ')}`;
}
