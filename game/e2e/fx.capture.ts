// Ad-hoc capture script (not a test): node runner via playwright test --grep is avoided; run with `npx tsx e2e/fx.capture.ts`.
import { chromium } from '@playwright/test';
const out = process.argv[2] ?? 'screenshots';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
for (const [seed, hotspot] of [[9, 'hollow']] as const) {
  await page.goto(`http://localhost:4173/?seed=${seed}&scene=battle&route=meadow&hotspot=${hotspot}`);
  await page.waitForFunction(() => (window as any).__game?.idle());
  await page.evaluate(() => (window as any).__game.setSpeed(0.3));
  await page.getByTestId('btn-fight').click();
  await page.getByTestId('move-1').click();
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(i === 0 ? 1500 : 450); await page.screenshot({ path: `${out}/fx-${seed}-${i}.png` }); }
}
await browser.close();
