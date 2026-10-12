import * as THREE from 'three';
import { BaseScene } from './base';
import { CreatureView } from '../render/creature';
import { addLights, backdrop, makeSky, platform } from '../render/diorama';
import { h, focusFirst } from '../ui/dom';
import { species } from '../engine';
import { STARTERS } from '../data/species';

export class TitleScene extends BaseScene {
  readonly name = 'title' as const;
  private views: CreatureView[] = [];
  private keyHandler = (e: KeyboardEvent) => { if (e.key === 'Enter' && document.activeElement === document.body) this.start(); };

  enter() {
    this.scene.add(makeSky('title'));
    addLights(this.scene, 'title');
    this.scene.fog = new THREE.Fog('#ffc8e4', 16, 40);
    this.scene.add(backdrop('meadow', 3));
    const ids = ['pyrelord', 'maelstrode', 'verdantusk'];
    ids.forEach((id, i) => {
      const v = new CreatureView(species(id).look, i);
      v.root.position.set((i - 1) * 2.4, 0, i === 1 ? -0.6 : 0);
      v.root.rotation.y = (1 - i) * 0.45;
      const p = platform('#8fdc6a', 1.1 * species(id).look.scale);
      p.position.copy(v.root.position);
      this.scene.add(p, v.root);
      this.views.push(v);
    });
    this.camera.position.set(0, 2.2, 8.5);
    this.camera.lookAt(0, 1.1, 0);
    this.ui.append(h('div', { class: 'title-ui' },
      h('h1', { class: 'logo' }, h('span', {}, 'ORB'), h('span', {}, 'KIN')),
      h('p', { class: 'tagline' }, 'Befriend wild kin. Battle with heart.'),
      h('div', { class: 'title-buttons' },
        h('button', { class: 'btn btn-big', 'data-testid': 'btn-start', onclick: () => this.start() }, 'New adventure'),
      ),
      h('p', { class: 'footnote' }, `${STARTERS.length * 3 + 9} kin to discover · prototype build`),
    ));
    focusFirst(this.ui);
    window.addEventListener('keydown', this.keyHandler);
  }

  private start() {
    void this.game.goto('starter');
  }

  override resize(w: number, hgt: number) {
    super.resize(w, hgt);
    const aspect = w / hgt;
    const dist = Math.max(8.5, 4.6 / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * aspect));
    this.camera.position.set(0, 2.2 + dist * 0.08, dist);
    this.camera.lookAt(0, aspect < 1 ? 1.9 : 1.2, 0);
  }

  override update(_dt: number, t: number) {
    this.views.forEach((v) => v.update(t));
  }

  override exit() {
    window.removeEventListener('keydown', this.keyHandler);
    super.exit();
  }
}
