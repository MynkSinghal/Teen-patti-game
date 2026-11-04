import { SUITS, RANKS, rankName } from './cards';
import type { AceLowMode, Card, HandScore } from './types';

export const CATEGORY = { HIGH: 1, PAIR: 2, COLOR: 3, SEQUENCE: 4, PURE_SEQUENCE: 5, TRAIL: 6 } as const;

export function compareKeys(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
export const compareScores = (a: HandScore, b: HandScore) => compareKeys(a.key, b.key);

/** Sequence strength: top card value; A-K-Q is 14; A-2-3 depends on the house rule. */
export function sequenceValue(ranks: number[], aceLow: AceLowMode): number | null {
  const [r1, r2, r3] = [...ranks].sort((x, y) => y - x) as [number, number, number];
  if (r1 - r2 === 1 && r2 - r3 === 1) return r1;
  if (r1 === 14 && r2 === 3 && r3 === 2) {
    if (aceLow === 'second') return 13.5; // just below A-K-Q, above K-Q-J
    if (aceLow === 'lowest') return 3; // below 2-3-4 (top card 4)
  }
  return null;
}

/** Evaluate exactly three concrete cards under standard Teen Patti ranking. */
export function evalClassic(cards: Card[], aceLow: AceLowMode = 'second'): HandScore {
  if (cards.length !== 3) throw new Error('A Teen Patti hand has exactly 3 cards');
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a) as [number, number, number];
  const flush = cards.every((c) => c.suit === cards[0]!.suit);
  if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) {
    return { key: [CATEGORY.TRAIL, ranks[0]], label: `Trail of ${rankName(ranks[0])}s` };
  }
  const seq = sequenceValue(ranks, aceLow);
  if (seq !== null) {
    const top = seq === 13.5 || seq === 3 ? 'A-2-3' : `${rankName(ranks[0])}-high`;
    return flush
      ? { key: [CATEGORY.PURE_SEQUENCE, seq], label: `Pure Sequence (${top})` }
      : { key: [CATEGORY.SEQUENCE, seq], label: `Sequence (${top})` };
  }
  if (flush) return { key: [CATEGORY.COLOR, ...ranks], label: `Color (${rankName(ranks[0])}-high)` };
  if (ranks[0] === ranks[1] || ranks[1] === ranks[2]) {
    const pair = ranks[1]; // middle card is always part of a pair
    const kicker = ranks[0] === ranks[1] ? ranks[2] : ranks[0];
    return { key: [CATEGORY.PAIR, pair, kicker], label: `Pair of ${rankName(pair)}s` };
  }
  return { key: [CATEGORY.HIGH, ...ranks], label: `High Card ${rankName(ranks[0])}` };
}

const ALL_CARDS: Card[] = SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));

/**
 * Best hand when `jokers` wildcards may stand in for any card.
 * `scoreFn` scores a concrete hand; the maximum over all substitutions is returned.
 */
export function bestWithJokers(
  natural: Card[],
  jokers: number,
  scoreFn: (cards: Card[]) => HandScore,
): HandScore {
  if (jokers === 0) return scoreFn(natural);
  if (jokers >= 3) return scoreFn([ace('S'), ace('H'), ace('D')]);
  let best: HandScore | null = null;
  const consider = (cards: Card[]) => {
    const s = scoreFn(cards);
    if (!best || compareScores(s, best) > 0) best = s;
  };
  if (jokers === 1) for (const c of ALL_CARDS) consider([...natural, c]);
  else for (const c1 of ALL_CARDS) for (const c2 of ALL_CARDS) consider([...natural, c1, c2]);
  return best!;
}
const ace = (suit: 'S' | 'H' | 'D'): Card => ({ rank: 14, suit });
