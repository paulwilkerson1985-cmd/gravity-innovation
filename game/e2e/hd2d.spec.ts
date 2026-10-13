// HD-2D prototype (`?gfx=hd2d`): the Ember Ridge cave arena renders through the post pipeline,
// a trainer turn and a wild cave turn play through the real UI, nothing logs an error, the
// canvas isn't blank and the whole frame (shadow + sprite bakes + post passes) stays < 100 calls.
import { expect, test, type Page } from '@playwright/test';

type Hooks = {
  scene(): string | null;
  setFast(on: boolean): void;
  setSpeed(k: number): void;
  waitIdle(ms?: number): Promise<boolean>;
  canvasStats(): { distinct: number; nonBlack: number; samples: number } | null;
  renderInfo(): { calls: number; triangles: number };
  perf(): { quality: string; calls: number; internal: [number, number] } | null;
  battle(): { turn: number; phase: string } | null;
  layout(): { w: number; h: number; subjects: { name: string; x: number; y: number; w: number; h: number }[] };
  debugSetParty(entries: { species: string; level: number }[]): void;
  goto(name: string, params?: Record<string, unknown>): Promise<void>;
};

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

const g = <T>(page: Page, fn: (g: Hooks, a: unknown) => T | Promise<T>, arg?: unknown): Promise<T> =>
  page.evaluate(([src, a]) => {
    const f = new Function('g', 'a', `return (${src})(g, a);`) as (g: unknown, a: unknown) => unknown;
    return f((window as unknown as { __game: unknown }).__game, a);
  }, [fn.toString(), arg] as const) as Promise<T>;

async function expectFrame(page: Page) {
  await page.waitForTimeout(250); // a few rendered frames
  const info = await g(page, (h) => h.renderInfo());
  expect(info.calls, 'draw calls per HD-2D frame').toBeLessThan(100);
  expect(info.calls, 'the arena actually rendered').toBeGreaterThan(15);
  const stats = await g(page, (h) => h.canvasStats());
  expect(stats!.distinct, 'canvas should not be blank').toBeGreaterThan(8);
  expect(stats!.nonBlack).toBeGreaterThan(stats!.samples * 0.6);
}

async function playTurn(page: Page) {
  expect(await g(page, (h) => h.waitIdle(60000))).toBe(true);
  const turn = (await g(page, (h) => h.battle()))!.turn;
  await page.getByTestId('btn-fight').click();
  await page.getByTestId('move-0').click();
  await page.waitForFunction((t) => {
    const b = (window as unknown as { __game: Hooks }).__game.battle();
    return !!b && (b.turn > t || b.phase === 'over');
  }, turn, { timeout: 60000 });
}

test('hd2d: trainer battle in the Ember Ridge cave arena', async ({ page }, info) => {
  const errors = watchConsole(page);
  await page.goto('/?seed=5&scene=battle&route=ridge&hotspot=hiker-brann&gfx=hd2d');
  await page.waitForFunction(() => (window as unknown as { __game?: Hooks }).__game?.scene() === 'battle');
  await g(page, (h) => { h.debugSetParty([{ species: 'cindertail', level: 16 }, { species: 'thistlehorn', level: 15 }]); return h.goto('battle', { route: 'ridge', hotspot: 'hiker-brann' }); });
  await g(page, (h) => h.setSpeed(4));
  expect(await g(page, (h) => h.waitIdle(60000))).toBe(true);
  const perf = await g(page, (h) => h.perf());
  expect(perf, 'HD-2D pipeline active').not.toBeNull();
  await expectFrame(page);
  // Everyone is on the field: both kin, the trainer behind theirs, the player behind yours.
  const subjects = (await g(page, (h) => h.layout())).subjects.map((s) => s.name).sort();
  expect(subjects).toEqual(['foe', 'mine', 'player', 'trainer']);
  await page.screenshot({ path: `screenshots/${info.project.name}-hd2d-trainer.png` });
  await playTurn(page);
  await expectFrame(page);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('hd2d: wild battle in a cave hotspot uses the arena too', async ({ page }, info) => {
  const errors = watchConsole(page);
  await page.goto('/?seed=9&scene=battle&route=ridge&hotspot=vent-cave&gfx=hd2d&q=low');
  await page.waitForFunction(() => (window as unknown as { __game?: Hooks }).__game?.scene() === 'battle');
  await g(page, (h) => h.setSpeed(4));
  expect(await g(page, (h) => h.waitIdle(60000))).toBe(true);
  expect((await g(page, (h) => h.perf()))!.quality).toBe('low');
  await expectFrame(page);
  const subjects = (await g(page, (h) => h.layout())).subjects.map((s) => s.name).sort();
  expect(subjects).toEqual(['foe', 'mine', 'player']);
  await page.screenshot({ path: `screenshots/${info.project.name}-hd2d-wild.png` });
  await playTurn(page);
  await expectFrame(page);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('hd2d: without the flag the default renderer is untouched', async ({ page }) => {
  await page.goto('/?seed=5&scene=battle&route=ridge&hotspot=hiker-brann');
  await page.waitForFunction(() => (window as unknown as { __game?: Hooks }).__game?.scene() === 'battle');
  expect(await g(page, (h) => h.perf())).toBeNull();
});
