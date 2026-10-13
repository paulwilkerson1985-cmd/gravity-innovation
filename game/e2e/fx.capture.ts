// Ad-hoc capture script (not a test): node runner via playwright test --grep is avoided; run with
// `npx tsx e2e/fx.capture.ts [outDir]`. Env: BASE (default http://localhost:4173), GFX=hd2d for the
// pixel-flipbook FX of the HD-2D renderer (render/hd2d/fx.ts), MOVE (move slot, default 1).
// For deterministic, frame-exact FX frames use the refine harness instead.
import { chromium } from '@playwright/test';
const out = process.argv[2] ?? 'screenshots';
const base = process.env.BASE ?? 'http://localhost:4173';
const gfx = process.env.GFX ? `&gfx=${process.env.GFX}` : '';
const move = Number(process.env.MOVE ?? 1);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
for (const [seed, hotspot] of [[9, 'hollow']] as const) {
  await page.goto(`${base}/?seed=${seed}&scene=battle&route=meadow&hotspot=${hotspot}${gfx}`);
  await page.waitForFunction(() => (window as unknown as { __game: { idle(): boolean; setSpeed(k: number): void } }).__game?.idle());
  await page.evaluate(() => (window as unknown as { __game: { idle(): boolean; setSpeed(k: number): void } }).__game.setSpeed(0.3));
  await page.getByTestId('btn-fight').click();
  await page.getByTestId(`move-${move}`).click();
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(i === 0 ? 1500 : 450); await page.screenshot({ path: `${out}/fx-${seed}-${i}.png` }); }
}
await browser.close();
