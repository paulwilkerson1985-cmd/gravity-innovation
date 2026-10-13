// HD-2D battle staging (behind `?gfx=hd2d`): the battle happens INSIDE a lit pixel-art
// diorama — kin and people are sprite-ified 3D models, the camera is an elevated 3/4 view,
// and the frame goes through the HD-2D post pipeline. The BattleScene keeps all of its flow,
// UI and FX; it only asks this stage for spots, framing, figures and per-frame work.
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { CreatureView } from '../render/creature';
import { Hd2dPipeline, detectQuality, hd2dRequested, installPipeline, postFlags, type Quality } from '../render/hd2d/pipeline';
import { SpriteBaker, type SpriteSubject } from '../render/hd2d/sprite';
import { buildCaveArena, type ArenaRig } from '../render/hd2d/arena';
import { Figure, heroFigure, trainerFigure } from '../render/hd2d/characters';
import { layoutMode, uiZoom } from './framing';

/** Terrains with an HD-2D arena so far (rollout adds the rest, docs/HD2D.md). */
export type Hd2dTerrain = 'cave';

/** Which arena (if any) a battle gets when `?gfx=hd2d` is on: Ember Ridge battles and every cave hotspot. */
export function hd2dTerrainFor(routeId: string, hotspotKind: string | undefined): Hd2dTerrain | null {
  if (!hd2dRequested()) return null;
  if (routeId === 'ridge' || hotspotKind === 'cave') return 'cave';
  return null;
}

/** Per-layout camera: elevation (rad), yaw (rad), vertical FOV, how tall a person reads, and where the kin go (fractions of the screen). */
const CAMERA = {
  wide: { elev: 0.58, yaw: -0.06, fov: 32, person: 0.15, mine: [0.38, 0.7], foe: [0.6, 0.53] },
  portrait: { elev: 0.74, yaw: -0.45, fov: 34, person: 0.14, mine: [0.4, 0.53], foe: [0.62, 0.32] },
  land: { elev: 0.72, yaw: -0.08, fov: 30, person: 0.18, mine: [0.3, 0.68], foe: [0.52, 0.44] },
} as const;

/** World size every kin is normalised toward (bigger final forms keep a little of their bulk). */
const KIN_SIZE = [1.3, 1.15] as const;
const PERSON_SCALE = 1.55;

/** A soft blob under a figure (follows it via onBeforeRender), for tiers without live shadows. */
function contactShadow(target: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.32, 14), new THREE.MeshBasicMaterial({ color: 0x1a0d08, transparent: true, opacity: 0.35, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -0.5;
  m.onBeforeRender = () => { m.position.set(target.position.x, 0.015, target.position.z); m.updateMatrixWorld(); };
  m.frustumCulled = false;
  return m;
}

/** Turn a figure (built facing +Z) toward a floor point; yaw only, so idle sway can use z. */
function face(o: THREE.Object3D, target: THREE.Vector3) {
  o.rotation.set(0, Math.atan2(target.x - o.position.x, target.z - o.position.z), 0);
}

export class Hd2dBattleStage {
  readonly quality: Quality;
  readonly rig: ArenaRig;
  readonly pipeline: Hd2dPipeline;
  readonly baker: SpriteBaker;
  readonly spots: [THREE.Vector3, THREE.Vector3];
  private uninstall: () => void;
  private kin: [SpriteSubject | null, SpriteSubject | null] = [null, null];
  private hero: Figure;
  private foeTrainer: Figure | null = null;
  private figures = new Map<Figure, SpriteSubject>();
  private inScene = postFlags().has('mesh');
  private pxPerTexel = postFlags().has('px2') ? 2 : 1;

  constructor(private game: Game, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, terrain: Hd2dTerrain) {
    void terrain; // one arena for now
    this.quality = detectQuality();
    this.rig = buildCaveArena({ quality: this.quality });
    scene.add(this.rig.group);
    scene.background = new THREE.Color('#120a07');
    scene.fog = new THREE.Fog(new THREE.Color('#2a160d'), 18, 42);
    this.spots = [this.rig.spots[0].clone(), this.rig.spots[1].clone()];
    this.pipeline = new Hd2dPipeline(game.renderer.gl, scene, camera, this.quality);
    this.uninstall = installPipeline(game.renderer, this.pipeline);
    this.baker = new SpriteBaker(scene, camera, this.rig.spriteLight);
    this.pipeline.beforeRender.push((r) => this.baker.bake(r));
    scene.userData.render = () => this.pipeline.render();
    // The player stands behind their kin, bottom-left, seen from the back.
    this.hero = heroFigure();
    this.hero.mesh.scale.setScalar(PERSON_SCALE);
    this.hero.mesh.position.copy(this.rig.people[0]);
    face(this.hero.mesh, this.spots[1]);
    scene.add(this.hero.mesh);
    this.addFigure(this.hero);
    (window as unknown as { __hd2d?: Hd2dBattleStage }).__hd2d = this; // debug handle
  }

  /** The player's figure (layout checks). */
  get heroMesh(): THREE.Mesh { return this.hero.mesh; }

  private addFigure(f: Figure) {
    this.figures.set(f, this.baker.add(f.mesh, { rig: f.uniforms, pxPerTexel: this.pxPerTexel, inScene: this.inScene, lift: 0.05 }));
    if (this.pipeline.settings.staticShadows) {
      f.mesh.castShadow = false;
      this.scene.add(contactShadow(f.mesh));
    }
  }

  /** Sprite-ify a kin as it is sent out. */
  attachKin(view: CreatureView, side: 0 | 1) {
    this.detachKin(side);
    const sub = this.baker.add(view.mesh, { rig: view.uniforms, emissiveFrom: view.material, pxPerTexel: this.pxPerTexel, inScene: this.inScene, lift: side === 0 ? 0.1 : 0.04 });
    this.kin[side] = sub;
    if (this.pipeline.settings.staticShadows) view.mesh.castShadow = false; // frozen shadow map: blob only
    // With a real cast shadow, keep only a faint contact blob.
    else (view.shadow.material as THREE.MeshBasicMaterial).opacity *= 0.7;
  }

  detachKin(side: 0 | 1) {
    this.baker.remove(this.kin[side]);
    this.kin[side] = null;
  }

  /** Normalise a kin's size for the arena (root scale, so the shadow follows). */
  fitKin(view: CreatureView, side: 0 | 1) {
    const g = view.mesh.geometry;
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const size = Math.max(bb.max.y - bb.min.y, 0.8 * Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z)) * view.baseScale;
    const k = (KIN_SIZE[side] / size) * Math.pow(size / 1.1, 0.3);
    view.root.scale.setScalar(THREE.MathUtils.clamp(k, 0.55, 1.6));
  }

  /** The foe trainer as a figure, starting centre stage on the foe spot. */
  trainer(id: string): THREE.Mesh {
    const f = trainerFigure(id);
    f.mesh.scale.setScalar(PERSON_SCALE);
    f.mesh.position.copy(this.spots[1]);
    face(f.mesh, this.rig.people[0].clone().add(new THREE.Vector3(0, 0, 1)));
    this.scene.add(f.mesh);
    this.foeTrainer = f;
    this.addFigure(f);
    return f.mesh;
  }

  /** Trainer walks between centre stage (entering) and their post behind the foe kin (leaving). */
  trainerPath(entering: boolean): [THREE.Vector3, THREE.Vector3] {
    const stage = this.spots[1].clone().add(new THREE.Vector3(1.0, 0, 0.35));
    const post = this.rig.people[1].clone();
    return entering ? [post, stage] : [stage, post];
  }

  /** Where your orb is thrown from (the player's hand). */
  throwOrigin(): THREE.Vector3 {
    return this.rig.people[0].clone().add(new THREE.Vector3(0.25, 1.1, 0.1));
  }

  /** Elevated 3/4 camera; the image is slid so the kin land on the layout's targets. */
  frame(w: number, h: number) {
    const mode = layoutMode(w, h);
    const c = CAMERA[mode];
    const cam = this.camera;
    cam.fov = c.fov;
    cam.aspect = w / h;
    cam.near = 0.5; cam.far = 80;
    const dir = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.elev), Math.sin(c.elev), Math.cos(c.yaw) * Math.cos(c.elev));
    const mid = this.spots[0].clone().add(this.spots[1]).multiplyScalar(0.5);
    const z = uiZoom(w, h);
    void z;
    // Distance so a standing person is `person` of the screen height at the midpoint.
    const dist = (PERSON_SCALE * 1.05) / (c.person * 2 * Math.tan(THREE.MathUtils.degToRad(c.fov) / 2));
    cam.position.copy(mid).addScaledVector(dir, dist);
    cam.lookAt(mid);
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const px = (p: THREE.Vector3) => { const v = p.clone().project(cam); return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h] as const; };
    const a = px(this.spots[0]), b = px(this.spots[1]);
    const tx = ((c.mine[0] + c.foe[0]) / 2) * w, ty = ((c.mine[1] + c.foe[1]) / 2) * h;
    cam.setViewOffset(w, h, (a[0] + b[0]) / 2 - tx, (a[1] + b[1]) / 2 - ty, w, h);
    cam.updateProjectionMatrix();
    if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = dist + 6; this.scene.fog.far = dist + 30; }
    this.pipeline.setSize();
    this.rig.setPixelSize(this.quality === 'high' ? 2 : 1.5);
  }

  update(t: number) {
    this.rig.update(t);
    this.hero.update(t);
    this.foeTrainer?.update(t);
  }

  perf() { return this.pipeline.stats(); }

  dispose() {
    this.baker.dispose();
    this.hero.dispose();
    this.foeTrainer?.dispose();
    this.rig.dispose();
    delete this.scene.userData.render;
    this.uninstall();
  }
}
