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

  enter(params: Record<string, unknown>) {
    const g = this.game;
    if (g.player.party.length === 0) g.debugParty();
    this.routeId = String(params.route ?? 'plateau');
    this.scene.add(makeSky('summit'));
    addLights(this.scene, 'summit');
    this.scene.fog = new THREE.Fog('#c7d4ff', 16, 40);

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
      const hgt = heights[rank] ?? 0.4;
      b.add(GEO.cyl, cols[rank] ?? '#c7b8ff', { p: [x, hgt / 2, z], s: [0.62, hgt, 0.62] }, 0.06);
      b.add(GEO.cyl, '#ffffff', { p: [x, hgt + 0.02, z], s: [0.66, 0.05, 0.66] });
    }
    for (const x of [-5.6, 5.6]) pillar(b, x, -1.6, 3.2);
    banner(b, -4.4, -2.6, '#5b3fbf');
    banner(b, 3.9, -2.6, '#ff5d73');
    this.scene.add(new THREE.Mesh(b.build(), flatMaterial()));

    this.rays = lightRays(18, 16, '#fff6cc');
    this.rays.mesh.position.set(0, 2.2, -5);
    this.rays.mat.opacity = 0.16;
    this.scene.add(this.rays.mesh);

    party.forEach((c, i) => {
      const rank = order.indexOf(i);
      const { x, z } = this.slot(i, n);
      const v = new CreatureView(species(c.species).look, i);
      v.root.position.set(x, (heights[rank] ?? 0.4) + 0.05, z);
      v.root.rotation.y = -x * 0.08;
      this.scene.add(v.root);
      this.views.push(v);
      void v.appear();
    });
    // You stand front-left of the line-up, waving the crowd in.
    const you = personMesh(PLAYER_LOOK);
    you.scale.setScalar(1.25);
    you.position.set(-3.9, 0, 1.5);
    you.rotation.y = 0.45;
    this.scene.add(you);

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
    this.ui.append(
      h('div', { class: 'hof-top' },
        h('div', { class: 'hof-title', 'data-testid': 'hof-title' }, 'Hall of Fame'),
        h('div', { class: 'hof-sub' }, `${p.name === 'You' ? 'You are' : `${p.name} is`} the Champion of Crown Plateau!`)),
      h('div', { class: 'sheet hof-sheet' },
        team,
        h('div', { class: 'hof-stats' },
          h('span', {}, h('b', {}, formatPlayTime(p.playTime)), ' played'),
          h('span', {}, h('b', {}, String(p.caught.length)), ' kin caught'),
          h('span', {}, h('b', {}, String(p.seen.length)), ' seen'),
          h('span', {}, h('b', {}, String(p.defeatedTrainers.length)), ' trainers beaten')),
        credits,
        buttons),
    );
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

  /** Podium positions: centre first, then alternating outwards. */
  private slot(i: number, n: number): { x: number; z: number } {
    const rank = this.podiumOrder(n).indexOf(i);
    const side = rank === 0 ? 0 : rank % 2 ? -1 : 1;
    const step = Math.ceil(rank / 2);
    return { x: side * step * 1.75, z: -0.4 - step * 0.35 };
  }

  override resize(w: number, hgt: number) {
    super.resize(w, hgt);
    const aspect = w / hgt;
    const halfW = aspect < 1 ? 5.4 : 8.4;
    const dist = Math.max(9, halfW / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * aspect));
    this.camera.position.set(0, 2.4 + dist * 0.16, dist);
    this.camera.lookAt(0, 1.2, 0);
    if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = dist + 6; this.scene.fog.far = dist + 40; }
    // Stage in the band between the title and the bottom sheet.
    this.camera.setViewOffset(w, hgt, 0, hgt * (aspect < 1 ? 0.2 : 0.13), w, hgt);
    this.camera.updateProjectionMatrix();
  }

  override update(_dt: number, t: number) {
    this.conf.update(t);
    this.rays.mesh.rotation.z = t * 0.12;
    this.views.forEach((v) => v.update(t));
  }
}
