// Arena (PvP) end-to-end: hotseat with the pass-the-device curtain, vs CPU, and an online
// match between two browser contexts through the real arena server (playwright webServer).
import { expect, test, type Page } from '@playwright/test';

type Snap = Record<string, unknown> & {
  scene: string; curtain?: boolean; asking?: 0 | 1 | null; playing?: boolean; menuButtons?: string[];
  winner?: 0 | 1 | null; view?: string; room?: { code: string } | null; phase?: string; turn?: number;
};
type Hooks = {
  scene(): string | null;
  setFast(on: boolean): void;
  waitIdle(ms?: number): Promise<boolean>;
  arena(): Snap | null;
  canvasStats(): { distinct: number; nonBlack: number; samples: number } | null;
  renderInfo(): { calls: number; triangles: number };
};
const SERVER = 'ws://localhost:8787';

// Full matches under software WebGL are slow on busy machines.
test.describe.configure({ timeout: 240_000 });

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}
const snap = (page: Page) => page.evaluate(() => (window as unknown as { __game: Hooks }).__game.arena());
const setFast = (page: Page, on: boolean) => page.evaluate((v) => (window as unknown as { __game: Hooks }).__game.setFast(v), on);

async function shot(page: Page, name: string, project: string) {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `screenshots/${project}-arena-${name}.png` });
}

async function waitScene(page: Page, name: string, timeout = 20_000) {
  await page.waitForFunction((n) => (window as unknown as { __game?: Hooks }).__game?.scene() === n, name, { timeout });
}

async function expectRendered(page: Page) {
  const stats = await page.evaluate(() => (window as unknown as { __game: Hooks }).__game.canvasStats());
  expect(stats!.distinct, 'canvas should not be blank').toBeGreaterThan(8);
  const info = await page.evaluate(() => (window as unknown as { __game: Hooks }).__game.renderInfo());
  expect(info.calls, 'draw calls per frame').toBeLessThan(100);
}

/** Touch targets: every visible enabled button in the arena UI is at least 44px tall. */
async function expectTouchTargets(page: Page) {
  const small = await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('.scene-ui button')]
    .filter((b) => b.offsetParent !== null)
    .map((b) => ({ id: b.dataset.testid ?? b.textContent, h: b.getBoundingClientRect().height }))
    .filter((b) => b.h < 43.5));
  expect(small, 'buttons smaller than 44px').toEqual([]);
}

/** Pick a move (or a replacement) for whoever is being asked on this page. Returns false if nothing to do. */
async function act(page: Page, s: Snap): Promise<boolean> {
  if (s.scene !== 'arenaBattle' || s.asking === null || s.asking === undefined || s.playing || s.curtain) return false;
  const buttons = s.menuButtons ?? [];
  if (buttons.includes('btn-fight')) {
    await page.getByTestId('btn-fight').click();
    const moves = page.locator('[data-testid^="move-"]:not([disabled])');
    await moves.first().click();
    return true;
  }
  const kin = page.locator('[data-testid^="kin-"]:not([disabled])');
  if (await kin.count()) { await kin.first().click(); return true; }
  return false;
}

async function buildRandom(page: Page) {
  await page.getByTestId('arena-random').click();
  await expect(page.getByTestId('arena-lockin')).toBeEnabled();
  await page.getByTestId('arena-lockin').click();
}

test('hotseat: two teams, curtains hide every choice, full match to the victory screen', async ({ page }, info) => {
  const project = info.project.name;
  const errors = watchConsole(page);
  await page.goto('/?seed=11&scene=arena');
  await waitScene(page, 'arena');
  await page.waitForTimeout(400);
  await expectRendered(page);
  await expectTouchTargets(page);
  await shot(page, '01-lobby', project);

  await page.getByTestId('arena-mode-hotseat').click();
  await page.getByTestId('arena-name-0').fill('Ember');
  await page.getByTestId('arena-name-1').fill('Rill');
  await page.getByTestId('arena-names-go').click();

  // Player 1 builds from rentals: three picks, a lead swap and a move tweak.
  await expect(page.getByTestId('arena-builder-0')).toBeVisible();
  await expect(page.getByTestId('arena-lockin')).toBeDisabled();
  await expect(page.getByTestId('arena-note')).toContainText('Pick 3 more');
  for (const id of ['r-pyrelord', 'r-maelstrode', 'r-verdantusk']) await page.getByTestId(`pick-${id}`).click();
  // A fourth pick is refused with a friendly message.
  await page.getByTestId('tab-rental').click();
  await page.getByTestId('pick-r-stormoth').click();
  await expect(page.getByTestId('arena-note')).toContainText('full');
  await page.getByTestId('slot-2').click();
  await page.getByTestId('slot-lead').click();
  await expect(page.getByTestId('slot-0')).toContainText('Verdantusk');
  await page.getByTestId('moveopt-second-wind').click(); // drop one move
  await expect(page.getByTestId('slot-0')).toContainText('3 moves');
  await page.waitForTimeout(500);
  await expectRendered(page);
  await expectTouchTargets(page);
  await shot(page, '02-builder', project);
  await page.getByTestId('arena-lockin').click();

  // Curtain between builders hides Player 1's team.
  await expect(page.getByTestId('arena-curtain')).toBeVisible();
  await expect(page.getByTestId('arena-curtain')).toContainText('Pass to Rill');
  await expect(page.locator('[data-testid^="slot-"]')).toHaveCount(0);
  await shot(page, '03-curtain', project);
  await page.getByTestId('arena-curtain-go').click();
  await expect(page.getByTestId('arena-builder-1')).toBeVisible();
  await expect(page.getByTestId('slot-0')).not.toContainText('Verdantusk');
  for (const id of ['r-stormoth', 'r-cragmaul', 'r-cyclonyx']) await page.getByTestId(`pick-${id}`).click();
  await page.getByTestId('arena-lockin').click();

  await waitScene(page, 'arenaBattle');
  await expect.poll(async () => (await snap(page))?.asking, { timeout: 20_000 }).toBe(0);
  await expectRendered(page);
  await shot(page, '04-battle-p1', project);
  await expectTouchTargets(page);

  // First turn by hand: P1 picks a move, the curtain hides it, P2 picks, curtain, playback.
  await page.getByTestId('btn-fight').click();
  await shot(page, '05-moves', project);
  await page.getByTestId('move-0').click();
  const cur = page.getByTestId('arena-curtain');
  await expect(cur).toBeVisible();
  await expect(cur).toContainText('Pass to Rill');
  await expect(page.locator('[data-testid^="move-"]')).toHaveCount(0);
  await expect(page.getByTestId('arena-menu')).toBeEmpty();
  await expect(page.getByTestId('battle-text')).toHaveText('');
  // The curtain covers the whole viewport (canvas and UI).
  const box = await cur.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(box!.height).toBeGreaterThanOrEqual(vp.height - 1);
  await page.getByTestId('arena-curtain-go').click();
  await expect.poll(async () => (await snap(page))?.asking).toBe(1);
  await expect(page.getByTestId('battle-text')).toContainText('Rill');
  await page.getByTestId('btn-fight').click();
  await page.getByTestId('move-1').click();
  await expect(cur).toBeVisible();
  await expect(cur).toContainText('both locked in');
  await expect(page.getByTestId('arena-menu')).toBeEmpty();
  await page.getByTestId('arena-curtain-go').click();

  // Rest of the match at full speed.
  await setFast(page, true);
  let curtains = 0;
  for (let i = 0; i < 600; i++) {
    const s = (await snap(page))!;
    if (s.scene === 'arenaVictory') break;
    if (s.curtain) {
      await expect(page.getByTestId('arena-menu')).toBeEmpty();
      await page.getByTestId('arena-curtain-go').click();
      curtains++;
      continue;
    }
    if (!(await act(page, s))) await page.waitForTimeout(25);
  }
  expect(curtains).toBeGreaterThan(2);
  await waitScene(page, 'arenaVictory');
  await setFast(page, false);
  await page.waitForTimeout(1200);
  const v = (await snap(page))!;
  expect([0, 1]).toContain(v.winner);
  await expect(page.getByTestId('arena-winner')).toContainText(v.winner === 0 ? 'Ember' : 'Rill');
  await expectRendered(page);
  await expectTouchTargets(page);
  await shot(page, '06-victory', project);

  // New teams goes back to Player 1's builder with the old team prefilled.
  await page.getByTestId('arena-newteams').click();
  await waitScene(page, 'arena');
  await expect(page.getByTestId('arena-builder-0')).toBeVisible();
  await expect(page.getByTestId('slot-0')).toContainText('Verdantusk');
  expect(errors, 'console errors').toEqual([]);
});

test('vs CPU: random team against the Arena Ace, rematch, exit', async ({ page }, info) => {
  const errors = watchConsole(page);
  await page.goto('/?seed=23&scene=arena');
  await waitScene(page, 'arena');
  await page.getByTestId('arena-mode-cpu').click();
  // Keyboard: the builder is reachable without a mouse.
  await page.getByTestId('arena-random').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('arena-lockin')).toBeEnabled();
  await page.getByTestId('arena-lockin').focus();
  await page.keyboard.press('Enter');
  await waitScene(page, 'arenaBattle');
  await setFast(page, true);
  let turns = 0;
  for (let i = 0; i < 600; i++) {
    const s = (await snap(page))!;
    if (s.scene === 'arenaVictory') break;
    expect(s.curtain, 'no curtain vs CPU').toBeFalsy();
    if (await act(page, s)) turns++;
    else await page.waitForTimeout(25);
  }
  await waitScene(page, 'arenaVictory');
  expect(turns).toBeGreaterThan(2);
  await setFast(page, false);
  await page.waitForTimeout(800);
  await shot(page, '07-cpu-victory', info.project.name);
  await page.getByTestId('arena-rematch').click();
  await waitScene(page, 'arenaBattle');
  await expect.poll(async () => (await snap(page))?.asking, { timeout: 20_000 }).toBe(0);
  // Forfeit ends it at once.
  await page.getByTestId('btn-forfeit').click();
  await page.getByTestId('btn-forfeit-yes').click();
  await waitScene(page, 'arenaVictory');
  expect((await snap(page))!.winner).toBe(1);
  await page.getByTestId('arena-exit').click();
  await waitScene(page, 'title');
  expect(errors, 'console errors').toEqual([]);
});

test('online: two browsers play a full match through the arena server', async ({ browser, page }, info) => {
  const project = info.project.name;
  const errorsA = watchConsole(page);
  const ctxB = await browser.newContext({ viewport: page.viewportSize()!, isMobile: info.project.name === 'phone', hasTouch: info.project.name === 'phone' });
  const pageB = await ctxB.newPage();
  const errorsB = watchConsole(pageB);
  const health = await (await page.request.get('http://localhost:8787/health')).json() as { ok: boolean };
  expect(health.ok).toBe(true);

  await page.goto(`/?seed=31&scene=arena&server=${SERVER}`);
  await pageB.goto(`/?seed=32&scene=arena&server=${SERVER}`);
  await waitScene(page, 'arena');
  await waitScene(pageB, 'arena');
  await page.getByTestId('arena-mode-online').click();
  await page.getByTestId('arena-online-name').fill('Host');
  await page.getByTestId('arena-create').click();
  const codeEl = page.getByTestId('arena-room-code');
  await expect(codeEl).toBeVisible({ timeout: 10_000 });
  const code = (await snap(page))!.room!.code;
  expect(code).toMatch(/^[A-Z]{4}$/);
  await expect(page.getByTestId('arena-opp-status')).toContainText(code);
  await shot(page, '08-online-room', project);

  await pageB.getByTestId('arena-mode-online').click();
  await pageB.getByTestId('arena-online-name').fill('Guest');
  // A wrong code gives a friendly error.
  await pageB.getByTestId('arena-code-input').fill('ZZZZ');
  await pageB.getByTestId('arena-join').click();
  await expect(pageB.getByTestId('arena-online-note')).toContainText('No room');
  await pageB.getByTestId('arena-code-input').fill(code.toLowerCase());
  await pageB.getByTestId('arena-join').click();
  await expect(pageB.getByTestId('arena-room-code')).toContainText(code);
  await expect(page.getByTestId('arena-opp-status')).toContainText('Guest');

  await buildRandom(page);
  await expect(page.getByTestId('arena-opp-status')).toContainText('building');
  await buildRandom(pageB);
  await waitScene(page, 'arenaBattle');
  await waitScene(pageB, 'arenaBattle');
  await expect.poll(async () => (await snap(page))?.asking, { timeout: 20_000 }).toBe(0);
  await expect(page.getByTestId('arena-timer')).toBeVisible();
  await shot(page, '09-online-battle', project);

  // A commits: B sees that A is ready but never what A picked.
  await page.getByTestId('btn-fight').click();
  await page.getByTestId('move-0').click();
  await expect(pageB.getByTestId('arena-opp')).toContainText('Host is ready');
  await expect(page.getByTestId('battle-text')).toContainText('Waiting for Guest');
  await shot(pageB, '10-online-opp-ready', project);

  // B drops (reload) and rejoins its seat.
  await pageB.reload();
  await waitScene(pageB, 'arena');
  await expect(page.getByTestId('arena-opp')).toContainText('reconnecting', { timeout: 10_000 });
  await pageB.getByTestId('arena-mode-online').click();
  await pageB.getByTestId('arena-rejoin').click();
  await waitScene(pageB, 'arenaBattle');
  await expect.poll(async () => (await snap(pageB))?.asking, { timeout: 20_000 }).toBe(1);

  await setFast(page, true);
  await setFast(pageB, true);
  for (let i = 0; i < 1200; i++) {
    const [a, b] = [(await snap(page))!, (await snap(pageB))!];
    if (a.scene === 'arenaVictory' && b.scene === 'arenaVictory') break;
    const did = (await act(page, a)) || (await act(pageB, b));
    if (!did) await page.waitForTimeout(30);
  }
  await waitScene(page, 'arenaVictory');
  await waitScene(pageB, 'arenaVictory');
  const [va, vb] = [(await snap(page))!, (await snap(pageB))!];
  expect(va.winner).toBe(vb.winner);
  expect(va.turns).toBe(vb.turns);
  await setFast(page, false);
  await page.waitForTimeout(800);
  await shot(page, '11-online-victory', project);

  // Rematch needs both players.
  await page.getByTestId('arena-rematch').click();
  await expect(pageB.getByTestId('arena-victory-note')).toContainText('wants a rematch');
  await pageB.getByTestId('arena-rematch').click();
  await waitScene(page, 'arenaBattle');
  await waitScene(pageB, 'arenaBattle');
  // Leaving forfeits for the other side.
  await expect.poll(async () => (await snap(pageB))?.asking, { timeout: 20_000 }).toBe(1);
  await pageB.getByTestId('btn-forfeit').click();
  await pageB.getByTestId('btn-forfeit-yes').click();
  await waitScene(page, 'arenaVictory');
  expect((await snap(page))!.winner).toBe(0);
  await page.getByTestId('arena-exit').click();
  await waitScene(page, 'title');
  await expect(pageB.getByTestId('arena-victory-note')).toContainText('left the arena');
  await ctxB.close();
  expect([...errorsA, ...errorsB], 'console errors').toEqual([]);
});

test('online: unreachable server shows a friendly error', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?seed=3&scene=arena&server=ws://localhost:9');
  await waitScene(page, 'arena');
  await page.getByTestId('arena-mode-online').click();
  await page.getByTestId('arena-create').click();
  await expect(page.getByTestId('arena-online-note')).toContainText("Can't reach the arena server", { timeout: 10_000 });
  // The browser logs failed WebSocket handshakes itself; nothing else may error.
  expect(errors.filter((e) => !/WebSocket/i.test(e))).toEqual([]);
});

