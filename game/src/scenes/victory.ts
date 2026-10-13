// Hall of Fame: shown after beating the Champion (and from the plateau afterwards). The party
// stands on podiums under falling confetti, with stats, play time and a credits roll.
import * as THREE from 'three';
import { BaseScene } from './base';
import './adventure.css';
import { CreatureView } from '../render/creature';
import { addLights, makeSky } from '../render/diorama';
import { GEO, MeshBuilder, flatMaterial } from '../render/builder';
import { confetti, lightRays } from '../render/celebrate';
import { pillar, banner } from '../render/props';
import { PLAYER_LOOK, personMesh } from '../render/trainer';
import { wait } from '../render/anim';
import { arrowNav, focusFirst, h, typeChip } from '../ui/dom';
import { audio } from '../audio/audio';
import { species } from '../engine';
import { formatPlayTime } from '../game/state';
import { corners, fitPoints, freeArea, layoutMode } from './framing';
import { hd2dRequested } from '../render/hd2d/pipeline';
import { summitPodiums } from '../render/hd2d/arenas/summit';
import { heroFigure } from '../render/hd2d/characters';
import { Hd2dHallStage } from './hd2dHall';

const CREDITS = [
  'ORBKIN', '',
  'A low-poly creature adventure', '',
  'Game design & code', 'Claude', '',
  'Procedural kin, scenery & music', 'Generated in code — no assets', '',
  'Built with', 'Three.js · TypeScript · Vite', '',
  'Special thanks', 'Pim · Brann · Sola · Merrow · Tavi', 'and Champion Vale', '',
  'Thank you for playing!',
];

export class VictoryScene extends BaseScene {
  readonly name = 'victory' as const;
  private views: CreatureView[] = [];
  private conf!: ReturnType<typeof confetti>;
  private rays!: ReturnType<typeof lightRays>;
  private routeId = 'plateau';
  private you!: THREE.Object3D;
  private top!: HTMLElement;
  private sheet!: HTMLElement;
  /** World x extent of the line-up (podiums + you), for framing. */
  private span: [number, number] = [-2, 2];
  /** Tall screens: two rows of podiums instead of one long line. */
  private narrow = innerWidth / innerHeight < 0.8;
  /** HD-2D staging (`?gfx=hd2d`): the champion hall, else null. */
  private hd2d: Hd2dHallStage | null = null;

  enter(params: Record<string, unknown>) {
    const g = this.game;
    if (g.player.party.length === 0) g.debugParty();
    this.routeId = String(params.route ?? 'plateau');
    if (hd2dRequested()) this.hd2d = new Hd2dHallStage(g, this.scene, this.camera);
    else {
      this.scene.add(makeSky('summit'));
      addLights(this.scene, 'summit');
      this.scene.fog = new THREE.Fog('#c7d4ff', 16, 40);
    }

    // Stage: a round dais, one podium per kin (tallest in the middle), pillars and banners.
    const party = g.player.party.slice(0, 6);
    const n = party.length;
    const b = new MeshBuilder();
    b.add(GEO.disc, '#e6ecf7', { p: [0, -0.1, 0], s: [7, 0.2, 4.2] }, 0.05);
    b.add(GEO.disc, '#b4c0d4', { p: [0, -0.3, 0], s: [7.3, 0.2, 4.5] });
    b.add(GEO.disc, '#8e95ab', { p: [0, -0.2, -40], s: [60, 0.2, 40] });
    for (let i = 0; i < 6; i++) {
      const x = -24 + i * 9.5;
      const hgt = 9 + ((i * 7) % 5) * 1.6;
      b.add(GEO.cone5, '#6b7394', { p: [x, hgt / 2 - 1, -22 - (i % 2) * 5], r: [0, i, 0], s: [6, hgt, 6] }, 0.2);
      b.add(GEO.cone5, '#ffffff', { p: [x, hgt - 1 - hgt * 0.17, -22 - (i % 2) * 5], r: [0, i, 0], s: [2.1, hgt * 0.34, 2.1] }, 0.1);
    }
    const order = this.podiumOrder(n);
    const heights = [0.95, 0.75, 0.75, 0.55, 0.55, 0.4];
    const cols = ['#ffd23f', '#d9e2f2', '#d9e2f2', '#e9a86a', '#e9a86a', '#c7b8ff'];
    for (let i = 0; i < n; i++) {
      const rank = order.indexOf(i);
      const { x, z } = this.slot(i, n);
      const hgt = (heights[rank] ?? 0.4) + this.backLift(rank);
      b.add(GEO.cyl, cols[rank] ?? '#c7b8ff', { p: [x, hgt / 2, z], s: [0.62, hgt, 0.62] }, 0.06);
      b.add(GEO.cyl, '#ffffff', { p: [x, hgt + 0.02, z], s: [0.66, 0.05, 0.66] });
    }
    for (const x of [-5.6, 5.6]) pillar(b, x, -1.6, 3.2);
    banner(b, -4.4, -2.6, '#5b3fbf');
    banner(b, 3.9, -2.6, '#ff5d73');
    const built = b.build();
    this.rays = lightRays(18, 16, '#fff6cc');
    if (this.hd2d) {
      // HD-2D: the champion hall is the stage; marble/gold podiums stand in the moonbeam on the crest.
      built.dispose();
      this.rays.mesh.geometry.dispose();
      this.rays.mat.dispose();
      this.scene.add(summitPodiums(party.map((_, i) => {
        const rank = order.indexOf(i);
        const { x, z } = this.slot(i, n);
        return { x, z, h: (heights[rank] ?? 0.4) + this.backLift(rank), rank };
      })));
    } else {
      this.scene.add(new THREE.Mesh(built, flatMaterial()));
      this.rays.mesh.position.set(0, 2.2, -5);
      this.rays.mat.opacity = 0.07;
      this.scene.add(this.rays.mesh);
    }

    party.forEach((c, i) => {
      const rank = order.indexOf(i);
      const { x, z } = this.slot(i, n);
      const v = new CreatureView(species(c.species).look, i);
      v.root.position.set(x, (heights[rank] ?? 0.4) + this.backLift(rank) + 0.05, z);
      v.root.rotation.y = -x * 0.08;
      this.scene.add(v.root);
      this.views.push(v);
      this.hd2d?.addKin(v);
      void v.appear();
    });
    // You stand at the open end of the line-up (never in front of a podium), facing your team.
    const xs = party.map((_, i) => this.slot(i, n).x);
    const right = Math.max(0, ...xs);
    let you: THREE.Object3D;
    if (this.hd2d) {
      const fig = heroFigure();
      fig.mesh.scale.setScalar(1.45);
      this.hd2d.addFigure(fig);
      you = fig.mesh;
    } else {
      you = personMesh(PLAYER_LOOK);
      you.scale.setScalar(1.25);
    }
    if (this.hd2d && this.narrow) you.position.set(1.85, 0, 0.75);
    else if (this.hd2d) you.position.set(3.85, 0, -1.7);
    else if (this.narrow) you.position.set(2.95, 0, -1.45);
    else you.position.set(right + 1.55, 0, 0.35);
    you.rotation.y = -0.6;
    this.scene.add(you);
    this.you = you;
    this.span = this.hd2d && this.narrow ? [Math.min(...xs) - 0.8, Math.max(2.4, ...xs) + 0.7] : this.hd2d ? [Math.min(-2, ...xs) - 0.85, 4.45] : this.narrow ? [Math.min(-2, ...xs) - 1.0, 3.6] : [Math.min(0, ...xs) - 1.1, right + 2.1];

    this.conf = confetti(170, 16, 9, 7);
    this.scene.add(this.conf.mesh);

    // ---- UI
    const p = g.player;
    const credits = h('div', { class: 'credits-roll' }, h('div', { class: 'credits-inner' }, ...CREDITS.map((l) => h('div', { class: l === 'ORBKIN' ? 'credits-logo' : '' }, l || ' '))));
    const team = h('div', { class: 'hof-team' }, ...party.map((c) => {
      const s = species(c.species);
      return h('div', { class: 'hof-kin' }, h('span', { class: 'mname' }, c.nickname ?? s.name), h('span', { class: 'plevel' }, `Lv${c.level}`), h('span', { class: 'chips' }, ...s.types.map(typeChip)));
    }));
    const buttons = h('div', { class: 'hof-buttons' },
      h('button', { class: 'btn btn-fight', 'data-testid': 'btn-hof-continue', onclick: () => void g.goto('route', { route: this.routeId }) }, 'Continue adventure'),
      h('button', { class: 'btn btn-back', 'data-testid': 'btn-hof-title', onclick: () => void g.goto('title') }, 'Title screen'));
    arrowNav(buttons);
    this.top = h('div', { class: 'hof-top' },
      h('div', { class: 'hof-title', 'data-testid': 'hof-title' }, 'Hall of Fame'),
      h('div', { class: 'hof-sub' }, `${p.name === 'You' ? 'You are' : `${p.name} is`} the Champion of Crown Plateau!`));
    this.sheet = h('div', { class: 'sheet hof-sheet' },
        team,
        h('div', { class: 'hof-stats' },
          h('span', {}, h('b', {}, formatPlayTime(p.playTime)), ' played'),
          h('span', {}, h('b', {}, String(p.caught.length)), ' kin caught'),
          h('span', {}, h('b', {}, String(p.seen.length)), ' seen'),
          h('span', {}, h('b', {}, String(p.defeatedTrainers.length)), ' trainers beaten')),
        credits,
        buttons);
    this.ui.append(this.top, this.sheet);
    focusFirst(buttons);
    audio.music('victory');
    void wait(9000).then(() => { if (this.game.current === this) audio.music('title'); });
    this.game.idle = true;
    this.resize(g.renderer.width, g.renderer.height);
  }

  /** Party indices sorted by rank: highest level stands on the tallest (centre) podium. */
  private podiumOrder(n: number): number[] {
    const party = this.game.player.party;
    return [...Array(n).keys()].sort((a, b) => party[b]!.level - party[a]!.level || a - b);
  }

  /** Extra podium height of the back row (two-row line-ups), so the back kin stand clear above the front ones. */
  private backLift(rank: number): number {
    if (this.hd2d && this.narrow) return rank === 0 ? 0 : rank < 3 ? 0.45 : rank < 5 ? 1.15 : 1.75;
    if (rank < 3) return 0;
    return this.hd2d ? 0.95 : this.narrow ? 0.55 : 0;
  }

  /** Podium positions: centre first, then alternating outwards. */
  private slot(i: number, n: number): { x: number; z: number } {
    const rank = this.podiumOrder(n).indexOf(i);
    if (this.hd2d && this.narrow) {
      // HD-2D portrait: a three-tier pyramid (1 · 2 · 3), each tier further back and higher (the
      // one right behind the champion highest of all), so the line-up is narrow (the camera comes
      // close) and no statue covers another.
      const tiers: [number, number][] = [[0, 0.35], [-1.25, -1.35], [1.25, -1.35], [-2.3, -2.9], [2.3, -2.9], [0, -3.3]];
      const [x, z] = tiers[rank] ?? [0, 0];
      return { x, z };
    }
    if (this.hd2d) {
      // HD-2D (every layout): a compact two-row line-up on the crest, so the camera can come
      // close. Front: champion centre, two either side; back: staggered between them and raised.
      const front: [number, number][] = [[0, 0.25], [-2.1, 0], [2.1, 0]];
      const back: [number, number][] = [[-1.05, -2.2], [1.05, -2.2], [-3.15, -2.2]];
      const [x, z] = (rank < 3 ? front[rank] : back[rank - 3]) ?? [0, 0];
      return { x, z };
    }
    if (this.narrow) {
      // Front row: ranks 0-2 (centre, left, right); back row: ranks 3-5 between and beside them.
      const front: [number, number][] = [[0, 0.1], [-1.9, 0], [1.9, 0]];
      const back: [number, number][] = [[-0.95, -1.7], [0.95, -1.7], [-2.85, -1.7]];
      const [x, z] = (rank < 3 ? front[rank] : back[rank - 3]) ?? [0, 0];
      return { x, z };
    }
    const side = rank === 0 ? 0 : rank % 2 ? -1 : 1;
    const step = Math.ceil(rank / 2);
    // Two metres apart (big kin no longer overlap), each pair a step further back.
    return { x: side * step * 2.0, z: -0.4 - step * 0.45 };
  }

  override resize(w: number, hgt: number) {
    super.resize(w, hgt);
    if (!this.sheet) return;
    // The line-up stands in the band between the title and the sheet (left of the sheet on a
    // landscape phone and on wide screens, where the sheet is a side column).
    const side = layoutMode(w, hgt) !== 'portrait';
    const area = freeArea(w, hgt, side ? { top: [this.top], right: [this.sheet] } : { top: [this.top], bottom: [this.sheet] }, 6);
    const [sx0, sx1] = this.span;
    // HD-2D: framed on the two-row line-up itself (podium bases to the back kin's heads).
    const pts = this.hd2d
      ? (this.narrow ? corners(new THREE.Vector3(sx0, 0.3, -3.4), new THREE.Vector3(sx1, 3.4, 1.1)) : corners(new THREE.Vector3(sx0, 0.3, -2.7), new THREE.Vector3(sx1, 3.3, 0.7)))
      : corners(new THREE.Vector3(sx0, 0, this.narrow ? -2.6 : -2.0), new THREE.Vector3(sx1, this.narrow ? 3.1 : 2.5, 0.9));
    this.camera.clearViewOffset();
    const dir = this.hd2d ? new THREE.Vector3(0, 0.4, 1) : new THREE.Vector3(0, 0.22, 1);
    const dist = fitPoints(this.camera, w, hgt, pts, area, { dir, target: new THREE.Vector3((sx0 + sx1) / 2, 1.3, -0.9), fill: 0.98 });
    if (this.hd2d) { this.hd2d.afterFrame(dist); return; }
    if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = dist + 6; this.scene.fog.far = dist + 40; }
  }

  /** HD-2D pipeline stats (debug hook), or null on the default renderer. */
  perf() { return this.hd2d?.perf() ?? null; }

  override exit() {
    this.hd2d?.dispose();
    super.exit();
  }

  /** Layout checks (debug hook). */
  subjects() {
    return [...this.views.map((v, i) => ({ name: `kin${i}`, obj: v.inner })), { name: 'you', obj: this.you }];
  }

  override update(_dt: number, t: number) {
    this.conf.update(t);
    this.rays.mesh.rotation.z = t * 0.12;
    this.hd2d?.update(t);
    this.views.forEach((v) => v.update(t));
  }
}
