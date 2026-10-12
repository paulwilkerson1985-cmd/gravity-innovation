import * as THREE from 'three';
import { BaseScene } from './base';
import { GEO, MeshBuilder, flatMaterial } from '../render/builder';
import { PALETTES, addLights, cloud, flowers, grassTuft, island, makeSky, rock, roundTree, staticMesh, tree } from '../render/diorama';
import { arrowNav, focusFirst, h } from '../ui/dom';
import { tween } from '../render/anim';
import { ambient } from '../render/movefx';
import { Rng } from '../engine/rng';
import { healParty, isRouteUnlocked } from '../game/state';
import type { HotspotData, RouteData } from '../engine/types';

const SPOTS: [number, number][] = [[-2.3, 0.7], [2.1, 1.1], [0.4, -2.3], [-1.6, -1.8]];

function hotspotMesh(spot: HotspotData, theme: RouteData['theme'], seed: number): THREE.Mesh {
  const pal = PALETTES[theme];
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  if (spot.kind === 'grass') {
    b.add(GEO.disc, pal.ground2, { p: [0, 0.01, 0], s: [1.15, 0.04, 1.0] });
    const greens = theme === 'ridge' ? ['#b5a24a', '#9a8a3a', '#cdb85a'] : ['#3fae3a', '#58c94a', '#2f9e3a'];
    grassTuft(b, 0, 0, 0.75, greens, rng, 34, 0.9);
    if (spot.id.includes('flower')) flowers(b, 0, 0, 14, pal.flower, rng, 0.9);
  } else if (spot.kind === 'cave') {
    for (let i = 0; i < 6; i++) rock(b, (rng.next() - 0.5) * 1.6, -0.3 - rng.next() * 0.6, 1.6 + rng.next() * 1.4, pal.rock, rng);
    b.add(GEO.rock, pal.rock, { p: [0, 0.75, -0.3], s: [1.15, 0.95, 0.85] }, 0.2);
    b.add(GEO.ball, '#1a1420', { p: [0, 0.42, 0.42], s: [0.42, 0.4, 0.12] });
  } else if (spot.kind === 'water') {
    b.add(GEO.disc, '#3d9bff', { p: [0, 0.02, 0], s: [1.2, 0.04, 1.0] });
    for (let i = 0; i < 4; i++) b.add(GEO.disc, '#bfe6ff', { p: [(rng.next() - 0.5) * 1.2, 0.05, (rng.next() - 0.5) * 1.0], s: [0.25, 0.01, 0.08] });
  }
  return new THREE.Mesh(b.build(), flatMaterial());
}

function trainerFigure(): THREE.Mesh {
  const b = new MeshBuilder();
  b.add(GEO.cyl, '#2b3a67', { p: [-0.08, 0.18, 0], s: [0.07, 0.36, 0.07] });
  b.add(GEO.cyl, '#2b3a67', { p: [0.08, 0.18, 0], s: [0.07, 0.36, 0.07] });
  b.add(GEO.ball, '#ff4d6d', { p: [0, 0.55, 0], s: [0.2, 0.24, 0.16] });
  b.add(GEO.ball, '#ffd9b3', { p: [0, 0.88, 0], s: 0.15 });
  b.add(GEO.ball, '#ffffff', { p: [0, 0.98, 0], s: [0.16, 0.08, 0.16] });
  b.add(GEO.box, '#ff4d6d', { p: [0, 0.97, 0.12], s: [0.18, 0.03, 0.14] });
  b.add(GEO.box, '#ffd23f', { p: [0, 0.6, -0.15], s: [0.22, 0.26, 0.1] });
  return new THREE.Mesh(b.build(), flatMaterial());
}

export class RouteScene extends BaseScene {
  readonly name = 'route' as const;
  private route!: RouteData;
  private hotspots = new Map<string, THREE.Object3D>();
  private markers: THREE.Object3D[] = [];
  private busy = false;
  private status!: HTMLElement;

  enter(params: Record<string, unknown>) {
    const g = this.game;
    if (g.player.party.length === 0) g.debugParty();
    const id = String(params.route ?? 'meadow');
    this.route = g.dex().routes.get(id) ?? g.dex().routes.get('meadow')!;
    const theme = this.route.theme;
    const pal = PALETTES[theme];
    this.scene.add(makeSky(theme));
    addLights(this.scene, theme);

    const rng = new Rng(id.length * 977);
    const b = new MeshBuilder();
    island(b, 4.6, theme);
    for (let i = 0; i < 14; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 3.6 + rng.next() * 0.8;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (z > 2.2) continue; // keep the front clear
      if (theme === 'ridge' && rng.chance(0.6)) rock(b, x, z, 1.5 + rng.next(), pal.rock, rng);
      else if (rng.chance(0.5)) tree(b, x, z, 0.8 + rng.next() * 0.5, rng.pick(pal.leaf), rng);
      else roundTree(b, x, z, 0.7 + rng.next() * 0.4, rng.pick(pal.leaf));
    }
    for (let i = 0; i < 6; i++) flowers(b, (rng.next() - 0.5) * 6, (rng.next() - 0.5) * 5, 3, pal.flower, rng, 0.3);
    b.add(GEO.disc, pal.dirt, { p: [0, 0.005, 1.6], s: [0.5, 0.02, 2.4] });
    for (let i = 0; i < 4; i++) cloud(b, (rng.next() - 0.5) * 30, 6 + rng.next() * 3, -14 - rng.next() * 6, 1 + rng.next());
    this.scene.add(staticMesh(b));

    const marker = new THREE.OctahedronGeometry(0.14, 0);
    const markerMat = new THREE.MeshLambertMaterial({ color: '#ffe14d', emissive: '#7a5a00', flatShading: true });
    this.route.hotspots.forEach((spot, i) => {
      const [x, z] = SPOTS[i % SPOTS.length]!;
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      grp.add(hotspotMesh(spot, theme, i * 31 + 7));
      grp.userData.pick = { hotspot: spot.id };
      const m = new THREE.Mesh(marker, markerMat);
      m.position.set(0, 1.6, 0);
      m.scale.set(1, 1.5, 1);
      grp.add(m);
      this.markers.push(m);
      this.scene.add(grp);
      this.hotspots.set(spot.id, grp);
    });
    const amb = ambient(theme);
    this.scene.add(amb.points);
    this.ambientUpdate = amb.update;
    const you = trainerFigure();
    you.position.set(0, 0, 0.9);
    this.scene.add(you);
    this.onPick((o) => void this.explore((o.userData.pick as { hotspot: string }).hotspot));

    // ---- UI
    const lead = g.player.party[0];
    this.status = h('div', { class: 'route-status', 'data-testid': 'route-status' });
    this.renderStatus();
    const spotButtons = h('div', { class: 'spot-buttons' }, ...this.route.hotspots.map((s) =>
      h('button', { class: 'btn btn-spot', 'data-testid': `spot-${s.id}`, onclick: () => void this.explore(s.id) },
        h('span', { class: `icon icon-${s.kind}`, 'aria-hidden': 'true' }), h('span', { class: 'mname' }, s.label))));
    arrowNav(spotButtons);
    const routes = [...g.dex().routes.values()];
    this.ui.append(
      h('div', { class: 'route-top' },
        h('div', { class: 'route-name' }, h('strong', {}, this.route.name), h('span', {}, ` Lv ${this.route.levelRange[0]}–${this.route.levelRange[1]}`)),
        h('div', { class: 'route-tabs' }, ...routes.map((r) => {
          const open = isRouteUnlocked(g.player, r.id);
          return h('button', { class: `tab ${r.id === this.route.id ? 'on' : ''}`, disabled: !open, title: open ? r.name : 'Locked', onclick: () => void g.goto('route', { route: r.id }) }, open ? r.name : 'Locked');
        }))),
      h('div', { class: 'sheet route-ui' },
        h('p', { class: 'hint' }, lead ? `Where should you and ${lead.nickname ?? g.dex().species.get(lead.species)!.name} look for kin?` : 'Explore!'),
        spotButtons,
        h('div', { class: 'route-actions' },
          h('button', { class: 'btn btn-kin', 'data-testid': 'btn-party', onclick: () => void g.goto('party', { from: 'route', route: this.route.id }) }, 'Party'),
          h('button', { class: 'btn btn-rest', 'data-testid': 'btn-rest', onclick: () => this.rest() }, 'Rest at spring'),
        ),
        this.status,
      ),
    );
    focusFirst(spotButtons);
  }

  private renderStatus() {
    const p = this.game.player;
    this.status.textContent = `Party ${p.party.length}/6 · Bestiary ${p.caught.length} caught / ${p.seen.length} seen · Orbs ${p.bag.orb}/${p.bag.bright}/${p.bag.star}`;
  }

  private rest() {
    this.game.player = healParty(this.game.player);
    this.status.textContent = 'Your kin drink from the spring and feel refreshed!';
  }

  private async explore(id: string) {
    if (this.busy) return;
    this.busy = true;
    const grp = this.hotspots.get(id);
    if (grp) {
      await tween(600, (k) => {
        grp.rotation.z = Math.sin(k * Math.PI * 6) * 0.06 * (1 - k);
        grp.scale.y = 1 + Math.sin(k * Math.PI * 4) * 0.08;
      });
    }
    await this.game.goto('battle', { route: this.route.id, hotspot: id });
  }

  override resize(w: number, hgt: number) {
    super.resize(w, hgt);
    const aspect = w / hgt;
    const dist = Math.max(10, (aspect < 1 ? 4.7 : 5.6) / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * aspect));
    this.camera.position.set(0, dist * 0.62, dist * 0.82);
    this.camera.lookAt(0, 0, 0);
    this.camera.setViewOffset(w, hgt, 0, hgt * (aspect < 1 ? 0.1 : 0.12), w, hgt);
    this.camera.updateProjectionMatrix();
  }

  private ambientUpdate: ((t: number) => void) | null = null;

  override update(_dt: number, t: number) {
    this.ambientUpdate?.(t);
    this.markers.forEach((m, i) => {
      m.position.y = 1.6 + Math.sin(t * 3 + i) * 0.12;
      m.rotation.y = t * 1.5;
    });
  }
}
