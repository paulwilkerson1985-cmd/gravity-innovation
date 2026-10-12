// Adventure layer end-to-end: trainer battles + route unlocks, XP / level-ups / move offers,
// items in battle, evolution (skipped), and the Champion → Hall of Fame. Runs on desktop and phone.
import { expect, test, type Page } from '@playwright/test';

interface Kin { species: string; level: number; hp: number; xp: number; moves: { id: string }[] }
interface Player { party: Kin[]; bag: Record<string, number>; money: number; defeatedTrainers: string[]; champion: boolean }
interface Battle { phase: string; outcome: { winner: number | null; reason: string } | null; sides: { party: { hp: number }[]; active: number }[] }
type Hooks = {
  scene(): string | null;
  player(): Player;
  battle(): Battle | null;
  goto(name: string, params?: Record<string, unknown>): Promise<void>;
  setFast(on: boolean): void;
  setSpeed(k: number): void;
  waitIdle(ms?: number): Promise<boolean>;
  canvasStats(): { distinct: number; nonBlack: number; samples: number } | null;
  renderInfo(): { calls: number; triangles: number };
  debugSetParty(entries: { species: string; level: number; xpToNext?: number; hp?: number }[]): void;
  debugDefeat(...ids: string[]): void;
  debugGive(id: string, count: number): void;
  debugSuggest(): { type: 'move'; index: number } | { type: 'switch'; to: number } | { type: 'item' | 'catch' | 'run' | 'forfeit' | 'pass' } | null;
};

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function hooks<T>(page: Page, fn: (g: Hooks) => T | Promise<T>, arg?: unknown): Promise<T> {
  return page.evaluate(([src, a]) => {
    const f = new Function('g', 'a', `return (${src})(g, a);`) as (g: unknown, a: unknown) => unknown;
    return f((window as unknown as { __game: unknown }).__game, a);
  }, [fn.toString(), arg] as const) as Promise<T>;
}

async function shot(page: Page, name: string, project: string) {
  await page.waitForTimeout(120);
  await page.screenshot({ path: `screenshots/${project}-adv-${name}.png` });
}

async function waitScene(page: Page, name: string, timeout = 30000) {
  await page.waitForFunction((n) => (window as unknown as { __game?: Hooks }).__game?.scene() === n, name, { timeout });
}

async function waitIdle(page: Page) {
  const ok = await hooks(page, (g) => g.waitIdle(30000));
  expect(ok, 'UI became idle').toBe(true);
}

async function expectRendered(page: Page) {
  const stats = await hooks(page, (g) => g.canvasStats());
  expect(stats!.distinct, 'canvas should not be blank').toBeGreaterThan(8);
  const info = await hooks(page, (g) => g.renderInfo());
  expect(info.calls, 'draw calls per frame').toBeLessThan(100);
}

/** Pick the move with the best (power × effectiveness) from the visible move buttons. */
async function bestMove(page: Page): Promise<string> {
  const buttons = page.locator('[data-testid^="move-"]:not([disabled])');
  const n = await buttons.count();
  let best = 'move-0';
  let bestScore = -1;
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    const text = (await b.textContent()) ?? '';
    const pow = Number(/Pow (\d+)/.exec(text)?.[1] ?? 0);
    const score = pow * (/Strong/.test(text) ? 2 : /Weak/.test(text) ? 0.5 : 1);
    if (score > bestScore) { bestScore = score; best = (await b.getAttribute('data-testid'))!; }
  }
  return best;
}

/** Fight until the battle is over (picking strong moves, replacing fainted kin). `smart` follows the Ace AI's advice. */
async function fightToEnd(page: Page, maxTurns = 80, smart = false) {
  for (let i = 0; i < maxTurns; i++) {
    // Idle in battle, or already moved on (evolution / hall of fame) — those animate, so never "idle" yet.
    await page.waitForFunction(() => {
      const g = (window as unknown as { __game: Hooks & { idle(): boolean } }).__game;
      return g.scene() !== 'battle' || g.idle();
    }, undefined, { timeout: 30000 });
    const b = await hooks(page, (g) => g.battle());
    if (!b || b.phase === 'over') return;
    const tip = smart ? await hooks(page, (g) => g.debugSuggest()) : null;
    if (await page.getByTestId('btn-fight').isVisible()) {
      if (tip?.type === 'switch') {
        await page.getByTestId('btn-kin').click();
        await page.getByTestId(`kin-${tip.to}`).click();
        continue;
      }
      await page.getByTestId('btn-fight').click();
      if (await page.getByTestId('move-0').isVisible().catch(() => false)) {
        const pick = tip?.type === 'move' && tip.index >= 0 ? `move-${tip.index}` : await bestMove(page);
        await page.getByTestId(pick).click();
      }
    } else if (await page.locator('[data-testid^="kin-"]:not([disabled])').first().isVisible().catch(() => false)) {
      const id = tip?.type === 'switch' ? `kin-${tip.to}` : null;
      await (id ? page.getByTestId(id) : page.locator('[data-testid^="kin-"]:not([disabled])').first()).click();
    }
  }
  throw new Error('battle did not finish');
}

test('trainer battle: beat Pim, learn a move, level up, unlock Ember Ridge', async ({ page }, info) => {
  const project = info.project.name;
  const errors = watchConsole(page);
  await page.goto('/?seed=21&scene=route&route=meadow');
  await waitScene(page, 'route');
  // Fresh adventure: Ember Ridge is locked and says what it needs.
  await expect(page.getByTestId('tab-ridge')).toBeDisabled();
  await expect(page.getByTestId('tab-ridge')).toContainText('Beat Pim');
  await hooks(page, (g) => { g.debugSetParty([{ species: 'cindertail', level: 20, xpToNext: 10 }, { species: 'breezel', level: 8 }]); return g.goto('route', { route: 'meadow' }); });
  await waitScene(page, 'route');
  await page.waitForTimeout(300);
  await expectRendered(page);
  await shot(page, '01-route-meadow', project);
  const money0 = (await hooks(page, (g) => g.player())).money;

  await page.getByTestId('spot-scout-pim').click();
  await waitScene(page, 'battle');
  await page.waitForTimeout(900);
  await shot(page, '02-trainer-intro', project);
  await hooks(page, (g) => g.setFast(true));
  await waitIdle(page);
  await expectRendered(page);
  // Trainer kin can't be caught: orbs are disabled with a clear message.
  await page.getByTestId('btn-bag').click();
  await page.getByTestId('tab-orbs').click();
  await expect(page.getByTestId('orb-orb')).toBeDisabled();
  await expect(page.getByTestId('battle-text')).toContainText("can't catch");
  await page.getByTestId('btn-back').click();
  // No running either.
  await page.getByTestId('btn-run').click({ force: true });
  await expect(page.getByTestId('battle-text')).toContainText('no running');
  await hooks(page, (g) => g.setFast(false));
  await shot(page, '03-trainer-battle', project);
  await hooks(page, (g) => g.setFast(true));

  await fightToEnd(page);
  // Cindertail reaches L21 and is offered Quick Jab with four moves known.
  await expect(page.getByTestId('btn-skip-move')).toBeVisible({ timeout: 20000 });
  await hooks(page, (g) => g.setFast(false));
  await shot(page, '04-forget-move', project);
  await page.getByTestId('forget-1').click();
  await hooks(page, (g) => g.setFast(true));
  await expect(page.getByTestId('btn-continue')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('btn-go-ridge')).toBeVisible();
  await hooks(page, (g) => g.setFast(false));
  await shot(page, '05-trainer-won', project);

  const p = await hooks(page, (g) => g.player());
  expect(p.defeatedTrainers).toContain('scout-pim');
  expect(p.money).toBe(money0 + 250);
  expect(p.party[0]!.level).toBe(21);
  expect(p.party[0]!.moves.map((m) => m.id)).toContain('quick-jab');

  await page.getByTestId('btn-continue').click();
  await waitScene(page, 'route');
  await expect(page.getByTestId('tab-ridge')).toBeEnabled();
  await expect(page.getByTestId('spot-scout-pim')).toContainText('Defeated');
  await page.waitForTimeout(300);
  await shot(page, '06-route-pim-beaten', project);
  await page.getByTestId('tab-ridge').click();
  await waitScene(page, 'route');
  await expect(page.getByTestId('route-name')).toContainText('Ember Ridge');
  await page.waitForTimeout(400);
  await expectRendered(page);
  await shot(page, '07-route-ridge', project);
  expect(errors, 'console errors').toEqual([]);
});

test('wild battle: use a Tonic, win, level up and evolve (skipped)', async ({ page }, info) => {
  const project = info.project.name;
  const errors = watchConsole(page);
  await page.goto('/?seed=5&scene=route&route=meadow');
  await waitScene(page, 'route');
  await hooks(page, (g) => {
    g.debugSetParty([{ species: 'ashkit', level: 13, xpToNext: 1, hp: 12 }]);
    g.debugGive('tonic', 2);
    return g.goto('route', { route: 'meadow' });
  });
  await waitScene(page, 'route');
  await hooks(page, (g) => g.setSpeed(3));
  await page.getByTestId('spot-tall-grass').click();
  await waitScene(page, 'battle');
  await waitIdle(page);
  await shot(page, '10-wild-menu', project);

  await page.getByTestId('btn-bag').click();
  await expect(page.getByTestId('orb-orb')).toBeEnabled();
  await expect(page.getByTestId('battle-text')).toContainText('Throw an orb');
  await page.getByTestId('tab-items').click();
  await shot(page, '11-bag-items', project);
  await page.getByTestId('item-tonic').click();
  await shot(page, '12-item-target', project);
  await page.getByTestId('target-0').click();
  await waitIdle(page);
  const b = await hooks(page, (g) => g.battle());
  expect(b!.sides[0]!.party[0]!.hp, 'tonic healed').toBeGreaterThan(12);
  expect((await hooks(page, (g) => g.player())).bag.tonic).toBe(1);

  await hooks(page, (g) => g.setSpeed(1));
  await fightToEnd(page);
  await waitScene(page, 'evolution');
  await expect(page.getByTestId('btn-evo-skip')).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await shot(page, '13-evolving', project);
  await page.getByTestId('btn-evo-skip').click();
  await expect(page.getByTestId('btn-evo-continue')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('evo-text')).toContainText('evolved into Cindertail');
  await page.waitForTimeout(600);
  await shot(page, '14-evolved', project);
  const p = await hooks(page, (g) => g.player());
  expect(p.party[0]!.species).toBe('cindertail');
  expect(p.party[0]!.level).toBe(14);
  await page.getByTestId('btn-evo-continue').click();
  await waitScene(page, 'route');
  expect(errors, 'console errors').toEqual([]);
});

test('Champion Vale: win and enter the Hall of Fame', async ({ page }, info) => {
  test.setTimeout(150_000);
  const project = info.project.name;
  const errors = watchConsole(page);
  await page.goto('/?seed=3&scene=route&route=meadow');
  await waitScene(page, 'route');
  await hooks(page, (g) => {
    g.debugDefeat('scout-pim', 'hiker-brann', 'adept-sola', 'angler-merrow', 'rider-tavi');
    g.debugSetParty([
      { species: 'pyrelord', level: 30 }, { species: 'maelstrode', level: 30 }, { species: 'verdantusk', level: 30 },
      { species: 'vulcrag', level: 30 }, { species: 'surgeray', level: 30 }, { species: 'petalwisp', level: 30 },
    ]);
    g.debugGive('full-tonic', 5);
    return g.goto('route', { route: 'plateau' });
  });
  await waitScene(page, 'route');
  await expect(page.getByTestId('route-name')).toContainText('Crown Plateau');
  await page.waitForTimeout(400);
  await expectRendered(page);
  await shot(page, '20-route-plateau', project);

  await page.getByTestId('spot-champion-vale').click();
  await waitScene(page, 'battle');
  await page.waitForTimeout(900);
  await shot(page, '21-champion-intro', project);
  await hooks(page, (g) => g.setFast(true));
  await fightToEnd(page, 150, true);
  await waitScene(page, 'victory');
  await hooks(page, (g) => g.setFast(false));
  await expect(page.getByTestId('hof-title')).toBeVisible();
  await page.waitForTimeout(1200);
  await expectRendered(page);
  await shot(page, '22-hall-of-fame', project);
  expect((await hooks(page, (g) => g.player())).champion).toBe(true);
  await page.getByTestId('btn-hof-continue').click();
  await waitScene(page, 'route');
  await expect(page.getByTestId('spot-champion-vale')).toContainText('Hall of Fame');
  expect(errors, 'console errors').toEqual([]);
});
