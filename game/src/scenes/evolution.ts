// Evolution: a skippable transformation sequence. The creature glows into a silhouette,
// flickers between its old and new forms with an accelerating rhythm under light rays and
// sparkles, then bursts into the new form. "Skip" finishes instantly; "Stop" cancels (the
// creature asks again after the next won battle, or via Evolve on the Party screen).
// Handles a queue of evolutions from one battle.
import * as THREE from 'three';
import { BaseScene } from './base';
import './adventure.css';
import { CreatureView } from '../render/creature';
import { addLights, platform } from '../render/diorama';
import { burst } from '../render/fx';
import { lightRays, sparkles } from '../render/celebrate';
import { animClock, ease, tween, wait } from '../render/anim';
import { focusFirst, h } from '../ui/dom';
import { audio } from '../audio/audio';
import { canEvolveNow, species } from '../engine';
import { evolutionQueue, evolvePartyMember } from '../game/progress';
import { corners, fitPoints, freeArea, layoutMode } from './framing';

type Flag = 'none' | 'skip' | 'stop';

export class EvolutionScene extends BaseScene {
  readonly name = 'evolution' as const;
  private views: CreatureView[] = [];
  private rays!: ReturnType<typeof lightRays>;
  private sparks!: ReturnType<typeof sparkles>;
  private glow!: THREE.Mesh;
  private silhouette = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  private text!: HTMLElement;
  private buttons!: HTMLElement;
  private flashEl!: HTMLElement;
  private panel!: HTMLElement;
  private flag: Flag = 'none';
  private spin = 0.3;
  private intensity = 0;
  private routeId = 'meadow';
  private next: 'route' | 'victory' | 'party' = 'route';
  /** For next = 'party': where the party screen goes back to. */
  private partyParams: Record<string, unknown> = {};
  private advance: (() => void) | null = null;
  /** The form left standing on the pedestal after the last sequence. */
  private keep: CreatureView | null = null;
  private keys = (e: KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && this.advance) { e.preventDefault(); this.advance(); }
    if (e.key === 'Escape' || e.key === 'x') this.buttons.querySelector<HTMLButtonElement>('[data-testid="btn-evo-stop"]')?.click();
  };

  enter(params: Record<string, unknown>) {
    const g = this.game;
    this.routeId = String(params.route ?? g.player.lastRoute ?? 'meadow');
    this.next = params.next === 'victory' || params.next === 'party' ? params.next : 'route';
    if (this.next === 'party') this.partyParams = { route: this.routeId, index: Number(params.index ?? 0) || 0, ...(typeof params.from === 'string' ? { from: params.from } : {}) };
    const raw = params.queue;
    let uids = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' && raw ? raw.split(',') : [];
    if (uids.length === 0) uids = g.player.party.filter(canEvolveNow).map((c) => c.uid); // ?scene=evolution
    const queue = evolutionQueue(g.player, uids);

    this.scene.background = new THREE.Color('#1d1838');
    this.scene.fog = new THREE.Fog('#1d1838', 9, 22);
    addLights(this.scene, 'title');
    const glowGeo = new THREE.CircleGeometry(3.2, 24);
    const glowCol = new Float32Array(glowGeo.attributes.position!.count * 3);
    for (let i = 0; i < glowGeo.attributes.position!.count; i++) {
      const r = Math.hypot(glowGeo.attributes.position!.getX(i), glowGeo.attributes.position!.getY(i)) / 3.2;
      const c = new THREE.Color('#6a4fd8').lerp(new THREE.Color('#1d1838'), r);
      glowCol.set([c.r, c.g, c.b], i * 3);
    }
    glowGeo.setAttribute('color', new THREE.BufferAttribute(glowCol, 3));
    this.glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    this.glow.position.set(0, 1.0, -2.2);
    this.scene.add(this.glow);
    this.rays = lightRays(16, 10, '#d9c8ff');
    this.rays.mesh.position.set(0, 1.0, -2.0);
    this.scene.add(this.rays.mesh);
    this.sparks = sparkles(110, 1.5);
    this.scene.add(this.sparks.points);
    const stand = platform('#8a7bd8', 1.3);
    this.scene.add(stand);

    this.text = h('div', { class: 'text', 'data-testid': 'evo-text', 'aria-live': 'polite' });
    this.buttons = h('div', { class: 'evo-buttons' });
    this.flashEl = h('div', { class: 'evo-flash' });
    this.panel = h('div', { class: 'evo-ui' }, h('div', { class: 'textbox', onclick: () => this.advance?.() }, this.text), this.buttons);
    this.ui.append(this.flashEl, this.panel);
    window.addEventListener('keydown', this.keys);
    audio.music('evolution');
    this.resize(g.renderer.width, g.renderer.height);
    void this.run(queue);
  }

  override resize(w: number, hgt: number) {
    super.resize(w, hgt);
    if (!this.panel) return;
    // Pedestal and kin (old or new form) fill the space above the text box — or left of it on
    // a landscape phone, where the text and buttons form a right-hand column.
    const land = layoutMode(w, hgt) === 'land';
    const area = freeArea(w, hgt, land ? { right: [this.panel] } : { bottom: [this.panel] }, 10);
    const hw = w / hgt < 1 ? 1.0 : 1.45;
    const pts = corners(new THREE.Vector3(-hw, -0.1, -1.3), new THREE.Vector3(hw, 2.2, 1.3));
    fitPoints(this.camera, w, hgt, pts, area, { dir: new THREE.Vector3(0, 0.16, 1), target: new THREE.Vector3(0, 0.95, 0), fill: 0.9 });
  }

  /** Layout checks (debug hook). */
  subjects() {
    return this.views.filter((v) => v.root.visible).map((v, i) => ({ name: `kin${i}`, obj: v.inner }));
  }

  override update(_dt: number, t: number) {
    this.rays.mesh.rotation.z = t * this.spin;
    this.rays.mat.opacity += (this.intensity * 0.28 - this.rays.mat.opacity) * 0.08;
    this.sparks.mat.opacity += (this.intensity - this.sparks.mat.opacity) * 0.08;
    this.sparks.update(t, 1 + this.intensity * 2);
    for (const v of this.views) {
      v.update(t);
      v.root.rotation.y = Math.sin(t * 0.7) * 0.35;
    }
  }

  override exit() {
    window.removeEventListener('keydown', this.keys);
    this.silhouette.dispose();
    super.exit();
  }

  private say(msg: string, hold = 900): Promise<void> {
    this.text.textContent = msg;
    if (animClock.instant) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; this.advance = null; resolve(); } };
      this.advance = finish;
      void wait(hold + msg.length * 20).then(finish);
    });
  }

  /** Read the Skip/Stop flag (set asynchronously by the buttons). */
  private is(f: Flag): boolean {
    return this.flag === f;
  }

  private setButtons(list: HTMLElement[]) {
    this.buttons.replaceChildren(...list);
    focusFirst(this.buttons);
  }

  private view(speciesId: string): CreatureView {
    const v = new CreatureView(species(speciesId).look, 0);
    v.faceTowards(new THREE.Vector3(0, 0, 5));
    this.scene.add(v.root);
    this.views.push(v);
    return v;
  }

  private drop(v: CreatureView) {
    this.scene.remove(v.root);
    v.mesh.geometry.dispose();
    v.material.dispose();
    v.shadow.geometry.dispose();
    (v.shadow.material as THREE.Material).dispose();
    this.views = this.views.filter((x) => x !== v);
  }

  private async run(queue: string[]) {
    for (const uid of queue) await this.evolveOne(uid);
    if (!queue.length) this.text.textContent = 'Nothing is ready to evolve right now.';
    const go = () => void (this.next === 'party'
      ? this.game.goto('party', this.partyParams)
      : this.game.goto(this.next === 'victory' ? 'victory' : 'route', { route: this.routeId }));
    this.setButtons([h('button', { class: 'btn btn-fight', 'data-testid': 'btn-evo-continue', onclick: go }, 'Continue')]);
    this.game.idle = true;
  }

  private async evolveOne(uid: string) {
    const g = this.game;
    const c = g.player.party.find((x) => x.uid === uid);
    if (!c || !canEvolveNow(c)) return;
    const prev = this.keep;
    if (prev) {
      this.keep = null;
      await tween(250, (k) => prev.inner.scale.setScalar(prev.baseScale * (1 - k * 0.98)));
      this.drop(prev);
    }
    const name = c.nickname ?? species(c.species).name;
    const into = species(c.species).evolvesTo!.species;
    const oldV = this.view(c.species);
    const newV = this.view(into);
    newV.root.visible = false;
    this.flag = 'none';
    this.intensity = 0;
    this.spin = 0.3;
    this.game.idle = false;
    await oldV.appear();
    audio.cry(c.species);
    await this.say(`What? ${name} is evolving!`, 600);
    this.setButtons([
      h('button', { class: 'btn btn-fight', 'data-testid': 'btn-evo-skip', onclick: () => { this.flag = 'skip'; audio.sfx('select'); } }, 'Skip'),
      h('button', { class: 'btn btn-run', 'data-testid': 'btn-evo-stop', 'data-back': true, onclick: () => { this.flag = 'stop'; audio.sfx('back'); } }, 'Stop'),
    ]);
    this.game.idle = true; // waiting on the sequence or a Skip/Stop press
    audio.sfx('evolveStart');

    // 1. Glow up into a white silhouette.
    this.intensity = 0.4;
    await tween(700, (k) => oldV.material.emissive.setScalar(ease.inOut(k)));
    if (this.is('none')) {
      oldV.mesh.material = this.silhouette;
      newV.mesh.material = this.silhouette;
      // 2. Flicker between forms with an accelerating rhythm.
      this.intensity = 1;
      let interval = 520;
      let showNew = false;
      let elapsed = 0;
      while (this.is('none') && elapsed < 5200) {
        showNew = !showNew;
        oldV.root.visible = !showNew;
        newV.root.visible = showNew;
        const v = showNew ? newV : oldV;
        const s = v.baseScale;
        void tween(Math.min(interval, 180), (k) => v.inner.scale.setScalar(s * (1 + 0.12 * Math.sin(k * Math.PI))));
        this.spin = 0.3 + (elapsed / 5200) * 2.6;
        await wait(interval);
        elapsed += interval;
        interval = Math.max(55, interval * 0.84);
      }
    }
    this.buttons.replaceChildren();
    this.game.idle = false;

    if (this.is('stop')) {
      // Fade back to the old form.
      oldV.mesh.material = oldV.material;
      oldV.root.visible = true;
      newV.root.visible = false;
      oldV.inner.scale.setScalar(oldV.baseScale);
      this.intensity = 0;
      this.spin = 0.3;
      await tween(500, (k) => oldV.material.emissive.setScalar(1 - k));
      audio.sfx('denied');
      await this.say(`Huh? ${name} stopped evolving!`, 900);
      this.drop(newV);
      this.keep = oldV;
      return;
    }

    // 3. Burst into the new form.
    const r = evolvePartyMember(g.player, uid);
    g.player = r.player;
    void this.game.save();
    oldV.root.visible = false;
    newV.root.visible = true;
    newV.mesh.material = newV.material;
    newV.material.emissive.setScalar(1);
    newV.inner.scale.setScalar(newV.baseScale);
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
    audio.sfx('evolveDone');
    void burst(this.scene, new THREE.Vector3(0, 0.9, 0), '#fff2b0', 2.2, 14);
    void burst(this.scene, new THREE.Vector3(0, 1.2, 0), '#9ad0ff', 1.6, 10);
    this.intensity = 0.5;
    this.spin = 0.4;
    await tween(800, (k) => newV.material.emissive.setScalar(1 - ease.outCubic(k)));
    audio.cry(into);
    await this.say(`Congratulations! ${name} evolved into ${species(into).name}!`, 1400);
    this.intensity = 0;
    this.drop(oldV);
    this.keep = newV;
  }
}
