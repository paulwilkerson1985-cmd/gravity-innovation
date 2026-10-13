// HD-2D night sets (`?gfx=hd2d`): the Crown Plateau champion hall (Champion battle + Hall of
// Fame) and the Arena stadium (hotseat battle with the curtain/perspective swap, then the
// victory podium). Each frame: the HD-2D pipeline is on, the canvas isn't blank, the whole
// frame stays under 100 draw calls, the subjects are on screen, and nothing logs an error.
import { expect, test, type Page } from '@playwright/test';

type Snap = { scene: string; curtain?: boolean; asking?: 0 | 1 | null; playing?: boolean; menuButtons?: string[]; near?: 0 | 1; winner?: 0 | 1 | null };
type Hooks = {
  scene(): string | null;
  setFast(on: boolean): void;
  setSpeed(k: number): void;
  waitIdle(ms?: number): Promise<boolean>;
  canvasStats(): { distinct: number; nonBlack: number; samples: number } | null;
  renderInfo(): { calls: number; triangles: number };
  perf(): { quality: string; calls: number; internal: [number, number] } | null;
  battle(): { turn: number; phase: string } | null;
  arena(): Snap | null;
  layout(): { w: number; h: number; subjects: { name: string; x: number; y: number; w: number; h: number }[] };
  debugSetParty(entries: { species: string; level: number }[]): void;
  goto(name: string, params?: Record<string, unknown>): Promise<void>;
};

test.describe.configure({ timeout: 240_000 });

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
  await page.waitForTimeout(250);
  expect(await g(page, (h) => h.perf()), 'HD-2D pipeline active').not.toBeNull();
  const info = await g(page, (h) => h.renderInfo());
  expect(info.calls, 'draw calls per HD-2D frame').toBeLessThan(100);
  expect(info.calls, 'the set actually rendered').toBeGreaterThan(15);
  const stats = await g(page, (h) => h.canvasStats());
  expect(stats!.distinct, 'canvas should not be blank').toBeGreaterThan(8);
  expect(stats!.nonBlack).toBeGreaterThan(stats!.samples * 0.5);
}

/** Every named subject has a visible box inside the viewport. */
async function expectOnScreen(page: Page, names: string[]) {
  const l = await g(page, (h) => h.layout());
  for (const n of names) {
    const s = l.subjects.find((x) => x.name === n);
    expect(s, `subject ${n}`).toBeTruthy();
    expect(s!.w * s!.h, `${n} has size`).toBeGreaterThan(50);
    expect(s!.x + s!.w / 2, `${n} centre x`).toBeGreaterThan(0);
    expect(s!.x + s!.w / 2).toBeLessThan(l.w);
    expect(s!.y + s!.h / 2, `${n} centre y`).toBeGreaterThan(0);
    expect(s!.y + s!.h / 2).toBeLessThan(l.h);
  }
}

test('hd2d summit: Champion Vale in the moonlit hall', async ({ page }, info) => {
  const errors = watchConsole(page);
  await page.goto('/?seed=5&scene=battle&route=plateau&hotspot=champion-vale&gfx=hd2d');
  await page.waitForFunction(() => (window as unknown as { __game?: Hooks }).__game?.scene() === 'battle');
  await g(page, (h) => { h.debugSetParty([{ species: 'pyrelord', level: 30 }, { species: 'maelstrode', level: 29 }]); return h.goto('battle', { route: 'plateau', hotspot: 'champion-vale' }); });
  await g(page, (h) => h.setSpeed(4));
  expect(await g(page, (h) => h.waitIdle(90000))).toBe(true);
  await expectFrame(page);
  const subjects = (await g(page, (h) => h.layout())).subjects.map((s) => s.name).sort();
  expect(subjects).toEqual(['foe', 'mine', 'player', 'trainer']);
  await expectOnScreen(page, ['foe', 'mine', 'player', 'trainer']);
  await page.screenshot({ path: `screenshots/${info.project.name}-hd2d-summit-champion.png` });
  const turn = (await g(page, (h) => h.battle()))!.turn;
  await page.getByTestId('btn-fight').click();
  await page.getByTestId('move-0').click();
  await page.waitForFunction((t) => {
    const b = (window as unknown as { __game: Hooks }).__game.battle();
    return !!b && (b.turn > t || b.phase === 'over');
  }, turn, { timeout: 90000 });
  await expectFrame(page);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('hd2d summit: Hall of Fame in the champion hall', async ({ page }, info) => {
  const errors = watchConsole(page);
  await page.goto('/?seed=5&scene=title&gfx=hd2d');
  await page.waitForFunction(() => (window as unknown as { __game?: Hooks }).__game?.scene() === 'title');
  await g(page, (h) => {
    h.debugSetParty([{ species: 'pyrelord', level: 40 }, { species: 'maelstrode', level: 38 }, { species: 'verdantusk', level: 37 }, { species: 'stormoth', level: 36 }]);
    return h.goto('victory', { route: 'plateau' });
  });
  await page.waitForFunction(() => (window as unknown as { __game?: Hooks }).__game?.scene() === 'victory');
  await page.waitForTimeout(800);
  await expect(page.getByTestId('hof-title')).toBeVisible();
  await expect(page.getByTestId('btn-hof-continue')).toBeVisible();
  await expectFrame(page);
  await expectOnScreen(page, ['kin0', 'kin1', 'kin2', 'kin3', 'you']);
  await page.screenshot({ path: `screenshots/${info.project.name}-hd2d-summit-hof.png` });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('hd2d stadium: hotseat arena battle with curtains and the perspective swap, then the victory podium', async ({ page }, info) => {
  const errors = watchConsole(page);
  const snap = () => g(page, (h) => h.arena());
  await page.goto('/?seed=11&scene=title&gfx=hd2d');
  await page.waitForFunction(() => (window as unknown as { __game?: Hooks }).__game?.scene() === 'title');
  await g(page, (h) => {
    const team = (ids: [string, string[]][], k: number) => ids.map(([species, moves], i) => ({ species, moves, uid: `e2e-${k}-${i}` }));
    return h.goto('arenaBattle', {
      setup: {
        mode: 'hotseat', names: ['Ember', 'Rill'], seed: 7, round: 1,
        teams: [
          team([['pyrelord', ['pyre-crash', 'searing-fang', 'quick-jab']], ['verdantusk', ['grove-hammer', 'thorn-lash']], ['maelstrode', ['breaker-crush', 'riptide-slam']]], 0),
          team([['stormoth', ['storm-lance', 'volt-lunge', 'breeze-cut']], ['cragmaul', ['landslide', 'ram-charge']], ['cyclonyx', ['cyclone-slam', 'talon-dive']]], 1),
        ],
      },
    });
  });
  await expect.poll(async () => (await snap())?.asking, { timeout: 60_000 }).toBe(0);
  await expectFrame(page);
  await expectOnScreen(page, ['mine', 'foe', 'player', 'rival']);
  await page.screenshot({ path: `screenshots/${info.project.name}-hd2d-stadium-p1.png` });

  // P1 picks; the curtain hides it; P2's turn swaps the perspective (their kin comes to the front).
  await page.getByTestId('btn-fight').click();
  await page.getByTestId('move-0').click();
  await expect(page.getByTestId('arena-curtain')).toBeVisible();
  await page.getByTestId('arena-curtain-go').click();
  await expect.poll(async () => (await snap())?.asking).toBe(1);
  expect((await snap())!.near).toBe(1);
  await expectFrame(page);
  await expectOnScreen(page, ['mine', 'foe', 'player', 'rival']);
  await page.getByTestId('btn-fight').click();
  await page.getByTestId('move-0').click();
  await expect(page.getByTestId('arena-curtain')).toContainText('both locked in');
  await page.getByTestId('arena-curtain-go').click();

  // Watch the turn, pass the curtain back to Ember, who forfeits: straight to the victory podium
  // (a full match at the high tier is too slow under a software rasterizer).
  await g(page, (h) => h.setFast(true));
  for (let i = 0; i < 400; i++) {
    const s = (await snap())!;
    if (s.scene === 'arenaVictory') break;
    if (s.curtain) { await page.getByTestId('arena-curtain-go').click(); continue; }
    if (s.scene === 'arenaBattle' && s.asking !== null && s.asking !== undefined && !s.playing) {
      if (s.menuButtons?.includes('btn-forfeit')) {
        await page.getByTestId('btn-forfeit').click();
        await page.getByTestId('btn-forfeit-yes').click();
      } else {
        const kin = page.locator('[data-testid^="kin-"]:not([disabled])');
        if (await kin.count()) await kin.first().click();
      }
      continue;
    }
    await page.waitForTimeout(25);
  }
  await page.waitForFunction(() => (window as unknown as { __game?: Hooks }).__game?.scene() === 'arenaVictory', null, { timeout: 60_000 });
  await g(page, (h) => h.setFast(false));
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('arena-winner')).toBeVisible();
  await expect(page.getByTestId('arena-rematch')).toBeVisible();
  await expectFrame(page);
  const names = (await g(page, (h) => h.layout())).subjects.map((s) => s.name);
  expect(names).toContain('kin0');
  await page.screenshot({ path: `screenshots/${info.project.name}-hd2d-stadium-victory.png` });
  expect(errors, errors.join('\n')).toEqual([]);
});
