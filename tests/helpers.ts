import { parseHand } from '@/engine/cards';
import { startRound, type StartRoundInput } from '@/engine/game';
import { seededRng } from '@/engine/rng';
import { defaultRules } from '@/engine/rules';
import type { EngineState, RulesConfig } from '@/engine/types';

export const NOW = 1_000_000;
export function mkRound(
  n: number,
  o: Omit<Partial<StartRoundInput>, 'rules'> & { rules?: Partial<RulesConfig>; balance?: number; hands?: string[] } = {},
): EngineState {
  const { rules: ruleOverrides, balance, hands, ...opts } = o;
  const rules = { ...defaultRules(10), ...(ruleOverrides ?? {}) };
  const { state } = startRound({
    round: 1,
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, seat: i, balance: balance ?? 1000 })),
    dealerSeat: n - 1,
    rules,
    variation: 'classic',
    rng: seededRng(7),
    now: NOW,
    ...opts,
  });
  if (hands) hands.forEach((h, i) => (state.hands[`p${i}`] = parseHand(h)));
  return state;
}
