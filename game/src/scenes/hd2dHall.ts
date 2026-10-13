// HD-2D staging for the Hall of Fame (`?gfx=hd2d`): the Crown Plateau champion hall in its
// "hall" setup (moon key on the podium circle), the post pipeline and sprite-baked kin and
// player. The VictoryScene keeps its UI, framing and confetti and only branches on this.
import * as THREE from 'three';
import type { Game } from '../game/game';
import { Hd2dPipeline, detectQuality, installPipeline, type Quality } from '../render/hd2d/pipeline';
import { SpriteBaker } from '../render/hd2d/sprite';
import type { ArenaRig } from '../render/hd2d/arena';
import { buildSummitArena, summitGrade } from '../render/hd2d/arenas/summit';
import type { CreatureView } from '../render/creature';
import type { Figure } from '../render/hd2d/characters';

export class Hd2dHallStage {
  readonly quality: Quality;
  readonly rig: ArenaRig;
  readonly pipeline: Hd2dPipeline;
  readonly baker: SpriteBaker;
  private uninstall: () => void;
  private figures: Figure[] = [];

  constructor(game: Game, private scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.quality = detectQuality();
    this.rig = buildSummitArena({ quality: this.quality, hall: true });
    scene.add(this.rig.group);
    scene.background = new THREE.Color('#070816');
    scene.fog = new THREE.Fog(new THREE.Color('#141a34'), 30, 60);
    this.pipeline = new Hd2dPipeline(game.renderer.gl, scene, camera, this.quality, summitGrade());
    this.uninstall = installPipeline(game.renderer, this.pipeline);
    this.baker = new SpriteBaker(scene, camera, this.rig.spriteLight);
    this.pipeline.beforeRender.push((r) => this.baker.bake(r));
    scene.userData.render = () => this.pipeline.render();
  }

  addKin(v: CreatureView) {
    this.baker.add(v.mesh, { rig: v.uniforms, emissiveFrom: v.material, lift: 0.08 });
    if (this.pipeline.settings.staticShadows) v.mesh.castShadow = false;
  }

  addFigure(f: Figure) {
    this.baker.add(f.mesh, { rig: f.uniforms, lift: 0.06 });
    if (this.pipeline.settings.staticShadows) f.mesh.castShadow = false;
    this.figures.push(f);
  }

  /** After the scene placed the camera: fog, buffer size, mote size. */
  afterFrame(dist: number) {
    if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = dist + 10; this.scene.fog.far = dist + 40; }
    this.pipeline.setSize();
    this.rig.setPixelSize(this.quality === 'high' ? 2 : 1.5);
  }

  update(t: number) {
    this.rig.update(t);
    for (const f of this.figures) f.update(t);
  }

  perf() { return this.pipeline.stats(); }

  dispose() {
    this.baker.dispose();
    for (const f of this.figures) f.dispose();
    this.rig.dispose();
    delete this.scene.userData.render;
    this.uninstall();
  }
}
