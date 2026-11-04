/** Player-facing rules and worked examples, rendered with real card art in the rules sheet. */
export interface VariationDoc {
  tagline: string;
  rules: string[];
  examples: { hands: string[]; note: string }[];
}

export const RANKING_EXAMPLES: { name: string; hand: string }[] = [
  { name: 'Trail', hand: 'KS KH KD' },
  { name: 'Pure sequence', hand: 'AS KS QS' },
  { name: 'Sequence', hand: 'JS TH 9D' },
  { name: 'Color', hand: 'AH 9H 4H' },
  { name: 'Pair', hand: 'QS QD 7C' },
  { name: 'High card', hand: 'AS 9H 4D' },
];

export const VARIATION_DOCS: Record<string, VariationDoc> = {
  classic: {
    tagline: 'The standard game. Best hand wins.',
    rules: [
      'Ranking, best to worst: Trail, Pure sequence, Sequence, Color, Pair, High card.',
      'A-K-Q is the best sequence; A-2-3 ranks just below it (host can change this).',
      'Suits never break ties.',
    ],
    examples: [
      { hands: ['KS KH KD', 'AS KS QS'], note: 'Trail of Kings beats a Pure sequence.' },
      { hands: ['QS QD 7C', 'QH QC 5D'], note: 'Same pair: the kicker decides, so 7 beats 5.' },
    ],
  },
  muflis: {
    tagline: 'Lowest hand wins. Everything is upside down.',
    rules: [
      'The whole ranking is reversed: a trail is the worst hand, a plain low high-card hand is the best.',
      'Ace is high, so 5-3-2 is the best possible hand.',
      'Sequences and colors are bad news here.',
    ],
    examples: [
      { hands: ['5S 3H 2D', 'AS KH QD'], note: '5-3-2 is low, so it beats A-K-Q.' },
      { hands: ['7S 4H 2D', 'AS AH AD'], note: 'A trail is the worst hand in Muflis.' },
    ],
  },
  ak47: {
    tagline: 'Every Ace, King, 4 and 7 is a joker.',
    rules: [
      'A, K, 4 and 7 can stand in for any card, in any hand.',
      'Jokers always make your best hand. Three jokers is A-A-A.',
      'If two hands are otherwise identical, the one with fewer jokers wins.',
    ],
    examples: [
      { hands: ['AS 9H 9D'], note: 'The Ace is a joker: 9-9 + joker = Trail of 9s.' },
      { hands: ['2S 3S 7D'], note: 'The 7 is a joker: 2-3 + joker = Pure sequence.' },
      { hands: ['9S 9H 9D', '9S 9H 7D'], note: 'Natural trail beats a trail made with a joker.' },
    ],
  },
  joker: {
    tagline: 'Wild cards, chosen by the dealer or drawn at random.',
    rules: [
      'Single joker: one rank is wild. Double joker: two ranks are wild. Lowest card: the lowest card in your own hand is wild.',
      'If the dealer does not pick, the joker ranks are drawn at random and shown to everyone on the table.',
      'Fewer jokers wins an otherwise equal hand.',
    ],
    examples: [
      { hands: ['5S 9H 9D'], note: 'Joker = 5s: the 5 becomes a 9 and you hold a Trail of 9s.' },
      { hands: ['2S KH KD'], note: 'Lowest-card joker: the 2 turns into a King, making a trail of Kings.' },
    ],
  },
  nine99: {
    tagline: 'Chase the perfect 999.',
    rules: [
      'Card values: Ace = 1, 2–9 = face value, 10 / J / Q / K = 0.',
      'Sort your three values from high to low to make a number. Closest to 999 (the highest number) wins.',
      'If the numbers tie, the classic ranking decides.',
    ],
    examples: [
      { hands: ['9S 9H 9D'], note: '9-9-9 = 999, the perfect hand.' },
      { hands: ['9S 8H AD', 'KS QH JD'], note: '9-8-1 = 981 beats K-Q-J = 000.' },
    ],
  },
  ten20: {
    tagline: 'Land your total between 10 and 20.',
    rules: [
      'Card points: Ace = 1, 2–9 = face value, 10 / J / Q / K = 10.',
      'A total from 10 to 20 is "in range" and beats every out-of-range hand. Higher in-range total wins.',
      'Out-of-range hands are ranked by how close they are to the window. Ties use the classic ranking.',
    ],
    examples: [
      { hands: ['9S 5H 4D', 'KS KH KD'], note: '9+5+4 = 18 is in range; K-K-K = 30 is not.' },
      { hands: ['9S 9H 2D', '9S 5H 4D'], note: '20 beats 18, since both are in range.' },
    ],
  },
  hilo: {
    tagline: 'The pot goes to the best and the worst hand.',
    rules: [
      'Split: half the pot to the best classic hand, half to the lowest hand (odd chip to the high hand).',
      'The dealer can also pick High only, Low only, or alternate high / low every round.',
      'With a tie the pot is shared between the tied hands.',
    ],
    examples: [
      { hands: ['AS AH AD', '5S 3H 2D'], note: 'Split pot: the trail takes the high half, 5-3-2 takes the low half.' },
    ],
  },
  dealers_choice: {
    tagline: 'The dealer picks the game for their round.',
    rules: [
      'The dealer button moves one seat every round.',
      'The dealer chooses the variation (and its options) before the cards are dealt.',
    ],
    examples: [],
  },
};
