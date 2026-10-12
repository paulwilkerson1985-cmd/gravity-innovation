// Debug gallery: ?scene=model shows every species; &species=<id> shows one.
import * as THREE from 'three';
import { BaseScene } from './base';
import { CreatureView } from '../render/creature';
import { addLights, makeSky } from '../render/diorama';
import { h } from '../ui/dom';
import { species } from '../engine';

export class ModelScene extends BaseScene {
  readonly name = 'model' as const;
  private views: CreatureView[] = [];
  private count = 1;

  enter(params: Record<string, unknown>) {
    this.scene.add(makeSky('meadow'));
    addLights(this.scene, 'meadow');
    const ids = params.species ? [String(params.species)] : [...this.game.dex().species.keys()];
    this.count = ids.length;
    const cols = Math.ceil(Math.sqrt(ids.length * 1.6));
    ids.forEach((id, i) => {
      const v = new CreatureView(species(id).look, i);
      const col = i % cols;
      const row = Math.floor(i / cols);
      v.root.position.set((col - (cols - 1) / 2) * 2.1, 0, row * 2.2 - 2);
      this.scene.add(v.root);
      this.views.push(v);
    });
    const grid = new THREE.GridHelper(30, 30, '#5fbf48', '#8fdc6a');
    this.scene.add(grid);
    this.resize(this.game.renderer.width, this.game.renderer.height);
    this.ui.append(h('div', { class: 'model-ui' }, ids.length === 1 ? species(ids[0]!).name : `${ids.length} species`));
  }

  override resize(w: number, hgt: number) {
    super.resize(w, hgt);
    const d = this.count === 1 ? 4 : Math.max(13, 9 / (w / hgt));
    this.camera.position.set(0, d * 0.55, d);
    this.camera.lookAt(0, this.count === 1 ? 0.7 : 0, this.count === 1 ? 0 : 1);
  }

  override update(_dt: number, t: number) {
    this.views.forEach((v) => { v.update(t); v.root.rotation.y = this.count === 1 ? t * 0.6 : Math.sin(t * 0.5) * 0.4; });
  }
}
