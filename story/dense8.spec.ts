import { test, expect, type Browser, type Page } from '@playwright/test';
async function mk(browser: Browser, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); await page.goto('/'); await page.getByTestId('name-input').fill(name); return page;
}
test('dense8', async ({ browser }) => {
  const names = ['Asha', 'Bela', 'Chirag', 'Dev', 'Esha', 'Farid', 'Gita', 'Hari'];
  const ps: Page[] = [];
  const host = await mk(browser, names[0]!); ps.push(host);
  await host.getByTestId('tab-create').click(); await host.getByTestId('create-submit').click(); await host.waitForURL(/room/);
  const code = (await host.getByTestId('room-code').innerText()).trim();
  for (const nm of names.slice(1)) { const p = await mk(browser, nm); ps.push(p); await p.getByTestId('code-input').fill(code); await p.getByTestId('join-submit').click(); await p.waitForURL(/room/); await p.getByTestId('ready-btn').click(); }
  await expect(host.getByTestId('lobby-player')).toHaveCount(8);
  await host.waitForTimeout(800); await host.screenshot({ path: 'test-results/look-21-lobby8-small.png' });
  await host.getByTestId('start-round').click();
  const p1 = ps[1]!;
  await expect(p1.getByTestId('btn-bet')).toBeVisible({ timeout: 25000 });
  await p1.getByTestId('see-cards').click();
  await p1.waitForTimeout(1200); await p1.screenshot({ path: 'test-results/look-22-table8-small.png' });
  await p1.setViewportSize({ width: 844, height: 390 }); await p1.waitForTimeout(800); await p1.screenshot({ path: 'test-results/look-23-table8.png' });
  await p1.setViewportSize({ width: 1280, height: 720 }); await p1.waitForTimeout(800); await p1.screenshot({ path: 'test-results/look-24-table8-desktop.png' });
});
