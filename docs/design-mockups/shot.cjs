const { chromium } = require('/home/user/Teen-patti-game/node_modules/playwright');
(async () => {
  const files = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 });
  for (const f of files) {
    await p.goto('file://' + __dirname + '/' + f + '.html');
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    for (const id of ['table', 'result', 'lobby']) await p.locator('#' + id).screenshot({ path: __dirname + `/out/${f}-${id}.png` });
  }
  await b.close();
})();
