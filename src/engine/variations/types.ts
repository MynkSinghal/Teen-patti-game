import type { Card, ConcreteVariationId, HandScore, Payout, Rng, RulesConfig, VariationContext } from '../types';

export interface OptionDef {
  key: string;
  label: string;
  type: 'select' | 'ranks' | 'boolean';
  choices?: { value: string; label: string }[];
  default: unknown;
  help?: string;
}

export interface Variation {
  id: ConcreteVariationId;
  name: string;
  description: string;
  options: OptionDef[];
  /** Resolve per-round context (e.g. randomly drawn joker ranks). */
  prepare(opts: Record<string, unknown>, rules: RulesConfig, round: number, rng: Rng): VariationContext;
  /** Higher key wins. Used for show, sideshow and ordinary comparison. */
  score(cards: Card[], ctx: VariationContext): HandScore;
  /** Split the pot between showdown entrants. Entries are in seat order. */
  settle(
    entries: { playerId: string; cards: Card[] }[],
    pot: number,
    ctx: VariationContext,
    rules: RulesConfig,
    challengerId?: string,
  ): Payout[];
}
