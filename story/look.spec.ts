import { test, expect, type Browser, type Page } from '@playwright/test';
import postgres from 'postgres';
const VP = { width: 844, height: 390 };
async function mk(browser: Browser, name: string, vp = VP) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); await page.goto('/'); await page.getByTestId('name-input').fill(name); return page;
}
const shot = (p: Page, n: string) => p.waitForTimeout(900).then(() => p.screenshot({ path: `test-results/look-${n}.png` }));
test('look', async ({ browser }) => {
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, onnotice: () => {} });
  const h = await mk(browser, 'Asha');
  await shot(h, '01-landing');
  await h.getByTestId('tab-create').click(); await shot(h, '02-landing-create');
  await h.getByTestId('create-submit').click(); await h.waitForURL(/room/);
  const code = (await h.getByTestId('room-code').innerText()).trim();
  const ps: Page[] = [h];
  for (const n of ['Bela', 'Chirag', 'Dev', 'Esha']) { const p = await mk(browser, n); await p.getByTestId('code-input').fill(code); await p.getByTestId('join-submit').click(); await p.waitForURL(/room/); await p.getByTestId('ready-btn').click(); ps.push(p); }
  await expect(h.getByTestId('lobby-player')).toHaveCount(5);
  await shot(h, '03-lobby-host'); await shot(ps[1]!, '04-lobby-guest');
  await h.getByTestId('pick-ak47').click(); await h.getByTestId('start-round').click();
  for (const p of ps) { await expect(p.getByTestId('variation-intro')).toBeVisible({ timeout: 25000 }); }
  await shot(ps[1]!, '05-intro');
  for (const p of ps) await p.getByTestId('variation-intro-ok').click();
  await sql`update player_hands set cards = ${sql.json([{ rank: 14, suit: 'S' }, { rank: 9, suit: 'H' }, { rank: 9, suit: 'D' }])} where player_id = (select id from players where display_name='Bela' and room_id=(select id from rooms where room_code=${code}))`;
  await shot(ps[1]!, '06-table-myturn-blind');
  await ps[1]!.getByTestId('see-cards').click(); await shot(ps[1]!, '07-table-myturn-seen-joker');
  await ps[1]!.getByTestId('joker-0').click(); await shot(ps[1]!, '08-joker-sheet');
  await ps[1]!.keyboard.press('Escape');
  await ps[1]!.getByTestId('btn-raise').click();
  await shot(h, '09-table-waiting');
  await ps[2]!.getByTestId('see-cards').click();
  await expect(ps[2]!.getByTestId('btn-sideshow')).toBeVisible({ timeout: 25000 });
  await ps[2]!.getByTestId('btn-sideshow').click();
  await expect(ps[1]!.getByTestId('sideshow-prompt')).toBeVisible({ timeout: 25000 });
  await shot(ps[1]!, '10-sideshow-prompt');
  await ps[1]!.getByTestId('sideshow-accept').click();
  await expect(ps[1]!.getByTestId('sideshow-result')).toBeVisible({ timeout: 25000 });
  await shot(ps[1]!, '11-sideshow-result');
  await ps[1]!.getByTestId('sideshow-result-close').click();
  await h.getByTestId('menu-btn').click(); await shot(h, '12-menu'); await h.keyboard.press('Escape');
  await h.getByTestId('pot-open').click(); await shot(h, '13-pot'); await h.keyboard.press('Escape');
  // finish the round: everyone else packs
  for (let i = 0; i < 12; i++) {
    let acted = false;
    for (const p of ps) if (p !== ps[1] && (await p.locator('[data-testid=btn-pack]:not([disabled])').count()) > 0) { await p.getByTestId('btn-pack').click(); acted = true; break; }
    if ((await ps[1]!.getByTestId('round-result').count()) > 0) break;
    if (!acted) await h.waitForTimeout(800);
  }
  await expect(ps[1]!.getByTestId('round-result')).toBeVisible({ timeout: 30000 });
  await shot(ps[1]!, '14-result-winner'); await shot(h, '15-result-other');
  for (const p of ps) if ((await p.getByTestId('choose-game').count()) > 0) { await p.getByTestId('choose-game').click(); await shot(p, '16-picker'); await p.keyboard.press('Escape'); break; }
  await ps[1]!.getByTestId('round-result').getByLabel('View the table').click();
  await shot(ps[1]!, '17-table-after');
  await ps[1]!.getByTestId('feed-btn').click();
  await ps[1]!.getByTestId('tab-standings').click(); await shot(ps[1]!, '18-standings');
  await ps[1]!.keyboard.press('Escape');
  await ps[1]!.setViewportSize({ width: 390, height: 844 }); await shot(ps[1]!, '19-portrait-rotated');
  await ps[3]!.setViewportSize({ width: 640, height: 360 }); await shot(ps[3]!, '20-small');
  await sql.end();
});
