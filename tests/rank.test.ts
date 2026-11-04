import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createDeck, deal, parseHand, shuffle } from '@/engine/cards';
import { compareScores, evalClassic, CATEGORY } from '@/engine/rank';
import { cryptoRng, seededRng } from '@/engine/rng';

const ev = (s: string, ace: 'second' | 'lowest' | 'none' = 'second') => evalClassic(parseHand(s), ace);
const cmp = (a: string, b: string, ace: 'second' | 'lowest' | 'none' = 'second') => compareScores(ev(a, ace), ev(b, ace));

describe('deck', () => {
  it('has 52 unique cards', () => {
    const d = createDeck();
    expect(d).toHaveLength(52);
    expect(new Set(d.map((c) => `${c.rank}${c.suit}`)).size).toBe(52);
  });
  it('deals exactly 3 unique cards each with crypto rng', () => {
    for (let n = 2; n <= 8; n++) {
      const hands = deal(n, cryptoRng);
      const all = hands.flat().map((c) => `${c.rank}${c.suit}`);
      expect(hands.every((h) => h.length === 3)).toBe(true);
      expect(new Set(all).size).toBe(n * 3);
    }
  });
  it('shuffle is a permutation', () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const s = shuffle(createDeck(), seededRng(seed));
      return new Set(s.map((c) => `${c.rank}${c.suit}`)).size === 52;
    }), { numRuns: 50 });
  });
  it('does not use Math.random in engine sources', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
    for (const f of walk('src/engine')) expect(readFileSync(f, 'utf8')).not.toMatch(/Math\.random/);
  });
});

describe('categories', () => {
  it('detects every category', () => {
    expect(ev('AS AH AD').key[0]).toBe(CATEGORY.TRAIL);
    expect(ev('2S 2H 2D').key[0]).toBe(CATEGORY.TRAIL);
    expect(ev('KS QS JS').key[0]).toBe(CATEGORY.PURE_SEQUENCE);
    expect(ev('KS QS JH').key[0]).toBe(CATEGORY.SEQUENCE);
    expect(ev('AS 9S 4S').key[0]).toBe(CATEGORY.COLOR);
    expect(ev('KS KH 4D').key[0]).toBe(CATEGORY.PAIR);
    expect(ev('KS 9H 4D').key[0]).toBe(CATEGORY.HIGH);
  });
  it('pair is found in all positions', () => {
    for (const h of ['5S 5H 9D', '5S 9H 5D', '9S 5H 5D']) expect(ev(h).key).toEqual([CATEGORY.PAIR, 5, 9]);
    for (const h of ['9S 9H 5D', '9S 5H 9D']) expect(ev(h).key).toEqual([CATEGORY.PAIR, 9, 5]);
  });
});

describe('hierarchy', () => {
  const ladder = ['2S 2H 2D', 'AS KS QH'.replace('QH', 'QS'), 'AS KH QD', 'AS KS 9S', 'AS AH 2D', 'AS KH 9D'];
  it('trail > pure seq > seq > color > pair > high', () => {
    expect(cmp('2S 2H 2D', 'AS KS QS')).toBeGreaterThan(0);
    expect(cmp('AS KS QS', 'AS KH QD')).toBeGreaterThan(0);
    expect(cmp('4S 3H 2D', 'AS KS 9S')).toBeGreaterThan(0);
    expect(cmp('4S 5S 9S', 'AS AH KD')).toBeGreaterThan(0);
    expect(cmp('2S 2H 3D', 'AS KH QD'.replace('QD', '9D'))).toBeGreaterThan(0);
    void ladder;
  });
  it('compares within categories', () => {
    expect(cmp('AS AH AD', 'KS KH KD')).toBeGreaterThan(0);
    expect(cmp('KS KH 2D', 'QS QH AD')).toBeGreaterThan(0);
    expect(cmp('KS KH 5D', 'KD KC 4H')).toBeGreaterThan(0); // kicker
    expect(cmp('AS 9S 4S', 'AH 9H 3H')).toBeGreaterThan(0);
    expect(cmp('AS KH 3D', 'AD KC 2H')).toBeGreaterThan(0);
  });
  it('suits never break ties', () => {
    expect(cmp('AS KH 3D', 'AH KD 3C')).toBe(0);
    expect(cmp('AS KS 3S', 'AH KH 3H')).toBe(0);
    expect(cmp('KS QS JS', 'KH QH JH')).toBe(0);
  });
});

describe('sequences & ace', () => {
  it('ace-high sequence is the best', () => {
    expect(cmp('AS KH QD', 'KS QH JD')).toBeGreaterThan(0);
  });
  it('A-2-3 second highest by default', () => {
    expect(ev('AS 2H 3D').key[0]).toBe(CATEGORY.SEQUENCE);
    expect(cmp('AS KH QD', 'AS 2H 3D')).toBeGreaterThan(0);
    expect(cmp('AS 2H 3D', 'KS QH JD')).toBeGreaterThan(0);
  });
  it('A-2-3 lowest rule', () => {
    expect(cmp('AS 2H 3D', '2S 3H 4D', 'lowest')).toBeLessThan(0);
    expect(cmp('AS KH QD', 'AS 2H 3D', 'lowest')).toBeGreaterThan(0);
  });
  it('A-2-3 not a sequence when disabled', () => {
    expect(ev('AS 2H 3D', 'none').key[0]).toBe(CATEGORY.HIGH);
    expect(ev('AS 2S 3S', 'none').key[0]).toBe(CATEGORY.COLOR);
  });
  it('no wrap-around (K-A-2, Q-K-A is just AKQ)', () => {
    expect(ev('KS AH 2D').key[0]).toBe(CATEGORY.HIGH);
    expect(ev('QS KH AD').key).toEqual([CATEGORY.SEQUENCE, 14]);
  });
  it('2-3-4 is the lowest sequence normally', () => {
    expect(cmp('2S 3H 4D', 'AS 4H 5D')).toBeGreaterThan(0);
    expect(cmp('3S 4H 5D', '2S 3H 4D')).toBeGreaterThan(0);
  });
});

describe('properties', () => {
  const handArb = fc.integer().map((seed) => deal(2, seededRng(seed)));
  it('comparison is antisymmetric and consistent', () => {
    fc.assert(fc.property(handArb, ([a, b]) => {
      const sa = evalClassic(a!), sb = evalClassic(b!);
      return compareScores(sa, sb) === -compareScores(sb, sa) && compareScores(sa, sa) === 0;
    }), { numRuns: 500 });
  });
  it('hand order is permutation invariant', () => {
    fc.assert(fc.property(handArb, ([a]) => {
      const rev = [...a!].reverse();
      return compareScores(evalClassic(a!), evalClassic(rev)) === 0;
    }), { numRuns: 300 });
  });
  it('category distribution over all 22100 hands is exact', () => {
    const deck = createDeck();
    const counts: Record<number, number> = {};
    for (let i = 0; i < 52; i++) for (let j = i + 1; j < 52; j++) for (let k = j + 1; k < 52; k++) {
      const c = evalClassic([deck[i]!, deck[j]!, deck[k]!]).key[0]!;
      counts[c] = (counts[c] ?? 0) + 1;
    }
    expect(counts).toEqual({ 6: 52, 5: 48, 4: 720, 3: 1096, 2: 3744, 1: 16440 });
  });
});
