import { randomInt } from 'node:crypto';
import type { Rng } from './types';

/** Cryptographically secure RNG (Node crypto). The only RNG used to deal cards. */
export const cryptoRng: Rng = { int: (max) => randomInt(0, max) };

/** Deterministic RNG for tests only (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    int(max) {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max);
    },
  };
}
