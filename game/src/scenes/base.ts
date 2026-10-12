import * as THREE from 'three';
import { disposeTree } from '../render/builder';
import type { Game } from '../game/game';

export type SceneName = 'title' | 'starter' | 'route' | 'battle' | 'party' | 'model' | 'bestiary' | 'box' | 'bag' | 'shop' | 'arena';

export abstract class BaseScene {
  abstract readonly name: SceneName;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  readonly ui: HTMLElement;
  private raycaster = new THREE.Raycaster();
  private pointerHandler?: (e: PointerEvent) => void;

  constructor(protected game: Game) {
    this.ui = document.createElement('div');
    this.ui.className = 'scene-ui';
    game.overlay.appendChild(this.ui);
  }

  abstract enter(params: Record<string, unknown>): void | Promise<void>;
  update(_dt: number, _t: number): void {}
  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Call `cb` with the first object under the pointer that has userData.pick. */
  protected onPick(cb: (obj: THREE.Object3D) => void) {
    this.pointerHandler = (e: PointerEvent) => {
      const rect = this.game.renderer.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      for (const hit of this.raycaster.intersectObjects(this.scene.children, true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o && !o.userData.pick) o = o.parent;
        if (o) { cb(o); return; }
      }
    };
    this.game.renderer.canvas.addEventListener('pointerdown', this.pointerHandler);
  }

  exit() {
    if (this.pointerHandler) this.game.renderer.canvas.removeEventListener('pointerdown', this.pointerHandler);
    disposeTree(this.scene);
    this.scene.clear();
    this.ui.remove();
  }
}
