import { expect, test, type Browser, type Page } from '@playwright/test';
import postgres from 'postgres';

type P = { page: Page; name: string };

async function newPlayer(browser: Browser, name: string): Promise<P> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByTestId('name-input').fill(name);
  return { page, name };
}
async function create(page: Page) {
  await page.getByTestId('tab-create').click();
  await page.getByTestId('create-submit').click();
  await page.waitForURL(/\/room\/[A-Z0-9]{6}/);
  return (await page.getByTestId('room-code').innerText()).trim();
}
async function join(page: Page, code: string) {
  await page.getByTestId('code-input').fill(code);
  await page.getByTestId('join-submit').click();
  await page.waitForURL(/\/room\//);
}
async function table3() {
  return null;
}
void table3;

async function setup(browser: Browser) {
  const host = await newPlayer(browser, 'Asha');
  const code = await create(host.page);
  const b = await newPlayer(browser, 'Bela');
  const c = await newPlayer(browser, 'Chirag');
  await join(b.page, code);
  await join(c.page, code);
  await b.page.getByTestId('ready-btn').click();
  await c.page.getByTestId('ready-btn').click();
  await expect(host.page.getByTestId('lobby-player')).toHaveCount(3);
  return { host, b, c, code, all: [host, b, c] };
}
const turnPage = async (all: P[], ...exclude: P[]) => {
  for (let i = 0; i < 60; i++) {
    for (const p of all) if (!exclude.includes(p) && (await p.page.locator('[data-testid=btn-pack]:not([disabled])').count()) > 0) return p;
    await all[0]!.page.waitForTimeout(400);
  }
  throw new Error('nobody has a turn');
};

test('dealer picks the variation each round; raises, pots, results and hands are shown properly', async ({ browser }) => {
  const { host, b, c, all } = await setup(browser);
  await expect(b.page.getByTestId('start-round')).toHaveCount(0); // only the first dealer (host) deals round 1
  await expect(b.page.getByTestId('waiting-dealer')).toBeVisible();
  await host.page.getByTestId('rules-btn').first().click();
  await expect(host.page.getByTestId('rules-sheet')).toBeVisible();
  await expect(host.page.getByTestId('rules-sheet').getByTestId('card-face').first()).toBeVisible(); // examples drawn with real cards
  await host.page.keyboard.press('Escape');
  await host.page.getByTestId('pick-classic').click();
  await host.page.getByTestId('start-round').click();

  for (const p of all) {
    await expect(p.page.getByTestId('table')).toBeVisible();
    await expect(p.page.getByTestId('pot')).toHaveText('30');
    await expect(p.page.getByTestId('hand').getByTestId('card-face')).toHaveCount(0);
    await expect(p.page.getByTestId('stake-ladder')).toBeVisible();
  }
  // dealer chip sits on the host's seat for everyone
  await expect(b.page.getByTestId('seat-Asha').getByTestId('dealer-chip')).toBeVisible();

  // Bela looks; only Bela's page shows face cards
  await b.page.getByTestId('see-cards').click();
  await expect(b.page.getByTestId('hand').getByTestId('card-face')).toHaveCount(3);
  await expect(host.page.getByTestId('card-face')).toHaveCount(0);

  // first player raises: label shows the new stake, everyone sees "Raised to 20", stake ladder + committed update
  const first = await turnPage(all);
  const seen = first === b;
  await expect(first.page.getByTestId('btn-raise')).toContainText('Raise to 20');
  await first.page.getByTestId('btn-raise').click();
  const paid = seen ? 40 : 20;
  for (const p of all) {
    await expect(p.page.getByTestId('pot')).toHaveText(String(30 + paid));
    await expect(p.page.getByTestId(`seat-${first.name}`).getByTestId('last-action')).toHaveText('Raised to 20');
  }
  await expect(first.page.getByTestId('my-committed')).toHaveText(String(10 + paid));
  await expect(host.page.getByTestId('stake-ladder')).toContainText(`raised by ${first.name}`);
  await expect(host.page.getByTestId('stake-value')).toHaveText('20');

  // the activity feed tells who did what
  await host.page.getByTestId('feed-btn').click();
  await expect(host.page.getByTestId('feed-list')).toContainText(`${first.name} raised the stake to 20`);
  await host.page.keyboard.press('Escape');

  // the other two pack -> round ends, winner is the raiser
  const second = await turnPage(all, first);
  await second.page.getByTestId('btn-pack').click();
  const third = await turnPage(all, first, second);
  await third.page.getByTestId('btn-pack').click();
  for (const p of all) {
    await expect(p.page.getByTestId('round-result')).toBeVisible();
    await expect(p.page.getByTestId('winner-text')).toContainText(`${first === p ? 'You' : first.name} won ${30 + paid}`);
    await expect(p.page.getByTestId('scoreboard')).toContainText('packed');
  }
  // winner may reveal; then everyone sees the hand (non-packed players' cards)
  await first.page.getByTestId('reveal-btn').click();
  for (const p of all) await expect(p.page.getByTestId('end-hands').getByTestId('card-face')).toHaveCount(3);

  // Dealer rotates to Bela, who picks muflis; host cannot see a start button until stepping in
  await expect(host.page.getByTestId('next-round')).toHaveCount(0);
  await expect(host.page.getByTestId('choose-game')).toHaveCount(0);
  await b.page.getByTestId('choose-game').click();
  await expect(b.page.getByTestId('next-round')).toBeVisible();
  await b.page.getByTestId('pick-muflis').click();
  await b.page.getByTestId('next-round').click();
  for (const p of all) {
    await expect(p.page.getByTestId('pot')).toHaveText('30');
    await expect(p.page.getByTestId('pot-btn')).toContainText('Muflis');
  }
  await expect(c.page.getByTestId('seat-Bela').getByTestId('dealer-chip')).toBeVisible();
});

test('chat bubble, banner, unread badge and messages', async ({ browser }) => {
  const { host, b } = await setup(browser);
  await host.page.getByTestId('start-round').click();
  await expect(b.page.getByTestId('table')).toBeVisible();
  await expect(b.page.getByTestId('chat-bubble')).toBeVisible();
  await b.page.getByTestId('chat-bubble').click();
  await b.page.getByTestId('chat-input').fill('Good luck all <b>friends</b>');
  await b.page.getByTestId('chat-send').click();
  await expect(b.page.getByTestId('chat-msg').first()).toHaveText('Good luck all <b>friends</b>'); // shown as text, not HTML
  // host gets a banner + unread badge (realtime in prod, polling fallback in this mock-auth run)
  await expect(host.page.getByTestId('chat-banner')).toContainText('Good luck all', { timeout: 20_000 });
  await expect(host.page.getByTestId('chat-unread')).toHaveText('1');
  await host.page.getByTestId('chat-banner').click();
  await expect(host.page.getByTestId('chat-msg').first()).toHaveText('Good luck all <b>friends</b>');
  await expect(host.page.getByTestId('chat-unread')).toHaveCount(0);
});

test('leaving mid-round packs you, keeps your chips in the pot and removes you', async ({ browser }) => {
  const { host, b, c, all } = await setup(browser);
  await host.page.getByTestId('start-round').click();
  await expect(c.page.getByTestId('table')).toBeVisible();
  await c.page.getByTestId('menu-btn').click();
  await c.page.getByTestId('leave-btn').click();
  await expect(c.page.getByTestId('leave-sheet')).toContainText('pack right now');
  await expect(c.page.getByTestId('leave-sheet')).toContainText('10 chips you\'ve already put in');
  await c.page.getByTestId('confirm-leave').click();
  await c.page.waitForURL((u) => u.pathname === '/');
  for (const p of [host, b]) {
    await expect(p.page.getByTestId('pot')).toHaveText('30');
    await expect(p.page.getByTestId('seat-Chirag')).toHaveCount(0, { timeout: 20_000 });
  }
  // the round continues for the remaining two
  const t = await turnPage([host, b]);
  void all;
  await t.page.getByTestId('btn-pack').click();
  await expect(host.page.getByTestId('round-result')).toBeVisible();
});

test('invalid and unknown room codes show friendly errors', async ({ browser }) => {
  const p = await newPlayer(browser, 'Zed');
  await p.page.getByTestId('code-input').fill('AB');
  await expect(p.page.getByTestId('join-submit')).toBeDisabled();
  await p.page.getByTestId('code-input').fill('ZZZZZZ');
  await p.page.getByTestId('join-submit').click();
  await expect(p.page.getByTestId('landing-error')).toContainText(/couldn't find a room/i);
});

test('a short stack goes all-in instead of being forced out; side pot result is shown', async ({ browser }) => {
  const { host, b, c, all, code } = await setup(browser);
  const sql = postgres(process.env.SUPABASE_DB_URL ?? 'postgres://postgres:postgres@localhost:5432/tp_test', { max: 1, onnotice: () => {} });
  // Bela only has 28 chips: after the boot (10) she has 18, but a seen chaal costs 20.
  await sql`update players set chip_balance = 28 where display_name = 'Bela' and room_id = (select id from rooms where room_code = ${code})`;
  await host.page.getByTestId('pick-classic').click();
  await host.page.getByTestId('start-round').click();
  await expect(b.page.getByTestId('table')).toBeVisible();
  await b.page.getByTestId('see-cards').click();
  await expect(b.page.getByTestId('btn-allin')).toBeVisible({ timeout: 25_000 });
  await expect(b.page.getByTestId('btn-allin')).toContainText('18 chips');
  await expect(b.page.getByTestId('btn-bet')).toHaveCount(0); // can't cover a normal chaal
  await b.page.getByTestId('btn-allin').click();
  for (const p of all) {
    await expect(p.page.getByTestId('seat-Bela').getByTestId('last-action')).toHaveText('All-in 18');
    await expect(p.page.getByTestId('seat-Bela').getByTestId('allin-chip')).toBeVisible();
    await expect(p.page.getByTestId('seat-Bela').getByTestId('balance')).toHaveText('0');
  }
  // One of the others packs: only one player who can still bet remains, so it goes straight to an all-in showdown.
  const next = await turnPage(all, b);
  await next.page.getByTestId('btn-pack').click();
  for (const p of all) {
    await expect(p.page.getByTestId('round-result')).toBeVisible({ timeout: 25_000 });
    await expect(p.page.getByTestId('round-result')).toContainText('All-in showdown');
    await expect(p.page.getByTestId('pots')).toContainText('Main pot');
    await expect(p.page.getByTestId('pots')).toContainText('Side pot 1');
    await expect(p.page.getByTestId('end-hands').getByTestId('card-face')).toHaveCount(6); // both live hands revealed
  }
  await sql.end();
  void c;
});

test('sideshow: clear prompt for the one asked, waiting state, private result, public banner, blocked reason', async ({ browser }) => {
  const { host, b, c, code } = await setup(browser);
  const sql = postgres(process.env.SUPABASE_DB_URL ?? 'postgres://postgres:postgres@localhost:5432/tp_test', { max: 1, onnotice: () => {} });
  await host.page.getByTestId('pick-classic').click();
  await host.page.getByTestId('start-round').click();
  await expect(b.page.getByTestId('table')).toBeVisible();
  const setHand = (name: string, cards: { rank: number; suit: string }[]) => sql`update player_hands set cards = ${sql.json(cards)}
    where player_id = (select id from players where display_name = ${name} and room_id = (select id from rooms where room_code = ${code}))
    and game_id = (select id from games where room_id = (select id from rooms where room_code = ${code}) order by round_number desc limit 1)`;
  await setHand('Asha', [{ rank: 2, suit: 'S' }, { rank: 5, suit: 'H' }, { rank: 9, suit: 'D' }]);
  await setHand('Bela', [{ rank: 14, suit: 'S' }, { rank: 14, suit: 'H' }, { rank: 14, suit: 'D' }]);
  // Bela (first to act) looks; the sideshow is greyed out with a reason because Asha is still blind
  await b.page.getByTestId('see-cards').click();
  await expect(b.page.getByTestId('btn-sideshow-blocked')).toContainText('Asha is still blind');
  await host.page.getByTestId('see-cards').click();
  await expect(b.page.getByTestId('btn-sideshow')).toBeVisible({ timeout: 25_000 });
  await b.page.getByTestId('btn-sideshow').click();
  await expect(host.page.getByTestId('sideshow-prompt')).toBeVisible({ timeout: 25_000 });
  await expect(host.page.getByTestId('sideshow-prompt')).toContainText('Bela wants a sideshow');
  await expect(b.page.getByTestId('sideshow-waiting')).toContainText('Waiting for Asha');
  await expect(c.page.getByTestId('sideshow-spectator')).toContainText('Bela asked Asha for a sideshow', { timeout: 25_000 });
  await host.page.getByTestId('sideshow-accept').click();
  // both players privately see the comparison
  await expect(host.page.getByTestId('sideshow-result')).toContainText('You lost the sideshow', { timeout: 25_000 });
  await expect(b.page.getByTestId('sideshow-result')).toContainText('You won the sideshow', { timeout: 25_000 });
  // the third player only gets a public explanation, no cards
  await expect(c.page.getByTestId('table-banner')).toContainText('compared cards privately. Asha packed', { timeout: 25_000 });
  await expect(c.page.getByTestId('sideshow-result')).toHaveCount(0);
  await b.page.getByTestId('sideshow-result-close').click();
  await expect(b.page.getByTestId('sideshow-result-chip')).toContainText('won');
  await sql.end();
});
