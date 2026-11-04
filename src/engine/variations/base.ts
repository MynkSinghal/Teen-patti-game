import { compareScores, bestWithJokersDetailed, evalClassic } from '../rank';
import type { Card, HandScore, Payout, RulesConfig, VariationContext, ConcreteVariationId } from '../types';

export function baseContext(id: ConcreteVariationId, name: string, rules: RulesConfig): VariationContext {
  return {
    id,
    name,
    jokerRanks: [],
    lowestCardJoker: false,
    naturalBeatsJoker: true,
    hiLoMode: 'split',
    aceLowSequence: rules.aceLowSequence,
    tenTwentyMin: 10,
    tenTwentyMax: 20,
  };
}

/** Player-chosen joker values: card index (as string) -> the card the joker stands for. */
export type JokerAssign = Record<string, Card>;

/** Indexes of the cards in a hand that are jokers under the context. */
export function jokerIndexes(cards: Card[], ctx: VariationContext): number[] {
  if (ctx.lowestCardJoker) {
    let idx = 0;
    cards.forEach((c, i) => {
      if (c.rank < cards[idx]!.rank) idx = i;
    });
    return [idx];
  }
  if (ctx.jokerRanks.length) return cards.map((c, i) => (ctx.jokerRanks.includes(c.rank) ? i : -1)).filter((i) => i >= 0);
  return [];
}

export interface ResolvedHand {
  score: HandScore & { jokers: number };
  /** The three cards with every joker replaced by its value (chosen or best). */
  effective: Card[];
  /** Per card: what its joker stands for, or null for natural cards. */
  jokerAs: (Card | null)[];
  /** Per card: true when the joker value was picked automatically (not by the player). */
  auto: boolean[];
}

const evalWith = (ctx: VariationContext) => (c: Card[]) => evalClassic(c, ctx.aceLowSequence);

/**
 * Evaluate a hand. Jokers ALWAYS count as the best possible card for this hand: scoring never depends on
 * what the player picked. A player's pick only decides which (equally strong) card is announced, and is
 * honoured only when it keeps the best hand.
 */
export function resolveHand(cards: Card[], ctx: VariationContext, assign?: JokerAssign): ResolvedHand {
  const jIdx = jokerIndexes(cards, ctx);
  const natural = cards.filter((_, i) => !jIdx.includes(i));
  const best = bestWithJokersDetailed(natural, jIdx.length, evalWith(ctx));
  let effective = cards.map((c, i) => (jIdx.includes(i) ? best.subs[jIdx.indexOf(i)]! : c));
  let auto = cards.map((_, i) => jIdx.includes(i));
  const chosen = jIdx.filter((i) => assign?.[String(i)]);
  if (chosen.length) {
    const free = jIdx.filter((i) => !assign?.[String(i)]);
    const fixed = chosen.map((i) => assign![String(i)]!);
    const r = bestWithJokersDetailed([...natural, ...fixed], free.length, evalWith(ctx));
    if (compareScores(r.score, best.score) === 0) {
      effective = cards.map((c, i) => (!jIdx.includes(i) ? c : chosen.includes(i) ? assign![String(i)]! : r.subs[free.indexOf(i)]!));
      auto = cards.map((_, i) => free.includes(i));
    }
  }
  const key = ctx.naturalBeatsJoker ? [...best.score.key, -jIdx.length] : best.score.key;
  return {
    score: { key, label: jIdx.length ? `${best.score.label} (joker)` : best.score.label, jokers: jIdx.length },
    effective,
    jokerAs: cards.map((_, i) => (jIdx.includes(i) ? effective[i]! : null)),
    auto,
  };
}

/** Would announcing these joker values still describe the player's best hand? */
export function choiceKeepsBest(cards: Card[], ctx: VariationContext, assign: JokerAssign): boolean {
  const jIdx = jokerIndexes(cards, ctx);
  const natural = cards.filter((_, i) => !jIdx.includes(i));
  const best = bestWithJokersDetailed(natural, jIdx.length, evalWith(ctx)).score;
  const chosen = jIdx.filter((i) => assign[String(i)]);
  const free = jIdx.length - chosen.length;
  const r = bestWithJokersDetailed([...natural, ...chosen.map((i) => assign[String(i)]!)], free, evalWith(ctx)).score;
  return compareScores(r, best) === 0;
}

/** Classic high-hand score with joker handling; fewer jokers wins an otherwise exact tie. */
export function classicScore(cards: Card[], ctx: VariationContext, assign?: JokerAssign): HandScore & { jokers: number } {
  return resolveHand(cards, ctx, assign).score;
}

export const negate = (s: HandScore): HandScore => ({ key: s.key.map((x) => -x), label: s.label });

/** Winner-takes-all settlement honouring the host's tie rule. */
export function settleWinnerTakesAll(
  entries: { playerId: string; cards: Card[]; assign?: JokerAssign }[],
  pot: number,
  scoreFn: (cards: Card[], assign?: JokerAssign) => HandScore,
  rules: RulesConfig,
  challengerId?: string,
  share: Payout['share'] = 'all',
): Payout[] {
  const scored = entries.map((e) => ({ id: e.playerId, s: scoreFn(e.cards, e.assign) }));
  let best = scored[0]!;
  for (const x of scored) if (compareScores(x.s, best.s) > 0) best = x;
  let winners = scored.filter((x) => compareScores(x.s, best.s) === 0);
  if (winners.length > 1 && rules.tieHandling === 'challenger_loses' && challengerId) {
    const rest = winners.filter((w) => w.id !== challengerId);
    if (rest.length > 0) winners = rest;
  }
  const base = Math.floor(pot / winners.length);
  let extra = pot - base * winners.length;
  return winners.map((w) => ({ playerId: w.id, amount: base + (extra-- > 0 ? 1 : 0), share }));
}
