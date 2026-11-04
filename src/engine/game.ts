import { deal } from './cards';
import { betCost, canRaise, chaalCost, raisedStake } from './rules';
import type {
  Action,
  EnginePlayer,
  EngineState,
  Payout,
  PublicEvent,
  Rng,
  RoundResult,
  RulesConfig,
  VariationId,
} from './types';
import { EngineError } from './types';
import { getVariation } from './variations';
import { jokerIndexes, resolveHand } from './variations/base';

const MAX_LOG = 40;

export interface StartRoundInput {
  round: number;
  players: { id: string; name: string; seat: number; balance: number }[];
  /** Seat of the dealer for this round; first turn goes to the next funded seat. */
  dealerSeat: number;
  rules: RulesConfig;
  variation: Exclude<VariationId, 'dealers_choice'>;
  variationOptions?: Record<string, unknown>;
  rng: Rng;
  now: number;
}

export interface StepOutput {
  state: EngineState;
  events: PublicEvent[];
}

const clone = <T>(x: T): T => structuredClone(x);

function push(state: EngineState, events: PublicEvent[], e: Omit<PublicEvent, 'seq'>) {
  const ev = { ...e, seq: ++state.seq };
  state.log.push(ev);
  if (state.log.length > MAX_LOG) state.log.shift();
  events.push(ev);
}

export const activePlayers = (s: EngineState) => s.players.filter((p) => !p.folded);
const getPlayer = (s: EngineState, id: string) => s.players.find((p) => p.id === id);

/** Players who can pay the boot take part; others sit out. */
export function startRound(input: StartRoundInput): StepOutput {
  const { rules } = input;
  const funded = input.players.filter((p) => p.balance >= rules.boot).sort((a, b) => a.seat - b.seat);
  if (funded.length < 2) throw new EngineError('NOT_ENOUGH_PLAYERS', 'At least two players need enough chips for the boot.');
  const variation = getVariation(input.variation);
  const ctx = variation.prepare(input.variationOptions ?? {}, rules, input.round, input.rng);
  const hands = deal(funded.length, input.rng);

  const players: EnginePlayer[] = funded.map((p) => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    balance: p.balance - rules.boot,
    committed: rules.boot,
    seen: false,
    folded: false,
    sideshowRequests: 0,
    allIn: p.balance - rules.boot === 0,
  }));
  const state: EngineState = {
    round: input.round,
    variation: input.variation,
    ctx,
    rules,
    players,
    dealerSeat: input.dealerSeat,
    pot: rules.boot * players.length,
    stake: Math.max(rules.minStake, rules.boot),
    phase: 'betting',
    turnId: null,
    turnDeadline: null,
    pending: null,
    hands: Object.fromEntries(players.map((p, i) => [p.id, hands[i]!])),
    notes: {},
    assign: {},
    result: null,
    log: [],
    seq: 0,
  };
  const events: PublicEvent[] = [];
  push(state, events, { type: 'round_started' });
  for (const p of players) push(state, events, { type: 'boot', playerId: p.id, amount: rules.boot });
  // first turn: first seat after the dealer that can still act
  const startIdx = Math.max(0, players.findIndex((p) => p.seat > input.dealerSeat));
  const ordered = [...players.slice(startIdx), ...players.slice(0, startIdx)];
  if (!settleIfDone(state, events)) assignTurn(state, ordered.find((p) => !p.allIn)!.id, input.now, events);
  return { state, events };
}

/** Next player who can still act (not packed, not all-in). */
function nextActorAfter(state: EngineState, id: string): EnginePlayer {
  const n = state.players.length;
  const i = state.players.findIndex((p) => p.id === id);
  for (let k = 1; k <= n; k++) {
    const p = state.players[(i + k) % n]!;
    if (!p.folded && !p.allIn) return p;
  }
  throw new Error('no players who can act');
}

/** Pass the turn on (or end the round if nobody can act any more). */
function advance(state: EngineState, fromId: string, now: number, events: PublicEvent[]) {
  if (settleIfDone(state, events)) return;
  assignTurn(state, nextActorAfter(state, fromId).id, now, events);
}
function previousActiveBefore(state: EngineState, id: string): EnginePlayer {
  const n = state.players.length;
  const i = state.players.findIndex((p) => p.id === id);
  for (let k = 1; k <= n; k++) {
    const p = state.players[(i - k + n * 2) % n]!;
    if (!p.folded) return p;
  }
  throw new Error('no active players');
}

function assignTurn(state: EngineState, id: string, now: number, _events: PublicEvent[]) {
  state.turnId = id;
  state.turnDeadline = now + state.rules.turnSeconds * 1000;
  state.phase = 'betting';
  state.pending = null;
}

/** Ends the round when one player is left, or when nobody (but at most one player) can still bet. */
function settleIfDone(state: EngineState, events: PublicEvent[]): boolean {
  if (state.phase === 'ended') return true;
  const alive = activePlayers(state);
  if (alive.length === 1) {
    const w = alive[0]!;
    endRound(state, events, {
      reason: 'last_standing',
      pot: state.pot,
      payouts: [{ playerId: w.id, amount: state.pot, share: 'all' }],
      reveal: [],
    });
    return true;
  }
  const able = alive.filter((p) => !p.allIn);
  if (alive.length >= 2 && able.length <= 1 && alive.some((p) => p.allIn)) {
    settlePots(state, events, 'showdown');
    return true;
  }
  return false;
}

function endRound(state: EngineState, events: PublicEvent[], result: RoundResult) {
  for (const p of result.payouts) {
    const pl = getPlayer(state, p.playerId)!;
    pl.balance += p.amount;
  }
  state.pot = 0;
  state.phase = 'ended';
  state.turnId = null;
  state.turnDeadline = null;
  state.pending = null;
  state.result = result;
  push(state, events, { type: 'round_ended' });
}

function showAllowed(state: EngineState, p: EnginePlayer): boolean {
  if (activePlayers(state).length !== 2) return false;
  if (state.rules.showEligibility === 'seen_only' && !p.seen) return false;
  return true;
}
const showCost = (state: EngineState, p: EnginePlayer) =>
  state.rules.showCost === 'free' ? 0 : chaalCost(state.rules, state.stake, p.seen);

function sideshowTarget(state: EngineState, p: EnginePlayer): EnginePlayer | null {
  const r = state.rules;
  if (!r.sideshowEnabled || !p.seen) return null;
  const n = activePlayers(state).length;
  if (n < 2 || (n === 2 && !r.sideshowWhenTwoLeft)) return null;
  if (p.sideshowRequests >= r.maxSideshowRequests) return null;
  const prev = previousActiveBefore(state, p.id);
  if (prev.id === p.id || !prev.seen) return null;
  return prev;
}

function pay(state: EngineState, p: EnginePlayer, amount: number) {
  if (amount > p.balance) throw new EngineError('INSUFFICIENT_BALANCE', 'Not enough chips for that action.');
  p.balance -= amount;
  p.committed += amount;
  state.pot += amount;
  if (p.balance === 0) p.allIn = true;
}

export function applyAction(prev: EngineState, playerId: string, action: Action, now: number): StepOutput {
  const state = clone(prev);
  const events: PublicEvent[] = [];
  if (action.type === 'reveal') return revealHand(state, playerId, events);
  if (state.phase === 'ended') throw new EngineError('ROUND_ENDED', 'This round is over.');
  const me = getPlayer(state, playerId);
  if (!me) throw new EngineError('NOT_IN_ROUND', 'You are not in this round.');
  if (me.folded) throw new EngineError('ALREADY_FOLDED', 'You have already packed.');

  switch (action.type) {
    case 'see': {
      if (me.seen) throw new EngineError('ALREADY_SEEN', 'You have already seen your cards.');
      me.seen = true;
      push(state, events, { type: 'seen', playerId });
      return { state, events };
    }
    case 'set_joker': {
      if (!me.seen) throw new EngineError('INVALID_ACTION', 'Look at your cards first.');
      const idxs = jokerIndexes(state.hands[playerId]!, state.ctx);
      if (!idxs.includes(action.index)) throw new EngineError('INVALID_ACTION', 'That card is not a joker.');
      const a = action.as;
      if (a !== null && (!Number.isInteger(a.rank) || a.rank < 2 || a.rank > 14 || !['S', 'H', 'D', 'C'].includes(a.suit))) {
        throw new EngineError('INVALID_ACTION', 'Pick a valid card for the joker.');
      }
      const mine = (state.assign[playerId] ??= {});
      if (a === null) delete mine[String(action.index)];
      else mine[String(action.index)] = a;
      return { state, events };
    }
    case 'sideshow_respond': {
      const pend = state.pending;
      if (state.phase !== 'sideshow' || !pend) throw new EngineError('NO_PENDING_SIDESHOW', 'There is no sideshow to answer.');
      if (pend.responderId !== playerId) throw new EngineError('NOT_YOUR_TURN', 'This sideshow is not addressed to you.');
      resolveSideshow(state, events, action.accept, now, false);
      return { state, events };
    }
    default:
      break;
  }

  if (state.phase === 'sideshow') throw new EngineError('SIDESHOW_PENDING', 'Waiting for a sideshow answer.');
  if (state.turnId !== playerId) throw new EngineError('NOT_YOUR_TURN', "It's not your turn.");

  switch (action.type) {
    case 'bet': {
      const raise = !!action.raise;
      if (raise && !canRaise(state.rules, state.stake)) throw new EngineError('INVALID_BET', 'The stake is already at the table maximum.');
      const cost = betCost(state.rules, state.stake, me, raise);
      pay(state, me, cost);
      if (raise) state.stake = raisedStake(state.rules, state.stake);
      push(state, events, { type: raise ? 'raise' : 'bet', playerId, amount: cost, stake: state.stake });
      me.last = { type: raise ? 'raise' : 'bet', amount: cost, stake: state.stake };
      advance(state, playerId, now, events);
      return { state, events };
    }
    case 'allin': {
      const call = betCost(state.rules, state.stake, me, false);
      if (me.balance <= 0) throw new EngineError('INSUFFICIENT_BALANCE', 'You have no chips left.');
      if (me.balance >= call) throw new EngineError('INVALID_BET', 'You can afford a normal bet, so all-in is not needed.');
      const amount = me.balance;
      pay(state, me, amount);
      push(state, events, { type: 'allin', playerId, amount, stake: state.stake });
      me.last = { type: 'allin', amount };
      advance(state, playerId, now, events);
      return { state, events };
    }
    case 'pack': {
      me.folded = true;
      me.last = { type: 'pack' };
      push(state, events, { type: 'pack', playerId });
      advance(state, playerId, now, events);
      return { state, events };
    }
    case 'show': {
      if (!showAllowed(state, me)) throw new EngineError('SHOW_NOT_ALLOWED', 'A show needs exactly two players left' + (state.rules.showEligibility === 'seen_only' ? ' and you must have seen your cards.' : '.'));
      // A short stack may show for whatever they have left (all-in show).
      const cost = Math.min(showCost(state, me), me.balance);
      pay(state, me, cost);
      push(state, events, { type: 'show', playerId, amount: cost });
      me.last = { type: 'show', amount: cost };
      settlePots(state, events, 'show', playerId);
      return { state, events };
    }
    case 'sideshow_request': {
      const target = sideshowTarget(state, me);
      if (!target) throw new EngineError('SIDESHOW_NOT_ALLOWED', 'A sideshow is not available right now.');
      const cost = chaalCost(state.rules, state.stake, true);
      pay(state, me, cost);
      me.sideshowRequests += 1;
      state.phase = 'sideshow';
      state.pending = { requesterId: playerId, responderId: target.id, amount: cost };
      state.turnDeadline = now + state.rules.sideshowSeconds * 1000;
      push(state, events, { type: 'sideshow_request', playerId, otherId: target.id, amount: cost });
      me.last = { type: 'sideshow_request', amount: cost };
      return { state, events };
    }
  }
}

function resolveSideshow(state: EngineState, events: PublicEvent[], accept: boolean, now: number, timedOut: boolean) {
  const pend = state.pending!;
  const req = getPlayer(state, pend.requesterId)!;
  const res = getPlayer(state, pend.responderId)!;
  if (!accept) {
    push(state, events, { type: timedOut ? 'sideshow_timeout' : 'sideshow_declined', playerId: res.id, otherId: req.id });
    advance(state, req.id, now, events);
    return;
  }
  push(state, events, { type: 'sideshow_accepted', playerId: res.id, otherId: req.id });
  const v = getVariation(state.variation);
  const sReq = v.score(state.hands[req.id]!, state.ctx, state.assign[req.id]);
  const sRes = v.score(state.hands[res.id]!, state.ctx, state.assign[res.id]);
  const rReq = resolveHand(state.hands[req.id]!, state.ctx, state.assign[req.id]);
  const rRes = resolveHand(state.hands[res.id]!, state.ctx, state.assign[res.id]);
  let cmp = 0;
  for (let i = 0; i < Math.max(sReq.key.length, sRes.key.length) && cmp === 0; i++) cmp = Math.sign((sReq.key[i] ?? 0) - (sRes.key[i] ?? 0));
  let loser: EnginePlayer | null = null;
  if (cmp > 0) loser = res;
  else if (cmp < 0) loser = req;
  else if (state.rules.tieHandling === 'challenger_loses') loser = req;
  const note = (me: EnginePlayer, other: EnginePlayer, mine: typeof sReq, theirs: typeof sReq, role: 'requester' | 'responder') => {
    (state.notes[me.id] ??= []).push({
      type: 'sideshow_result',
      otherId: other.id,
      yourCards: state.hands[me.id]!,
      otherCards: state.hands[other.id]!,
      yourLabel: mine.label,
      otherLabel: theirs.label,
      yourJokerAs: (me.id === req.id ? rReq : rRes).jokerAs,
      otherJokerAs: (me.id === req.id ? rRes : rReq).jokerAs,
      outcome: loser === null ? 'tied' : loser.id === me.id ? 'lost' : 'won',
      role,
    });
    state.notes[me.id] = state.notes[me.id]!.slice(-5);
  };
  note(req, res, sReq, sRes, 'requester');
  note(res, req, sRes, sReq, 'responder');
  if (loser) {
    loser.folded = true;
    loser.last = { type: 'pack' };
    push(state, events, { type: 'pack', playerId: loser.id });
    if (settleIfDone(state, events)) return;
  }
  advance(state, req.id, now, events);
}

/**
 * Showdown with side pots. Pots are layered by what each live player put in: everyone who is still in
 * competes for the main pot up to the smallest contribution, and so on; chips above the highest live
 * contribution (e.g. from packed players) go to the top pot.
 */
function settlePots(state: EngineState, events: PublicEvent[], reason: 'show' | 'showdown', challengerId?: string) {
  const v = getVariation(state.variation);
  const alive = activePlayers(state);
  // Layered side pots only matter when someone is all-in; in a normal show the winner takes the whole pot.
  const layered = alive.some((p) => p.allIn);
  const levels = layered ? [...new Set(alive.map((p) => p.committed))].sort((a, b) => a - b) : [Math.max(...alive.map((p) => p.committed))];
  const won = new Map<string, Payout>();
  const pots: NonNullable<RoundResult['pots']> = [];
  let prev = 0;
  levels.forEach((L, li) => {
    const top = li === levels.length - 1;
    let amount = 0;
    for (const p of state.players) amount += Math.max(0, (top ? p.committed : Math.min(p.committed, L)) - Math.min(p.committed, prev));
    prev = L;
    const eligible = layered ? alive.filter((p) => p.committed >= L) : alive;
    if (amount <= 0 || !eligible.length) return;
    const entries = eligible.map((p) => ({ playerId: p.id, cards: state.hands[p.id]!, assign: state.assign[p.id] }));
    const ch = challengerId && eligible.some((p) => p.id === challengerId) ? challengerId : undefined;
    const paid = v.settle(entries, amount, state.ctx, state.rules, ch);
    for (const x of paid) {
      const cur = won.get(x.playerId);
      if (cur) cur.amount += x.amount;
      else won.set(x.playerId, { ...x });
    }
    pots.push({ amount, eligible: eligible.map((p) => p.id), winners: paid.map((x) => x.playerId) });
  });
  endRound(state, events, {
    reason,
    pot: state.pot,
    pots,
    payouts: [...won.values()],
    challengerId,
    reveal: alive.map((p) => {
      const rh = resolveHand(state.hands[p.id]!, state.ctx, state.assign[p.id]);
      return { playerId: p.id, cards: state.hands[p.id]!, label: v.score(state.hands[p.id]!, state.ctx, state.assign[p.id]).label, jokerAs: rh.jokerAs };
    }),
  });
}

/** Apply any overdue deadline (auto-pack / sideshow timeout). Returns null when nothing is overdue. */
export function processTimeout(prev: EngineState, now: number): StepOutput | null {
  if (prev.phase === 'ended' || prev.turnDeadline === null || now < prev.turnDeadline) return null;
  const state = clone(prev);
  const events: PublicEvent[] = [];
  if (state.phase === 'sideshow') {
    resolveSideshow(state, events, false, now, true);
  } else {
    const p = getPlayer(state, state.turnId!)!;
    p.folded = true;
    p.last = { type: 'pack' };
    push(state, events, { type: 'timeout_pack', playerId: p.id });
    advance(state, p.id, now, events);
  }
  return { state, events };
}

/* ---------------- views ---------------- */

export interface LegalActions {
  see: boolean;
  bet: { cost: number; raiseCost: number | null; raiseTo: number | null } | null;
  pack: boolean;
  sideshow: { targetId: string; cost: number } | null;
  show: { cost: number; allIn: boolean } | null;
  allIn: { amount: number } | null;
  respond: boolean;
}

export function legalActions(state: EngineState, playerId: string): LegalActions {
  const none: LegalActions = { see: false, bet: null, pack: false, sideshow: null, show: null, allIn: null, respond: false };
  const me = getPlayer(state, playerId);
  if (!me || me.folded || state.phase === 'ended') return none;
  const out = { ...none, see: !me.seen };
  if (state.phase === 'sideshow') {
    out.respond = state.pending?.responderId === playerId;
    return out;
  }
  if (state.turnId !== playerId) return out;
  out.pack = true;
  const call = betCost(state.rules, state.stake, me, false);
  if (me.balance >= call) {
    const rc = canRaise(state.rules, state.stake) ? betCost(state.rules, state.stake, me, true) : null;
    const affordable = rc !== null && me.balance >= rc;
    out.bet = { cost: call, raiseCost: affordable ? rc : null, raiseTo: affordable ? raisedStake(state.rules, state.stake) : null };
    const t = sideshowTarget(state, me);
    if (t && me.balance >= chaalCost(state.rules, state.stake, true)) {
      out.sideshow = { targetId: t.id, cost: chaalCost(state.rules, state.stake, true) };
    }
  }
  if (me.balance > 0 && me.balance < call) out.allIn = { amount: me.balance };
  if (showAllowed(state, me) && (showCost(state, me) === 0 || me.balance > 0)) {
    out.show = { cost: Math.min(showCost(state, me), me.balance), allIn: me.balance < showCost(state, me) };
  }
  return out;
}

export function publicView(state: EngineState, dealerSeat = state.dealerSeat) {
  return {
    round: state.round,
    variation: state.variation,
    variationName: state.ctx.name,
    jokerRanks: state.ctx.jokerRanks,
    lowestCardJoker: state.ctx.lowestCardJoker,
    phase: state.phase,
    pot: state.pot,
    stake: state.stake,
    rules: {
      minStake: state.rules.minStake,
      maxStake: state.rules.maxStake,
      raiseFactor: state.rules.raiseFactor,
      blindMultiplier: state.rules.blindMultiplier,
      seenMultiplier: state.rules.seenMultiplier,
    },
    blindCost: chaalCost(state.rules, state.stake, false),
    seenCost: chaalCost(state.rules, state.stake, true),
    turnId: state.turnId,
    turnDeadline: state.turnDeadline,
    pending: state.pending ? { requesterId: state.pending.requesterId, responderId: state.pending.responderId } : null,
    dealerSeat,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      balance: p.balance,
      committed: p.committed,
      seen: p.seen,
      folded: p.folded,
      allIn: !!p.allIn,
      last: p.last ?? null,
    })),
    result: state.result,
    log: state.log.slice(-20),
  };
}
export type PublicGameView = ReturnType<typeof publicView>;

export function privateView(state: EngineState, playerId: string) {
  const me = getPlayer(state, playerId);
  const ended = state.phase === 'ended';
  // Your own cards are visible to you once you've looked, and always once the round is over.
  const hand = state.hands[playerId];
  const canSee = !!me && !!hand && (ended || (!me.folded && me.seen));
  const v = getVariation(state.variation);
  return {
    inRound: !!me,
    seen: !!me?.seen,
    folded: !!me?.folded,
    cards: me && canSee ? hand! : null,
    handLabel: me && canSee ? v.score(hand!, state.ctx, state.assign[playerId]).label : null,
    jokers: me && canSee ? jokerView(state, playerId) : null,
    legal: legalActions(state, playerId),
    notes: state.notes[playerId] ?? [],
  };
}
export type PrivateGameView = ReturnType<typeof privateView>;

/* ---------------- leaving & voluntary reveal ---------------- */

function revealHand(state: EngineState, playerId: string, events: PublicEvent[]): StepOutput {
  const r = state.result;
  if (state.phase !== 'ended' || !r) throw new EngineError('INVALID_ACTION', 'You can reveal your hand when the round is over.');
  const won = r.payouts.some((p) => p.playerId === playerId);
  if (!won) throw new EngineError('INVALID_ACTION', 'Only the winner may reveal their hand.');
  if (r.reveal.some((x) => x.playerId === playerId)) throw new EngineError('INVALID_ACTION', 'Your hand is already revealed.');
  const cards = state.hands[playerId];
  if (!cards) throw new EngineError('NOT_IN_ROUND', 'You are not in this round.');
  const v = getVariation(state.variation);
  const rh = resolveHand(cards, state.ctx, state.assign[playerId]);
  r.reveal.push({ playerId, cards, label: v.score(cards, state.ctx, state.assign[playerId]).label, jokerAs: rh.jokerAs });
  push(state, events, { type: 'reveal', playerId });
  return { state, events };
}

/**
 * A player walks away mid-round: they pack immediately (chips already in the pot stay there).
 * Handles turn hand-off and a pending sideshow involving them. No-op if they are not an active player.
 */
export function leaveRound(prev: EngineState, playerId: string, now: number): StepOutput {
  const state = clone(prev);
  const events: PublicEvent[] = [];
  const me = getPlayer(state, playerId);
  if (!me || me.folded || state.phase === 'ended') return { state, events };
  const wasTurn = state.turnId === playerId;
  const pend = state.pending;
  me.folded = true;
  me.last = { type: 'pack' };
  push(state, events, { type: 'left', playerId });
  if (settleIfDone(state, events)) return { state, events };
  if (pend && pend.responderId === playerId) {
    // The responder left: treat as a declined sideshow.
    state.pending = pend;
    const req = getPlayer(state, pend.requesterId)!;
    push(state, events, { type: 'sideshow_declined', playerId, otherId: req.id });
    advance(state, req.id, now, events);
  } else if (pend && pend.requesterId === playerId) {
    // The requester left: the request is void (their fee stays in the pot).
    advance(state, playerId, now, events);
  } else if (wasTurn) {
    advance(state, playerId, now, events);
  }
  return { state, events };
}

function jokerView(state: EngineState, playerId: string) {
  const cards = state.hands[playerId]!;
  const idx = jokerIndexes(cards, state.ctx);
  if (!idx.length) return null;
  const rh = resolveHand(cards, state.ctx, state.assign[playerId]);
  return { indexes: idx, as: rh.jokerAs, auto: rh.auto };
}
