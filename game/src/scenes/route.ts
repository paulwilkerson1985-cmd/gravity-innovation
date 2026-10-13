// Route map: a small fixed-camera diorama per route with tappable hotspots (wild patches and
// trainers). Every hotspot is also an HTML button for keyboard/touch/tests.
import * as THREE from 'three';
import { BaseScene } from './base';
import './adventure.css';
import { GEO, MeshBuilder, flatMaterial } from '../render/builder';
import { PALETTES, addLights, cloud, flowers, grassTuft, island, rock, roundTree, staticMesh, tree } from '../render/diorama';
import { corners, fitPoints, freeArea, layoutMode } from './framing';
import { banner, deadTree, fence, lavaRiver, palm, pillar, shell, snowPine, trainerBadge, umbrella, vent } from '../render/props';
import { PLAYER_LOOK, personMesh, trainerLook } from '../render/trainer';
import { arrowNav, focusFirst, h } from '../ui/dom';
import { tween } from '../render/anim';
import { ambient } from '../render/movefx';
import { audio } from '../audio/audio';
import { openGameMenu } from '../ui/menu';
import { Rng } from '../engine/rng';
import { getTrainer } from '../engine';
import { healParty, isRouteUnlocked } from '../game/state';
import { CHAMPION_ID, isTrainerDefeated, routeBlockers } from '../game/progress';
import type { HotspotData, RouteData } from '../engine/types';
import { hd2dRequested } from '../render/hd2d/pipeline';
import { heroFigure, trainerFigure } from '../render/hd2d/characters';
import { buildIslandSet, type IslandSet, type IslandSpot, type IslandTheme } from '../render/hd2d/screens/island';
import { Hd2dScreenStage } from './hd2dScreen';

type Theme = RouteData['theme'];

const WILD_SPOTS: [number, number][] = [[-2.45, 0.55], [2.35, 0.75], [0.1, -2.55]];
const TRAINER_SPOTS: Record<number, [number, number][]> = {
  1: [[1.35, -0.85]],
  2: [[1.4, -0.95], [-1.45, -1.05]],
};

/** Where the wild hotspots go: caves take the back slot so they never hide a trainer or a patch. */
function placeWild(wild: HotspotData[]): Map<string, [number, number]> {
  const free = [...WILD_SPOTS];
  const slotFor = (spot: HotspotData): [number, number] => {
    const i = spot.kind === 'cave' ? free.length - 1 : 0;
    return free.splice(Math.max(0, i), 1)[0] ?? WILD_SPOTS[0]!;
  };
  const placed = new Map(wild.map((s) => [s.id, s.kind === 'cave' ? slotFor(s) : null] as const));
  for (const s of wild) if (!placed.get(s.id)) placed.set(s.id, slotFor(s));
  return placed as Map<string, [number, number]>;
}

/** Wild level range of a route, derived from its hotspot tables (what you will actually meet). */
export function wildRange(route: RouteData): [number, number] | null {
  const slots = route.hotspots.flatMap((s) => (s.kind === 'trainer' ? [] : s.table));
  if (!slots.length) return null;
  return [Math.min(...slots.map((e) => e.min)), Math.max(...slots.map((e) => e.max))];
}

/** Screen-space sky: a vertical gradient texture (the route camera looks down, so a sky dome would read flat). */
function skyGradient(theme: Theme): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const ctx = c.getContext('2d')!;
  const pal = PALETTES[theme];
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, pal.skyTop);
  g.addColorStop(0.62, pal.skyBottom);
  g.addColorStop(1, new THREE.Color(pal.skyBottom).lerp(new THREE.Color(pal.skyTop), 0.35).getStyle());
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';

function hotspotMesh(spot: HotspotData, theme: Theme, seed: number): THREE.Mesh {
  const pal = PALETTES[theme];
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  if (spot.kind === 'grass') {
    b.add(GEO.disc, pal.ground2, { p: [0, 0.01, 0], s: [1.15, 0.04, 1.0] });
    const greens = theme === 'ridge' ? ['#b5a24a', '#9a8a3a', '#cdb85a'] : theme === 'coast' ? ['#9ccf5a', '#b5d86a', '#7fbf4a'] : ['#3fae3a', '#58c94a', '#2f9e3a'];
    grassTuft(b, 0, 0, theme === 'coast' ? 0.6 : 0.75, greens, rng, 34, 0.9);
    if (spot.id.includes('flower')) flowers(b, 0, 0, 14, pal.flower, rng, 0.9);
  } else if (spot.kind === 'cave') {
    for (let i = 0; i < 6; i++) rock(b, (rng.next() - 0.5) * 1.6, -0.3 - rng.next() * 0.6, 1.6 + rng.next() * 1.4, pal.rock, rng);
    b.add(GEO.rock, pal.rock, { p: [0, 0.75, -0.3], s: [1.15, 0.95, 0.85] }, 0.2);
    b.add(GEO.ball, '#1a1420', { p: [0, 0.42, 0.42], s: [0.42, 0.4, 0.12] });
    if (theme === 'ridge') {
      b.add(GEO.ball, '#ff7a1e', { p: [0, 0.3, 0.47], s: [0.26, 0.16, 0.05] });
      vent(b, 0.95, 0.35, 0.7);
    }
    if (theme === 'coast') for (let i = 0; i < 4; i++) shell(b, (rng.next() - 0.5) * 1.6, 0.5 + rng.next() * 0.4, rng.pick(['#ffffff', '#ff9ad0', '#ffd8a8']));
  } else if (spot.kind === 'water') {
    b.add(GEO.disc, '#e9cf86', { p: [0, 0.0, 0], s: [1.35, 0.04, 1.15] });
    b.add(GEO.disc, '#3d9bff', { p: [0, 0.02, 0], s: [1.2, 0.04, 1.0] });
    b.add(GEO.disc, '#2a7fe0', { p: [0, 0.025, 0], s: [0.7, 0.04, 0.55] });
    for (let i = 0; i < 5; i++) b.add(GEO.disc, '#bfe6ff', { p: [(rng.next() - 0.5) * 1.3, 0.05, (rng.next() - 0.5) * 1.0], s: [0.25, 0.01, 0.07] });
    for (let i = 0; i < 3; i++) rock(b, Math.cos(i * 2.1) * 1.15, Math.sin(i * 2.1) * 0.95, 0.7, pal.rock, rng);
  }
  return new THREE.Mesh(b.build(), flatMaterial());
}

/** Themed set dressing for each route (all merged into one static mesh). */
function dressing(b: MeshBuilder, theme: Theme, rng: Rng) {
  const pal = PALETTES[theme];
  const ring = (n: number, place: (x: number, z: number, i: number) => void) => {
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 3.6 + rng.next() * 0.8;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (z > 2.0) continue; // keep the front clear
      place(x, z, i);
    }
  };
  switch (theme) {
    case 'meadow':
      ring(16, (x, z) => (rng.chance(0.5) ? tree(b, x, z, 0.8 + rng.next() * 0.5, rng.pick(pal.leaf), rng) : roundTree(b, x, z, 0.7 + rng.next() * 0.4, rng.pick(pal.leaf))));
      for (let i = 0; i < 7; i++) flowers(b, (rng.next() - 0.5) * 6, (rng.next() - 0.5) * 5, 3, pal.flower, rng, 0.3);
      fence(b, -3.9, 2.0, -1.2, 3.6, 5);
      b.add(GEO.disc, '#3d9bff', { p: [2.8, 0.01, 2.6], s: [0.9, 0.04, 0.6] });
      b.add(GEO.disc, '#bfe6ff', { p: [2.6, 0.03, 2.5], s: [0.3, 0.02, 0.1] });
      break;
    case 'ridge':
      ring(18, (x, z) => (rng.chance(0.6) ? rock(b, x, z, z > -1 ? 0.8 + rng.next() * 0.5 : 1.3 + rng.next() * 0.8, pal.rock, rng) : rng.chance(0.5) ? deadTree(b, x, z, 0.9 + rng.next() * 0.4, rng) : tree(b, x, z, 0.7, rng.pick(pal.leaf), rng)));
      lavaRiver(b, [[-3.7, -1.3], [-2.8, -2.0], [-2.1, -2.9], [-1.1, -3.5]]);
      vent(b, -3.2, 1.6, 0.8);
      vent(b, 3.4, -1.8, 1.0);
      // Small boulders, kept off the trainers' spots and the path down the middle.
      for (let i = 0, n = 0; i < 40 && n < 5; i++) {
        const x = (rng.next() - 0.5) * 6, z = (rng.next() - 0.5) * 4;
        if (Math.abs(x) < 0.8 || Object.values(TRAINER_SPOTS).flat().some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 1.0)) continue;
        rock(b, x, z, 0.5, pal.rock, rng);
        n++;
      }
      break;
    case 'coast':
      ring(12, (x, z) => (rng.chance(0.65) ? palm(b, x, z, 1 + rng.next() * 0.3, rng) : rock(b, x, z, 1.2 + rng.next(), pal.rock, rng)));
      umbrella(b, -3.0, 2.1);
      for (let i = 0; i < 8; i++) shell(b, (rng.next() - 0.5) * 7, (rng.next() - 0.2) * 4, rng.pick(['#ffffff', '#ff9ad0', '#ffd8a8']));
      b.add(GEO.box, '#a8754a', { p: [3.2, 0.06, 2.3], r: [0, 0.6, 0.1], s: [0.18, 0.12, 1.2] }); // driftwood
      break;
    case 'summit':
      ring(14, (x, z) => (rng.chance(0.55) ? snowPine(b, x, z, 0.9 + rng.next() * 0.4, rng.pick(pal.leaf)) : rock(b, x, z, 1.3 + rng.next(), pal.rock, rng)));
      // Champion's dais: stepped discs, crown arch, pillars and banners.
      b.add(GEO.disc, '#b4c0d4', { p: [0, 0.06, -1.3], s: [1.5, 0.12, 1.2] }, 0.05);
      b.add(GEO.disc, '#e6ecf7', { p: [0, 0.16, -1.3], s: [1.15, 0.1, 0.9] }, 0.05);
      b.add(GEO.disc, '#5b3fbf', { p: [0, 0.22, -1.3], s: [0.75, 0.04, 0.6] });
      for (const x of [-1.6, 1.6]) pillar(b, x, -1.9, 2.2);
      b.add(GEO.box, '#e9e2f6', { p: [0, 2.45, -1.9], s: [3.7, 0.22, 0.4] }, 0.05);
      for (let i = 0; i < 5; i++) b.add(GEO.cone4, '#ffd23f', { p: [-0.6 + i * 0.3, 2.7 + (i === 2 ? 0.1 : 0), -1.9], s: [0.1, i === 2 ? 0.45 : 0.3, 0.1] });
      banner(b, -2.6, -0.6, '#5b3fbf');
      banner(b, 2.4, -0.6, '#ff5d73');
      for (let i = 0; i < 5; i++) b.add(GEO.box, '#e6ecf7', { p: [0, 0.03, 0.4 + i * 0.5], s: [0.9, 0.06, 0.32] }); // path stones
      break;
  }
  if (theme !== 'summit') b.add(GEO.disc, pal.dirt, { p: [0, 0.005, 1.6], s: [0.5, 0.02, 2.4] });
  for (let i = 0; i < 4; i++) cloud(b, (rng.next() - 0.5) * 30, 6 + rng.next() * 3, -14 - rng.next() * 6, 1 + rng.next());
}

export class RouteScene extends BaseScene {
  readonly name = 'route' as const;
  private route!: RouteData;
  private hotspots = new Map<string, THREE.Object3D>();
  private markers: THREE.Object3D[] = [];
  private badges: THREE.Object3D[] = [];
  private busy = false;
  private status!: HTMLElement;
  private top!: HTMLElement;
  private sheet!: HTMLElement;
  private ambientUpdate: ((t: number) => void) | null = null;
  private sky: THREE.Texture | null = null;
  private you!: THREE.Object3D;
  /** HD-2D staging (`?gfx=hd2d`): the floating-island diorama, else null. */
  private hd2d: Hd2dScreenStage | null = null;

  enter(params: Record<string, unknown>) {
    const g = this.game;
    if (g.player.party.length === 0) g.debugParty();
    const want = String(params.route ?? g.player.lastRoute ?? 'meadow');
    const id = g.dex().routes.has(want) && isRouteUnlocked(g.player, want) ? want : 'meadow';
    this.route = g.dex().routes.get(id)!;
    audio.music('route');
    if (hd2dRequested()) this.enterHd2d();
    else this.enterDefault(id);
    this.onPick((o) => void this.explore((o.userData.pick as { hotspot: string }).hotspot));
    this.buildUi();
  }

  /** The default (low-poly) route diorama. */
  private enterDefault(id: string) {
    const g = this.game;
    const theme = this.route.theme;
    this.sky = skyGradient(theme);
    this.scene.background = this.sky;
    addLights(this.scene, theme);

    const rng = new Rng(id.length * 977 + id.charCodeAt(0));
    const b = new MeshBuilder();
    island(b, 4.6, theme);
    dressing(b, theme, rng);
    // A soft cloud sea far below and around the floating island gives the map depth.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rng.next() * 0.3;
      const r = 7.5 + rng.next() * 4;
      cloud(b, Math.cos(a) * r, -3.2 - rng.next() * 1.8, Math.sin(a) * r * 0.8 - 1.5, 1.4 + rng.next() * 1.2);
    }
    this.scene.add(staticMesh(b));

    const marker = new THREE.OctahedronGeometry(0.14, 0);
    const markerMat = new THREE.MeshLambertMaterial({ color: '#ffe14d', emissive: '#7a5a00', flatShading: true });
    const wild = this.route.hotspots.filter((s) => s.kind !== 'trainer');
    const trainers = this.route.hotspots.filter((s) => s.kind === 'trainer');
    const tSpots = theme === 'summit' ? [[0, -1.3] as [number, number]] : TRAINER_SPOTS[trainers.length] ?? TRAINER_SPOTS[2]!;
    // Caves are big: they take the back slot so they never hide a trainer or a patch.
    const placed = placeWild(wild);
    wild.forEach((spot, i) => {
      const [x, z] = placed.get(spot.id)!;
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      grp.add(hotspotMesh(spot, theme, i * 31 + 7));
      grp.userData.pick = { hotspot: spot.id };
      const m = new THREE.Mesh(marker, markerMat);
      m.userData.baseY = spot.kind === 'cave' ? 1.9 : 1.5;
      m.position.set(0, m.userData.baseY as number, 0);
      m.scale.set(1, 1.5, 1);
      grp.add(m);
      this.markers.push(m);
      this.scene.add(grp);
      this.hotspots.set(spot.id, grp);
    });
    trainers.forEach((spot, i) => {
      const [x, z] = tSpots[i % tSpots.length]!;
      const beaten = !!spot.trainer && isTrainerDefeated(g.player, spot.trainer);
      const grp = new THREE.Group();
      grp.position.set(x, theme === 'summit' ? 0.24 : 0, z);
      const pad = new MeshBuilder();
      pad.add(GEO.disc, theme === 'summit' ? '#ffd23f' : '#ffffff', { p: [0, 0.01, 0], s: [0.42, 0.03, 0.42] });
      pad.add(GEO.disc, beaten ? '#2fb34a' : '#ff5d73', { p: [0, 0.02, 0], s: [0.36, 0.03, 0.36] });
      grp.add(new THREE.Mesh(pad.build(), flatMaterial()));
      const fig = personMesh(trainerLook(spot.trainer ?? ''));
      fig.scale.setScalar(theme === 'summit' ? 1.35 : 1.15);
      fig.rotation.y = Math.atan2(-x, 4 - z); // face the path / camera
      if (beaten) (fig.material as THREE.MeshLambertMaterial).color.set('#a3a3b5');
      grp.add(fig);
      const badge = trainerBadge(beaten);
      badge.position.set(0, theme === 'summit' ? 1.8 : 1.6, 0);
      grp.add(badge);
      this.badges.push(badge);
      grp.userData.pick = { hotspot: spot.id };
      this.scene.add(grp);
      this.hotspots.set(spot.id, grp);
    });
    const amb = ambient(theme);
    this.scene.add(amb.points);
    this.ambientUpdate = amb.update;
    const you = personMesh(PLAYER_LOOK);
    // On the plateau the path is a stone stairway up to the dais: stand at its foot instead.
    if (theme === 'summit') { you.position.set(0.85, 0, 2.55); you.rotation.y = -0.35; } else you.position.set(0, 0, 1.15);
    this.scene.add(you);
    this.you = you;
  }

  /**
   * HD-2D: the route as a floating-island diorama (render/hd2d/screens/island.ts) through the
   * HD-2D pipeline; trainers and the player are the battle's pixel sprites. Hotspot positions,
   * picking and the explore wiggle are the same as the default map.
   */
  private enterHd2d() {
    const g = this.game;
    const theme = this.route.theme;
    const wild = this.route.hotspots.filter((s) => s.kind !== 'trainer');
    const trainers = this.route.hotspots.filter((s) => s.kind === 'trainer');
    const tSpots = theme === 'summit' ? [[0, -1.3] as [number, number]] : TRAINER_SPOTS[trainers.length] ?? TRAINER_SPOTS[2]!;
    const placed = placeWild(wild);
    const spots: IslandSpot[] = [
      ...wild.map((s) => { const [x, z] = placed.get(s.id)!; return { id: s.id, kind: s.kind, x, z }; }),
      ...trainers.map((s, i) => { const [x, z] = tSpots[i % tSpots.length]!; return { id: s.id, kind: 'trainer', x, z, beaten: !!s.trainer && isTrainerDefeated(g.player, s.trainer) }; }),
    ];
    const player: [number, number] = theme === 'summit' ? [0.85, 2.55] : [0, 1.15];
    let island: IslandSet | null = null;
    this.hd2d = new Hd2dScreenStage(g, this.scene, this.camera, (q) => (island = buildIslandSet(q, theme as IslandTheme, spots, { player })));
    const set = island as unknown as IslandSet;
    for (const [hid, grp] of set.hotspots) this.hotspots.set(hid, grp);
    trainers.forEach((spot, i) => {
      const [x, z] = tSpots[i % tSpots.length]!;
      const fig = trainerFigure(spot.trainer ?? '');
      fig.mesh.scale.setScalar(theme === 'summit' ? 1.2 : 1.1);
      fig.mesh.position.set(0, 0.085, 0);
      fig.mesh.rotation.y = Math.atan2(-x, 6 - z) * 0.6; // toward the path and the camera
      set.hotspots.get(spot.id)!.add(fig.mesh);
      this.hd2d!.addFigure(fig);
    });
    const you = heroFigure();
    you.mesh.scale.setScalar(1.1);
    you.mesh.position.set(player[0], set.topAt(player[0], player[1]), player[1]);
    you.mesh.rotation.y = theme === 'summit' ? -0.35 : 0.3;
    this.scene.add(you.mesh);
    this.hd2d.addFigure(you);
    this.you = you.mesh;
  }

  private buildUi() {
    const g = this.game;
    // ---- UI
    const lead = g.player.party.find((c) => c.hp > 0) ?? g.player.party[0];
    this.status = h('div', { class: 'route-status', 'data-testid': 'route-status' });
    this.renderStatus();
    const spotButtons = h('div', { class: 'spot-buttons' }, ...this.route.hotspots.map((s) => this.spotButton(s)));
    arrowNav(spotButtons);
    const routes = [...g.dex().routes.values()];
    const tabs = h('div', { class: 'route-tabs', role: 'tablist' }, ...routes.map((r) => {
      const open = isRouteUnlocked(g.player, r.id);
      const blockers = routeBlockers(g.player, r);
      const need = blockers.length ? `Beat ${blockers.map((t) => t.name).join(' & ')}` : '';
      const tab = h('button', {
        class: `tab ${r.id === this.route.id ? 'on' : ''} ${open ? '' : 'locked'}`, 'data-testid': `tab-${r.id}`, role: 'tab',
        'aria-selected': r.id === this.route.id ? 'true' : 'false', disabled: !open,
        title: open ? `${r.name}${wildRange(r) ? ` (Lv ${wildRange(r)![0]}–${wildRange(r)![1]})` : ''}` : `Locked — defeat ${blockers.map((t) => `${t.title} ${t.name}`).join(' and ')} to open ${r.name}`,
        onclick: () => { if (r.id !== this.route.id) { audio.sfx('select'); void g.goto('route', { route: r.id }); } },
      }, h('span', { class: 'tab-name' }, r.name), open ? null : h('span', { class: 'tab-need' }, need));
      if (!open) tab.setAttribute('aria-label', `${r.name}, locked: ${need}`);
      if (!open) tab.prepend(h('span', { class: 'tab-lock' }));
      return tab;
    }));
    arrowNav(tabs);
    const range = wildRange(this.route);
    // The next locked route and what opens it, for the status line (tabs only show a lock).
    const nextLocked = routes.find((r) => !isRouteUnlocked(g.player, r.id));
    const nextNeed = nextLocked ? routeBlockers(g.player, nextLocked).map((t) => t.name) : [];
    this.top = h('div', { class: 'route-top' },
        h('div', { class: 'route-name', 'data-testid': 'route-name' }, h('strong', {}, this.route.name), range ? h('span', {}, ` Lv ${range[0]}–${range[1]}`) : null,
          g.player.champion ? h('span', { class: 'champ-pill' }, 'Champion') : null),
        tabs);
    this.sheet = h('div', { class: 'sheet route-ui' },
        h('p', { class: 'hint' }, this.hint(lead ? lead.nickname ?? g.dex().species.get(lead.species)!.name : '')),
        spotButtons,
        h('div', { class: 'route-actions' },
          h('button', { class: 'btn btn-menu', 'data-testid': 'btn-menu', onclick: () => openGameMenu(g) }, 'Menu'),
          h('button', { class: 'btn btn-kin', 'data-testid': 'btn-party', onclick: () => void g.goto('party', { from: 'route', route: this.route.id }) }, 'Party'),
          h('button', { class: 'btn btn-rest', 'data-testid': 'btn-rest', onclick: () => this.rest() }, 'Rest'),
        ),
        nextLocked && nextNeed.length ? h('div', { class: 'route-next', 'data-testid': 'route-next' }, h('span', { class: 'tab-lock' }), `${nextLocked.name}: beat ${nextNeed.join(' & ')} to open`) : null,
        this.status,
      );
    this.ui.append(this.top, this.sheet);
    this.resize(g.renderer.width, g.renderer.height);
    this.ui.querySelectorAll('.tab-lock').forEach((el) => { el.innerHTML = LOCK_SVG; });
    focusFirst(spotButtons);
  }

  private hint(lead: string): string {
    const next = this.route.hotspots.find((s) => s.kind === 'trainer' && s.trainer && !isTrainerDefeated(this.game.player, s.trainer));
    if (this.route.theme === 'summit') return this.game.player.champion ? 'The crown wind blows for you, Champion.' : 'The Champion awaits atop the plateau.';
    if (next?.trainer) return `${lead ? `${lead} is` : 'You are'} ready. ${getTrainer(next.trainer).name} is waiting for a challenger!`;
    return lead ? `Where should you and ${lead} look for kin?` : 'Explore!';
  }

  private spotButton(s: HotspotData): HTMLElement {
    const p = this.game.player;
    let meta: string;
    let cls = '';
    let label = s.label;
    if (s.kind === 'trainer' && s.trainer) {
      const t = getTrainer(s.trainer);
      const beaten = isTrainerDefeated(p, t.id);
      cls = beaten ? 'beaten' : 'challenge';
      // Short name on the button, the trainer's title in the subtitle.
      label = t.name;
      meta = beaten ? (t.id === CHAMPION_ID ? 'Hall of Fame' : 'Defeated ✓') : `${t.title} · ${t.party.length} kin`;
    } else {
      const lo = Math.min(...s.table.map((e) => e.min));
      const hi = Math.max(...s.table.map((e) => e.max));
      meta = `Wild · Lv ${lo}–${hi}`;
    }
    return h('button', { class: `btn btn-spot spot-${s.kind} ${cls}`, 'data-testid': `spot-${s.id}`, title: s.label, onclick: () => void this.explore(s.id) },
      h('span', { class: `icon icon-${s.kind}`, 'aria-hidden': 'true' }),
      h('span', { class: 'spot-text' }, h('span', { class: 'mname' }, label), h('span', { class: 'mmeta' }, meta)));
  }

  private renderStatus() {
    const p = this.game.player;
    const fainted = p.party.filter((c) => c.hp <= 0).length;
    this.status.textContent = `Party ${p.party.length}/6${fainted ? ` (${fainted} fainted)` : ''} · ${p.money} coins · Bestiary ${p.caught.length} caught / ${p.seen.length} seen`;
  }

  private rest() {
    audio.sfx('heal');
    this.game.player = healParty(this.game.player);
    void this.game.save();
    this.status.textContent = 'Your kin drink from the spring and feel refreshed!';
  }

  private async explore(id: string) {
    if (this.busy) return;
    const spot = this.route.hotspots.find((s) => s.id === id);
    if (!spot) return;
    const g = this.game;
    if (spot.kind === 'trainer' && spot.trainer && isTrainerDefeated(g.player, spot.trainer)) {
      const t = getTrainer(spot.trainer);
      audio.sfx('select');
      if (t.id === CHAMPION_ID) { void g.goto('victory', { route: this.route.id }); return; }
      this.status.textContent = `${t.name}: “${t.defeat}”`;
      return;
    }
    if (!g.player.party.some((c) => c.hp > 0)) {
      audio.sfx('denied');
      this.status.textContent = 'Your kin are too tired to explore. Rest at the spring first!';
      return;
    }
    this.busy = true;
    audio.sfx('select');
    const grp = this.hotspots.get(id);
    if (grp) {
      await tween(600, (k) => {
        grp.rotation.z = Math.sin(k * Math.PI * 6) * 0.06 * (1 - k);
        grp.scale.y = 1 + Math.sin(k * Math.PI * 4) * 0.08;
      });
    }
    await g.goto('battle', { route: this.route.id, hotspot: id });
  }

  override resize(w: number, hgt: number) {
    super.resize(w, hgt);
    if (!this.sheet) return;
    // Fit the whole island (tallest props included) between the header and the sheet, or
    // left of the sheet on a landscape phone.
    const land = layoutMode(w, hgt) === 'land';
    const area = freeArea(w, hgt, land ? { top: [this.top], right: [this.sheet] } : { top: [this.top], bottom: [this.sheet] }, 4);
    if (this.hd2d) {
      // The island top, its trees and a slice of the rock underneath.
      const target = new THREE.Vector3(0, 0.3, 0);
      const pts2 = corners(new THREE.Vector3(-5.1, -1.6, -5.0), new THREE.Vector3(5.1, 2.4, 5.2));
      fitPoints(this.camera, w, hgt, pts2, area, { dir: new THREE.Vector3(0, 0.66, 0.8), target, fill: 1 });
      this.hd2d.framed(target);
      return;
    }
    const pts = corners(new THREE.Vector3(-4.6, -0.5, -4.4), new THREE.Vector3(4.6, 2.55, 4.6));
    fitPoints(this.camera, w, hgt, pts, area, { dir: new THREE.Vector3(0, 0.62, 0.82), target: new THREE.Vector3(0, 0.6, 0), fill: 1 });
  }

  /** HD-2D render stats (debug hook), null on the default renderer. */
  perf() { return this.hd2d?.perf() ?? null; }

  /** Layout checks (debug hook): the player and the trainers on the map. */
  subjects() {
    const out = [{ name: 'you', obj: this.you }];
    for (const [id, grp] of this.hotspots) out.push({ name: id, obj: grp });
    return out;
  }

  override exit() {
    this.hd2d?.dispose();
    this.hd2d = null;
    this.sky?.dispose();
    super.exit();
  }

  override update(_dt: number, t: number) {
    this.hd2d?.update(t);
    this.ambientUpdate?.(t);
    this.markers.forEach((m, i) => {
      m.position.y = (m.userData.baseY as number) + Math.sin(t * 3 + i) * 0.12;
      m.rotation.y = t * 1.5;
    });
    this.badges.forEach((b, i) => {
      b.quaternion.copy(this.camera.quaternion);
      b.position.y = 1.6 + Math.abs(Math.sin(t * 3.4 + i)) * 0.1 + (this.route.theme === 'summit' ? 0.2 : 0);
    });
  }
}
