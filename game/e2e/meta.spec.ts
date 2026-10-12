// Meta layer e2e: saves, menu hub, shop, bestiary, box, settings, export/import.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

type P = { party: { species: string; hp: number }[]; box: { species: string }[]; bag: Record<string, number>; money: number; seen: string[]; caught: string[]; playTime: number; settings: { textSpeed: string } };
type Hooks = {
  scene(): string | null;
  goto(name: string, params?: Record<string, unknown>): Promise<void>;
  player(): P;
  save(): Promise<boolean>;
  hasSave(): Promise<boolean>;
  addKin(species: string, level?: number): void;
  patchPlayer(patch: Record<string, unknown>): void;
  renderInfo(): { calls: number; triangles: number };
};

const G = <T>(page: Page, fn: (g: Hooks) => T): Promise<Awaited<T>> =>
  page.evaluate((src) => (new Function('g', `return (${src})(g)`))((window as unknown as { __game: Hooks }).__game), fn.toString()) as Promise<Awaited<T>>;

// WebGL runs on SwiftShader in CI containers; under heavy machine load frames can take seconds.
test.describe.configure({ timeout: 180_000 });

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function waitScene(page: Page, name: string) {
  try {
    await page.waitForFunction((n) => (window as unknown as { __game?: Hooks }).__game?.scene() === n, name, { timeout: 60_000, polling: 100 });
  } catch (e) {
    const state = await page.evaluate(() => ({
      scene: (window as unknown as { __game?: Hooks }).__game?.scene(),
      modal: document.querySelector('#modals')?.textContent?.slice(0, 120),
      toasts: document.querySelector('#toasts')?.textContent,
      curtain: document.getElementById('curtain')?.className,
    })).catch((err: unknown) => `evaluate failed: ${String(err).slice(0, 200)}`);
    throw new Error(`waitScene(${name}) timed out; state=${JSON.stringify(state)}; ${String(e)}`);
  }
}

async function shot(page: Page, name: string, project: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/${project}-meta-${name}.png` });
}

async function newAdventure(page: Page) {
  page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
  page.on('crash', () => console.log('[crash] page crashed'));
  await page.goto('/?seed=5');
  await waitScene(page, 'title');
  await page.getByTestId('btn-start').click();
  await waitScene(page, 'starter');
  await page.getByTestId('starter-dropple').click();
  await page.getByTestId('btn-confirm-starter').click();
  await waitScene(page, 'route');
}

async function openMenu(page: Page) {
  await page.keyboard.press('m');
  await expect(page.getByTestId('game-menu')).toBeVisible();
}

async function drawCalls(page: Page) {
  const info = await G(page, (g) => g.renderInfo());
  expect(info.calls).toBeLessThan(100);
}

test('save → reload → continue restores the adventure; settings persist', async ({ page }, info) => {
  const errors = watchConsole(page);
  await newAdventure(page);
  await G(page, (g) => { g.addKin('breezel', 6); g.patchPlayer({ money: 4321 }); });
  await openMenu(page);
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('speed-fast').click();
  await page.getByTestId('vol-music').fill('20');
  await shot(page, '01-settings', info.project.name);
  await page.keyboard.press('Escape');
  await page.getByTestId('menu-save').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'saved' })).toBeVisible();
  expect(await G(page, (g) => g.hasSave())).toBe(true);

  await page.reload();
  await waitScene(page, 'title');
  await expect(page.getByTestId('btn-continue-save')).toBeVisible();
  await expect(page.getByTestId('btn-continue-save')).toContainText('Dropple Lv5');
  await shot(page, '02-title-continue', info.project.name);
  // Loading a seeded URL never auto-continues: we're still on the title with fresh state.
  expect((await G(page, (g) => g.player())).party.length).toBe(0);
  await page.getByTestId('btn-continue-save').click();
  await waitScene(page, 'route');
  const p = await G(page, (g) => g.player());
  expect(p.money).toBe(4321);
  expect(p.party.map((c) => c.species)).toEqual(['dropple', 'breezel']);
  expect(p.settings.textSpeed).toBe('fast');
  await openMenu(page);
  await page.getByTestId('menu-settings').click();
  await expect(page.getByTestId('speed-fast')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('vol-music')).toHaveValue('20');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('game-menu')).toBeHidden();

  // New adventure over an existing save asks first.
  await openMenu(page);
  await page.getByTestId('menu-quit').click();
  await page.getByTestId('confirm-yes').click();
  await waitScene(page, 'title');
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.getByTestId('confirm-no').click();
  expect(await G(page, (g) => g.scene())).toBe('title');
  expect(errors).toEqual([]);
});

test('shop purchase, bag use and party actions', async ({ page }, info) => {
  const errors = watchConsole(page);
  await newAdventure(page);
  await openMenu(page);
  await page.getByTestId('menu-shop').click();
  await waitScene(page, 'shop');
  await expect(page.getByTestId('shop-money')).toHaveText('500');
  await page.getByTestId('shop-orb').click();
  await page.getByTestId('qty-plus').click();
  await expect(page.getByTestId('qty-value')).toHaveText('2');
  await expect(page.getByTestId('qty-plus')).toBeDisabled(); // capped at what we can afford
  await shot(page, '03-shop', info.project.name);
  await drawCalls(page);
  await page.getByTestId('btn-buy').click();
  await expect(page.getByTestId('shop-money')).toHaveText('100');
  let p = await G(page, (g) => g.player());
  expect(p.bag.orb).toBe(12);
  expect(p.money).toBe(100);
  // Can't overspend.
  await page.getByTestId('shop-star').click();
  await expect(page.getByTestId('btn-buy')).toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('btn-buy').click({ force: true }); // stays clickable to give "denied" feedback
  await expect(page.getByTestId('toast').filter({ hasText: 'Not enough money' })).toBeVisible();
  expect((await G(page, (g) => g.player())).money).toBe(100);

  // Back returns to the route with the menu reopened.
  await page.getByTestId('btn-shop-back').click();
  await waitScene(page, 'route');
  await expect(page.getByTestId('game-menu')).toBeVisible();

  // Hurt the lead and heal it from the bag.
  await G(page, (g) => { const pl = g.player(); pl.party[0]!.hp = 2; g.patchPlayer({ party: pl.party }); });
  await page.getByTestId('menu-bag').click();
  await waitScene(page, 'bag');
  await page.getByTestId('bag-tonic').click();
  await page.getByTestId('btn-use-item').click();
  await page.getByTestId('use-target-0').click();
  p = await G(page, (g) => g.player());
  expect(p.party[0]!.hp).toBe(20);
  expect(p.bag.tonic).toBe(2);
  await shot(page, '04-bag', info.project.name);
  await page.keyboard.press('Escape');
  await waitScene(page, 'route');

  // Party: reorder.
  await G(page, (g) => g.addKin('pebblet', 7));
  await page.keyboard.press('Escape'); // close reopened menu
  await openMenu(page);
  await page.getByTestId('menu-party').click();
  await waitScene(page, 'party');
  await page.getByTestId('party-1').click();
  await page.getByTestId('btn-set-lead').click();
  expect((await G(page, (g) => g.player())).party.map((c) => c.species)).toEqual(['pebblet', 'dropple']);
  await shot(page, '05-party', info.project.name);
  await drawCalls(page);
  expect(errors).toEqual([]);
});

test('bestiary shows seen and caught correctly', async ({ page }, info) => {
  const errors = watchConsole(page);
  await newAdventure(page);
  await G(page, (g) => { g.addKin('breezel', 4); const pl = g.player(); g.patchPlayer({ seen: [...pl.seen, 'cragmaul'] }); });
  await openMenu(page);
  await page.getByTestId('menu-bestiary').click();
  await waitScene(page, 'bestiary');
  await expect(page.getByTestId('dex-seen-count')).toHaveText('3');
  await expect(page.getByTestId('dex-caught-count')).toHaveText('2');
  await expect(page.getByTestId('dex-dropple')).toHaveAttribute('data-state', 'caught');
  await expect(page.getByTestId('dex-cragmaul')).toHaveAttribute('data-state', 'seen');
  await expect(page.getByTestId('dex-pyrelord')).toHaveAttribute('data-state', 'unseen');
  await expect(page.getByTestId('dex-pyrelord')).toContainText('???');
  await page.getByTestId('dex-breezel').click();
  await expect(page.getByTestId('dex-detail')).toContainText('Mossy Meadow');
  await expect(page.getByTestId('dex-evo')).toContainText('Breezel');
  await shot(page, '06-bestiary-caught', info.project.name);
  await page.getByTestId('dex-cragmaul').click();
  await expect(page.getByTestId('dex-seen-note')).toBeVisible();
  await shot(page, '07-bestiary-seen', info.project.name);
  await page.getByTestId('dex-pyrelord').click();
  await expect(page.getByTestId('dex-unknown')).toBeVisible();
  await drawCalls(page);
  expect(errors).toEqual([]);
});

test('box deposit and withdraw', async ({ page }, info) => {
  const errors = watchConsole(page);
  await newAdventure(page);
  await G(page, (g) => g.addKin('flickwing', 5));
  await openMenu(page);
  await page.getByTestId('menu-box').click();
  await waitScene(page, 'box');
  await expect(page.getByTestId('box-empty')).toBeVisible();
  await page.getByTestId('box-party-1').click();
  await page.getByTestId('btn-deposit').click();
  let p = await G(page, (g) => g.player());
  expect(p.party.map((c) => c.species)).toEqual(['dropple']);
  expect(p.box.map((c) => c.species)).toEqual(['flickwing']);
  // The last kin in the party can't be deposited.
  await page.getByTestId('box-party-0').click();
  await expect(page.getByTestId('btn-deposit')).toBeDisabled();
  await page.getByTestId('box-slot-0').click();
  await shot(page, '08-box', info.project.name);
  await page.getByTestId('btn-withdraw').click();
  p = await G(page, (g) => g.player());
  expect(p.party.map((c) => c.species)).toEqual(['dropple', 'flickwing']);
  expect(p.box).toEqual([]);
  await drawCalls(page);
  expect(errors).toEqual([]);
});

test('export and import a save file', async ({ page }, info) => {
  const errors = watchConsole(page);
  await newAdventure(page);
  await G(page, (g) => g.patchPlayer({ money: 777 }));
  await openMenu(page);
  const dl = page.waitForEvent('download');
  await page.getByTestId('menu-export').click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/^orbkin-save-\d{8}-\d{4}\.json$/);
  const path = `test-results/meta-export-${info.project.name}.json`;
  await download.saveAs(path);
  const exported = JSON.parse(readFileSync(path, 'utf8'));
  expect(exported.format).toBe('orbkin-save');
  expect(exported.data.money).toBe(777);

  // Fresh browser storage: import the file from the title screen.
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('orbkin'); });
  await page.goto('/?seed=9');
  await waitScene(page, 'title');
  await expect(page.getByTestId('btn-continue-save')).toHaveCount(0);

  // A garbage file is rejected with a friendly message.
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/garbage.json', '{"hello": "world"}');
  let chooser = page.waitForEvent('filechooser');
  await page.getByTestId('btn-import').click();
  await (await chooser).setFiles('test-results/garbage.json');
  await expect(page.getByTestId('toast').filter({ hasText: 'Orbkin save' })).toBeVisible();

  chooser = page.waitForEvent('filechooser');
  await page.getByTestId('btn-import').click();
  await (await chooser).setFiles(path);
  await expect(page.getByTestId('btn-continue-save')).toBeVisible();
  await shot(page, '09-imported', info.project.name);
  await page.getByTestId('btn-continue-save').click();
  await waitScene(page, 'route');
  expect((await G(page, (g) => g.player())).money).toBe(777);
  expect(errors).toEqual([]);
});

test('import after quitting to title is not clobbered by an autosave of the old adventure', async ({ page }, info) => {
  const errors = watchConsole(page);
  await newAdventure(page);
  await G(page, (g) => g.patchPlayer({ money: 1111 }));
  const mine = await G(page, (g) => g.player());
  await openMenu(page);
  await page.getByTestId('menu-quit').click();
  await page.getByTestId('confirm-yes').click();
  await waitScene(page, 'title');
  // The old adventure is no longer in memory once we're on the title.
  expect((await G(page, (g) => g.player())).party.length).toBe(0);

  mkdirSync('test-results', { recursive: true });
  const file = `test-results/meta-clobber-${info.project.name}.json`;
  writeFileSync(file, JSON.stringify({ format: 'orbkin-save', schema: 2, savedAt: new Date().toISOString(), data: { ...mine, money: 4242 } }));
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('btn-import').click();
  await (await chooser).setFiles(file);
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'imported' })).toBeVisible();

  // Backgrounding the tab (autosave triggers) must not write the stale adventure back.
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); document.dispatchEvent(new Event('visibilitychange')); });
  // Nor does sitting in the arena (no autosave / play time outside an adventure).
  await page.getByTestId('btn-arena').click();
  await waitScene(page, 'arena');
  await page.waitForTimeout(1200);
  expect((await G(page, (g) => g.player())).playTime).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(300);

  await page.reload();
  await waitScene(page, 'title');
  await page.getByTestId('btn-continue-save').click();
  await waitScene(page, 'route');
  expect((await G(page, (g) => g.player())).money).toBe(4242);
  expect(errors).toEqual([]);
});

test('scene changes are re-entrancy safe (rapid gotos, double clicks during the fade)', async ({ page }) => {
  const errors = watchConsole(page);
  await newAdventure(page);
  // Three overlapping requests: the latest wins, exactly one scene UI is left.
  await G(page, (g) => { void g.goto('bag'); void g.goto('shop'); return g.goto('party'); });
  await waitScene(page, 'party');
  await page.waitForTimeout(400);
  expect(await page.locator('.scene-ui').count()).toBe(1);
  await G(page, (g) => g.goto('route', { route: 'meadow' }));
  await waitScene(page, 'route');
  await openMenu(page);
  await page.getByTestId('menu-bag').dblclick();
  await waitScene(page, 'bag');
  await page.waitForTimeout(600);
  expect(await G(page, (g) => g.scene())).toBe('bag');
  expect(await page.locator('.scene-ui').count()).toBe(1);
  expect(errors).toEqual([]);
});

test('box party tiles stay ≥ 44px on small phones (portrait and landscape)', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'sets its own viewports');
  await page.goto('/?seed=5&scene=route&route=meadow');
  await waitScene(page, 'route');
  await G(page, (g) => { for (const s of ['breezel', 'dropple', 'breezel', 'dropple', 'breezel']) g.addKin(s, 6); return g.goto('box', {}); });
  await waitScene(page, 'box');
  for (const vp of [{ width: 320, height: 568 }, { width: 740, height: 360 }]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(300);
    const sizes = await page.locator('[data-testid^="box-party-"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    expect(sizes.length).toBe(6);
    for (const [w, h] of sizes) { expect(w, `${vp.width}x${vp.height} tile width`).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
  }
});
