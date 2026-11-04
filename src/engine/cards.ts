import type { Card, Rng, Suit } from './types';

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const RANK_CHARS: Record<number, string> = { 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const RANK_NAMES: Record<number, string> = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}

/** Fisher–Yates with an injected (crypto) RNG. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function deal(playerCount: number, rng: Rng, cardsEach = 3): Card[][] {
  if (playerCount < 1 || playerCount * cardsEach > 52) throw new Error('invalid deal size');
  const deck = shuffle(createDeck(), rng);
  const hands: Card[][] = [];
  for (let p = 0; p < playerCount; p++) hands.push(deck.slice(p * cardsEach, (p + 1) * cardsEach));
  return hands;
}

export const rankChar = (rank: number) => RANK_CHARS[rank] ?? String(rank);
export const rankName = (rank: number) => RANK_NAMES[rank] ?? String(rank);
export const cardToString = (c: Card) => `${rankChar(c.rank)}${c.suit}`;

export function parseCard(s: string): Card {
  const r = s[0]!.toUpperCase();
  const suit = s[1]!.toUpperCase() as Suit;
  const rank = Object.entries(RANK_CHARS).find(([, ch]) => ch === r)?.[0];
  return { rank: rank ? Number(rank) : Number(r), suit };
}
export const parseHand = (s: string): Card[] => s.trim().split(/\s+/).map(parseCard);
