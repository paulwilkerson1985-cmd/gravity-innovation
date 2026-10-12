import { expect, test, type Page } from '@playwright/test';

type Hooks = {
  scene(): string | null;
  player(): { party: unknown[]; caught: string[]; bag: Record<string, number> };
  battle(): { phase: string; outcome: { reason: string } | null } | null;
  setFast(on: boolean): void;
  waitIdle(ms?: number): Promise<boolean>;
  canvasStats(): { distinct: number; nonBlack: number; samples: number } | null;
  renderInfo(): { calls: number; triangles: number };
};


function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function shot(page: Page, name: string, project: string) {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `screenshots/${project}-${name}.png` });
}

async function expectRendered(page: Page) {
  const stats = await page.evaluate(() => (window as unknown as { __game: Hooks }).__game.canvasStats());
  expect(stats, 'canvas stats').not.toBeNull();
  expect(stats!.distinct, 'canvas should not be blank').toBeGreaterThan(8);
  expect(stats!.nonBlack).toBeGreaterThan(stats!.samples / 2);
  const info = await page.evaluate(() => (window as unknown as { __game: Hooks }).__game.renderInfo());
  expect(info.calls, 'draw calls per frame').toBeLessThan(100);
}

async function waitScene(page: Page, name: string) {
  await page.waitForFunction((n) => (window as unknown as { __game?: Hooks }).__game?.scene() === n, name);
}

async function waitIdle(page: Page) {
  const ok = await page.evaluate(() => (window as unknown as { __game: Hooks }).__game.waitIdle(20000));
  expect(ok, 'UI became idle').toBe(true);
}

test('vertical slice: title → starter → route → wild battle → catch → party', async ({ page }, info) => {
  const project = info.project.name;
  const errors = watchConsole(page);
  await page.goto('/?seed=42');
  await waitScene(page, 'title');
  await page.waitForTimeout(500);
  await expectRendered(page);
  await shot(page, '01-title', project);

  await page.getByTestId('btn-start').click();
  await waitScene(page, 'starter');
  await page.getByTestId('starter-ashkit').click();
  await page.waitForTimeout(400);
  await expectRendered(page);
  await shot(page, '02-starter', project);
  await page.getByTestId('btn-confirm-starter').click();

  await waitScene(page, 'route');
  await page.waitForTimeout(300);
  await expectRendered(page);
  await shot(page, '03-route', project);

  // Fight one wild battle normally, then catch in later encounters.
  await page.getByTestId('spot-tall-grass').click();
  await waitScene(page, 'battle');
  await waitIdle(page);
  await expectRendered(page);
  await shot(page, '04-battle', project);
  await page.getByTestId('btn-fight').click();
  await shot(page, '05-moves', project);
  await page.getByTestId('btn-back').click();
  await page.getByTestId('btn-bag').click();
  await shot(page, '06-orbs', project);

  // Throw orbs until something is caught (deterministic for the seed), playing the first throw at full speed.
  let caught = false;
  let throws = 0;
  for (let encounter = 0; encounter < 8 && !caught; encounter++) {
    if (encounter > 0) {
      await page.getByTestId('btn-continue').click();
      await waitScene(page, 'route');
      await page.getByTestId('btn-rest').click();
      await page.getByTestId('spot-tall-grass').click();
      await waitScene(page, 'battle');
      await waitIdle(page);
      await page.getByTestId('btn-bag').click();
    }
    for (let turn = 0; turn < 6; turn++) {
      const orb = (await page.getByTestId('orb-star').isEnabled()) ? 'orb-star' : (await page.getByTestId('orb-bright').isEnabled()) ? 'orb-bright' : 'orb-orb';
      await page.getByTestId(orb).click();
      throws++;
      if (throws === 1) {
        await page.waitForTimeout(1900);
        await shot(page, '07-catch-shake', project);
      }
      await waitIdle(page);
      const b = await page.evaluate(() => (window as unknown as { __game: Hooks }).__game.battle());
      if (b?.phase === 'over') { caught = b.outcome?.reason === 'caught'; break; }
      await page.evaluate(() => (window as unknown as { __game: Hooks }).__game.setFast(true));
      await page.getByTestId('btn-bag').click();
    }
  }
  expect(caught, 'caught a wild kin').toBe(true);
  await page.evaluate(() => (window as unknown as { __game: Hooks }).__game.setFast(false));
  await shot(page, '08-caught', project);

  await page.getByTestId('btn-view-party').click();
  await waitScene(page, 'party');
  await page.waitForTimeout(500);
  const player = await page.evaluate(() => (window as unknown as { __game: Hooks }).__game.player());
  expect(player.party.length).toBe(2);
  expect(player.caught.length).toBe(2);
  await expectRendered(page);
  await shot(page, '09-party', project);
  await expect(page.getByTestId('party-1')).toBeVisible();

  await page.getByTestId('btn-party-back').click();
  await waitScene(page, 'route');
  expect(errors, 'console errors').toEqual([]);
});

test('scene hooks: gallery and direct battle', async ({ page }, info) => {
  const errors = watchConsole(page);
  await page.goto('/?seed=7&scene=model&debug=1');
  await waitScene(page, 'model');
  await page.waitForTimeout(500);
  await expectRendered(page);
  await shot(page, '10-gallery', info.project.name);

  await page.goto('/?seed=7&scene=battle&route=meadow&hotspot=hollow');
  await waitScene(page, 'battle');
  await page.evaluate(() => (window as unknown as { __game: Hooks }).__game.setFast(true));
  await waitIdle(page);
  // Fight with the first move until the battle ends.
  for (let i = 0; i < 30; i++) {
    const b = await page.evaluate(() => (window as unknown as { __game: Hooks }).__game.battle());
    if (b?.phase === 'over') break;
    if (await page.getByTestId('btn-fight').isVisible()) {
      await page.getByTestId('btn-fight').click();
      await page.getByTestId('move-0').click();
    } else if (await page.getByTestId('kin-1').isVisible().catch(() => false)) {
      await page.getByTestId('kin-1').click();
    }
    await waitIdle(page);
  }
  const b = await page.evaluate(() => (window as unknown as { __game: Hooks }).__game.battle());
  expect(b?.phase).toBe('over');
  expect(errors).toEqual([]);
});
