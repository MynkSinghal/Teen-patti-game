import { compareScores, bestWithJokers, evalClassic } from '../rank';
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

/** Which cards of a hand are jokers under the context. */
export function splitJokers(cards: Card[], ctx: VariationContext): { natural: Card[]; jokers: number } {
  if (ctx.lowestCardJoker) {
    let idx = 0;
    cards.forEach((c, i) => {
      if (c.rank < cards[idx]!.rank) idx = i;
    });
    return { natural: cards.filter((_, i) => i !== idx), jokers: 1 };
  }
  if (ctx.jokerRanks.length) {
    const natural = cards.filter((c) => !ctx.jokerRanks.includes(c.rank));
    return { natural, jokers: cards.length - natural.length };
  }
  return { natural: cards, jokers: 0 };
}

/** Classic high-hand score with joker substitution; fewer jokers wins an otherwise exact tie. */
export function classicScore(cards: Card[], ctx: VariationContext): HandScore & { jokers: number } {
  const { natural, jokers } = splitJokers(cards, ctx);
  const s = bestWithJokers(natural, jokers, (c) => evalClassic(c, ctx.aceLowSequence));
  const key = ctx.naturalBeatsJoker ? [...s.key, -jokers] : s.key;
  return { key, label: jokers ? `${s.label} (with joker)` : s.label, jokers };
}

export const negate = (s: HandScore): HandScore => ({ key: s.key.map((x) => -x), label: s.label });

/** Winner-takes-all settlement honouring the host's tie rule. */
export function settleWinnerTakesAll(
  entries: { playerId: string; cards: Card[] }[],
  pot: number,
  scoreFn: (cards: Card[]) => HandScore,
  rules: RulesConfig,
  challengerId?: string,
  share: Payout['share'] = 'all',
): Payout[] {
  const scored = entries.map((e) => ({ id: e.playerId, s: scoreFn(e.cards) }));
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
