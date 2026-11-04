import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyAction, legalActions, privateView, processTimeout, publicView, startRound } from '@/engine/game';
import { seededRng } from '@/engine/rng';
import { defaultRules } from '@/engine/rules';
import { EngineError, type Action, type EngineState } from '@/engine/types';
import { mkRound, NOW } from './helpers';

const act = (s: EngineState, id: string, a: Action, now = NOW) => applyAction(s, id, a, now).state;
const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return (e as EngineError).code; }
  return null;
};
const total = (s: EngineState) => s.pot + s.players.reduce((t, p) => t + p.balance, 0);

describe('round start', () => {
  it('collects boot, deals 3 unique cards, first turn after dealer', () => {
    const s = mkRound(4);
    expect(s.pot).toBe(40);
    expect(s.players.every((p) => p.balance === 990)).toBe(true);
    expect(Object.values(s.hands).every((h) => h.length === 3)).toBe(true);
    expect(new Set(Object.values(s.hands).flat().map((c) => `${c.rank}${c.suit}`)).size).toBe(12);
    expect(s.turnId).toBe('p0');
    expect(s.turnDeadline).toBe(NOW + 45_000);
  });
  it('sits out players who cannot pay the boot', () => {
    const { state } = startRound({ round: 1, players: [
      { id: 'a', name: 'a', seat: 0, balance: 100 }, { id: 'b', name: 'b', seat: 1, balance: 5 }, { id: 'c', name: 'c', seat: 2, balance: 100 },
    ], dealerSeat: 2, rules: defaultRules(10), variation: 'classic', rng: seededRng(1), now: NOW });
    expect(state.players.map((p) => p.id)).toEqual(['a', 'c']);
  });
  it('refuses with fewer than two funded players', () => {
    expect(code(() => startRound({ round: 1, players: [{ id: 'a', name: 'a', seat: 0, balance: 100 }], dealerSeat: 0, rules: defaultRules(10), variation: 'classic', rng: seededRng(1), now: NOW }))).toBe('NOT_ENOUGH_PLAYERS');
  });
});

describe('betting formulas', () => {
  it('blind pays stake, seen pays 2x stake, raise doubles stake', () => {
    let s = mkRound(3);
    s = act(s, 'p0', { type: 'bet' }); // blind 10
    expect(s.players[0]!.balance).toBe(980);
    s = act(s, 'p1', { type: 'see' });
    s = act(s, 'p1', { type: 'bet' }); // seen 20
    expect(s.players[1]!.balance).toBe(970);
    expect(s.stake).toBe(10);
    s = act(s, 'p2', { type: 'bet', raise: true }); // blind raise: stake 20, pays 20
    expect(s.stake).toBe(20);
    expect(s.players[2]!.balance).toBe(970);
    s = act(s, 'p0', { type: 'see' });
    s = act(s, 'p0', { type: 'bet', raise: true }); // seen raise: stake 40, pays 80
    expect(s.stake).toBe(40);
    expect(s.players[0]!.balance).toBe(900);
    expect(s.pot).toBe(30 + 10 + 20 + 20 + 80);
    expect(total(s)).toBe(3000);
  });
  it('maximum stake enforced', () => {
    let s = mkRound(3, { rules: { maxStake: 20 } });
    s = act(s, 'p0', { type: 'bet', raise: true });
    expect(s.stake).toBe(20);
    expect(code(() => act(s, 'p1', { type: 'bet', raise: true }))).toBe('INVALID_BET');
    expect(legalActions(s, 'p1').bet!.raiseCost).toBeNull();
  });
  it('custom multipliers come only from rules', () => {
    let s = mkRound(3, { rules: { blindMultiplier: 1, seenMultiplier: 3 } });
    s = act(s, 'p0', { type: 'see' });
    s = act(s, 'p0', { type: 'bet' });
    expect(s.players[0]!.balance).toBe(960);
  });
  it('rejects out-of-turn, folded, insufficient', () => {
    let s = mkRound(3);
    expect(code(() => act(s, 'p1', { type: 'bet' }))).toBe('NOT_YOUR_TURN');
    s = act(s, 'p0', { type: 'pack' });
    expect(code(() => act(s, 'p0', { type: 'bet' }))).toBe('ALREADY_FOLDED');
    expect(code(() => act(s, 'ghost', { type: 'bet' }))).toBe('NOT_IN_ROUND');
  });
  it('blind -> seen transition is one-way and free', () => {
    let s = mkRound(3);
    s = act(s, 'p2', { type: 'see' }); // out of turn is OK
    expect(s.players[2]!.seen).toBe(true);
    expect(s.players[2]!.balance).toBe(990);
    expect(code(() => act(s, 'p2', { type: 'see' }))).toBe('ALREADY_SEEN');
  });
});

describe('pack, last standing, payout', () => {
  it('last player wins pot exactly once', () => {
    let s = mkRound(3);
    s = act(s, 'p0', { type: 'bet' });
    s = act(s, 'p1', { type: 'pack' });
    s = act(s, 'p2', { type: 'pack' });
    expect(s.phase).toBe('ended');
    expect(s.pot).toBe(0);
    expect(s.players[0]!.balance).toBe(1020);
    expect(code(() => act(s, 'p0', { type: 'bet' }))).toBe('ROUND_ENDED');
    expect(total(s)).toBe(3000);
  });
});

describe('show', () => {
  const two = (hands: string[]) => {
    let s = mkRound(3, { hands: [...hands, '2S 3H 5D'] });
    s = act(s, 'p2', { type: 'pack' }); // p0 first though
    return s;
  };
  it('requires exactly two players', () => {
    const s = mkRound(3);
    expect(code(() => act(s, 'p0', { type: 'show' }))).toBe('SHOW_NOT_ALLOWED');
  });
  it('higher hand wins; hands revealed publicly; show costs a chaal', () => {
    let s = mkRound(3, { hands: ['AS AH AD', '2S 3H 5D', '4S 6H 9D'] });
    s = act(s, 'p0', { type: 'pack' }); // p0 folds (turn)
    s = act(s, 'p1', { type: 'show' }); // blind show costs 10, challenger p1
    expect(s.phase).toBe('ended');
    expect(s.result!.reveal.map((r) => r.playerId)).toEqual(['p1', 'p2']);
    expect(s.result!.payouts[0]!.playerId).toBe('p2'); // 9-6-4 beats 5-3-2
    expect(total(s)).toBe(3000);
    expect(s.players[2]!.balance).toBe(990 + 30 + 10);
  });
  it('tie: challenger loses by default; split option', () => {
    const h = ['2S 3H 5D', 'AS KH 3D', 'AH KD 3C'];
    let s = mkRound(3, { hands: h });
    s = act(s, 'p0', { type: 'pack' });
    s = act(s, 'p1', { type: 'show' });
    expect(s.result!.payouts).toEqual([{ playerId: 'p2', amount: 40, share: 'all' }]);
    s = mkRound(3, { hands: ['2S 3H 5D', 'AS KH 3D', 'AH KD 3C'], rules: { tieHandling: 'split' } });
    s = act(s, 'p0', { type: 'pack' });
    s = act(s, 'p1', { type: 'show' });
    expect(s.result!.payouts.map((p) => p.amount)).toEqual([20, 20]);
    expect(s.result!.payouts.reduce((t, p) => t + p.amount, 0)).toBe(40);
  });
  it('seen_only eligibility', () => {
    let s = mkRound(3, { rules: { showEligibility: 'seen_only' } });
    s = act(s, 'p0', { type: 'pack' });
    expect(code(() => act(s, 'p1', { type: 'show' }))).toBe('SHOW_NOT_ALLOWED');
    s = act(s, 'p1', { type: 'see' });
    expect(act(s, 'p1', { type: 'show' }).phase).toBe('ended');
  });
  void two;
});

describe('sideshow', () => {
  const setup = (hands: string[]) => {
    let s = mkRound(4, { hands });
    s = act(s, 'p0', { type: 'see' });
    s = act(s, 'p3', { type: 'see' });
    s = act(s, 'p0', { type: 'pack' }); // p1
    s = act(s, 'p1', { type: 'bet' }); // p2
    return s;
  };
  it('only previous seen player is a valid target', () => {
    let s = mkRound(4);
    s = act(s, 'p0', { type: 'see' });
    s = act(s, 'p0', { type: 'bet' });
    s = act(s, 'p1', { type: 'see' });
    expect(legalActions(s, 'p1').sideshow!.targetId).toBe('p0');
    s = act(s, 'p1', { type: 'bet' });
    expect(legalActions(s, 'p2').sideshow).toBeNull(); // p2 blind
    s = act(s, 'p2', { type: 'see' });
    expect(legalActions(s, 'p2').sideshow!.targetId).toBe('p1');
  });
  it('blind players cannot request', () => {
    const s = mkRound(4);
    expect(code(() => act(s, 'p0', { type: 'sideshow_request' }))).toBe('SIDESHOW_NOT_ALLOWED');
  });
  it('accept: weaker folds, private notes only for the two, others see nothing', () => {
    let s = mkRound(4, { hands: ['AS AH AD', '2S 3H 5D', '4S 6H 9D', '7S 8H JD'] });
    s = act(s, 'p0', { type: 'see' });
    s = act(s, 'p0', { type: 'bet' });
    s = act(s, 'p1', { type: 'see' });
    s = act(s, 'p1', { type: 'sideshow_request' });
    expect(s.phase).toBe('sideshow');
    expect(s.players[1]!.balance).toBe(970);
    expect(code(() => act(s, 'p2', { type: 'bet' }))).toBe('SIDESHOW_PENDING');
    expect(code(() => act(s, 'p2', { type: 'sideshow_respond', accept: true }))).toBe('NOT_YOUR_TURN');
    s = act(s, 'p0', { type: 'sideshow_respond', accept: true });
    expect(s.players[1]!.folded).toBe(true); // 5-3-2 loses to trail
    expect(s.turnId).toBe('p2');
    expect(privateView(s, 'p1').notes[0]!.outcome).toBe('lost');
    expect(privateView(s, 'p0').notes[0]!.outcome).toBe('won');
    expect(privateView(s, 'p2').notes).toEqual([]);
    expect(privateView(s, 'p3').notes).toEqual([]);
    expect(JSON.stringify(publicView(s))).not.toMatch(/"rank"/);
  });
  it('decline: continue with next player, request fee stays in pot', () => {
    let s = mkRound(4);
    s = act(s, 'p0', { type: 'see' });
    s = act(s, 'p0', { type: 'bet' });
    s = act(s, 'p1', { type: 'see' });
    s = act(s, 'p1', { type: 'sideshow_request' });
    s = act(s, 'p0', { type: 'sideshow_respond', accept: false });
    expect(s.phase).toBe('betting');
    expect(s.turnId).toBe('p2');
    expect(s.players.every((p) => !p.folded)).toBe(true);
    expect(total(s)).toBe(4000);
  });
  it('tie on sideshow: requester folds by default, nobody with split', () => {
    const hands = ['AS KH 3D', 'AH KD 3C', '4S 6H 9D', '7S 8H JD'];
    const run = (rules = {}) => {
      let s = mkRound(4, { hands, rules });
      s = act(s, 'p0', { type: 'see' }); s = act(s, 'p0', { type: 'bet' });
      s = act(s, 'p1', { type: 'see' }); s = act(s, 'p1', { type: 'sideshow_request' });
      return act(s, 'p0', { type: 'sideshow_respond', accept: true });
    };
    expect(run().players[1]!.folded).toBe(true);
    const sp = run({ tieHandling: 'split' });
    expect(sp.players.some((p) => p.folded)).toBe(false);
    expect(privateView(sp, 'p1').notes[0]!.outcome).toBe('tied');
  });
  it('only one pending, cannot request twice, max requests honoured, disabled', () => {
    let s = mkRound(4);
    s = act(s, 'p0', { type: 'see' }); s = act(s, 'p0', { type: 'bet' });
    s = act(s, 'p1', { type: 'see' }); s = act(s, 'p1', { type: 'sideshow_request' });
    expect(code(() => act(s, 'p1', { type: 'sideshow_request' }))).toBe('SIDESHOW_PENDING');
    const off = mkRound(4, { rules: { sideshowEnabled: false } });
    expect(legalActions(act(off, 'p0', { type: 'see' }), 'p0').sideshow).toBeNull();
    const lim = mkRound(4, { rules: { maxSideshowRequests: 0 } });
    expect(legalActions(act(lim, 'p0', { type: 'see' }), 'p0').sideshow).toBeNull();
  });
  it('not allowed with two players left by default', () => {
    let s = mkRound(3);
    s = act(s, 'p0', { type: 'pack' });
    s = act(s, 'p1', { type: 'see' });
    s = act(s, 'p1', { type: 'bet' });
    s = act(s, 'p2', { type: 'see' });
    expect(legalActions(s, 'p2').sideshow).toBeNull();
    expect(legalActions(s, 'p2').show).not.toBeNull();
  });
  void setup;
});

describe('timeouts', () => {
  it('not before deadline; auto-pack after; deadline advances', () => {
    const s = mkRound(3);
    expect(processTimeout(s, NOW + 44_999)).toBeNull();
    const r = processTimeout(s, NOW + 45_000)!;
    expect(r.state.players[0]!.folded).toBe(true);
    expect(r.state.turnId).toBe('p1');
    expect(r.state.turnDeadline).toBe(NOW + 90_000);
    expect(r.events[0]!.type).toBe('timeout_pack');
  });
  it('ends round when timeout leaves one player', () => {
    let s = mkRound(3);
    s = act(s, 'p0', { type: 'pack' });
    s = processTimeout(s, NOW + 100_000)!.state;
    expect(s.phase).toBe('ended');
    expect(s.players[2]!.balance).toBe(1020);
  });
  it('pending sideshow timeout counts as decline', () => {
    let s = mkRound(4);
    s = act(s, 'p0', { type: 'see' }); s = act(s, 'p0', { type: 'bet' });
    s = act(s, 'p1', { type: 'see' }); s = act(s, 'p1', { type: 'sideshow_request' });
    const r = processTimeout(s, NOW + 31_000)!;
    expect(r.state.phase).toBe('betting');
    expect(r.state.turnId).toBe('p2');
    expect(r.events[0]!.type).toBe('sideshow_timeout');
  });
  it('no timeout once ended', () => {
    let s = mkRound(3);
    s = act(s, 'p0', { type: 'pack' }); s = act(s, 'p1', { type: 'pack' });
    expect(processTimeout(s, NOW + 1e9)).toBeNull();
  });
});

describe('zero balance policy: all-in and side pots', () => {
  it('a short stack gets an all-in option instead of being forced out; balances never go negative', () => {
    let s = mkRound(3, { balance: 25 }); // 15 after boot
    s = act(s, 'p0', { type: 'see' });
    const l = legalActions(s, 'p0');
    expect(l.bet).toBeNull(); // chaal costs 20 > 15
    expect(l.allIn).toEqual({ amount: 15 });
    expect(l.pack).toBe(true);
    expect(code(() => act(s, 'p0', { type: 'bet' }))).toBe('INSUFFICIENT_BALANCE');
    s = act(s, 'p0', { type: 'allin' });
    expect(s.players[0]!.balance).toBe(0);
    expect(s.players[0]!.allIn).toBe(true);
    expect(s.players.every((p) => p.balance >= 0)).toBe(true);
    expect(s.turnId).toBe('p1'); // play continues for the others
  });
  it('all-in is refused when you can afford a normal bet', () => {
    const s = mkRound(3);
    expect(code(() => act(s, 'p0', { type: 'allin' }))).toBe('INVALID_BET');
  });
  it('exactly zero after a bet marks you all-in automatically', () => {
    let s = mkRound(3, { balance: 20 }); // 10 after boot; blind chaal costs 10
    s = act(s, 'p0', { type: 'bet' });
    expect(s.players[0]!.balance).toBe(0);
    expect(s.players[0]!.allIn).toBe(true);
  });
  it('round goes to an automatic showdown when at most one player can still bet', () => {
    let s = mkRound(3, { balance: 25, hands: ['AS KH 3D', '2S 3H 5D', '4S 6H 9D'] });
    s = act(s, 'p0', { type: 'see' });
    s = act(s, 'p0', { type: 'allin' }); // p0 15 more -> committed 25
    s = act(s, 'p1', { type: 'see' });
    s = act(s, 'p1', { type: 'allin' }); // p1 committed 25
    // p2 is the only one who can still act and everyone else is all-in -> showdown right away
    expect(s.phase).toBe('ended');
    expect(s.result!.reason).toBe('showdown');
    expect(s.result!.reveal.map((r) => r.playerId)).toEqual(['p0', 'p1', 'p2']);
    expect(total(s)).toBe(75);
  });
  it('side pots: a short all-in can only win what each player matched', () => {
    let s = mkRound(3, { balance: 1000, hands: ['AS AH AD', '9S 4H 2D', '5S 3H KD'] });
    s.players[0]!.balance = 15; // short: after boot (committed 10) and seen, a chaal costs 20
    s = act(s, 'p0', { type: 'see' });
    s = act(s, 'p0', { type: 'allin' }); // +15 -> committed 25
    s = act(s, 'p1', { type: 'bet', raise: true }); // blind raise: stake 20 -> +20 (committed 30)
    s = act(s, 'p2', { type: 'bet', raise: true }); // stake 40 -> +40 (committed 50)
    s = act(s, 'p1', { type: 'bet' }); // blind +40 (committed 70)
    s = act(s, 'p2', { type: 'pack' }); // leaves all-in p0 and p1 -> automatic showdown
    expect(s.phase).toBe('ended');
    expect(s.result!.reason).toBe('showdown');
    const pots = s.result!.pots!;
    expect(pots.map((p) => [p.amount, p.eligible])).toEqual([[75, ['p0', 'p1']], [70, ['p1']]]);
    // p0 holds a trail of aces: wins the main pot (25 from each of three players) but not the side pot
    expect(s.result!.payouts.find((p) => p.playerId === 'p0')!.amount).toBe(75);
    expect(s.result!.payouts.find((p) => p.playerId === 'p1')!.amount).toBe(70);
    expect(s.pot).toBe(0);
    expect(total(s)).toBe(2025); // 25 + 1000 + 1000: nothing created or lost
    expect(s.players.every((p) => p.balance >= 0)).toBe(true);
  });
  it('all-in show: a short stack may show for whatever they have left', () => {
    let s = mkRound(3, { balance: 1000, hands: ['2S 3H 5D', 'AS KH 3D', '4S 6H 9D'] });
    s = act(s, 'p0', { type: 'pack' });
    s.players[1]!.balance = 4; // blind show would cost 10
    const l = legalActions(s, 'p1');
    expect(l.show).toEqual({ cost: 4, allIn: true });
    s = act(s, 'p1', { type: 'show' });
    expect(s.phase).toBe('ended');
    expect(s.players.every((p) => p.balance >= 0)).toBe(true);
  });
  it('chips are conserved through random play with all-ins (property)', () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 3, max: 6 }), (seed, n) => {
      const rng = seededRng(seed);
      let s = mkRound(n, { balance: 60 + rng.int(200) });
      // uneven stacks so all-ins really happen
      s.players.forEach((p, i) => { if (i % 2 === 0) { s.pot += 0; p.balance = Math.min(p.balance, 15 + rng.int(60)); } });
      const start = total(s);
      let t = NOW;
      for (let i = 0; i < 500 && s.phase !== 'ended'; i++) {
        t += 1000;
        if (s.phase === 'sideshow') { s = act(s, s.pending!.responderId, { type: 'sideshow_respond', accept: rng.int(2) === 0 }, t); continue; }
        const id = s.turnId!;
        const l = legalActions(s, id);
        const opts: Action[] = [{ type: 'pack' }];
        if (l.see) opts.push({ type: 'see' });
        if (l.bet) opts.push({ type: 'bet' });
        if (l.bet?.raiseCost) opts.push({ type: 'bet', raise: true });
        if (l.allIn) opts.push({ type: 'allin' }, { type: 'allin' });
        if (l.sideshow) opts.push({ type: 'sideshow_request' });
        if (l.show) opts.push({ type: 'show' });
        const a = opts[rng.int(opts.length)]!;
        s = act(s, id, a, t);
        if (a.type === 'see' && s.phase !== 'ended' && s.turnId === id) s = act(s, id, { type: 'pack' }, t);
        if (total(s) !== start || s.players.some((p) => p.balance < 0)) return false;
      }
      return s.phase === 'ended' ? total(s) === start && s.pot === 0 : true;
    }), { numRuns: 400 });
  });
});

describe('card privacy', () => {
  it('public view never contains cards; private only after seeing; folded players see nothing', () => {
    let s = mkRound(3);
    expect(JSON.stringify(publicView(s))).not.toContain('"suit"');
    expect(privateView(s, 'p0').cards).toBeNull();
    s = act(s, 'p0', { type: 'see' });
    expect(privateView(s, 'p0').cards).toHaveLength(3);
    expect(privateView(s, 'p1').cards).toBeNull();
    expect(privateView(s, 'nobody').cards).toBeNull();
    s = act(s, 'p0', { type: 'pack' });
    expect(privateView(s, 'p0').cards).toBeNull();
  });
});

describe('property: chip conservation & no negatives', () => {
  it('random legal play conserves chips', () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 3, max: 8 }), (seed, n) => {
      const rng = seededRng(seed);
      let s = mkRound(n, { balance: 400 });
      const start = total(s) + s.rules.boot * 0;
      let t = NOW;
      for (let i = 0; i < 400 && s.phase !== 'ended'; i++) {
        t += 1000;
        if (s.phase === 'sideshow') { s = act(s, s.pending!.responderId, { type: 'sideshow_respond', accept: rng.int(2) === 0 }, t); continue; }
        const id = s.turnId!;
        const l = legalActions(s, id);
        const opts: Action[] = [{ type: 'pack' }];
        if (l.see) opts.push({ type: 'see' });
        if (l.bet) opts.push({ type: 'bet' });
        if (l.bet?.raiseCost) opts.push({ type: 'bet', raise: true });
        if (l.sideshow) opts.push({ type: 'sideshow_request' });
        if (l.show) opts.push({ type: 'show' });
        const a = opts[rng.int(opts.length)]!;
        s = act(s, id, a, t);
        if (a.type === 'see' && s.phase !== 'ended' && s.turnId === id) s = act(s, id, { type: 'pack' }, t);
        if (total(s) !== start || s.players.some((p) => p.balance < 0)) return false;
      }
      return total(s) === start;
    }), { numRuns: 300 });
  });
});

import { leaveRound } from '@/engine/game';

describe('last action, raise data', () => {
  it('records last action and stake on raises', () => {
    let s = mkRound(3);
    s = act(s, 'p0', { type: 'bet', raise: true });
    expect(s.players[0]!.last).toEqual({ type: 'raise', amount: 20, stake: 20 });
    expect(s.log.at(-1)).toMatchObject({ type: 'raise', playerId: 'p0', amount: 20, stake: 20 });
    expect(publicView(s).players[0]!.last!.type).toBe('raise');
    const l = legalActions(s, 'p1');
    expect(l.bet).toEqual({ cost: 20, raiseCost: 40, raiseTo: 40 });
    s = act(s, 'p1', { type: 'pack' });
    expect(s.players[1]!.last).toEqual({ type: 'pack' });
  });
  it('blind-then-seen raise ladder reaches the cap exactly and hides raise afterwards', () => {
    let s = mkRound(3, { rules: { maxStake: 40 }, balance: 5000 });
    s = act(s, 'p0', { type: 'bet', raise: true });
    s = act(s, 'p1', { type: 'bet', raise: true });
    expect(s.stake).toBe(40);
    expect(legalActions(s, 'p2').bet!.raiseTo).toBeNull();
    expect(code(() => act(s, 'p2', { type: 'bet', raise: true }))).toBe('INVALID_BET');
  });
});

describe('leaving mid-round', () => {
  it('packs the leaver, keeps their chips in the pot, passes the turn', () => {
    let s = mkRound(4);
    s = act(s, 'p0', { type: 'bet' });
    const r = leaveRound(s, 'p1', NOW + 1000);
    expect(r.state.players[1]!.folded).toBe(true);
    expect(r.state.pot).toBe(50);
    expect(r.state.turnId).toBe('p2');
    expect(r.events[0]!.type).toBe('left');
  });
  it('last player standing wins when others leave; chips conserved', () => {
    let s = mkRound(3);
    s = leaveRound(s, 'p0', NOW).state;
    s = leaveRound(s, 'p2', NOW).state;
    expect(s.phase).toBe('ended');
    expect(s.players[1]!.balance).toBe(1020);
    expect(total(s)).toBe(3000);
  });
  it('responder leaving a sideshow counts as decline; requester leaving voids it', () => {
    let s = mkRound(4);
    s = act(s, 'p0', { type: 'see' }); s = act(s, 'p0', { type: 'bet' });
    s = act(s, 'p1', { type: 'see' }); s = act(s, 'p1', { type: 'sideshow_request' });
    const a = leaveRound(s, 'p0', NOW + 5);
    expect(a.state.phase).toBe('betting');
    expect(a.state.turnId).toBe('p2');
    const b = leaveRound(s, 'p1', NOW + 5);
    expect(b.state.phase).toBe('betting');
    expect(b.state.pending).toBeNull();
    expect(b.state.turnId).toBe('p2');
    expect(total(b.state)).toBe(4000);
  });
  it('is a no-op for a folded player or after the round', () => {
    let s = mkRound(3);
    s = act(s, 'p0', { type: 'pack' });
    expect(leaveRound(s, 'p0', NOW).events).toEqual([]);
    expect(leaveRound(s, 'nobody', NOW).events).toEqual([]);
  });
});

describe('end of round reveal', () => {
  it('own cards always visible to yourself at the end; winner may reveal after a last-standing win', () => {
    let s = mkRound(3, { hands: ['AS KH 3D', '2S 3H 5D', '4S 6H 9D'] });
    s = act(s, 'p0', { type: 'pack' });
    s = act(s, 'p1', { type: 'pack' });
    expect(s.result!.reveal).toEqual([]);
    expect(privateView(s, 'p0').cards).toHaveLength(3); // own hand after round end
    expect(code(() => act(s, 'p1', { type: 'reveal' }))).toBe('INVALID_ACTION'); // only winner
    s = act(s, 'p2', { type: 'reveal' });
    expect(s.result!.reveal.map((r) => r.playerId)).toEqual(['p2']);
    expect(code(() => act(s, 'p2', { type: 'reveal' }))).toBe('INVALID_ACTION');
    expect(code(() => act(mkRound(3), 'p0', { type: 'reveal' }))).toBe('INVALID_ACTION'); // round running
  });
  it('multiple winners: tie split pays both exactly the pot', () => {
    let s = mkRound(3, { hands: ['2S 3H 5D', 'AS KH 3D', 'AH KD 3C'], rules: { tieHandling: 'split' } });
    s = act(s, 'p0', { type: 'pack' });
    s = act(s, 'p1', { type: 'show' });
    expect(s.result!.payouts).toHaveLength(2);
    expect(s.result!.reveal).toHaveLength(2);
    expect(total(s)).toBe(3000);
  });
});

describe('player-controlled jokers', () => {
  const ak = (hands: string[]) => mkRound(3, { variation: 'ak47', hands });
  it('only seen players can set, only on joker cards, validated', () => {
    let s = ak(['AS 9H 9D', '2S 3H 5D', '6S 8H JD']);
    expect(code(() => act(s, 'p0', { type: 'set_joker', index: 0, as: { rank: 9, suit: 'S' } }))).toBe('INVALID_ACTION'); // not seen yet
    s = act(s, 'p0', { type: 'see' });
    expect(code(() => act(s, 'p0', { type: 'set_joker', index: 1, as: { rank: 9, suit: 'S' } }))).toBe('INVALID_ACTION'); // 9 is natural
    expect(code(() => act(s, 'p0', { type: 'set_joker', index: 0, as: { rank: 99, suit: 'S' } }))).toBe('INVALID_ACTION');
    expect(code(() => act(s, 'p1', { type: 'set_joker', index: 0, as: null }))).toBe('INVALID_ACTION'); // p1 not seen
    s = act(s, 'p0', { type: 'set_joker', index: 0, as: { rank: 9, suit: 'S' } });
    expect(s.assign.p0).toEqual({ '0': { rank: 9, suit: 'S' } });
    expect(code(() => act(mkRound(3), 'p0', { type: 'set_joker', index: 0, as: null }))).toBe('INVALID_ACTION'); // classic: no jokers
  });
  it('auto picks the best value; the player may override it and the label follows', () => {
    let s = ak(['AS 9H 9D', '2S 3H 5D', '6S 8H JD']);
    s = act(s, 'p0', { type: 'see' });
    let pv = privateView(s, 'p0');
    expect(pv.handLabel).toMatch(/Trail of 9s/);
    expect(pv.jokers).toMatchObject({ indexes: [0], auto: [true, false, false] });
    s = act(s, 'p0', { type: 'set_joker', index: 0, as: { rank: 2, suit: 'C' } });
    pv = privateView(s, 'p0');
    expect(pv.handLabel).toMatch(/Pair of 9s/);
    expect(pv.jokers!.as[0]).toEqual({ rank: 2, suit: 'C' });
    expect(pv.jokers!.auto[0]).toBe(false);
    s = act(s, 'p0', { type: 'set_joker', index: 0, as: null }); // back to auto
    expect(privateView(s, 'p0').handLabel).toMatch(/Trail of 9s/);
  });
  it('lowest-card joker: index follows the lowest card', () => {
    let s = mkRound(3, { variation: 'joker', variationOptions: { jokerMode: 'lowest' }, hands: ['KS 2H KD', '4S 6H JD', '7S 8H 9D'] });
    s = act(s, 'p0', { type: 'see' });
    expect(privateView(s, 'p0').jokers!.indexes).toEqual([1]);
    expect(privateView(s, 'p0').handLabel).toMatch(/Trail of Kings/);
  });
  it('show honours the chosen values and reveals who set what; others cannot see it before', () => {
    let s = ak(['AS 9H 9D', '5S 9C 9H', '2S 3H 5D']);
    s = act(s, 'p0', { type: 'pack' }); // wait: p0 is first to act and has a strong hand; make p2 pack instead
    void s;
    s = ak(['2S 3H 5D', 'AS 9H 9D', '5S 9C 9H']);
    s = act(s, 'p0', { type: 'pack' });
    s = act(s, 'p1', { type: 'see' });
    s = act(s, 'p1', { type: 'set_joker', index: 0, as: { rank: 2, suit: 'C' } }); // deliberately weak: pair of 9s
    expect(JSON.stringify(publicView(s))).not.toContain('"assign"');
    expect(privateView(s, 'p2').jokers).toBeNull();
    s = act(s, 'p1', { type: 'show' });
    const r = s.result!;
    const rev = r.reveal.find((x) => x.playerId === 'p1')!;
    expect(rev.jokerAs![0]).toEqual({ rank: 2, suit: 'C' });
    expect(rev.label).toMatch(/Pair of 9s/);
    expect(r.payouts[0]!.playerId).toBe('p2'); // p2 (pair of 9s, 5 kicker... ) vs p1 (pair of 9s, 3? ) sanity: higher kicker wins
  });
  it('auto jokers at a show are reported with their best value', () => {
    let s = ak(['2S 3H 5D', 'AS 9H 9D', '4S 6H JD']);
    s = act(s, 'p0', { type: 'pack' });
    s = act(s, 'p1', { type: 'show' });
    const rev = s.result!.reveal.find((x) => x.playerId === 'p1')!;
    expect(rev.jokerAs![0]!.rank).toBe(9);
    expect(rev.jokerAs![1]).toBeNull();
  });
  it('sideshow shows both players how the jokers were used, privately', () => {
    let s = ak(['AS 9H 9D', '7S 9C 9H', '2S 3H 5D']);
    s = act(s, 'p0', { type: 'see' });
    s = act(s, 'p0', { type: 'bet' });
    s = act(s, 'p1', { type: 'see' });
    s = act(s, 'p1', { type: 'sideshow_request' });
    s = act(s, 'p0', { type: 'sideshow_respond', accept: true });
    const n = privateView(s, 'p1').notes[0]!;
    expect(n.yourJokerAs![0]).toMatchObject({ rank: 9 });
    expect(n.otherJokerAs![0]).toMatchObject({ rank: 9 });
    expect(privateView(s, 'p2').notes).toEqual([]);
  });
  it('cannot change jokers after the round ends or after packing', () => {
    let s = ak(['AS 9H 9D', '2S 3H 5D', '4S 6H JD']);
    s = act(s, 'p0', { type: 'see' });
    s = act(s, 'p0', { type: 'pack' });
    expect(code(() => act(s, 'p0', { type: 'set_joker', index: 0, as: null }))).toBe('ALREADY_FOLDED');
    s = act(s, 'p1', { type: 'pack' });
    expect(code(() => act(s, 'p2', { type: 'set_joker', index: 0, as: null }))).toBe('ROUND_ENDED');
  });
});

describe('sideshow availability reasons', () => {
  it('explains why the sideshow is unavailable', () => {
    let s = mkRound(4);
    expect(legalActions(s, 'p0').sideshowBlocked).toBe('See your cards first');
    s = act(s, 'p0', { type: 'see' });
    expect(legalActions(s, 'p0').sideshowBlocked).toBe('P3 is still blind');
    s = act(s, 'p3', { type: 'see' });
    expect(legalActions(s, 'p0').sideshow).not.toBeNull();
    expect(legalActions(s, 'p0').sideshowBlocked).toBeNull();
    // not my turn -> no reason
    expect(legalActions(s, 'p1').sideshowBlocked).toBeNull();
  });
  it('no reason when only two are left (show applies) or when disabled', () => {
    let s = mkRound(3);
    s = act(s, 'p0', { type: 'pack' });
    expect(legalActions(s, 'p1').sideshowBlocked).toBeNull();
    const off = mkRound(3, { rules: { sideshowEnabled: false } });
    expect(legalActions(off, 'p0').sideshowBlocked).toBeNull();
  });
});
