// HD-2D volcanic + coast arenas (`?gfx=hd2d`): each terrain loads for its hotspot / trainer on
// desktop and phone, picks the right arena from the registry, logs no errors, renders a
// non-blank frame under 100 draw calls, and a turn plays through.
import { expect, test, type Page } from '@playwright/test';

type Hooks = {
  scene(): string | null;
  setSpeed(k: number): void;
  waitIdle(ms?: number): Promise<boolean>;
  canvasStats(): { distinct: number; nonBlack: number; samples: number } | null;
  renderInfo(): { calls: number; triangles: number };
  perf(): { quality: string; calls: number } | null;
  battle(): { turn: number; phase: string } | null;
  layout(): { w: number; h: number; subjects: { name: string; x: number; y: number; w: number; h: number }[] };
};

const g = <T>(page: Page, fn: (g: Hooks, a: unknown) => T | Promise<T>, arg?: unknown): Promise<T> =>
  page.evaluate(([src, a]) => {
    const f = new Function('g', 'a', `return (${src})(g, a);`) as (g: unknown, a: unknown) => unknown;
    return f((window as unknown as { __game: unknown }).__game, a);
  }, [fn.toString(), arg] as const) as Promise<T>;

const CASES = [
  { arena: 'volcanic', route: 'ridge', hotspot: 'vent-cave', people: ['foe', 'mine', 'player'] },
  { arena: 'coast', route: 'coast', hotspot: 'dune-grass', people: ['foe', 'mine', 'player'] },
  { arena: 'shallows', route: 'coast', hotspot: 'shallows', people: ['foe', 'mine', 'player'] },
  { arena: 'cliff', route: 'coast', hotspot: 'sea-cliff', people: ['foe', 'mine', 'player'] },
  { arena: 'coast', route: 'coast', hotspot: 'angler-merrow', people: ['foe', 'mine', 'player', 'trainer'] },
  { arena: 'cliff', route: 'coast', hotspot: 'rider-tavi', people: ['foe', 'mine', 'player', 'trainer'] },
] as const;

for (const c of CASES) {
  test(`hd2d: ${c.hotspot} battles in the ${c.arena} arena`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/?seed=7&scene=battle&route=${c.route}&hotspot=${c.hotspot}&gfx=hd2d`);
    await page.waitForFunction(() => (window as unknown as { __game?: Hooks }).__game?.scene() === 'battle');
    expect(await page.evaluate(() => (window as unknown as { __hd2d?: { terrain: { def: { id: string } } } }).__hd2d?.terrain.def.id)).toBe(c.arena);
    await g(page, (h) => h.setSpeed(4));
    expect(await g(page, (h) => h.waitIdle(60000))).toBe(true);
    await page.waitForTimeout(250);
    const calls = (await g(page, (h) => h.renderInfo())).calls;
    expect(calls, 'draw calls per HD-2D frame').toBeLessThan(100);
    expect(calls, 'the arena rendered').toBeGreaterThan(15);
    const stats = (await g(page, (h) => h.canvasStats()))!;
    expect(stats.distinct, 'canvas should not be blank').toBeGreaterThan(8);
    expect(stats.nonBlack).toBeGreaterThan(stats.samples * 0.6);
    const subjects = (await g(page, (h) => h.layout())).subjects.map((s) => s.name).sort();
    expect(subjects).toEqual([...c.people]);
    await page.screenshot({ path: `screenshots/${info.project.name}-hd2d-${c.hotspot}.png` });
    // One turn plays through the real UI.
    const turn = (await g(page, (h) => h.battle()))!.turn;
    await page.getByTestId('btn-fight').click();
    await page.getByTestId('move-0').click();
    await page.waitForFunction((t) => {
      const b = (window as unknown as { __game: Hooks }).__game.battle();
      return !!b && (b.turn > t || b.phase === 'over');
    }, turn, { timeout: 60000 });
    expect((await g(page, (h) => h.renderInfo())).calls).toBeLessThan(100);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
