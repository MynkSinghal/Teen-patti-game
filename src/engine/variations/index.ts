import { RANKS } from '../cards';
import { compareScores, evalClassic } from '../rank';
import type { Card, HandScore, Payout, RulesConfig, VariationContext, VariationId } from '../types';
import { baseContext, classicScore, negate, settleWinnerTakesAll } from './base';
import type { OptionDef, Variation } from './types';

export type { Variation, OptionDef } from './types';
export { VARIATION_DOCS, RANKING_EXAMPLES } from './docs';
export type { VariationDoc } from './docs';

const classic: Variation = {
  id: 'classic',
  name: 'Classic Teen Patti',
  description: 'Standard rankings: Trail > Pure Sequence > Sequence > Color > Pair > High Card.',
  options: [],
  prepare: (_o, rules) => baseContext('classic', 'Classic Teen Patti', rules),
  score: (cards, ctx) => classicScore(cards, ctx),
  settle: (entries, pot, ctx, rules, challengerId) =>
    settleWinnerTakesAll(entries, pot, (c) => classicScore(c, ctx), rules, challengerId),
};

const muflis: Variation = {
  id: 'muflis',
  name: 'Muflis (Lowest Wins)',
  description: 'The ranking is inverted: the lowest hand wins. 2-3-5 offsuit style hands are strong; trails are weakest.',
  options: [],
  prepare: (_o, rules) => baseContext('muflis', 'Muflis (Lowest Wins)', rules),
  score: (cards, ctx) => negate(evalClassic(cards, ctx.aceLowSequence)),
  settle: (entries, pot, ctx, rules, challengerId) =>
    settleWinnerTakesAll(entries, pot, (c) => negate(evalClassic(c, ctx.aceLowSequence)), rules, challengerId),
};

const ak47: Variation = {
  id: 'ak47',
  name: 'AK47',
  description: 'Every Ace, King, Four and Seven is a joker and may stand in for any card.',
  options: [],
  prepare: (_o, rules) => ({ ...baseContext('ak47', 'AK47', rules), jokerRanks: [14, 13, 4, 7] }),
  score: (cards, ctx) => classicScore(cards, ctx),
  settle: (entries, pot, ctx, rules, challengerId) =>
    settleWinnerTakesAll(entries, pot, (c) => classicScore(c, ctx), rules, challengerId),
};

const rankChoices = RANKS.map((r) => ({ value: String(r), label: ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[r] ?? String(r) }));

const jokerOptions: OptionDef[] = [
  {
    key: 'jokerMode',
    label: 'Joker mode',
    type: 'select',
    default: 'single',
    choices: [
      { value: 'single', label: 'Single joker rank' },
      { value: 'double', label: 'Double joker (two ranks)' },
      { value: 'lowest', label: 'Lowest card in hand is joker' },
    ],
  },
  {
    key: 'jokerRanks',
    label: 'Designated joker ranks',
    type: 'ranks',
    default: [],
    choices: rankChoices,
    help: 'Leave empty to draw the joker rank(s) randomly each round (shown openly to everyone).',
  },
];

function drawRanks(count: number, rng: { int(n: number): number }): number[] {
  const pool = [...RANKS];
  const out: number[] = [];
  while (out.length < count) out.push(pool.splice(rng.int(pool.length), 1)[0]!);
  return out;
}

const joker: Variation = {
  id: 'joker',
  name: 'Joker Teen Patti',
  description:
    'Designated joker ranks (single or double) or the lowest card of each hand act as wildcards. Fewer jokers wins an otherwise equal hand.',
  options: jokerOptions,
  prepare(opts, rules, _round, rng) {
    const ctx = baseContext('joker', 'Joker Teen Patti', rules);
    const mode = opts.jokerMode === 'double' || opts.jokerMode === 'lowest' ? opts.jokerMode : 'single';
    if (mode === 'lowest') return { ...ctx, name: 'Joker (Lowest Card)', lowestCardJoker: true };
    const want = mode === 'double' ? 2 : 1;
    const host = Array.isArray(opts.jokerRanks) ? (opts.jokerRanks as number[]).filter((r) => RANKS.includes(r)) : [];
    const ranks = host.length ? [...new Set(host)].slice(0, want) : drawRanks(want, rng);
    return { ...ctx, name: mode === 'double' ? 'Double Joker' : 'Single Joker', jokerRanks: ranks };
  },
  score: (cards, ctx) => classicScore(cards, ctx),
  settle: (entries, pot, ctx, rules, challengerId) =>
    settleWinnerTakesAll(entries, pot, (c) => classicScore(c, ctx), rules, challengerId),
};

/* ---------- 999 ---------- */
const digit = (c: Card) => (c.rank === 14 ? 1 : c.rank >= 10 ? 0 : c.rank);
/**
 * House interpretation: Ace=1, 2-9 pips, 10/J/Q/K=0. The three digits sorted descending form a
 * number; 999 (three nines) is the perfect hand. Closest to 999 wins (i.e. the highest number).
 * Ties fall back to the classic ranking.
 */
function score999(cards: Card[], ctx: VariationContext): HandScore {
  const d = cards.map(digit).sort((a, b) => b - a);
  const n = d[0]! * 100 + d[1]! * 10 + d[2]!;
  const c = evalClassic(cards, ctx.aceLowSequence);
  return { key: [n, ...c.key], label: `${String(n).padStart(3, '0')} (${999 - n} from 999)` };
}
const nine99: Variation = {
  id: 'nine99',
  name: '999',
  description: 'Digits (A=1, 2-9, face/10=0) sorted high-to-low form a number. Closest to 999 wins; ties use classic ranking.',
  options: [],
  prepare: (_o, rules) => baseContext('nine99', '999', rules),
  score: score999,
  settle: (entries, pot, ctx, rules, challengerId) =>
    settleWinnerTakesAll(entries, pot, (c) => score999(c, ctx), rules, challengerId),
};

/* ---------- 10-20 ---------- */
const points = (c: Card) => (c.rank === 14 ? 1 : c.rank >= 10 ? 10 : c.rank);
/**
 * House interpretation: Ace=1, 2-9 pips, 10/J/Q/K=10. A hand whose total lies in the
 * [10, 20] window is "in range"; in-range hands beat all others and the higher total wins.
 * Out-of-range hands rank by closeness to the window. Ties use classic ranking.
 */
function scoreTenTwenty(cards: Card[], ctx: VariationContext): HandScore {
  const total = cards.reduce((s, c) => s + points(c), 0);
  const c = evalClassic(cards, ctx.aceLowSequence);
  const inRange = total >= ctx.tenTwentyMin && total <= ctx.tenTwentyMax;
  const dist = total < ctx.tenTwentyMin ? ctx.tenTwentyMin - total : total - ctx.tenTwentyMax;
  return {
    key: inRange ? [1, total, ...c.key] : [0, -dist, ...c.key],
    label: inRange ? `Total ${total} (in range)` : `Total ${total} (out of range)`,
  };
}
const ten20: Variation = {
  id: 'ten20',
  name: '10–20',
  description: 'Card total (A=1, face=10) must land between 10 and 20. In-range hands beat out-of-range; higher in-range total wins.',
  options: [],
  prepare: (_o, rules) => baseContext('ten20', '10–20', rules),
  score: scoreTenTwenty,
  settle: (entries, pot, ctx, rules, challengerId) =>
    settleWinnerTakesAll(entries, pot, (c) => scoreTenTwenty(c, ctx), rules, challengerId),
};

/* ---------- Hi-Lo ---------- */
const hilo: Variation = {
  id: 'hilo',
  name: 'Hi-Lo',
  description: 'Pot is split between the highest and lowest hand, or won by the high/low hand only, per host setting.',
  options: [
    {
      key: 'hiLoMode',
      label: 'Winning condition',
      type: 'select',
      default: 'split',
      choices: [
        { value: 'split', label: 'Split pot: half high, half low' },
        { value: 'high', label: 'High hand wins' },
        { value: 'low', label: 'Low hand wins' },
        { value: 'alternate', label: 'Alternate high / low each round' },
      ],
    },
  ],
  prepare(opts, rules, round) {
    const m = opts.hiLoMode;
    let mode: 'split' | 'high' | 'low' = 'split';
    if (m === 'high' || m === 'low') mode = m;
    else if (m === 'alternate') mode = round % 2 === 1 ? 'high' : 'low';
    return { ...baseContext('hilo', `Hi-Lo (${mode})`, rules), hiLoMode: mode };
  },
  score: (cards, ctx) => {
    const s = evalClassic(cards, ctx.aceLowSequence);
    return ctx.hiLoMode === 'low' ? negate(s) : s;
  },
  settle(entries, pot, ctx, rules, challengerId): Payout[] {
    const hi = (c: Card[]) => evalClassic(c, ctx.aceLowSequence);
    const lo = (c: Card[]) => negate(hi(c));
    if (ctx.hiLoMode === 'high') return settleWinnerTakesAll(entries, pot, hi, rules, challengerId, 'high');
    if (ctx.hiLoMode === 'low') return settleWinnerTakesAll(entries, pot, lo, rules, challengerId, 'low');
    const highPot = Math.ceil(pot / 2);
    const merged = new Map<string, Payout>();
    const add = (ps: Payout[]) =>
      ps.forEach((p) => {
        const cur = merged.get(p.playerId);
        if (cur) cur.amount += p.amount;
        else merged.set(p.playerId, { ...p });
      });
    add(settleWinnerTakesAll(entries, highPot, hi, rules, challengerId, 'high'));
    add(settleWinnerTakesAll(entries, pot - highPot, lo, rules, challengerId, 'low'));
    return [...merged.values()];
  },
};

export const VARIATIONS: Record<string, Variation> = { classic, muflis, ak47, joker, nine99, ten20, hilo };

export const DEALERS_CHOICE = {
  id: 'dealers_choice' as const,
  name: "Dealer's Choice",
  description: 'The host picks the variation (and its options) before every round.',
};

export const VARIATION_LIST = [
  ...Object.values(VARIATIONS).map((v) => ({ id: v.id as VariationId, name: v.name, description: v.description, options: v.options })),
  { ...DEALERS_CHOICE, options: [] as OptionDef[] },
];

export function getVariation(id: string): Variation {
  const v = VARIATIONS[id];
  if (!v) throw new Error(`Unknown variation ${id}`);
  return v;
}

export { compareScores };
export type { RulesConfig };
