const fs = require('fs');
const { chromium } = require('/home/user/Teen-patti-game/node_modules/playwright');
const D = __dirname;
const img = (f) => `file://${D}/out/${f}.png`;
const DIRS = [
  { id: 'a-royal', L: 'A', name: 'Maharaja', tag: 'Royal Indian luxury: a private card room in a palace.',
    feels: ['Carved wood rim, emerald velvet felt, gold leaf', 'Serif engraved type (Cinzel + Cormorant)', 'Medallion avatars and brass name plaques', 'Maroon and gold card backs with mandala pattern'],
    layout: 'Full-width table. Your cards fan out big at the bottom centre, overlapping the rim; actions sit in a gold button column on the right.',
    motion: 'Slow, weighty deals; cards slide from the dealer medallion; chips clink into a pile; a VICTORY banner with light rays.',
    best: 'Feels premium and grown-up. Highest "wow" for a classic card game.', risk: 'Ornate details need care to stay readable on small phones.',
    palette: ['#0c4a36', '#3b2414', '#d8b45a', '#f6eedb', '#6d1222'] },
  { id: 'b-neon', L: 'B', name: 'Neon Noir', tag: 'Late-night club energy: a glowing glass table in the dark.',
    feels: ['Dark glass panels with cyan and magenta glow', 'Techy type (Orbitron + Space Grotesk + mono numbers)', 'HUD-style bottom bar like a console game', 'Leaderboard-style results with a glitch WINNER title'],
    layout: 'Wide stadium table on top. A bottom HUD holds your cards (left), the stake meter and timer (centre) and pill buttons (right).',
    motion: 'Snappy, fast transitions; neon pulses on your turn; stake meter fills as raises happen; synth sounds.',
    best: 'Most exciting and modern; great at night and in groups.', risk: 'Can feel less "Indian card game", and glow can be busy.',
    palette: ['#06050c', '#22e6ff', '#ff2bd6', '#b6ff3b', '#e9ecff'] },
  { id: 'c-clean', L: 'C', name: 'Clean Modern', tag: 'Calm, clear, app-like: the iOS Game Center take on Teen Patti.',
    feels: ['Flat graphite panels, soft rounded shapes', 'One warm accent (coral) for the main action', 'Big readable type (Manrope), colour avatar rings', 'Info cards: pot, what you put in, balance'],
    layout: 'Split screen: the table on the left, your own control panel on the right (cards, numbers, 2×2 buttons). Closest to today\'s app, but far cleaner.',
    motion: 'Subtle springs, smooth fades, haptic taps; nothing flashy.', best: 'Easiest to read and play; works for everyone, any lighting.', risk: 'Least dramatic; needs good animations to feel exciting.',
    palette: ['#0e1013', '#171a1f', '#123a31', '#ff6a3d', '#2fd27a'] },
  { id: 'd-festive', L: 'D', name: 'Diwali Night', tag: 'Festive Indian pop: rangoli, diyas and marigold. A party at home.',
    feels: ['Rangoli-pattern table rim with glowing diya lights', 'Indigo night sky, hanging lanterns, fireworks on wins', 'Playful type (Yatra One + Baloo 2), Hinglish copy', 'Chunky 3D candy buttons like popular mobile card games'],
    layout: 'Full table with your cards big at the bottom; a stake card bottom-left, your timer beside your cards, and big candy buttons bottom-right.',
    motion: 'Bouncy and celebratory: firework bursts, confetti, coin showers, playful sounds.', best: 'Most fun and most "ours"; perfect for friends and festivals.', risk: 'Very loud visually; the Hinglish tone isn\'t for everyone.',
    palette: ['#1b1150', '#ffb81c', '#e6007e', '#00b8a9', '#ff7a00'] },
];
const css = `@font-face{font-family:Disp;src:url(file://${D}/node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff2)}
*{box-sizing:border-box;margin:0}body{font-family:Inter,sans-serif;background:#0b0c0e;color:#e9e7e1;-webkit-print-color-adjust:exact}
@page{size:1800px 1100px;margin:0}
.page{width:1800px;height:1100px;padding:44px 52px;page-break-after:always;position:relative;overflow:hidden}
h1{font-family:Disp;font-size:64px;line-height:1;color:#f1e3b6}h2{font-family:Disp;font-size:52px;line-height:1;color:#f1e3b6}
.k{font-size:15px;letter-spacing:.22em;text-transform:uppercase;color:#8f8a7c}
p,li{font-size:19px;line-height:1.45;color:#d6d2c6}
img{display:block;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.6),0 0 0 1px #2a2b30}
.badge{width:74px;height:74px;border-radius:18px;background:#f1e3b6;color:#14130f;font-family:Disp;font-size:52px;display:grid;place-items:center}
.sw{display:flex;gap:10px}.sw i{width:58px;height:58px;border-radius:12px;box-shadow:0 0 0 1px #333}
ul{padding-left:20px}li{margin:3px 0}`;
const cover = `<section class="page"><div class="k">Private Teen Patti · UI redesign</div><h1 style="margin-top:10px">Four directions. Pick one (or mix).</h1>
<p style="max-width:1300px;margin-top:14px">Each direction is a complete look and feel, with its own layout as well as its own colours. Every screen shows the same moment: a 6-player table on your turn (Classic, stake 20, you hold A-K-Q of spades), the winner screen after a show, and the lobby where the dealer picks the game. All mockups are at real phone-landscape size (844×390). Nothing about the rules or features changes.</p>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px 70px;margin-top:20px;justify-content:center;grid-template-columns:715px 715px">${DIRS.map((d) => `<div><div style="display:flex;align-items:center;gap:14px;margin-bottom:10px"><div class="badge" style="width:48px;height:48px;font-size:34px;border-radius:12px">${d.L}</div><div><div style="font-family:Disp;font-size:34px;color:#f1e3b6;line-height:1">${d.name}</div><div style="font-size:15px;color:#8f8a7c">${d.tag}</div></div></div><img src="${img(d.id + '-table')}" style="width:715px"></div>`).join('')}</div></section>`;
const pages = DIRS.map((d) => `<section class="page" style="display:grid;grid-template-columns:470px 1fr;gap:40px">
 <div><div style="display:flex;gap:16px;align-items:center"><div class="badge">${d.L}</div><div><div class="k">Direction ${d.L}</div><h2>${d.name}</h2></div></div>
  <p style="margin-top:16px;font-size:21px;color:#f1e3b6">${d.tag}</p>
  <div class="k" style="margin-top:22px">Look &amp; feel</div><ul style="margin-top:6px">${d.feels.map((f) => `<li>${f}</li>`).join('')}</ul>
  <div class="k" style="margin-top:18px">Layout</div><p style="margin-top:6px">${d.layout}</p>
  <div class="k" style="margin-top:18px">Motion &amp; sound</div><p style="margin-top:6px">${d.motion}</p>
  <div class="k" style="margin-top:18px">Strength</div><p style="margin-top:4px">${d.best}</p>
  <div class="k" style="margin-top:14px">Watch out</div><p style="margin-top:4px">${d.risk}</p>
  <div class="k" style="margin-top:18px">Palette</div><div class="sw" style="margin-top:8px">${d.palette.map((c) => `<i style="background:${c}"></i>`).join('')}</div></div>
 <div><div class="k" style="margin-bottom:8px">Table: your turn</div><img src="${img(d.id + '-table')}" style="width:1236px">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:22px"><div><div class="k" style="margin-bottom:8px">Winner screen</div><img src="${img(d.id + '-result')}" style="width:605px"></div><div><div class="k" style="margin-bottom:8px">Lobby: dealer picks the game</div><img src="${img(d.id + '-lobby')}" style="width:605px"></div></div></div>
</section>`).join('');
const end = `<section class="page"><div class="k">How to choose</div><h1 style="margin-top:10px">Tell me a letter, or mix and match.</h1>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin-top:34px">${DIRS.map((d) => `<div style="border-radius:18px;padding:22px;background:#15161a;box-shadow:0 0 0 1px #2a2b30"><div style="display:flex;align-items:center;gap:12px"><div class="badge" style="width:46px;height:46px;font-size:32px;border-radius:12px">${d.L}</div><div style="font-family:Disp;font-size:30px;color:#f1e3b6">${d.name}</div></div><p style="margin-top:12px;font-size:17px">${d.best}</p><p style="margin-top:8px;font-size:16px;color:#9a958a">${d.risk}</p></div>`).join('')}</div>
<div class="k" style="margin-top:40px">Examples of mixes</div>
<ul style="margin-top:10px;max-width:1500px"><li><b>A + C</b>: Maharaja's table and cards with Clean Modern's clear control panel (premium but easy to read).</li>
<li><b>D + C</b>: Diwali colours and celebrations, Clean Modern layout and type (festive without the noise).</li>
<li><b>B for night, C for day</b>: theme switch in the menu (we already have table themes).</li>
<li>Any direction can keep the Hindi/Hinglish touches ("Jeet gaye!", "Patte baanto") or stay in English.</li></ul>
<div class="k" style="margin-top:36px">Whatever you pick, these stay</div>
<p style="margin-top:8px;max-width:1500px">Landscape-first layout, dealer picks the game, joker picking, the sideshow prompt, all-in and side pots, buy-ins and profit, chat, sounds and the activity feed. The redesign changes how it looks and feels, not how it plays.</p></section>`;
(async () => {
  fs.writeFileSync(`${D}/options.html`, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${cover}${pages}${end}</body></html>`);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1800, height: 1100 } });
  await p.goto(`file://${D}/options.html`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  await p.pdf({ path: '/home/user/Teen-patti-game/docs/ui-directions.pdf', width: '1800px', height: '1100px', printBackground: true, preferCSSPageSize: true });
  await p.screenshot({ path: `${D}/out/pdf-cover.png`, clip: { x: 0, y: 0, width: 1800, height: 1100 } });
  await p.screenshot({ path: `${D}/out/pdf-page2.png`, clip: { x: 0, y: 1100, width: 1800, height: 1100 }, fullPage: true });
  await b.close();
})();
