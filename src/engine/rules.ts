import type { EnginePlayer, RulesConfig } from './types';

export function defaultRules(boot = 10): RulesConfig {
  return {
    boot,
    minStake: boot,
    maxStake: boot * 64,
    blindMultiplier: 1,
    seenMultiplier: 2,
    raiseFactor: 2,
    showEligibility: 'any',
    showCost: 'chaal',
    sideshowEnabled: true,
    sideshowWhenTwoLeft: false,
    maxSideshowRequests: 5,
    tieHandling: 'challenger_loses',
    aceLowSequence: 'second',
    turnSeconds: 45,
    sideshowSeconds: 30,
  };
}

/** Amount a player pays to "call" at the given stake (blind pays blindMultiplier*stake, seen pays seenMultiplier*stake). */
export function chaalCost(rules: RulesConfig, stake: number, seen: boolean): number {
  return Math.ceil(stake * (seen ? rules.seenMultiplier : rules.blindMultiplier));
}

export function raisedStake(rules: RulesConfig, stake: number): number {
  return Math.ceil(stake * rules.raiseFactor);
}

export function canRaise(rules: RulesConfig, stake: number): boolean {
  return raisedStake(rules, stake) <= rules.maxStake;
}

export const betCost = (rules: RulesConfig, stake: number, p: Pick<EnginePlayer, 'seen'>, raise: boolean) =>
  chaalCost(rules, raise ? raisedStake(rules, stake) : stake, p.seen);
