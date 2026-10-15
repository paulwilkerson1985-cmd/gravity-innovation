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
  debugDefeat(...ids: string[]): void;
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
    test.beforeEach(({ browserName }, info) => { test.skip(info.project.name !== 'desktop' || browserName !== 'chromium', 'viewports are set per test'); });

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

// Every species, as your kin, stays clear of your HP panel on portrait phones (the panel sits
// right beside it) and inside the screen.
const SPECIES = ['ashkit', 'cindertail', 'pyrelord', 'dropple', 'rillback', 'maelstrode', 'mossling', 'thistlehorn', 'verdantusk',
  'flickwing', 'stormoth', 'pebblet', 'cragmaul', 'breezel', 'cyclonyx', 'vulcrag', 'surgeray', 'petalwisp'];
for (const vp of ['phone', 'small'] as const) {
  test(`battle @ ${vp}: every species clears your panel`, async ({ browser, browserName }, info) => {
    test.skip(info.project.name !== 'desktop' || browserName !== 'chromium', 'viewports are set per test');
    const { ctx, page } = await open(browser, vp, '/?seed=4&scene=route&route=meadow', 'route');
    const bad: string[] = [];
    for (const sp of SPECIES) {
      await page.evaluate((id) => {
        const g = (window as unknown as { __game: Hooks }).__game;
        g.debugSetParty([{ species: id, level: 30 }]);
        return g.goto('battle', { route: 'meadow', hotspot: 'tall-grass' });
      }, sp);
      await waitScene(page, 'battle');
      await G(page, (g) => g.waitIdle(30_000));
      await page.waitForTimeout(250);
      const lay = await G(page, (g) => g.layout());
      const panel = (await rect(page, '[data-testid="panel-mine"]'))!;
      const mine = lay.subjects.find((x) => x.name === 'mine');
      if (!mine) { bad.push(`${sp}: no kin`); continue; }
      const k = covered(mine, panel);
      if (k > 0.03) bad.push(`${sp}: ${Math.round(k * 100)}% under the panel`);
      if (mine.x < -2 || mine.x + mine.w > lay.w + 2) bad.push(`${sp}: off-screen ${JSON.stringify(mine)}`);
    }
    expect(bad).toEqual([]);
    await ctx.close();
  });
}

// ---------------------------------------------------------------- text never clips (final polish)

/** Labels that must show in full: no ellipsis and no line-clamp cut (scroll size ≤ client size). */
async function clippedLabels(page: Page, sel: string): Promise<string[]> {
  return page.evaluate((s) => [...document.querySelectorAll<HTMLElement>(s)]
    .filter((e) => e.offsetParent !== null && getComputedStyle(e).display !== 'none')
    .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)
    .map((e) => `${e.className}: "${e.textContent?.trim()}" ${e.scrollWidth}x${e.scrollHeight} > ${e.clientWidth}x${e.clientHeight}`), sel);
}

/**
 * Battle HUD check (UI research, docs/research/graphics/ui-hud-typography.md §10):
 *  - every label is exactly ONE line box (names, levels, HP numbers, chips, tags, and the
 *    command / move / item names `.mn`: the slab's small caps step down in size on phones
 *    instead of wrapping);
 *  - neither info box (yours, the foe's) intersects another HUD panel (the bag/kin sheet is meant
 *    to cover the dialog on phones);
 *  - legibility floor: no visible text with an x-height under 7 CSS px on desktop, or under
 *    18 device px at the research's reference phone (DPR 2.75), i.e. 6.5 CSS px, on touch screens.
 *    x-height per face (fontTools, vendored woff2): UI Caps (Alegreya Sans SC) 0.501 em, UI Sans
 *    0.464, UI Serif (Alegreya) 0.456. `--f0` (decoration) is not used by the battle HUD.
 */
async function hudIssues(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const vis = (e: Element | null): e is HTMLElement => {
      if (!(e instanceof HTMLElement) || e.offsetParent === null) return false;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const root = document.querySelector('.battle-ui') ?? document.body;
    for (const e of root.querySelectorAll('.pname, .plevel, .hpnums, .chip, .badge, .hplabel, .xplabel, .eff, .bt-menu .mn')) {
      if (!vis(e) || !e.textContent?.trim()) continue;
      // Line boxes = clusters of vertically overlapping text rects.
      const rows: [number, number][] = [];
      const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      for (let t = tw.nextNode(); t; t = tw.nextNode()) {
        if (!t.textContent?.trim() || !vis(t.parentElement)) continue;
        const rg = document.createRange(); rg.selectNodeContents(t);
        for (const r of rg.getClientRects()) if (r.width > 0.5 && r.height > 0.5) rows.push([r.top, r.bottom]);
      }
      rows.sort((a, b) => a[0] - b[0]);
      let lines = 0, bottom = -1e9;
      for (const [top, bot] of rows) { if (top >= bottom - 1) { lines++; bottom = bot; } else bottom = Math.max(bottom, bot); }
      if (lines > 1) out.push(`wraps onto ${lines} lines: ${e.className} "${e.textContent.trim()}"`);
    }
    const panels = ['[data-testid="panel-mine"]', '[data-testid="panel-foe"]', '.textbox.bt-text', '.bt-menu']
      .map((s) => [s, document.querySelector(s)] as const).filter(([, e]) => vis(e))
      .map(([s, e]) => [s, e!.getBoundingClientRect()] as const);
    for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) {
      const [sa, a] = panels[i]!, [sb, b] = panels[j]!;
      if (!sa.startsWith('[data-testid="panel-')) continue;
      const area = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (area > 1) out.push(`panels overlap: ${sa} x ${sb} (${Math.round(area)} px²)`);
    }
    const floor = matchMedia('(pointer: coarse)').matches ? 18 / 2.75 : 7;
    const seen = new Set<Element>();
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      const el = t.parentElement;
      if (!el || seen.has(el) || !t.textContent?.trim() || !vis(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      const fam = cs.fontFamily.split(',')[0]!.replace(/["']/g, '').trim();
      const xr = fam === 'UI Serif' ? 0.456 : fam === 'UI Sans' ? 0.464 : 0.501;
      const x = parseFloat(cs.fontSize) * xr;
      if (x < floor - 0.01) out.push(`x-height ${x} CSS px < ${floor.toFixed(2)}: ${el.className} "${t.textContent.trim().slice(0, 20)}"`);
    }
    return out;
  });
}

async function insideViewport(page: Page, sel: string): Promise<string[]> {
  return page.evaluate((s) => [...document.querySelectorAll<HTMLElement>(s)]
    .filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
    .map((e) => ({ e, r: e.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1))
    .map(({ e, r }) => `${e.className} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`), sel);
}

for (const vp of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
  test(`text & labels never clip @ ${vp}`, async ({ browser, browserName }, info) => {
    test.skip(info.project.name !== 'desktop' || browserName !== 'chromium', 'viewports are set per test');
    test.setTimeout(240_000);
    const { ctx, page } = await open(browser, vp, '/?seed=9&scene=route&route=meadow', 'route');
    const bad: string[] = [];
    const note = (label: string, list: string[]) => { for (const x of list) bad.push(`${label}: ${x}`); };

    // Battle panels (#3 #4 #5): long names, dual types, status badge and party pips at once.
    await G(page, (g) => {
      g.debugSetParty([{ species: 'thistlehorn', level: 30, status: 'burn' }, { species: 'breezel', level: 8, hp: 3 }, { species: 'pebblet', level: 7, hp: 0 }, { species: 'maelstrode', level: 30 }, { species: 'vulcrag', level: 30, status: 'shock' }, { species: 'petalwisp', level: 30 }]);
      g.debugGive('tonic', 3); g.debugGive('mega-tonic', 1); g.debugGive('full-tonic', 1); g.debugGive('remedy', 1); g.debugGive('revive-seed', 1); g.debugGive('star', 5); g.debugGive('bright', 3); g.debugGive('orb', 12);
      return g.goto('battle', { route: 'meadow', hotspot: 'tall-grass', foe: 'vulcrag', foeLevel: 30 });
    });
    await waitScene(page, 'battle');
    await G(page, (g) => g.waitIdle(30_000));
    note('panel inside', await insideViewport(page, '.panel'));
    note('panel name', await clippedLabels(page, '.panel .pname'));
    note('hud', await hudIssues(page));
    const chipRows = await page.evaluate(() => [...document.querySelectorAll('.panel .ptypes')].map((t) => new Set([...t.children].map((c) => Math.round(c.getBoundingClientRect().top))).size));
    expect(chipRows.every((n) => n <= 1), `type chips stay on one line (${chipRows})`).toBe(true);

    // Menus (#8): every name and meta shows in full.
    for (const [btn, label] of [['btn-fight', 'moves'], ['btn-bag', 'orbs'], ['btn-kin', 'kin']] as const) {
      await page.getByTestId(btn).click();
      await page.waitForTimeout(120);
      note(label, await clippedLabels(page, '.bt-menu .mn, .bt-menu .mmeta, .bt-menu .kin-row .mname, .bt-menu .btn-back'));
      note(`${label} hud`, await hudIssues(page));
      if (label === 'orbs') {
        await page.getByTestId('tab-items').click();
        await page.waitForTimeout(120);
        note('items', await clippedLabels(page, '.bt-menu .mn, .bt-menu .mmeta'));
      }
      await page.getByTestId('btn-back').click();
    }

    // Champion speech (#2): the whole line fits the (grown) text box, on screen.
    await G(page, (g) => {
      g.debugDefeat('scout-pim', 'hiker-brann', 'adept-sola', 'angler-merrow', 'rider-tavi');
      g.debugSetParty([{ species: 'pyrelord', level: 30 }]);
      return g.goto('battle', { route: 'plateau', trainer: 'champion-vale' });
    });
    await waitScene(page, 'battle');
    await page.waitForFunction(() => /climbed/.test(document.querySelector('[data-testid="battle-text"]')?.textContent ?? ''), undefined, { timeout: 20_000 });
    await page.waitForSelector('[data-testid="battle-text"].waiting', { timeout: 20_000 });
    note('champion text', await clippedLabels(page, '.textbox.bt-text'));
    note('champion text box', await insideViewport(page, '.textbox.bt-text'));
    const shown = (await page.getByTestId('battle-text').textContent()) ?? '';
    expect(shown.length, 'a page of the speech is shown').toBeGreaterThan(20);

    // Route hotspots (#7): names and subtitles in full on a five-button route.
    await G(page, (g) => { g.debugDefeat('angler-merrow'); return g.goto('route', { route: 'coast' }); });
    await waitScene(page, 'route');
    await page.waitForTimeout(300);
    note('route', await clippedLabels(page, '.btn-spot .mname, .btn-spot .mmeta'));

    // Party screen (#9): the action bar is on screen.
    await G(page, (g) => g.goto('party', { from: 'route', route: 'coast' }));
    await waitScene(page, 'party');
    await page.waitForTimeout(500);
    note('party actions', await insideViewport(page, '.kin-actions .btn'));
    expect(bad).toEqual([]);
    await ctx.close();
  });
}

// Every species as the foe, on two themes, stays inside the screen (#16) — measured from the
// projected vertices, not a world-aligned box.
for (const vp of ['phone', 'small', 'landscape'] as const) {
  test(`battle @ ${vp}: every species as foe stays on screen`, async ({ browser, browserName }, info) => {
    test.skip(info.project.name !== 'desktop' || browserName !== 'chromium', 'viewports are set per test');
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, vp, '/?seed=4&scene=route&route=meadow', 'route');
    const bad: string[] = [];
    for (const route of ['meadow', 'plateau']) {
      for (const sp of SPECIES) {
        await page.evaluate(([id, r]) => {
          const g = (window as unknown as { __game: Hooks & { setFast(on: boolean): void } }).__game;
          g.setFast(true);
          g.debugSetParty([{ species: 'cragmaul', level: 30 }]);
          return g.goto('battle', { route: r, hotspot: 'x', foe: id, foeLevel: 30 });
        }, [sp, route]);
        await waitScene(page, 'battle');
        await G(page, (g) => g.waitIdle(30_000));
        const lay = await G(page, (g) => g.layout());
        const foe = lay.subjects.find((x) => x.name === 'foe');
        if (!foe) { bad.push(`${route}/${sp}: no foe`); continue; }
        if (foe.x < -2 || foe.y < -2 || foe.x + foe.w > lay.w + 2) bad.push(`${route}/${sp}: ${JSON.stringify(foe)}`);
      }
    }
    expect(bad).toEqual([]);
    await ctx.close();
  });
}
