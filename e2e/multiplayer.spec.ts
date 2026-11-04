import { expect, test, type Browser, type Page } from '@playwright/test';

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
    await expect(p.page.getByTestId(`seat-${first.name}`).getByTestId('committed')).toHaveText(`in ${10 + paid}`);
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
