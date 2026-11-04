export type Suit = 'S' | 'H' | 'D' | 'C';
/** rank: 2..10, 11=J, 12=Q, 13=K, 14=A */
export interface Card {
  rank: number;
  suit: Suit;
}

export type ConcreteVariationId = 'classic' | 'muflis' | 'ak47' | 'joker' | 'nine99' | 'ten20' | 'hilo';
export type VariationId = ConcreteVariationId | 'dealers_choice';

export type AceLowMode = 'second' | 'lowest' | 'none';
export type TieHandling = 'challenger_loses' | 'split';

/** Centralised betting / rules configuration. No multipliers live anywhere else. */
export interface RulesConfig {
  boot: number;
  /** Initial stake (blind-rate chaal amount). Never below boot. */
  minStake: number;
  /** Maximum stake (blind-rate). Raises beyond this are rejected. */
  maxStake: number;
  blindMultiplier: number;
  seenMultiplier: number;
  raiseFactor: number;
  showEligibility: 'any' | 'seen_only';
  showCost: 'chaal' | 'free';
  sideshowEnabled: boolean;
  sideshowWhenTwoLeft: boolean;
  maxSideshowRequests: number;
  tieHandling: TieHandling;
  aceLowSequence: AceLowMode;
  turnSeconds: number;
  sideshowSeconds: number;
}

export interface HandScore {
  /** Lexicographic key, higher always wins. */
  key: number[];
  label: string;
}

export interface VariationContext {
  id: ConcreteVariationId;
  name: string;
  /** Ranks acting as jokers (open to everyone). */
  jokerRanks: number[];
  /** The lowest-ranked card in each hand acts as a joker. */
  lowestCardJoker: boolean;
  naturalBeatsJoker: boolean;
  /** hi-lo resolved mode for this round. */
  hiLoMode: 'split' | 'high' | 'low';
  aceLowSequence: AceLowMode;
  tenTwentyMin: number;
  tenTwentyMax: number;
}

export interface EnginePlayer {
  id: string;
  name: string;
  seat: number;
  balance: number;
  committed: number;
  seen: boolean;
  folded: boolean;
  sideshowRequests: number;
  /** Put every remaining chip in; no more decisions, plays to showdown for the pots they contributed to. */
  allIn?: boolean;
  /** Most recent public action, for the table UI ("Raised to 40"). */
  last?: { type: string; amount?: number; stake?: number } | null;
}

export interface PendingSideshow {
  requesterId: string;
  responderId: string;
  amount: number;
}

export interface Payout {
  playerId: string;
  amount: number;
  share?: 'high' | 'low' | 'all';
}

export interface RoundResult {
  reason: 'last_standing' | 'show' | 'showdown';
  pot: number;
  /** Main pot and side pots, in order. Present when decided by a showdown. */
  pots?: { amount: number; eligible: string[]; winners: string[] }[];
  payouts: Payout[];
  /** Hands that were legitimately revealed by a show. */
  /** jokerAs[i] = what the joker at card i stood for (null for natural cards). */
  reveal: { playerId: string; cards: Card[]; label: string; jokerAs?: (Card | null)[] }[];
  challengerId?: string;
}

export interface PublicEvent {
  seq: number;
  type:
    | 'round_started'
    | 'boot'
    | 'seen'
    | 'bet'
    | 'raise'
    | 'pack'
    | 'timeout_pack'
    | 'broke_pack'
    | 'sideshow_request'
    | 'sideshow_declined'
    | 'sideshow_accepted'
    | 'sideshow_timeout'
    | 'show'
    | 'left'
    | 'allin'
    | 'reveal'
    | 'round_ended';
  playerId?: string;
  otherId?: string;
  amount?: number;
  /** Stake (blind-rate) after this event, for bet/raise events. */
  stake?: number;
}

export interface PrivateNote {
  type: 'sideshow_result';
  otherId: string;
  yourCards: Card[];
  otherCards: Card[];
  yourLabel: string;
  otherLabel: string;
  yourJokerAs?: (Card | null)[];
  otherJokerAs?: (Card | null)[];
  outcome: 'won' | 'lost' | 'tied';
  role: 'requester' | 'responder';
}

export interface EngineState {
  round: number;
  variation: ConcreteVariationId;
  ctx: VariationContext;
  rules: RulesConfig;
  players: EnginePlayer[];
  dealerSeat: number;
  pot: number;
  stake: number;
  phase: 'betting' | 'sideshow' | 'ended';
  turnId: string | null;
  turnDeadline: number | null;
  pending: PendingSideshow | null;
  hands: Record<string, Card[]>;
  notes: Record<string, PrivateNote[]>;
  /** Player-chosen joker values: playerId -> card index -> substitute card. Private until revealed. */
  assign: Record<string, Record<string, Card>>;
  result: RoundResult | null;
  log: PublicEvent[];
  seq: number;
}

export type Action =
  | { type: 'see' }
  | { type: 'bet'; raise?: boolean }
  | { type: 'pack' }
  | { type: 'show' }
  | { type: 'sideshow_request' }
  | { type: 'sideshow_respond'; accept: boolean }
  | { type: 'allin' }
  | { type: 'reveal' }
  | { type: 'set_joker'; index: number; as: Card | null };

export class EngineError extends Error {
  constructor(
    public code:
      | 'NOT_YOUR_TURN'
      | 'NOT_IN_ROUND'
      | 'ALREADY_FOLDED'
      | 'ROUND_ENDED'
      | 'INSUFFICIENT_BALANCE'
      | 'INVALID_BET'
      | 'ALREADY_SEEN'
      | 'SIDESHOW_NOT_ALLOWED'
      | 'SIDESHOW_PENDING'
      | 'NO_PENDING_SIDESHOW'
      | 'SHOW_NOT_ALLOWED'
      | 'NOT_ENOUGH_PLAYERS'
      | 'INVALID_ACTION',
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export interface Rng {
  /** uniform integer in [0, max) */
  int(max: number): number;
}
