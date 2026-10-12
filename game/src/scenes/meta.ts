// Shared base for the menu screens (party, box, bestiary, bag, shop): a soft pastel stage with a
// single turntable model in the middle, HTML panels left/right (stacked under the model in
// portrait), and Back handling that returns to the route the screen was opened from.
import * as THREE from 'three';
import { BaseScene } from './base';
import { CreatureView } from '../render/creature';
import { GEO, MeshBuilder } from '../render/builder';
import { addLights, makeSky, platform } from '../render/diorama';
import { ORB_COLORS, makeOrb } from '../render/fx';
import { ease, tween } from '../render/anim';
import { species } from '../engine';
import { isOrb, type BagId } from '../game/state';
import { h } from '../ui/dom';
import { returnToRoute } from '../ui/menu';
import { reduceMotion } from '../ui/prefs';

export type ModelMode = 'color' | 'silhouette';

const SILHOUETTE = '#1d1838';

export abstract class MetaScene extends BaseScene {
  protected params: Record<string, unknown> = {};
  protected view: CreatureView | null = null;
  protected prop: THREE.Object3D | null = null;
  protected stand!: THREE.Mesh;
  protected caption!: HTMLElement;
  /** 'spin' = continuous turntable; 'sway' = gentle look-around. */
  protected motion: 'spin' | 'sway' = 'spin';
  private spinBase = 0;
  private spinT0: number | null = null;
  /** Height (world units) of the current model, used to frame the camera. */
  private frameH = 1;
  private extraMaterial: THREE.Material | null = null;
  private keyHandler = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('.modal-root')) return;
    e.preventDefault();
    this.back();
  };

  protected setupStage(params: Record<string, unknown>) {
    this.params = params;
    if (this.game.player.party.length === 0) this.game.debugParty();
    this.scene.add(makeSky('title'));
    addLights(this.scene, 'meadow');
    this.scene.fog = new THREE.Fog('#ffc8e4', 14, 34);
    this.stand = platform('#fff6e0', 1.15);
    this.scene.add(this.stand);
    this.caption = h('div', { class: 'meta-caption', 'aria-hidden': 'true' });
    window.addEventListener('keydown', this.keyHandler);
  }

  /** Build the standard two-panel layout. */
  protected layout(left: HTMLElement, right: HTMLElement, cls = '') {
    this.ui.append(h('div', { class: `meta-ui ${cls}` }, left, right), this.caption);
  }

  protected back() {
    void returnToRoute(this.game, this.params);
  }

  protected backButton(testid: string): HTMLButtonElement {
    return h('button', { class: 'btn btn-back btn-small', 'data-testid': testid, onclick: () => this.back() }, 'Back');
  }

  protected clearModel() {
    if (this.view) {
      this.scene.remove(this.view.root);
      this.view.mesh.geometry.dispose();
      this.view.material.dispose();
      this.view.shadow.geometry.dispose();
      (this.view.shadow.material as THREE.Material).dispose();
      this.view = null;
    }
    if (this.extraMaterial) { this.extraMaterial.dispose(); this.extraMaterial = null; }
    if (this.prop) {
      this.scene.remove(this.prop);
      this.prop.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
      });
      this.prop = null;
    }
  }

  protected showKin(speciesId: string, mode: ModelMode = 'color', animate = true) {
    this.clearModel();
    const v = new CreatureView(species(speciesId).look, 1);
    if (mode === 'silhouette') {
      const mat = new THREE.MeshBasicMaterial({ color: SILHOUETTE });
      v.mesh.material = mat;
      this.extraMaterial = mat;
      (v.shadow.material as THREE.MeshBasicMaterial).opacity = 0.12;
    }
    this.view = v;
    this.scene.add(v.root);
    this.spinBase = 0;
    this.spinT0 = null;
    v.mesh.geometry.computeBoundingBox();
    const bb = v.mesh.geometry.boundingBox!;
    this.frame((bb.max.y - Math.min(0, bb.min.y)) * v.baseScale);
    if (animate && !reduceMotion()) void v.appear();
  }

  protected showProp(obj: THREE.Object3D) {
    this.clearModel();
    this.prop = obj;
    this.scene.add(obj);
    this.spinT0 = null;
    this.frame(1.25);
    if (!reduceMotion()) {
      const s = obj.scale.x;
      obj.scale.setScalar(0.001);
      void tween(300, (k) => obj.scale.setScalar(Math.max(0.001, s * ease.outBack(k))));
    }
  }

  protected setCaption(text: string, sub = '') {
    this.caption.replaceChildren(h('strong', {}, text), sub ? h('span', {}, sub) : '');
    this.caption.classList.toggle('empty', !text);
  }

  private frame(height: number) {
    this.frameH = Math.max(0.6, height);
    this.resize(this.game.renderer.width, this.game.renderer.height);
  }

  override resize(w: number, hgt: number) {
    super.resize(w, hgt);
    const portrait = w / hgt < 1.05;
    const H = this.frameH;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 2;
    this.camera.clearViewOffset();
    // Fit model + stand into the free area: the top ~34% in portrait, most of the middle in landscape.
    const fit = portrait ? 0.31 : 0.55;
    let d = (H + (portrait ? 0.9 : 0.8)) / (fit * tan);
    // Narrow portrait screens also need horizontal room for the 2.4-wide stand.
    if (portrait) d = Math.max(d, 3.0 / (0.85 * tan * (w / hgt)));
    d = Math.max(portrait ? 6 : 5.2, d);
    const lookY = H * 0.42;
    this.camera.position.set(0, lookY + d * 0.2, d);
    this.camera.lookAt(0, lookY, 0);
    if (portrait) this.camera.setViewOffset(w, hgt, 0, hgt * 0.32, w, hgt);
    else this.camera.setViewOffset(w, hgt, 0, -hgt * 0.02, w, hgt);
    this.camera.updateProjectionMatrix();
  }

  override update(_dt: number, t: number) {
    const slow = reduceMotion();
    const obj = this.view?.root ?? this.prop;
    if (this.view && !slow) this.view.update(t);
    if (obj) {
      this.spinT0 ??= t;
      if (this.motion === 'spin') obj.rotation.y = this.spinBase + (t - this.spinT0) * (slow ? 0.15 : 0.6);
      else obj.rotation.y = Math.sin(t * 0.6) * (slow ? 0.2 : 0.7);
      if (this.prop) this.prop.position.y = 0.75 + (slow ? 0 : Math.sin(t * 2) * 0.06);
    }
  }

  override exit() {
    window.removeEventListener('keydown', this.keyHandler);
    this.clearModel();
    super.exit();
  }
}

// ---------------------------------------------------------------- item props

const ITEM_TINT: Record<string, { body: string; cap: string }> = {
  tonic: { body: '#5fd36b', cap: '#c98a4a' },
  'mega-tonic': { body: '#3d9bff', cap: '#c98a4a' },
  'full-tonic': { body: '#ffc93d', cap: '#e8f4ff' },
};

/** A small low-poly model for a bag item (one mesh). */
export function itemModel(id: BagId): THREE.Object3D {
  if (isOrb(id)) {
    const orb = makeOrb(ORB_COLORS[id]);
    orb.scale.setScalar(2.0);
    orb.position.y = 0.75;
    return orb;
  }
  const b = new MeshBuilder();
  if (id === 'remedy') {
    b.add(GEO.ball, '#4cc35a', { p: [0, 0, 0], s: [0.42, 0.06, 0.24], r: [0, 0, 0.4] }, 0.15);
    b.add(GEO.ball, '#7fdc5a', { p: [0.02, 0.02, 0], s: [0.36, 0.04, 0.03], r: [0, 0, 0.4] });
    b.add(GEO.cyl, '#3a7a2e', { p: [-0.42, -0.2, 0], s: [0.025, 0.25, 0.025], r: [0, 0, 0.4] });
  } else if (id === 'revive-seed') {
    b.add(GEO.ball, '#ff9a3d', { p: [0, -0.05, 0], s: [0.27, 0.34, 0.27] }, 0.12);
    b.add(GEO.ball, '#ffd23f', { p: [0, -0.02, 0.14], s: [0.12, 0.2, 0.15] });
    b.add(GEO.cyl, '#3a7a2e', { p: [0, 0.32, 0], s: [0.025, 0.14, 0.025] });
    b.add(GEO.ball, '#6fdc4c', { p: [0.1, 0.4, 0], s: [0.12, 0.03, 0.06], r: [0, 0, 0.5] });
    b.add(GEO.ball, '#6fdc4c', { p: [-0.1, 0.38, 0], s: [0.1, 0.03, 0.05], r: [0, 0, -0.5] });
  } else {
    const t = ITEM_TINT[id] ?? ITEM_TINT.tonic!;
    b.add(GEO.cyl, t.body, { p: [0, -0.1, 0], s: [0.24, 0.42, 0.24] }, 0.1);
    b.add(GEO.ball, t.body, { p: [0, 0.1, 0], s: [0.24, 0.12, 0.24] });
    b.add(GEO.cyl, '#e8f4ff', { p: [0, 0.24, 0], s: [0.09, 0.14, 0.09] });
    b.add(GEO.cyl, t.cap, { p: [0, 0.34, 0], s: [0.11, 0.08, 0.11] });
    b.add(GEO.box, '#fff6e0', { p: [0, -0.1, 0.2], s: [0.24, 0.18, 0.06] });
    b.add(GEO.box, '#ffffff', { p: [0.13, 0.02, 0.18], s: [0.04, 0.22, 0.04] });
  }
  const mesh = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.scale.setScalar(1.6);
  mesh.position.y = 0.75;
  return mesh;
}
