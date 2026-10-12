import * as THREE from 'three';
import { BaseScene } from './base';
import { CreatureView } from '../render/creature';
import { addLights, backdrop, makeSky } from '../render/diorama';
import { battlePad } from './battleStage';
import { corners, fitPoints, freeArea, layoutMode } from './framing';
import { arrowNav, focusFirst, h, typeChip } from '../ui/dom';
import { calcStats, species } from '../engine';
import { STARTERS } from '../data/species';
import { chooseStarter } from '../game/state';
import { ease, tween } from '../render/anim';

export class StarterScene extends BaseScene {
  readonly name = 'starter' as const;
  private views: CreatureView[] = [];
  private selected = -1;
  private info!: HTMLElement;
  private cards: HTMLButtonElement[] = [];
  private pads: THREE.Object3D[] = [];
  private spot!: THREE.Group;
  private sheet!: HTMLElement;
  private narrow = innerWidth / innerHeight < 0.8;

  enter() {
    this.scene.add(makeSky('meadow'));
    addLights(this.scene, 'meadow');
    this.scene.fog = new THREE.Fog('#d9f6ff', 16, 40);
    this.scene.add(backdrop('meadow', 5));
    STARTERS.forEach((id, i) => {
      const v = new CreatureView(species(id).look, i);
      const p = battlePad(['#ff9a6a', '#7cc4ff', '#8fdc6a'][i] ?? '#f2e6c8', 0.85);
      v.root.userData.pick = { index: i };
      p.userData.pick = { index: i };
      this.scene.add(p, v.root);
      this.views.push(v);
      this.pads.push(p);
      this.placeAt(i, this.slot(i, -1), 1);
    });
    // Spotlight for the chosen one: a glowing ring on its pad and a soft beam from above.
    this.spot = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.07, 6, 32), new THREE.MeshBasicMaterial({ color: '#ffe14d' }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.04;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.05, 4.2, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.position.y = 2.1;
    this.spot.add(ring, beam);
    this.spot.visible = false;
    this.scene.add(this.spot);
    this.onPick((o) => this.select((o.userData.pick as { index: number }).index));

    this.info = h('div', { class: 'starter-info', 'data-testid': 'starter-info' }, 'Tap a kin to meet it.');
    const row = h('div', { class: 'starter-cards' }, ...STARTERS.map((id, i) => {
      const s = species(id);
      const b = h('button', { class: 'btn card', 'data-testid': `starter-${id}`, onclick: () => this.select(i) },
        h('span', { class: 'mname' }, s.name), h('span', { class: 'chips' }, ...s.types.map(typeChip)));
      this.cards.push(b);
      return b;
    }));
    arrowNav(row);
    this.sheet = h('div', { class: 'sheet starter-ui' },
      h('h2', {}, 'Choose your first kin'),
      row,
      this.info,
    );
    this.ui.append(this.sheet);
    focusFirst(row);
    this.resize(this.game.renderer.width, this.game.renderer.height);
  }

  private select(i: number) {
    if (this.selected === i) return;
    this.selected = i;
    const id = STARTERS[i]!;
    const s = species(id);
    const st = calcStats(id, 5);
    this.cards.forEach((c, j) => { c.classList.toggle('selected', j === i); c.setAttribute('aria-pressed', String(j === i)); });
    this.info.replaceChildren(
      h('p', { class: 'blurb' }, s.blurb),
      h('p', { class: 'stats' }, `HP ${st.hp} · Atk ${st.atk} · Def ${st.def} · Spe ${st.spe}`),
      h('button', { class: 'btn btn-big', 'data-testid': 'btn-confirm-starter', onclick: () => this.confirm() }, `Choose ${s.name}!`),
    );
    // The chosen kin steps forward into the spotlight (and hops); the others step back.
    const from = this.views.map((v) => v.root.position.clone());
    const to = this.views.map((_, j) => this.slot(j, i));
    const s0 = this.views.map((v) => v.root.scale.x);
    void tween(380, (k) => {
      const e = ease.outCubic(k);
      this.views.forEach((_, j) => {
        const p = from[j]!.clone().lerp(to[j]!, e);
        if (j === i) p.y += Math.sin(k * Math.PI) * 0.55;
        this.placeAt(j, p, s0[j]! + ((j === i ? 1.25 : 0.9) - s0[j]!) * e);
      });
    });
    this.spot.visible = true;
    this.spot.position.set(to[i]!.x, 0, to[i]!.z);
    this.resize(this.game.renderer.width, this.game.renderer.height);
  }

  /** Where kin j stands when `sel` is chosen (-1: none yet, a straight line-up). */
  private slot(j: number, sel: number): THREE.Vector3 {
    // Narrow screens use a tighter, staggered line-up so each kin stays big enough to read.
    const k = this.narrow ? 0.66 : 1;
    if (sel < 0) return new THREE.Vector3((j - 1) * 2.2 * k, 0, this.narrow && j === 1 ? -0.7 : 0);
    if (j === sel) return new THREE.Vector3((j - 1) * 1.0 * k, 0, 1.05);
    return new THREE.Vector3((j - 1) * 2.35 * k, 0, -0.55 - (this.narrow ? 0.5 : 0));
  }

  private placeAt(j: number, p: THREE.Vector3, scale: number) {
    const v = this.views[j]!;
    v.root.position.copy(p);
    v.root.scale.setScalar(scale);
    this.pads[j]!.position.set(p.x, Math.min(p.y, 0), p.z);
    this.pads[j]!.scale.setScalar(scale);
  }

  /** Layout checks (debug hook). */
  subjects() {
    return this.views.map((v, i) => ({ name: STARTERS[i]!, obj: v.inner }));
  }

  private confirm() {
    const id = STARTERS[this.selected];
    if (!id) return;
    this.game.player = chooseStarter(this.game.player, id);
    void this.game.goto('route', { route: 'meadow' });
  }

  override resize(w: number, hgt: number) {
    super.resize(w, hgt);
    if (!this.sheet) return;
    const narrow = w / hgt < 0.8;
    if (narrow !== this.narrow) {
      this.narrow = narrow;
      this.views.forEach((v, j) => this.placeAt(j, this.slot(j, this.selected), v.root.scale.x));
      if (this.selected >= 0) this.spot.position.copy(this.slot(this.selected, this.selected)).setY(0);
    }
    // Fit the line-up (in either arrangement) into the space the sheet leaves free.
    const land = layoutMode(w, hgt) === 'land';
    const area = freeArea(w, hgt, land ? { right: [this.sheet] } : { bottom: [this.sheet] }, 10);
    const hw = narrow ? 1.85 : 3.3;
    const pts = corners(new THREE.Vector3(-hw, -0.1, -1.6), new THREE.Vector3(hw, 1.75, 2.1));
    fitPoints(this.camera, w, hgt, pts, area, { dir: new THREE.Vector3(0, 0.42, 1), target: new THREE.Vector3(0, 0.6, 0.2), fill: 0.97 });
  }

  override update(_dt: number, t: number) {
    this.views.forEach((v, i) => {
      v.update(t);
      v.root.rotation.y = i === this.selected ? Math.sin(t * 1.5) * 0.5 : 0;
      if (this.selected >= 0 && i !== this.selected) v.material.color.setScalar(0.72);
      else v.material.color.setScalar(1);
    });
  }
}
