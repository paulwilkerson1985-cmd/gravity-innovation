// Layout invariants per viewport: the HTML UI never covers the 3D subjects, panels stay put
// when battle submenus open, touch targets are >= 44px and nothing interactive is off-screen.
// Subjects come from window.__game.layout() (projected bounding boxes of creatures/figures).
import { expect, test, type Browser, type Page } from '@playwright/test';

type Rect = { x: number; y: number; w: number; h: number };
type Hooks = {
  scene(): string | null;
  goto(name: string, params?: Record<string, unknown>): Promise<void>;
  waitIdle(ms?: number): Promise<boolean>;
  debugSetParty(e: unknown[]): void;
  debugGive(id: string, n: number): void;
  openMenu(): void;
  save(): Promise<boolean>;
  layout(): { w: number; h: number; subjects: (Rect & { name: string })[] };
};

const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  small: { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
} as const;

test.describe.configure({ timeout: 240_000 });

const G = <T>(page: Page, fn: (g: Hooks) => T): Promise<Awaited<T>> =>
  page.evaluate((src) => (new Function('g', `return (${src})(g)`))((window as unknown as { __game: Hooks }).__game), fn.toString()) as Promise<Awaited<T>>;

async function waitScene(page: Page, name: string) {
  await page.waitForFunction((n) => (window as unknown as { __game?: Hooks }).__game?.scene() === n, name, { timeout: 60_000, polling: 100 });
}

async function rect(page: Page, sel: string): Promise<Rect | null> {
  return page.evaluate((s) => {
    const e = document.querySelector(s) as HTMLElement | null;
    if (!e || e.offsetParent === null) return null;
    const r = e.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, sel);
}

/** Fraction of `a` covered by `b`. */
function covered(a: Rect, b: Rect): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (ix * iy) / Math.max(1, a.w * a.h);
}

/** Subjects must be on screen and (mostly) clear of the given UI elements. */
async function expectClear(page: Page, ui: string[], maxCover = 0.2, label = '') {
  const lay = await G(page, (g) => g.layout());
  expect(lay.subjects.length, `${label}: subjects`).toBeGreaterThan(0);
  const rects = (await Promise.all(ui.map((s) => rect(page, s)))).filter((r): r is Rect => !!r);
  for (const s of lay.subjects) {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    expect(cx > 0 && cx < lay.w && cy > 0 && cy < lay.h, `${label}: ${s.name} centre on screen (${JSON.stringify(s)})`).toBe(true);
    for (const [i, r] of rects.entries()) {
      expect(covered(s, r), `${label}: ${s.name} covered by ${ui[i]}`).toBeLessThanOrEqual(maxCover);
    }
  }
}

/** Every visible button is >= 44px and inside the viewport (or inside a scroll box). */
async function expectTargets(page: Page, label: string) {
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    for (const b of document.querySelectorAll<HTMLElement>('.scene-ui button, .modal button')) {
      if (b.offsetParent === null) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) out.push(`${b.dataset.testid ?? b.textContent?.trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      // Off-screen is only OK when an ancestor scrolls.
      let scroller = false;
      for (let p = b.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) { scroller = true; break; } }
      if (!scroller && (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)) out.push(`${b.dataset.testid ?? b.textContent?.trim().slice(0, 20)} off-screen`);
    }
    return out;
  });
  expect(bad, label).toEqual([]);
}

async function open(browser: Browser, vp: keyof typeof VIEWPORTS, url: string, scene: string) {
  const ctx = await browser.newContext(VIEWPORTS[vp]);
  const page = await ctx.newPage();
  await page.goto(url);
  await waitScene(page, scene);
  return { ctx, page };
}

for (const vp of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
  test.describe(`layout @ ${vp}`, () => {
    // Each test opens its own contexts per viewport, so run once (in the desktop project).
    test.beforeEach((_fixtures, info) => { test.skip(info.project.name !== 'desktop', 'viewports are set per test'); });

    test('battle: panels anchored, kin clear of the UI, big targets', async ({ browser }) => {
      const { ctx, page } = await open(browser, vp, '/?seed=9&scene=route&route=meadow', 'route');
      await G(page, (g) => {
        g.debugSetParty([{ species: 'ashkit', level: 9, status: 'burn' }, { species: 'breezel', level: 8, hp: 3 }, { species: 'pebblet', level: 7, hp: 0 }, { species: 'maelstrode', level: 30 }, { species: 'vulcrag', level: 30 }, { species: 'petalwisp', level: 30 }]);
        g.debugGive('tonic', 3); g.debugGive('mega-tonic', 1); g.debugGive('full-tonic', 1); g.debugGive('remedy', 1); g.debugGive('revive-seed', 1); g.debugGive('star', 5);
        return g.goto('battle', { route: 'meadow', hotspot: 'tall-grass' });
      });
      await waitScene(page, 'battle');
      await G(page, (g) => g.waitIdle(30_000));
      await page.waitForTimeout(300);
      const ui = ['[data-testid="panel-mine"]', '[data-testid="panel-foe"]', '.textbox', '.bt-menu'];
      const mine0 = await rect(page, '[data-testid="panel-mine"]');
      const foe0 = await rect(page, '[data-testid="panel-foe"]');
      expect(mine0).not.toBeNull();
      await expectClear(page, ui, 0.22, 'main');
      await expectTargets(page, 'main');
      for (const [open, label] of [['btn-fight', 'moves'], ['btn-bag', 'bag'], ['btn-kin', 'kin']] as const) {
        await page.getByTestId(open).click();
        await page.waitForTimeout(150);
        expect(await rect(page, '[data-testid="panel-mine"]'), `${label}: your panel does not move`).toEqual(mine0);
        expect(await rect(page, '[data-testid="panel-foe"]'), `${label}: foe panel does not move`).toEqual(foe0);
        await expectClear(page, ui, 0.22, label);
        await expectTargets(page, label);
        // The menu never pokes out of the screen.
        const m = (await rect(page, '.bt-menu'))!;
        expect(m.y >= 0 && m.y + m.h <= VIEWPORTS[vp].viewport.height + 1, `${label}: menu inside viewport`).toBe(true);
        await page.getByTestId('btn-back').click();
      }
      await ctx.close();
    });

    test('starter, title and route frame the 3D clear of the panels', async ({ browser }) => {
      const { ctx, page } = await open(browser, vp, '/?seed=5', 'title');
      await page.waitForTimeout(500);
      await expectClear(page, ['.title-buttons', '.logo'], 0.12, 'title');
      await expectTargets(page, 'title');
      await page.getByTestId('btn-start').click();
      await waitScene(page, 'starter');
      await page.waitForTimeout(500);
      await expectClear(page, ['.starter-ui'], 0.05, 'starter');
      await page.getByTestId('starter-mossling').click();
      await page.waitForTimeout(700);
      await expectClear(page, ['.starter-ui'], 0.05, 'starter selected');
      const lay = await G(page, (g) => g.layout());
      const sel = lay.subjects.find((s) => s.name === 'mossling')!;
      for (const s of lay.subjects) if (s !== sel) expect(sel.h, 'the chosen starter stands out').toBeGreaterThan(s.h);
      await expectTargets(page, 'starter');
      await page.getByTestId('btn-confirm-starter').click();
      await waitScene(page, 'route');
      await page.waitForTimeout(500);
      await expectClear(page, ['.route-ui', '.route-top'], 0.25, 'route');
      await expectTargets(page, 'route');
      await ctx.close();
    });

    test('menus and modals fit the screen', async ({ browser }) => {
      const { ctx, page } = await open(browser, vp, '/?seed=7&scene=route&route=meadow', 'route');
      await G(page, (g) => g.openMenu());
      await page.waitForTimeout(400);
      const modal = (await rect(page, '.modal'))!;
      const vh = VIEWPORTS[vp].viewport.height;
      expect(modal.y >= 0 && modal.y + modal.h <= vh + 1, 'menu modal within the viewport').toBe(true);
      const close = (await rect(page, '.modal .modal-x'))!;
      expect(close.y >= 0, 'close button visible').toBe(true);
      await expectTargets(page, 'menu');
      await page.getByTestId('menu-settings').click();
      await page.waitForTimeout(400);
      const x = (await rect(page, '.modal-settings .modal-x'))!;
      expect(x.y >= 0 && x.y + x.h <= vh, 'settings close button on screen').toBe(true);
      await ctx.close();
    });
  });
}
