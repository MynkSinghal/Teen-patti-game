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

/** Evaluate a hand honouring the player's own joker choices; free jokers take their best value. */
export function resolveHand(cards: Card[], ctx: VariationContext, assign?: JokerAssign): ResolvedHand {
  const jIdx = jokerIndexes(cards, ctx);
  const chosen = jIdx.filter((i) => assign?.[String(i)]);
  const free = jIdx.filter((i) => !assign?.[String(i)]);
  const natural = cards.filter((_, i) => !jIdx.includes(i));
  const fixed = chosen.map((i) => assign![String(i)]!);
  const { score, subs } = bestWithJokersDetailed([...natural, ...fixed], free.length, (c) => evalClassic(c, ctx.aceLowSequence));
  const effective = cards.map((c, i) => {
    if (!jIdx.includes(i)) return c;
    if (chosen.includes(i)) return assign![String(i)]!;
    return subs[free.indexOf(i)]!;
  });
  const key = ctx.naturalBeatsJoker ? [...score.key, -jIdx.length] : score.key;
  return {
    score: { key, label: jIdx.length ? `${score.label} (joker)` : score.label, jokers: jIdx.length },
    effective,
    jokerAs: cards.map((_, i) => (jIdx.includes(i) ? effective[i]! : null)),
    auto: cards.map((_, i) => free.includes(i)),
  };
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
