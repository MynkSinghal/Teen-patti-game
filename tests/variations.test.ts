import { describe, expect, it } from 'vitest';
import { parseHand } from '@/engine/cards';
import { seededRng } from '@/engine/rng';
import { defaultRules } from '@/engine/rules';
import { getVariation, VARIATION_LIST } from '@/engine/variations';

const rules = defaultRules(10);
const ctxOf = (id: string, opts = {}, round = 1) => getVariation(id).prepare(opts, rules, round, seededRng(3));
const sc = (id: string, h: string, opts = {}, round = 1) => {
  const v = getVariation(id);
  return v.score(parseHand(h), v.prepare(opts, rules, round, seededRng(3)));
};
const gt = (id: string, a: string, b: string, opts = {}) => {
  const A = sc(id, a, opts), B = sc(id, b, opts);
  for (let i = 0; i < Math.max(A.key.length, B.key.length); i++) {
    const d = (A.key[i] ?? 0) - (B.key[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
};

describe('registry', () => {
  it('exposes all required variations', () => {
    const ids = VARIATION_LIST.map((v) => v.id);
    for (const id of ['classic', 'muflis', 'ak47', 'joker', 'nine99', 'ten20', 'hilo', 'dealers_choice']) expect(ids).toContain(id);
  });
});
describe('muflis', () => {
  it('lowest hand wins, trail is worst', () => {
    expect(gt('muflis', '5S 3H 2D', 'AS KH QD')).toBe(true);
    expect(gt('muflis', '5S 3H 2D', '4S 3H 2D')).toBe(true); // sequence 2-3-4 is a strong hand, so worse in muflis
    expect(gt('muflis', '7S 4H 2D', 'AS AH AD')).toBe(true);
    expect(gt('muflis', '5S 3H 2D', '6S 3H 2D')).toBe(true);
  });
});
describe('ak47', () => {
  it('A K 4 7 are jokers', () => {
    expect(ctxOf('ak47').jokerRanks.sort((a, b) => a - b)).toEqual([4, 7, 13, 14]);
    expect(sc('ak47', 'AS KH 4D').label).toMatch(/Trail/); // 3 jokers = AAA
    expect(sc('ak47', 'AS 9H 9D').label).toMatch(/Trail of 9s/);
    expect(sc('ak47', '2S 3S 7D').label).toMatch(/Pure Sequence/);
  });
  it('natural trail beats joker trail of same rank', () => {
    expect(gt('ak47', '9S 9H 9D', '9S 9H 7D')).toBe(true);
  });
});
describe('joker', () => {
  it('host designated single joker', () => {
    const ctx = ctxOf('joker', { jokerMode: 'single', jokerRanks: [5] });
    expect(ctx.jokerRanks).toEqual([5]);
    expect(sc('joker', '5S 9H 9D', { jokerMode: 'single', jokerRanks: [5] }).label).toMatch(/Trail of 9s/);
    expect(sc('joker', '5S KS QS', { jokerMode: 'single', jokerRanks: [5] }).label).toMatch(/Pure Sequence/);
  });
  it('double joker', () => {
    const o = { jokerMode: 'double', jokerRanks: [5, 6] };
    expect(ctxOf('joker', o).jokerRanks).toEqual([5, 6]);
    expect(sc('joker', '5S 6H 9D', o).label).toMatch(/Trail of 9s/);
  });
  it('random joker ranks drawn when not designated', () => {
    expect(ctxOf('joker', { jokerMode: 'double' }).jokerRanks).toHaveLength(2);
  });
  it('lowest card joker', () => {
    const o = { jokerMode: 'lowest' };
    expect(sc('joker', '2S KH KD', o).label).toMatch(/Trail of Kings/);
    expect(sc('joker', '2S 9H 8D', o).label).toMatch(/Pure Sequence|Sequence/);
  });
});
describe('999', () => {
  it('closest to 999 wins', () => {
    expect(gt('nine99', '9S 9H 9D', '9S 9H 8D')).toBe(true);
    expect(sc('nine99', '9S 9H 9D').key[0]).toBe(999);
    expect(sc('nine99', 'KS QH JD').key[0]).toBe(0);
    expect(gt('nine99', '9S 8H 1D'.replace('1D', 'AD'), '9S 8H 7D')).toBe(false);
  });
});
describe('10-20', () => {
  it('in range beats out of range; higher in-range wins', () => {
    expect(gt('ten20', '9S 5H 4D', 'KS KH KD')).toBe(true); // 18 vs 30
    expect(gt('ten20', '9S 9H 2D', '9S 5H 4D')).toBe(true); // 20 vs 18
    expect(gt('ten20', 'KS KH KD', '2S 3H 4D')).toBe(false); // 30 (dist10) vs 9 (dist1)
    expect(gt('ten20', 'AS 2H 3D', 'KS KH KD')).toBe(true);
  });
});
describe('hilo', () => {
  const entries = [
    { playerId: 'a', cards: parseHand('AS AH AD') },
    { playerId: 'b', cards: parseHand('5S 3H 2D') },
  ];
  it('split pays half high / half low', () => {
    const v = getVariation('hilo');
    const p = v.settle(entries, 101, v.prepare({ hiLoMode: 'split' }, rules, 1, seededRng(1)), rules);
    expect(p.find((x) => x.playerId === 'a')!.amount).toBe(51);
    expect(p.find((x) => x.playerId === 'b')!.amount).toBe(50);
    expect(p.reduce((s, x) => s + x.amount, 0)).toBe(101);
  });
  it('high / low / alternate modes', () => {
    const v = getVariation('hilo');
    const mk = (m: string, round = 1) => v.settle(entries, 100, v.prepare({ hiLoMode: m }, rules, round, seededRng(1)), rules);
    expect(mk('high')).toEqual([{ playerId: 'a', amount: 100, share: 'high' }]);
    expect(mk('low')).toEqual([{ playerId: 'b', amount: 100, share: 'low' }]);
    expect(mk('alternate', 1)[0]!.playerId).toBe('a');
    expect(mk('alternate', 2)[0]!.playerId).toBe('b');
  });
});
describe('tie handling', () => {
  it('challenger loses on exact tie, or split', () => {
    const v = getVariation('classic');
    const ctx = v.prepare({}, rules, 1, seededRng(1));
    const e = [{ playerId: 'a', cards: parseHand('AS KH 3D') }, { playerId: 'b', cards: parseHand('AH KD 3C') }];
    expect(v.settle(e, 100, ctx, rules, 'a')).toEqual([{ playerId: 'b', amount: 100, share: 'all' }]);
    const split = v.settle(e, 101, ctx, { ...rules, tieHandling: 'split' }, 'a');
    expect(split.map((x) => x.amount).sort()).toEqual([50, 51]);
  });
});
