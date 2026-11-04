// Shared mock data + helpers for the design-direction mockups (static, no app logic).
window.MOCK = {
  room: 'FXR2ZY',
  pot: 340, stake: 20, blind: 20, seen: 40, maxStake: 640,
  players: [
    { n: 'You', name: 'Mayank', bal: 2480, inn: 60, av: '🦁', me: true, turn: true, seen: true, last: null },
    { n: 'Devika', bal: 1820, inn: 60, av: '🦊', seen: true, last: 'Raised to 20' },
    { n: 'yk', bal: 960, inn: 30, av: '🐯', folded: true, last: 'Packed' },
    { n: 'dv', bal: 1310, inn: 80, av: '🐉', seen: true, last: 'Chaal 40' },
    { n: 'Riya', bal: 2150, inn: 50, av: '🦉', dealer: true, last: 'Blind 20' },
    { n: 'Kabir', bal: 740, inn: 60, av: '🐺', seen: true, last: 'Seen' },
  ],
  myCards: ['AS', 'KS', 'QS'],
  myLabel: 'Pure Sequence',
  actions: [
    { k: 'chaal', label: 'Chaal', sub: 'pay 40' },
    { k: 'raise', label: 'Raise to 40', sub: 'pay 80' },
    { k: 'side', label: 'Sideshow', sub: 'pay 40' },
    { k: 'pack', label: 'Pack', sub: '' },
  ],
  result: {
    winner: 'Mayank', amount: 340,
    hands: [
      { n: 'Mayank', cards: ['AS', 'KS', 'QS'], label: 'Pure Sequence', win: true },
      { n: 'dv', cards: ['KH', 'KD', '7C'], label: 'Pair of Kings' },
    ],
    score: [['Mayank', '+280', 'up'], ['Devika', '-60', 'down'], ['dv', '-80', 'down'], ['Riya', '-50', 'down'], ['Kabir', '-60', 'down'], ['yk', '-30', 'down']],
  },
  variations: [
    ['Classic', 'Best hand wins'], ['Muflis', 'Lowest hand wins'], ['AK47', 'A K 4 7 are jokers'], ['Joker', 'Wild cards'],
    ['999', 'Closest to 999'], ['10–20', 'Total 10 to 20'], ['Hi-Lo', 'Split the pot'],
  ],
};
const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK = { T: '10' };
window.card = (c, cls = '') => {
  if (c === 'back') return `<div class="card back ${cls}"><i></i></div>`;
  const r = RANK[c[0]] ?? c[0], s = c[1];
  const red = s === 'H' || s === 'D';
  return `<div class="card ${red ? 'red' : 'black'} ${cls}"><b class="rk">${r}</b><b class="st">${SUIT[s]}</b><b class="pip">${SUIT[s]}</b></div>`;
};
// seat positions around an ellipse, "me" at the bottom, others clockwise
window.seatPos = (n, cx, cy, rx, ry) => Array.from({ length: n }, (_, k) => {
  const a = Math.PI / 2 + (k * 2 * Math.PI) / n;
  return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
});
window.ring = (size, pct, color, track = 'rgba(255,255,255,.1)', w = 3) => {
  const r = size / 2 - w; const c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${track}" stroke-width="${w}" fill="none"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
};
window.F = (pkg, file) => `node_modules/@fontsource/${pkg}/files/${file}`;
