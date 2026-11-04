# Variations

Variations are modules in `src/engine/variations/`. Each defines an id, name, description, options, a per-round `prepare`
(joker draw etc.), a `score` function (higher key wins) and a `settle` function (pot split). The variation is fixed for the round.
Household rules differ – each interpretation below is deliberate and tested (`tests/variations.test.ts`).

| Variation | Rule |
|---|---|
| **Classic** | Standard ranking above. |
| **Muflis** | The full ranking is inverted: lowest hand wins. Ace is high (so 5-3-2 is the best hand, a trail the worst). |
| **AK47** | Every A, K, 4 and 7 is a joker standing in for any card (best-hand substitution). |
| **Joker Teen Patti** | Host option `jokerMode`: *single* (one rank), *double* (two ranks), or *lowest* (the lowest-ranked card in each hand, one card, is the joker). Designated ranks may be chosen by the host; if left empty they are drawn at random each round with the secure RNG and shown openly on the table. |
| **999** | Card digit: A=1, 2–9 face value, 10/J/Q/K=0. The three digits sorted high→low form a number; closest to **999** (i.e. highest number) wins. Ties use the classic ranking. |
| **10–20** | Card points: A=1, 2–9 face value, 10/J/Q/K=10. A total within **10–20** is "in range" and beats every out-of-range hand; higher in-range total wins; out-of-range hands rank by closeness to the window. Ties use the classic ranking. |
| **Hi-Lo** | Host option: *split* (half the pot to the best classic hand, half to the worst; odd chip to high), *high*, *low*, or *alternate* (odd rounds high, even rounds low). Sideshow compares in the round's main direction (high for split). |
| **Dealer's Choice** | The host picks the variation (and options) when starting each round. |

## Joker evaluation
In joker games (AK47, Joker) you can **tap a joker card in your hand and choose the card it stands for**. Whatever you set is what is compared at a show or sideshow,
and it is revealed to the table at a show ("joker as 9♣") and to the other player in a sideshow. If you don't choose, the joker is **Auto**: it takes the value that produces your best classic hand. When two hands are otherwise exactly equal, the hand with
**fewer jokers wins** (natural beats wild). Three jokers = A-A-A.

## Examples
* AK47: `A♠ 9♥ 9♦` → joker + 9-9 → *Trail of 9s*. `2♠ 3♠ 7♦` → 7 is a joker → *Pure Sequence*.
* Muflis: `5♠ 3♥ 2♦` beats `A♠ K♥ Q♦` and beats `A♠ A♥ A♦`.
* 999: `9-9-9` = 999 (perfect); `K-Q-J` = 000.
* 10–20: `9-5-4` = 18 (in range) beats `K-K-K` = 30 (out of range).
