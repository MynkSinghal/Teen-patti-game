# Game rules and exact formulas

Chips are virtual. All rules live in `RulesConfig` (`src/engine/types.ts`, defaults in `src/engine/rules.ts`,
host-facing form in `src/lib/settings.ts`). No multiplier is hard-coded anywhere else.

## Hand ranking (Classic)
1. Trail (three of a kind) – A-A-A highest, 2-2-2 lowest.
2. Pure sequence (straight flush).
3. Sequence (straight, mixed suits).
4. Color (flush) – compared by highest card, then second, then third.
5. Pair – pair rank, then kicker.
6. High card – compared card by card.

Sequences: A-K-Q is highest, 2-3-4 lowest. **A-2-3** is configurable (`aceLowSequence`):
`second` (default; valid, just below A-K-Q), `lowest` (valid, below 2-3-4), `none` (not a sequence).
There is no wrap-around (K-A-2 is not a sequence). **Suits never break ties.** Exactly equal hands use the tie rule below.
The 22,100 possible hands are verified in a test to produce the exact textbook category counts (52 / 48 / 720 / 1096 / 3744 / 16440).

## Betting
Let `stake` be the current stake (initially `minStake`, default = boot).

| Action | Cost | Effect |
|---|---|---|
| Boot | `boot` from each funded player | added to pot |
| Blind chaal | `ceil(stake × blindMultiplier)` (default ×1) | stake unchanged |
| Seen chaal | `ceil(stake × seenMultiplier)` (default ×2) | stake unchanged |
| Blind raise | `ceil(newStake × blindMultiplier)` | `stake = ceil(stake × raiseFactor)` (default ×2) |
| Seen raise | `ceil(newStake × seenMultiplier)` | same |
| Sideshow request | one seen chaal | stake unchanged |
| Show | one chaal at your blind/seen rate (`showCost: 'chaal'`) or free (`'free'`) | ends round |

* A blind player and a seen player never pay the same amount (default 1× vs 2×).
* `stake` may not exceed `maxStake` (default `boot × 64`); raises beyond it are rejected.
* Seeing your cards is free, allowed at any time, one-way, and makes all later bets seen-rate.
* Pot accounting, balances and payouts are computed by the engine and written in one database transaction.
  Chips are conserved (property-tested over 300 random games).

## Turn flow
Dealer rotates each round; the first turn goes to the next seat. Only the player on turn may bet, pack, request a sideshow or show.
Turn time defaults to 45 s; the deadline is stored on the server. A late turn is auto-packed (see Timeouts).

## Show
Allowed only with exactly two players left (and, if `showEligibility = seen_only`, only for seen players).
Both hands are revealed to the table and compared.

## Sideshow
* Only a **seen** player can ask, and only the **immediately previous active player**, who must also be **seen**.
* Not available with two players left (use Show) unless `sideshowWhenTwoLeft`; capped by `maxSideshowRequests` per player per round.
* The requester pays one seen chaal immediately. One sideshow can be pending at a time; the table waits for the answer.
* Accept → hands compared privately; the weaker hand packs. Only the two players receive the cards/result; everyone sees only that someone packed.
* Decline or 30 s timeout → play continues with the next player (the fee stays in the pot).

## Ties (`tieHandling`)
* `challenger_loses` (default): on an exact tie, the player who asked for the show / sideshow loses.
* `split`: the pot is split evenly (odd chip to the first player in seat order); in a sideshow nobody packs.

## Timeouts, disconnects
* The server stores `turn_deadline`. The browser countdown is informational; clients cannot extend it.
* Overdue deadlines are enforced: when any client calls `/tick` after the deadline, on every state fetch, and before every command.
  Nothing relies on a background process, so a table that went idle resumes correctly when anyone returns.
* An overdue player is packed; the next player gets a fresh full turn.
* Disconnected players keep seat, chips and hand and may reconnect (a heartbeat every 15 s; stale after 40 s).

## Zero-balance policy: all-in and side pots
* A player must hold at least the boot to be dealt in; others sit out the round. Balances can never go negative (database `CHECK` + engine validation).
* **All-in.** If you can't cover the full bet on your turn but still have chips, you get an **All-in** button (instead of being forced out): you put in everything you have left.
  You may still pack. A player whose balance hits exactly 0 is all-in automatically. All-in players take no further decisions.
* **Show all-in.** With two players left, a short stack may *show* for whatever they have left.
* **Automatic showdown.** When nobody (or only one player) can still bet and at least one player is all-in, all remaining hands are revealed and the round is settled.
* **Side pots.** Pots are layered by what each live player put in: the main pot goes to the best hand among everyone still in, up to the smallest contribution; each side pot is
  contested only by players who put in at least that much. Chips above the highest live contribution go to the top pot (so a short all-in can only win what each player matched).
  Ties and Hi-Lo are settled per pot. In an ordinary show (nobody all-in) the winner still takes the whole pot.
* A player whose turn timer runs out is still packed automatically.

## Buy-ins, top-ups and profit
* Everyone buys in for the starting stack. A **top-up** (between rounds) refills you to a full stack and is **counted**: the host sets how many each player gets (default 3, `0` turns them off).
* **Net profit** = chips now (including chips you have in the current pot) minus everything you bought in. It is shown in the lobby, the round scoreboard (session total) and the Standings tab.
* **Leaving does not reset your stack.** If you leave and come back you get the same chips and the same buy-in history back. A player the host removed cannot rejoin.

## Chip accounting guarantees
All commands run in a PostgreSQL transaction holding `SELECT … FOR UPDATE` on the room; each command carries an idempotency key
(a replay is a no-op) and the client's game version (stale commands are rejected).

## Dealer, variation and round flow
* The **dealer button moves one seat every round** (skipping players who are out of chips or not ready). The host deals round 1.
* With the default *Dealer's Choice* setting the **dealer picks the variation** (and its options) before dealing; the host can always step in
  (the UI offers it after 30 s or when the dealer is disconnected). The host may instead choose "host picks" or a fixed variation in table settings.

## Leaving
* Between rounds you simply leave with your chips.
* **Mid-round** you are packed immediately, the chips you already put in stay in the pot, and you leave with the rest. A pending sideshow involving you is cancelled
  (as a decline if you were the one asked). If the host leaves, hosting passes to another player.

## End of round
* Pot, per-player contribution ("in 120") and the stake ladder (blind rate → table max) are visible all round; each seat shows its last action.
* Ties and Hi-Lo splits produce **multiple winners**, each shown with their share.
* Hands of everyone who did **not** pack are shown when the round ends (a show reveals both hands automatically). If everyone else packed, the winner
  chooses whether to show their cards. Packed hands stay private. Anyone can see their own cards after the round.

## Sideshow = back show
The sideshow (compare with the previous seen player) is the "backshow". Requests have a 30 s answer timer; a timeout counts as a decline.
