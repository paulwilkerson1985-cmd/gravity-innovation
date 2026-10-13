// HD-2D non-battle screens (`?gfx=hd2d`): title, starter pick, route maps (meadow, ridge, coast,
// plateau), the menu over a route, party, the other menu screens and evolution all render through the
// HD-2D pipeline (perf() non-null, integer pixel grid buffer), aren't blank, keep the whole frame
// under 100 draw calls on both tiers, keep their DOM UI / data-testids, and log no errors.
import { expect, test, type Page } from '@playwright/test';

type Hooks = {
  scene(): string | null;
  goto(name: string, params?: Record<string, unknown>): Promise<void>;
  setFast(on: boolean): void;
  canvasStats(): { distinct: number; nonBlack: number; samples: number } | null;
  renderInfo(): { calls: number; triangles: number };
  perf(): { quality: string; calls: number; internal: [number, number] } | null;
  openMenu(): void;
  debugDefeat(...ids: string[]): void;
  debugSetParty(entries: { species: string; level: number }[]): void;
};

const g = <T>(page: Page, fn: (g: Hooks, a: unknown) => T | Promise<T>, arg?: unknown): Promise<T> =>
  page.evaluate(([src, a]) => {
    const f = new Function('g', 'a', `return (${src})(g, a);`) as (g: unknown, a: unknown) => unknown;
    return f((window as unknown as { __game: unknown }).__game, a);
  }, [fn.toString(), arg] as const) as Promise<T>;

// SwiftShader renders every HD-2D frame on the CPU: allow slow frames under machine load.
test.describe.configure({ timeout: 180_000 });

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

const waitScene = (page: Page, name: string) =>
  page.waitForFunction((n) => (window as unknown as { __game?: Hooks }).__game?.scene() === n, name, { timeout: 90_000, polling: 100 });

/** The HD-2D pipeline drew the frame: perf() non-null with the drawing-buffer size, calls in budget, not blank. */
async function expectHd2dFrame(page: Page, label: string, dim = false) {
  await page.waitForTimeout(400); // a few rendered frames
  const perf = await g(page, (h) => h.perf());
  expect(perf, `${label}: perf() (HD-2D pipeline installed)`).not.toBeNull();
  const buf = await page.evaluate(() => { const c = document.getElementById('view') as HTMLCanvasElement; return [c.width, c.height]; });
  expect(perf!.internal, `${label}: internal low-res size = drawing buffer`).toEqual(buf);
  expect(perf!.internal[1], `${label}: low-res internal height`).toBeLessThan(700);
  const calls = (await g(page, (h) => h.renderInfo())).calls;
  expect(calls, `${label}: draw calls per HD-2D frame`).toBeLessThan(100);
  expect(calls, `${label}: the set actually rendered`).toBeGreaterThan(10);
  const stats = await g(page, (h) => h.canvasStats());
  expect(stats!.distinct, `${label}: canvas should not be blank`).toBeGreaterThan(8);
  expect(stats!.nonBlack, `${label}: canvas mostly lit`).toBeGreaterThan(stats!.samples * (dim ? 0.3 : 0.6));
}

test('hd2d screens: title, starter pick and confirm', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?seed=5&scene=title&gfx=hd2d');
  await waitScene(page, 'title');
  await expect(page.getByTestId('btn-start')).toBeVisible();
  await expect(page.getByTestId('btn-settings')).toBeVisible();
  await expectHd2dFrame(page, 'title');
  await page.getByTestId('btn-start').click();
  await waitScene(page, 'starter');
  await expectHd2dFrame(page, 'starter');
  await page.getByTestId('starter-mossling').click();
  await expect(page.getByTestId('btn-confirm-starter')).toBeVisible();
  await expectHd2dFrame(page, 'starter (chosen)');
  await page.getByTestId('btn-confirm-starter').click();
  await waitScene(page, 'route');
  await expect(page.getByTestId('route-name')).toContainText('Mossy Meadow');
  await expectHd2dFrame(page, 'route meadow');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('hd2d screens: every route map, the menu and the menu screens', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?seed=5&scene=route&route=meadow&gfx=hd2d');
  await waitScene(page, 'route');
  await g(page, (h) => {
    h.debugSetParty([{ species: 'pyrelord', level: 32 }, { species: 'rillback', level: 18 }, { species: 'mossling', level: 6 }]);
    h.debugDefeat('scout-pim', 'hiker-brann', 'adept-sola', 'angler-merrow', 'rider-tavi');
    h.setFast(true);
  });
  for (const route of ['meadow', 'ridge', 'coast', 'plateau']) {
    await g(page, (h, r) => h.goto('route', { route: r }), route);
    await waitScene(page, 'route');
    await expect(page.getByTestId(`tab-${route}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('btn-party')).toBeVisible();
    await expectHd2dFrame(page, `route ${route}`);
  }
  // The menu hub over the map (the map stays the HD-2D backdrop).
  await g(page, (h) => h.goto('route', { route: 'meadow' }));
  await waitScene(page, 'route');
  await expect(page.getByTestId('spot-tall-grass')).toBeVisible();
  await g(page, (h) => h.openMenu());
  await expect(page.locator('.modal-root')).toBeVisible();
  await expectHd2dFrame(page, 'menu');
  await page.keyboard.press('Escape');
  // Party and the other menu screens share the room + plinth stage.
  for (const scene of ['party', 'box', 'bestiary', 'bag', 'shop']) {
    await g(page, (h, s) => h.goto(s as string, { from: 'menu', route: 'meadow' }), scene);
    await waitScene(page, scene);
    await expectHd2dFrame(page, scene, true);
  }
  await expect(page.getByTestId('party-list')).toHaveCount(0); // left the party screen
  // Evolution (the same room at dusk, both forms as baked sprites).
  await g(page, (h) => { h.debugSetParty([{ species: 'ashkit', level: 20 }]); return h.goto('evolution', { route: 'meadow' }); });
  await waitScene(page, 'evolution');
  await expect(page.getByTestId('evo-text')).toBeVisible();
  await expectHd2dFrame(page, 'evolution', true);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('hd2d screens: party keeps its data-testids and reorders', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?seed=5&scene=route&route=meadow&gfx=hd2d');
  await waitScene(page, 'route');
  await g(page, (h) => { h.debugSetParty([{ species: 'pyrelord', level: 32 }, { species: 'surgeray', level: 19 }]); h.setFast(true); });
  await page.getByTestId('btn-party').click();
  await waitScene(page, 'party');
  await expect(page.getByTestId('party-list')).toBeVisible();
  await expect(page.getByTestId('party-detail')).toBeVisible();
  await page.getByTestId('party-1').click();
  await page.getByTestId('btn-set-lead').click();
  await expect(page.getByTestId('party-0')).toContainText(/surgeray/i);
  await expectHd2dFrame(page, 'party', true);
  await page.getByTestId('btn-party-back').click();
  await waitScene(page, 'route');
  expect(errors, errors.join('\n')).toEqual([]);
});
