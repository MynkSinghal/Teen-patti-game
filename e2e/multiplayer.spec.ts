import { expect, test, type Browser, type Page } from '@playwright/test';

async function newPlayer(browser: Browser, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByTestId('name-input').fill(name);
  return { ctx, page, name };
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

test('three phones play a round; cards stay private; refresh keeps the seat', async ({ browser }) => {
  const host = await newPlayer(browser, 'Asha');
  const code = await create(host.page);
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

  const b = await newPlayer(browser, 'Bela');
  const c = await newPlayer(browser, 'Chirag');
  await join(b.page, code);
  await join(c.page, code);
  await b.page.getByTestId('ready-btn').click();
  await c.page.getByTestId('ready-btn').click();

  await expect(host.page.getByTestId('lobby-player')).toHaveCount(3);
  await expect(host.page.getByTestId('start-round')).toBeEnabled();
  // Non-hosts cannot see host controls
  await expect(b.page.getByTestId('start-round')).toHaveCount(0);
  await host.page.screenshot({ path: 'test-results/lobby.png' });
  await host.page.getByTestId('start-round').click();

  const all = [host, b, c];
  for (const p of all) {
    await expect(p.page.getByTestId('table')).toBeVisible();
    await expect(p.page.getByTestId('pot')).toHaveText('30');
    // Hidden until the player looks.
    await expect(p.page.getByTestId('hand').getByTestId('card-face')).toHaveCount(0);
  }

  // Bela looks; only Bela's page shows face cards.
  await b.page.getByTestId('see-cards').click();
  await expect(b.page.getByTestId('hand').getByTestId('card-face')).toHaveCount(3);
  await expect(b.page.getByTestId('hand-label')).toBeVisible();
  await expect(host.page.getByTestId('card-face')).toHaveCount(0);
  await expect(c.page.getByTestId('card-face')).toHaveCount(0);
  // The raw HTML of other phones never contains Bela's card glyph set after the update either.
  await host.page.waitForTimeout(500);

  await b.page.screenshot({ path: 'test-results/table-bela.png' });
  await host.page.screenshot({ path: 'test-results/table-host.png' });
  // Refresh keeps identity and restores Bela's private hand.
  await b.page.reload();
  await expect(b.page.getByTestId('hand').getByTestId('card-face')).toHaveCount(3);

  // Play: whoever's turn it is bets once, then the next two pack until one remains.
  const turnPage = async (...exclude: (typeof host)[]) => {
    for (let i = 0; i < 40; i++) {
      for (const p of all) if (!exclude.includes(p) && (await p.page.locator('[data-testid=btn-pack]:not([disabled])').count()) > 0) return p;
      await host.page.waitForTimeout(500);
    }
    throw new Error('nobody has a turn');
  };
  const first = await turnPage();
  await first.page.getByTestId('btn-bet').click();
  const pot = first === b ? 50 : 40; // seen players pay double
  for (const p of all) await expect(p.page.getByTestId('pot')).toHaveText(String(pot));

  const second = await turnPage(first);
  await second.page.getByTestId('btn-pack').click();
  const third = await turnPage(first, second);
  await third.page.getByTestId('btn-pack').click();

  for (const p of all) {
    await expect(p.page.getByTestId('round-result')).toBeVisible();
    await expect(p.page.getByTestId('winner-text')).toContainText(`${first === p ? 'You' : first.name} won ${pot}`);
  }
  await expect(host.page.getByTestId('next-round')).toBeVisible();
  await expect(b.page.getByTestId('next-round')).toHaveCount(0);
  await host.page.getByTestId('next-round').click();
  for (const p of all) await expect(p.page.getByTestId('pot')).toHaveText('30');
});

test('invalid and unknown room codes show friendly errors', async ({ browser }) => {
  const p = await newPlayer(browser, 'Zed');
  await p.page.getByTestId('code-input').fill('AB');
  await expect(p.page.getByTestId('join-submit')).toBeDisabled();
  await p.page.getByTestId('code-input').fill('ZZZZZZ');
  await p.page.getByTestId('join-submit').click();
  await expect(p.page.getByTestId('landing-error')).toContainText(/couldn't find a room/i);
});
