// HD-2D terrain arenas (`?gfx=hd2d`): each outdoor Mossy Meadow / Ember Ridge arena is picked by
// the terrain registry for its hotspot, renders without console errors, isn't blank and keeps
// the whole frame (shadow + sprite bakes + post) under 100 draw calls — desktop and phone.
import { expect, test, type Page } from '@playwright/test';

type Hooks = {
  scene(): string | null;
  setSpeed(k: number): void;
  waitIdle(ms?: number): Promise<boolean>;
  canvasStats(): { distinct: number; nonBlack: number; samples: number } | null;
  renderInfo(): { calls: number; triangles: number };
  perf(): { quality: string; calls: number } | null;
  layout(): { subjects: { name: string }[] };
};

const g = <T>(page: Page, fn: (g: Hooks) => T | Promise<T>): Promise<T> =>
  page.evaluate((src) => {
    const f = new Function('g', `return (${src})(g);`) as (g: unknown) => unknown;
    return f((window as unknown as { __game: unknown }).__game);
  }, fn.toString()) as Promise<T>;

const CASES = [
  { route: 'meadow', hotspot: 'tall-grass', arena: 'hd2d-meadow-clearing', trainer: false },
  { route: 'meadow', hotspot: 'scout-pim', arena: 'hd2d-meadow-clearing', trainer: true },
  { route: 'meadow', hotspot: 'flower-patch', arena: 'hd2d-meadow-flowers', trainer: false },
  { route: 'meadow', hotspot: 'hollow', arena: 'hd2d-meadow-hollow', trainer: false },
  { route: 'ridge', hotspot: 'scrub', arena: 'hd2d-ridge-scrub', trainer: false },
  { route: 'ridge', hotspot: 'hiker-brann', arena: 'hd2d-ridge-scrub', trainer: true },
];

for (const c of CASES) {
  test(`hd2d arena: ${c.route}/${c.hotspot} → ${c.arena}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/?seed=3&scene=battle&route=${c.route}&hotspot=${c.hotspot}&gfx=hd2d`);
    await page.waitForFunction(() => (window as unknown as { __game?: Hooks }).__game?.scene() === 'battle');
    await g(page, (h) => h.setSpeed(4));
    expect(await g(page, (h) => h.waitIdle(60000))).toBe(true);
    const name = await page.evaluate(() => {
      const st = (window as unknown as { __hd2d?: { rig: { group: { name: string } } } }).__hd2d;
      return st?.rig.group.name ?? null;
    });
    expect(name, 'registry picked the arena for this hotspot').toBe(c.arena);
    await page.waitForTimeout(300);
    const calls = (await g(page, (h) => h.renderInfo())).calls;
    expect(calls, 'draw calls per HD-2D frame').toBeLessThan(100);
    expect(calls).toBeGreaterThan(15);
    const stats = await g(page, (h) => h.canvasStats());
    expect(stats!.distinct, 'canvas should not be blank').toBeGreaterThan(8);
    expect(stats!.nonBlack).toBeGreaterThan(stats!.samples * 0.6);
    const subjects = (await g(page, (h) => h.layout())).subjects.map((s) => s.name).sort();
    expect(subjects).toEqual(c.trainer ? ['foe', 'mine', 'player', 'trainer'] : ['foe', 'mine', 'player']);
    await page.screenshot({ path: `screenshots/${info.project.name}-hd2d-${c.hotspot}.png` });
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
