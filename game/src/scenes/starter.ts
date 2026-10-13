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
import { hd2dRequested } from '../render/hd2d/pipeline';
import { DAIS_TOP, buildStarterSet, daisSpot, type StarterSet } from '../render/hd2d/screens/meadowScreens';
import { Hd2dScreenStage } from './hd2dScreen';

export class StarterScene extends BaseScene {
  readonly name = 'starter' as const;
  private views: CreatureView[] = [];
  private selected = -1;
  private info!: HTMLElement;
  private cards: HTMLButtonElement[] = [];
  private pads: THREE.Object3D[] = [];
  private spot!: THREE.Group;
  private sheet!: HTMLElement;
  private narrow = innerWidth / innerHeight < 1.2;
  /** HD-2D staging (`?gfx=hd2d`): the meadow clearing with stone daises, else null. */
  private hd2d: Hd2dScreenStage | null = null;
  private hd2dSet: StarterSet | null = null;

  enter() {
    const set = hd2dRequested() ? buildStarterSet : null;
    if (set) {
      this.hd2d = new Hd2dScreenStage(this.game, this.scene, this.camera, (q) => (this.hd2dSet = set(q)));
      this.pads = [...this.hd2dSet!.daises];
      this.spot = new THREE.Group(); // unused: the set lights the chosen dais (placeSpot)
    } else {
      this.scene.add(makeSky('meadow'));
      addLights(this.scene, 'meadow');
      this.scene.fog = new THREE.Fog('#d9f6ff', 16, 40);
      this.scene.add(backdrop('meadow', 5));
    }
    STARTERS.forEach((id, i) => {
      const v = new CreatureView(species(id).look, i);
      // HD-2D: the kin stand on lit stone daises (built by the set) as pixel sprites.
      const p = this.hd2d ? this.pads[i]! : battlePad(['#ff9a6a', '#7cc4ff', '#8fdc6a'][i] ?? '#f2e6c8', 0.85);
      v.root.userData.pick = { index: i };
      p.userData.pick = { index: i };
      if (this.hd2d) { this.scene.add(v.root); this.hd2d.addKin(v); } else { this.scene.add(p, v.root); this.pads.push(p); }
      this.views.push(v);
      this.placeAt(i, this.slot(i, -1), 1);
    });
    this.onPick((o) => this.select((o.userData.pick as { index: number }).index));
    if (!this.hd2d) this.addSpot();
    this.buildUi();
  }

  /** Spotlight for the chosen one: a glowing ring on its pad and a soft beam from above. */
  private addSpot() {
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
  }

  private buildUi() {
    this.info = h('div', { class: 'starter-info', 'data-testid': 'starter-info' }, 'Tap a kin to meet it.');
    const row = h('div', { class: 'starter-cards' }, ...STARTERS.map((id, i) => {
      const s = species(id);
      // Keyboard activation (click with detail 0) moves focus straight to "Choose X!".
      const b = h('button', { class: 'btn card', 'data-testid': `starter-${id}`, onclick: (e: Event) => this.select(i, (e as MouseEvent).detail === 0) },
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

  private select(i: number, focusConfirm = false) {
    const focus = () => { if (focusConfirm) this.info.querySelector<HTMLButtonElement>('[data-testid="btn-confirm-starter"]')?.focus(); };
    if (this.selected === i) return focus();
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
    const s0 = [...this.scales];
    void tween(380, (k) => {
      const e = ease.outCubic(k);
      this.views.forEach((_, j) => {
        const p = from[j]!.clone().lerp(to[j]!, e);
        if (j === i) p.y += Math.sin(k * Math.PI) * 0.55;
        // HD-2D: the kin stay on their daises; the chosen one hops and grows a little.
        const big = this.hd2d ? 1.12 : 1.25, small = this.hd2d ? 0.94 : 0.9;
        this.placeAt(j, p, s0[j]! + ((j === i ? big : small) - s0[j]!) * e);
      });
    });
    this.spot.visible = true;
    this.spot.position.set(to[i]!.x, 0, to[i]!.z);
    this.spot.scale.setScalar(this.narrow ? 0.85 : 1);
    this.hd2dSet?.placeSpot(daisSpot(i, this.narrow), this.narrow ? 0.85 : 1);
    this.resize(this.game.renderer.width, this.game.renderer.height);
    focus();
  }

  /** Where kin j stands when `sel` is chosen (-1: none yet, a straight line-up). */
  private slot(j: number, sel: number): THREE.Vector3 {
    if (this.hd2d) return daisSpot(j, this.narrow).setY(DAIS_TOP);
    // Narrow free areas (portrait phones, the landscape strip left of the sheet) use a
    // triangle: the middle kin steps back so the three stand close and read big.
    if (this.narrow) {
      if (sel < 0) return new THREE.Vector3((j - 1) * 0.95, 0, j === 1 ? -1.3 : 0.55);
      if (j === sel) return new THREE.Vector3((j - 1) * 0.35, 0, 1.05);
      return new THREE.Vector3((j - 1) * 1.05, 0, -1.05);
    }
    if (sel < 0) return new THREE.Vector3((j - 1) * 1.95, 0, 0);
    if (j === sel) return new THREE.Vector3((j - 1) * 0.9, 0, 1.05);
    return new THREE.Vector3((j - 1) * 2.15, 0, -0.55);
  }

  private scales = [1, 1, 1];

  /** Narrow screens show the kin bigger on slimmer pads (the line-up is width-bound there). */
  private placeAt(j: number, p: THREE.Vector3, scale: number) {
    const v = this.views[j]!;
    this.scales[j] = scale;
    v.root.position.copy(p);
    if (this.hd2d) {
      v.root.scale.setScalar(scale);
      this.pads[j]!.position.copy(daisSpot(j, this.narrow));
      return;
    }
    v.root.scale.setScalar(scale * (this.narrow ? 1.3 : 1));
    this.pads[j]!.position.set(p.x, Math.min(p.y, 0), p.z);
    this.pads[j]!.scale.setScalar(scale * (this.narrow ? 0.85 : 1));
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
    // Fit the line-up (in either arrangement) into the space the sheet leaves free.
    const land = layoutMode(w, hgt) === 'land';
    const area = freeArea(w, hgt, land ? { right: [this.sheet] } : { bottom: [this.sheet] }, 10);
    const narrow = area.w / area.h < 1.45;
    if (narrow !== this.narrow) {
      this.narrow = narrow;
      this.views.forEach((_, j) => this.placeAt(j, this.slot(j, this.selected), this.scales[j]!));
      if (this.selected >= 0) this.spot.position.copy(this.slot(this.selected, this.selected)).setY(0);
      this.spot.scale.setScalar(narrow ? 0.85 : 1);
      if (this.selected >= 0) this.hd2dSet?.placeSpot(daisSpot(this.selected, narrow), narrow ? 0.85 : 1);
    }
    if (this.hd2d) { this.frameHd2d(w, hgt, area, narrow, land); return; }
    // Boxes hug the pads of either arrangement (unselected pads at 0.9 scale, the chosen one forward).
    // A narrow area looks down more steeply, so the triangle's depth fills the height too.
    const pts = narrow
      ? corners(new THREE.Vector3(-1.85, -0.1, -2.2), new THREE.Vector3(1.85, 1.9, 2.1))
      : corners(new THREE.Vector3(-3.0, -0.1, -1.5), new THREE.Vector3(3.0, 1.8, 2.0));
    const dir = narrow ? new THREE.Vector3(0, land ? 0.55 : 0.8, 1) : new THREE.Vector3(0, 0.42, 1);
    fitPoints(this.camera, w, hgt, pts, area, { dir, target: new THREE.Vector3(0, 0.6, 0.0), fill: 0.98, alignY: narrow && !land ? 'bottom' : 'center' });
  }

  /** HD-2D framing: the three daises (and the kin on them) fill the free area, seen from ≈ 27–38°. */
  private frameHd2d(w: number, hgt: number, area: { x: number; y: number; w: number; h: number }, narrow: boolean, land: boolean) {
    // A wider box than the daises: the kin read at the battle sprites' texel size (2 px per
    // texel on a 720p desktop) inside more of the clearing.
    const pts = narrow
      ? corners(new THREE.Vector3(-2.3, -0.05, -2.2), new THREE.Vector3(2.3, 2.2, 1.6))
      : corners(new THREE.Vector3(-5.2, -0.05, -1.8), new THREE.Vector3(5.2, 2.2, 1.6));
    const dir = narrow ? new THREE.Vector3(0, land ? 0.55 : 0.78, 1) : new THREE.Vector3(0, 0.56, 1);
    const target = new THREE.Vector3(0, 0.6, -0.1);
    fitPoints(this.camera, w, hgt, pts, area, { dir, target, fill: narrow ? 0.94 : 0.92, alignY: narrow && !land ? 'bottom' : 'center' });
    this.hd2d!.framed(target);
  }

  /** HD-2D render stats (debug hook), null on the default renderer. */
  perf() { return this.hd2d?.perf() ?? null; }

  override exit() {
    this.hd2d?.dispose();
    this.hd2d = null;
    super.exit();
  }

  override update(_dt: number, t: number) {
    this.hd2d?.update(t);
    this.views.forEach((v, i) => {
      v.update(t);
      v.root.rotation.y = i === this.selected ? Math.sin(t * 1.5) * 0.5 : 0;
      if (this.selected >= 0 && i !== this.selected) v.material.color.setScalar(0.72);
      else v.material.color.setScalar(1);
    });
  }
}
