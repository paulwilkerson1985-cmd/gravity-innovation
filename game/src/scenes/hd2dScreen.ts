// HD-2D screen stage (behind `?gfx=hd2d`): renders a non-battle screen — title, starter pick,
// route maps (and the menu over them), party and the other menu screens — through the same
// pipeline as the battles. Given a set builder (render/hd2d/screens/*), it installs the post
// pipeline at the detected tier, bakes kin and people into pixel sprites (the battle sprites),
// keeps the camera on the integer pixel grid, ticks the set and disposes everything on exit.
//
// Scenes keep their flow, DOM UI and data-testids; they branch on `hd2dRequested()` and hand
// their CreatureViews / Figures to this stage instead of drawing the low-poly meshes.
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { CreatureView } from '../render/creature';
import { Hd2dPipeline, detectQuality, installPipeline, type Quality } from '../render/hd2d/pipeline';
import { SpriteBaker, type SpriteOptions, type SpriteSubject } from '../render/hd2d/sprite';
import type { Figure } from '../render/hd2d/characters';
import { screenFigureOptions, screenKinOptions, type ScreenSet } from '../render/hd2d/screens/common';

export class Hd2dScreenStage {
  readonly quality: Quality;
  readonly set: ScreenSet;
  readonly pipeline: Hd2dPipeline;
  readonly baker: SpriteBaker;
  private uninstall: () => void;
  private kin = new Map<CreatureView, SpriteSubject>();
  private figures = new Map<Figure, SpriteSubject>();
  /** Camera framing before any drift: position and the view offset (CSS px). */
  private base: { pos: THREE.Vector3; focus: number } | null = null;

  constructor(private game: Game, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, build: (quality: Quality) => ScreenSet) {
    this.quality = detectQuality();
    this.set = build(this.quality);
    scene.add(this.set.group);
    scene.background = new THREE.Color(this.set.background);
    scene.fog = this.set.fog ? new THREE.Fog(new THREE.Color(this.set.fog.color), this.set.fog.near, this.set.fog.far) : null;
    this.pipeline = new Hd2dPipeline(game.renderer.gl, scene, camera, this.quality, this.set.grade);
    this.uninstall = installPipeline(game.renderer, this.pipeline);
    this.baker = new SpriteBaker(scene, camera, this.set.spriteLight);
    this.pipeline.beforeRender.push((r) => this.baker.bake(r));
    scene.userData.render = () => this.pipeline.render();
    (window as unknown as { __hd2dScreen?: Hd2dScreenStage }).__hd2dScreen = this; // debug handle
  }

  /** Sprite-ify a kin (its low-poly mesh stays in the scene invisibly: rig, picking, shadow). */
  addKin(view: CreatureView, extra: SpriteOptions = {}): SpriteSubject {
    this.removeKin(view);
    const s = this.baker.add(view.mesh, screenKinOptions(view, extra));
    s.setLightRim(view.dark ? 0.35 : 0);
    view.shadow.visible = false; // the sprite stands on its own pixel contact shadow
    this.kin.set(view, s);
    return s;
  }

  removeKin(view: CreatureView) {
    const s = this.kin.get(view);
    if (!s) return;
    this.baker.remove(s);
    this.kin.delete(view);
  }

  /** Sprite-ify a person figure (the stage owns and disposes it). */
  addFigure(f: Figure, extra: SpriteOptions = {}): SpriteSubject {
    const s = this.baker.add(f.mesh, screenFigureOptions(f, extra));
    this.figures.set(f, s);
    return s;
  }

  /** Sprite-ify any vertex-coloured mesh (item props); returns the subject to remove later. */
  addMesh(mesh: THREE.Mesh, opts: SpriteOptions = {}): SpriteSubject {
    return this.baker.add(mesh, opts);
  }

  removeSubject(s: SpriteSubject | null | undefined) { this.baker.remove(s); }

  /** CSS px per internal (drawing-buffer) px. */
  private cssPerPx(): number {
    const size = this.game.renderer.gl.getDrawingBufferSize(new THREE.Vector2());
    return this.game.renderer.height / Math.max(1, size.y);
  }

  /**
   * After the scene framed its camera (position, lookAt, view offset): snap the view offset to
   * whole internal pixels, remember the framing for drift, size the buffers, re-aim backdrops.
   * `focus` = the world point whose depth gets pixel-exact drift (default: 10 units ahead).
   */
  framed(focus?: THREE.Vector3) {
    const cam = this.camera;
    const v = cam.view;
    if (v?.enabled) {
      const s = this.cssPerPx();
      cam.setViewOffset(v.fullWidth, v.fullHeight, Math.round(v.offsetX / s) * s, Math.round(v.offsetY / s) * s, v.width, v.height);
    }
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const f = focus ? cam.position.distanceTo(focus) : 10;
    this.base = { pos: cam.position.clone(), focus: f };
    if (this.scene.fog instanceof THREE.Fog && this.set.fog) { this.scene.fog.near = f + this.set.fog.near; this.scene.fog.far = f + this.set.fog.far; }
    this.pipeline.setSize();
    this.set.setPixelSize(this.quality === 'high' ? 1 : 1.5);
    this.set.frame?.(cam, this.game.renderer.gl.getDrawingBufferSize(new THREE.Vector2()));
  }

  /**
   * Slow camera drift (title): offset the framed position by `d` (camera right / up / forward,
   * world units) with the right/up part rounded to whole internal pixels at the focus depth, so
   * the focus plane slides in whole texels instead of shimmering.
   */
  drift(d: THREE.Vector3) {
    const b = this.base;
    if (!b) return;
    const cam = this.camera;
    const size = this.game.renderer.gl.getDrawingBufferSize(new THREE.Vector2());
    const px = (2 * b.focus * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / Math.max(1, size.y);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    cam.position.copy(b.pos)
      .addScaledVector(right, Math.round(d.x / px) * px)
      .addScaledVector(up, Math.round(d.y / px) * px)
      .addScaledVector(fwd, d.z);
    cam.updateMatrixWorld();
  }

  update(t: number) {
    this.set.update(t);
    for (const f of this.figures.keys()) f.update(t);
  }

  perf() { return this.pipeline.stats(); }

  dispose() {
    this.baker.dispose();
    for (const f of this.figures.keys()) { this.scene.remove(f.mesh); f.dispose(); }
    this.figures.clear();
    this.kin.clear();
    this.set.dispose();
    this.scene.remove(this.set.group);
    delete this.scene.userData.render;
    this.uninstall();
    const w = window as unknown as { __hd2dScreen?: Hd2dScreenStage };
    if (w.__hd2dScreen === this) delete w.__hd2dScreen;
  }
}
