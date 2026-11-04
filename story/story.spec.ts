/**
 * Full user story, three phones in landscape: lobby -> AK47 round with jokers, raise, chat,
 * rules check, sideshow, fold, show -> dealer rotates, Muflis round -> history -> leave.
 * Screenshots of all three players per step are compiled into docs/user-story.pdf.
 */
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const OUT = path.resolve('docs/story');
const DB = process.env.SUPABASE_DB_URL ?? 'postgres://postgres:postgres@localhost:5432/tp_test';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RANK: Record<string, number> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
const toCards = (h: string) => h.split(' ').map((c) => ({ rank: RANK[c[0]!] ?? Number(c[0]), suit: c[1]! }));

interface Step { n: number; title: string; caption: string; files: { who: string; file: string }[] }
const steps: Step[] = [];
let counter = 0;

test('three players, full flow', async ({ browser }) => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const sql = postgres(DB, { prepare: false, max: 2, onnotice: () => {} });

  const mk = async (b: Browser, name: string) => {
    const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.getByTestId('name-input').fill(name);
    return page;
  };
  const A = await mk(browser, 'Asha');
  const B = await mk(browser, 'Bela');
  const C = await mk(browser, 'Chirag');
  const all: [string, Page][] = [['Asha', A], ['Bela', B], ['Chirag', C]];

  async function snap(title: string, caption: string, settle = 900) {
    await sleep(settle);
    const n = ++counter;
    const files: Step['files'] = [];
    for (const [who, page] of all) {
      const file = `${String(n).padStart(2, '0')}-${who}.jpg`;
      await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 82 });
      files.push({ who, file });
    }
    steps.push({ n, title, caption, files });
  }
  const setHands = async (code: string, hands: Record<string, string>) => {
    for (const [name, h] of Object.entries(hands)) {
      await sql`update player_hands set cards = ${sql.json(toCards(h))}
        where player_id = (select id from players where room_id = (select id from rooms where room_code = ${code}) and display_name = ${name})
        and game_id = (select id from games where room_id = (select id from rooms where room_code = ${code}) order by round_number desc limit 1)`;
    }
  };
  const everyone = async (fn: (p: Page, who: string) => Promise<void>) => { for (const [who, p] of all) await fn(p, who); };
  const closeSheet = async (p: Page) => { await p.keyboard.press('Escape'); await sleep(400); };

  // 1 ─ landing
  await snap('Landing page', 'Each friend opens the link on their phone and types a name. No sign-up, no email, no password.');
  // 2 ─ create form
  await A.getByTestId('tab-create').click();
  await snap('Host sets up the table', 'Asha taps "Create a room": starting chips, boot, players, turn timer, and betting / house rules are all hers to configure. Bela and Chirag wait with the join form.');
  // 3 ─ lobby
  await A.getByTestId('create-submit').click();
  await A.waitForURL(/room/);
  const code = (await A.getByTestId('room-code').innerText()).trim();
  await snap('Room created', `The room gets a six-letter code (${code}) and an invite link to share. Asha is host and the first dealer.`);
  // 4 ─ join
  await B.getByTestId('code-input').fill(code);
  await C.getByTestId('code-input').fill(code);
  await snap('Friends enter the room code', 'Bela and Chirag type the code (or open the invite link). Both players are about to join.');
  await B.getByTestId('join-submit').click(); await B.waitForURL(/room/);
  await C.getByTestId('join-submit').click(); await C.waitForURL(/room/);
  await expect(A.getByTestId('lobby-player')).toHaveCount(3);
  await snap('Everyone is in the lobby', 'Three players are seated. Landscape layout: players on the left, game setup on the right. Friends tap "I\'m ready".');
  await B.getByTestId('ready-btn').click(); await C.getByTestId('ready-btn').click();
  await expect(A.getByTestId('start-round')).toBeEnabled();
  // 5 ─ host rules
  await A.getByTestId('edit-settings').click();
  await snap('Host can tweak the rules', 'Before the game, the host can change the boot, chips, timer, sideshow, show costs, tie handling and more. Settings are locked once a round starts.', 1200);
  await A.getByTestId('edit-settings').click();
  // 6 ─ dealer picks, rules sheet
  await A.getByTestId('pick-ak47').getByTestId('rules-btn').click();
  await snap('Dealer checks the AK47 rules', 'The dealer (Asha) taps the ? on a variation. A sheet explains the rule with real card examples. The same ? is on the table during play.', 1200);
  await closeSheet(A);
  await A.getByTestId('pick-ak47').click();
  await snap('Dealer picks AK47', 'The dealer chooses the game for their round: Aces, Kings, 4s and 7s are jokers. Other players see "Waiting for the dealer".');

  // 7 ─ deal
  await A.getByTestId('start-round').click();
  for (const [, p] of all.slice(0, 1)) await expect(p.getByTestId('table')).toBeVisible();
  await setHands(code, { Asha: '2S 5D JH', Bela: 'AS 9H 9D', Chirag: 'KC 6H 6D' });
  await everyone(async (p) => { await expect(p.getByTestId('pot')).toHaveText('30'); });
  await snap('Cards dealt, boot collected', 'Everyone paid the boot (10). The dealer chip (D) is on Asha; play starts with the next seat. Everyone is playing blind, so no card is face-up.');
  // 8 ─ Bela sees
  await B.getByTestId('see-cards').click();
  await expect(B.getByTestId('hand').getByTestId('card-face')).toHaveCount(3);
  await snap('Bela looks at her cards', 'Only Bela\'s phone shows her cards. The Ace is a joker: it is marked, and "auto" means it currently stands for the best card for her (a 9).');
  // 9 ─ joker picker
  await B.getByTestId('joker-0').click();
  await snap('Tap a joker to choose its value', 'Bela taps the joker and picks the card it stands for. A live preview shows what her hand becomes. Whatever she sets is what counts at a show or sideshow.', 1000);
  await B.getByTestId('jk-9C').click();
  await expect(B.getByTestId('joker-as')).toContainText('= 9♣');
  await snap('Joker set manually', 'The joker is now fixed as the 9♣ (no longer "auto"). Everyone will see this choice if the hand is shown.');
  // 10 ─ raise
  await B.getByTestId('btn-raise').click();
  await everyone(async (p) => { await expect(p.getByTestId('seat-Bela').getByTestId('last-action')).toHaveText('Raised to 20'); });
  await snap('Bela raises', 'Raising doubles the stake: the ladder shows 10 → 20 and who raised. Bela is seen, so she paid 40. Every seat shows what it has put in and its last action.');
  // 11 ─ chat
  await C.getByTestId('chat-bubble').click();
  await C.getByTestId('chat-input').fill('Raise already?! Bold, Bela 😏');
  await C.getByTestId('chat-send').click();
  await expect(A.getByTestId('chat-banner')).toBeVisible({ timeout: 25_000 });
  await snap('Chat message arrives', 'Chirag sends a message from the chat drawer. Everyone else gets a banner (with an unread badge on the bubble) that they can tap to open and reply.', 150);
  await C.keyboard.press('Escape');
  await A.getByTestId('chat-bubble').click();
  await A.getByTestId('chat-input').fill('Chirag, your move 👀');
  await A.getByTestId('chat-send').click();
  await snap('Replying in chat', 'Asha opens the chat and replies. Messages are plain text, kept for the room (last 100), and deleted with it.', 1200);
  await closeSheet(A);
  // 12 ─ rules mid-hand
  await C.getByTestId('pot-btn').getByTestId('rules-btn').click();
  await snap('Chirag checks the rules mid-hand', 'Not sure how jokers work? The ? by the pot opens the rules for the game being played, without leaving the table.', 1200);
  await closeSheet(C);
  // 13 ─ chirag looks + sideshow
  await C.getByTestId('see-cards').click();
  await expect(C.getByTestId('hand').getByTestId('card-face')).toHaveCount(3);
  await snap('Chirag looks and likes his hand', 'His King is a joker; auto-best makes it a trail of 6s. He considers a sideshow against Bela (the previous seen player).');
  await C.getByTestId('btn-sideshow').click();
  await expect(B.getByTestId('sideshow-prompt')).toBeVisible({ timeout: 25_000 });
  await snap('Sideshow request', 'Chirag pays one chaal to ask Bela to compare hands. Bela gets an Accept / Decline prompt with a countdown. Asha only sees that a sideshow was requested.');
  await B.getByTestId('sideshow-accept').click();
  await expect(C.getByTestId('sideshow-result')).toBeVisible({ timeout: 25_000 });
  await snap('Sideshow result is private', 'Bela and Chirag privately compare cards, including how each joker was used. Chirag\'s hand is weaker, so he packs. Asha learns only that Chirag packed.', 1200);
  // 14 ─ asha bets
  await expect(A.getByTestId('btn-bet')).toBeVisible({ timeout: 25_000 });
  await A.getByTestId('btn-bet').click();
  await expect(B.getByTestId('btn-show')).toBeVisible({ timeout: 25_000 });
  await snap('Two players left', 'Asha (still blind) matches the stake. With only two left, a show is possible: Bela\'s buttons now include Show.');
  // 15 ─ show
  await B.getByTestId('btn-show').click();
  await everyone(async (p) => { await expect(p.getByTestId('round-result')).toBeVisible({ timeout: 25_000 }); });
  await everyone(async (p) => { await p.getByTestId('round-result').scrollIntoViewIfNeeded(); });
  await snap('Show! Winner screen', 'Both hands are revealed to the table. Bela wins the pot; her joker is shown as the 9♣ she chose, so everyone sees who set what. Net winnings and the dealer rotation are shown.', 1500);
  await everyone(async (p) => { await p.getByTestId('end-hands').scrollIntoViewIfNeeded(); });
  await snap('Hands at the end + scoreboard', 'Everyone who did not pack shows their hand. Packed hands stay private (Chirag can still see his own). The scoreboard shows each player\'s net result for the round.', 1200);
  // 16 ─ feed
  await A.getByTestId('feed-btn').click();
  await snap('Activity feed', 'The feed lists who did what this round: raise, sideshow, pack, show. Nothing private appears in it.', 1200);
  await closeSheet(A);

  // ───── round 2: dealer rotates to Bela, picks Muflis
  await expect(B.getByTestId('next-round')).toBeVisible({ timeout: 25_000 });
  await expect(A.getByTestId('waiting-dealer')).toBeVisible({ timeout: 25_000 });
  await snap('Dealer moves to Bela', 'The dealer button moves one seat. Bela picks the next game; Asha and Chirag see that they are waiting for her.', 1500);
  await B.getByTestId('pick-muflis').getByTestId('rules-btn').click();
  await snap('Bela reads the Muflis rules', 'Before choosing, Bela checks Muflis (lowest hand wins) with its examples.', 1200);
  await closeSheet(B);
  await B.getByTestId('pick-muflis').click();
  await B.getByTestId('next-round').click();
  await everyone(async (p) => { await expect(p.getByTestId('pot-btn')).toContainText('Muflis', { timeout: 25_000 }); });
  await setHands(code, { Asha: '5S 3H 2D', Bela: 'AS KH QD', Chirag: '9S 7H 4D' });
  await snap('New variation: Muflis', 'A new round with a new game. In Muflis the lowest hand wins, so 5-3-2 is the best hand. Pots and stakes reset; balances carry over.');
  // theme
  await C.getByTestId('menu-btn').click();
  await snap('Menu: sound, themes, leave', 'Sound effects (synthesized, with mute and volume), four table themes, activity, rules and a Leave button live in the menu.', 1000);
  await C.getByRole('button', { name: 'Midnight' }).click();
  await snap('Chirag picks the Midnight theme', 'Themes are personal; the others keep the classic green.', 800);
  await closeSheet(C);
  // chirag packs
  await expect(C.getByTestId('btn-pack')).toBeVisible({ timeout: 25_000 });
  await C.getByTestId('btn-pack').click();
  await everyone(async (p) => { await expect(p.getByTestId('seat-Chirag').getByTestId('last-action')).toHaveText('Packed', { timeout: 25_000 }); });
  await snap('Chirag folds', 'Chirag packs. His seat greys out for everyone and shows "Packed". His chips stay in the pot.');
  await expect(A.getByTestId('see-cards')).toBeVisible();
  await A.getByTestId('see-cards').click();
  await expect(A.getByTestId('hand').getByTestId('card-face')).toHaveCount(3);
  await snap('Asha looks: 5-3-2', 'The best Muflis hand. Asha bets while Bela decides.');
  await A.getByTestId('btn-bet').click();
  await expect(B.getByTestId('btn-pack')).toBeVisible({ timeout: 25_000 });
  await B.getByTestId('btn-pack').click();
  await everyone(async (p) => { await expect(p.getByTestId('round-result')).toBeVisible({ timeout: 25_000 }); });
  await everyone(async (p) => { await p.getByTestId('round-result').scrollIntoViewIfNeeded(); });
  await snap('Everyone folded: Asha wins', 'When everyone else packs, no hands are shown automatically. The winner can choose to show her cards.', 1500);
  await A.getByTestId('reveal-btn').click();
  await everyone(async (p) => { await expect(p.getByTestId('end-hands').getByTestId('card-face')).toHaveCount(3, { timeout: 25_000 }); });
  await everyone(async (p) => { await p.getByTestId('end-hands').scrollIntoViewIfNeeded(); });
  await snap('Winner shows her hand', 'Asha flexes her 5-3-2 to the table. Everyone sees the label and the scoreboard.', 1200);
  // history
  await C.getByTestId('feed-btn').click();
  await C.getByRole('button', { name: 'Past rounds' }).click();
  await snap('Past rounds', 'The round history lists every finished round with its winner, pot and the hands that were shown (including joker choices).', 1500);
  await closeSheet(C);
  // leave
  await C.getByTestId('menu-btn').click();
  await C.getByTestId('leave-btn').click();
  await snap('Leaving the table', 'Anyone can leave. Mid-round, you pack and your chips in the pot stay there; between rounds you simply walk out with your stack. Host duties pass on if the host leaves.', 1000);
  await C.getByTestId('confirm-leave').click();
  await C.waitForURL((u) => u.pathname === '/');
  await expect(A.getByTestId('lobby-player')).toHaveCount(0).catch(() => undefined);
  await snap('Chirag has left', 'Chirag is back on the home page. Asha and Bela keep playing with two players.', 3000);

  // ── compile the PDF
  fs.writeFileSync(path.join(OUT, 'steps.json'), JSON.stringify(steps, null, 2));
  await sql.end();
  await buildPdf(steps, code);
});

async function buildPdf(steps: Step[], code: string) {
  const W = 1800, H = 470;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const pages = steps.map((s) => `
    <section class="page">
      <header><span class="n">${s.n}</span><div><h2>${esc(s.title)}</h2><p>${esc(s.caption)}</p></div></header>
      <div class="row">${s.files.map((f) => `<figure><img src="file://${path.join(OUT, f.file)}"/><figcaption>${f.who}</figcaption></figure>`).join('')}</div>
    </section>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${W}px ${H}px; margin: 0 }
    * { box-sizing: border-box }
    body { margin: 0; background: #0a0d0c; color: #ece8dc; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; -webkit-print-color-adjust: exact }
    .page { width: ${W}px; height: ${H}px; padding: 18px 26px; page-break-after: always; display: flex; flex-direction: column; gap: 10px; overflow: hidden }
    header { display: flex; gap: 16px; align-items: flex-start }
    .n { background: #c9a24b; color: #1b1608; font-weight: 800; font-size: 22px; min-width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center }
    h2 { margin: 0; font: 600 25px Georgia, serif; color: #c9a24b }
    header p { margin: 3px 0 0; font-size: 15px; line-height: 1.35; color: #cfc9b8; max-width: 1500px }
    .row { display: flex; gap: 14px; flex: 1; min-height: 0 }
    figure { margin: 0; flex: 1; display: flex; flex-direction: column; gap: 5px; min-width: 0 }
    figure img { width: 100%; border-radius: 12px; border: 1px solid #26322d; display: block }
    figcaption { font-size: 14px; letter-spacing: .08em; text-transform: uppercase; color: #8a9a92 }
    .cover { justify-content: center; gap: 14px }
    .cover h1 { font: 700 54px Georgia, serif; color: #c9a24b; margin: 0 }
    .cover p { font-size: 20px; max-width: 1300px; line-height: 1.45; margin: 0; color: #d8d2c0 }
    .cover small { color: #8a9a92; font-size: 14px }
    </style></head><body>
    <section class="page cover">
      <h1>Private Teen Patti: full user story</h1>
      <p>Three players, three phones, landscape. Every screen from landing page to leaving the table, shown side by side for Asha (host / first dealer), Bela and Chirag.<br/>
      Round 1: AK47 with joker choice, raise, chat, a rules check mid-hand, a private sideshow, a fold and a show. Round 2: the dealer rotates to Bela, who picks Muflis; a fold, a last-player win and a voluntary reveal. Then history, themes and leaving.</p>
      <small>Room ${code} · recorded against the local build with a mocked sign-in, so realtime updates arrive by the 5-second polling fallback here; on the live site they are pushed instantly. Sounds are not visible in screenshots.</small>
    </section>
    ${pages}</body></html>`;
  const htmlPath = path.join(OUT, 'story.html');
  fs.writeFileSync(htmlPath, html);
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.goto(`file://${htmlPath}`);
  await p.waitForLoadState('load');
  await p.pdf({ path: path.resolve('docs/user-story.pdf'), width: `${W}px`, height: `${H}px`, printBackground: true, preferCSSPageSize: true });
  await b.close();
}
