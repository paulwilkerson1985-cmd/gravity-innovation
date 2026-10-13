// HD-2D battle staging (behind `?gfx=hd2d`): the battle happens INSIDE a lit pixel-art
// diorama — kin and people are sprite-ified 3D models, the camera is an elevated 3/4 view,
// and the frame goes through the HD-2D post pipeline. The BattleScene keeps all of its flow,
// UI and FX; it only asks this stage for spots, framing, figures, facing and per-frame work.
//
// Staging (like a hand-made sprite battle): your kin stands in a clean side / 3-4 profile
// facing the foe across the screen (partnerYaw), the player stands just behind-left of it with
// clear floor between them, the foe trainer one step behind the foe kin. Sprites are baked
// from a near-side view with a fixed texel density (see render/hd2d/sprite.ts).
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { CreatureView } from '../render/creature';
import { getDex } from '../engine/dex';
import { tween, ease } from '../render/anim';
import { Hd2dPipeline, detectQuality, hd2dRequested, installPipeline, postFlags, type Quality } from '../render/hd2d/pipeline';
import { SpriteBaker, type SpriteOptions, type SpriteSubject } from '../render/hd2d/sprite';
import type { ArenaRig } from '../render/hd2d/arena';
import { arenaById, resolveArena, type ArenaContext, type ArenaDef, type CameraPreset, type LayoutName } from '../render/hd2d/arenas';
import { Figure, heroFigure, trainerFigure } from '../render/hd2d/characters';
import { layoutMode } from './framing';
import { FLAME } from '../render/creatures/parts';

/** The arena chosen for a battle and the context it was chosen from. */
export interface Hd2dTerrain { def: ArenaDef; ctx: ArenaContext }

/**
 * Which arena (if any) a battle gets when `?gfx=hd2d` is on. Data-driven: arenas claim
 * route / hotspot / kind / trainer combinations in `render/hd2d/arenas/*` (docs/HD2D.md).
 * `?arena=<id>` forces one (captures, A/B).
 */
export function hd2dTerrainFor(ctx: ArenaContext): Hd2dTerrain | null {
  if (!hd2dRequested()) return null;
  const forced = new URLSearchParams(location.search).get('arena');
  const def = forced ? arenaById(forced) ?? null : resolveArena(ctx);
  return def ? { def, ctx } : null;
}

/**
 * Per-layout camera: elevation (rad), yaw (rad), vertical FOV, how tall a person reads at the
 * midpoint (screen fraction; sets the distance) and where the kin go (fractions of the screen).
 * Wide: fov 38 so the near trainer reads ≈ 1.2× the far one; person 0.2 → the near person is
 * ≈ 88 internal px on the 640×360 grid = ≈ 44 texels of 2 px (the reference's chunky sprites). Portrait: a lower, closer-to-level camera and targets
 * high in the frame, so the back wall, window and beams sit in the visible top half above the
 * battle UI.
 */
export const HD2D_CAMERA: Record<LayoutName, CameraPreset> = {
  wide: { elev: 0.52, yaw: -0.06, fov: 38, person: 0.2, mine: [0.4, 0.72], foe: [0.62, 0.56] },
  portrait: { elev: 0.48, yaw: -0.4, fov: 38, person: 0.1, mine: [0.4, 0.5], foe: [0.62, 0.3] },
  land: { elev: 0.66, yaw: -0.08, fov: 34, person: 0.15, mine: [0.3, 0.66], foe: [0.52, 0.42] },
} as const;

/** World size every kin is normalised toward ([yours, foe]), times the evolution-stage factor. */
export const KIN_SIZE = [1.22, 1.1] as const;
const STAGE_K = [1, 1, 1.07, 1.15] as const;
/** People scale (the figure is ≈ 1.1 units → ≈ 1.87 units ≈ 1.8 kin). */
export const PERSON_SCALE = 1.7;
/** Sprite texel heights: people, then kin by stage (docs/HD2D.md "Sprites"). */
export const TEXELS = { person: 44, kin: [28, 28, 34, 40] } as const;
/** How far your kin turns from screen-right toward the camera (near eye and face show). */
const PARTNER_TURN = 0.42;

/** Evolution stage of a species: 1 (base), 2, 3; single-stage species count as 2. */
export function stageOf(id: string | undefined): 1 | 2 | 3 {
  if (!id) return 1;
  const all = [...getDex().species.values()];
  let stage = 1, cur = id;
  for (let i = 0; i < 3; i++) {
    const pre = all.find((s) => s.evolvesTo?.species === cur);
    if (!pre) break;
    stage++;
    cur = pre.id;
  }
  if (stage === 1 && !getDex().species.get(id)?.evolvesTo) stage = 2;
  return Math.min(3, stage) as 1 | 2 | 3;
}

/**
 * Per-species poses: flat kin (rays, moths, gliders) read as a sliver from a near-side view, so
 * they pitch toward the camera (rad, top toward the viewer) and bake from more of the camera's
 * elevation; `turn` overrides how far your kin turns toward the camera from a side view.
 */
export const FLAT_POSES: Record<string, { pitch: number; bakePitch: number; turn?: number }> = {
  // A ray lies flat: tip its back toward the viewer and bake from higher up.
  surgeray: { pitch: 0.42, bakePitch: 0.8 },
  // A moth's wings stand across its body: as your kin it turns further toward the camera so the
  // wings open up instead of showing their edge.
  stormoth: { pitch: 0.12, bakePitch: 0.5, turn: 1.0 },
  cyclonyx: { pitch: 0.16, bakePitch: 0.45, turn: 0.7 },
  // A hunched brute: from the side its hump hides the face, so it turns further toward us.
  cragmaul: { pitch: 0, bakePitch: 0.3, turn: 0.78 },
};

/** How far your kin turns toward the camera from a pure side view (rad). */
export function partnerTurn(speciesId?: string): number {
  return (speciesId ? FLAT_POSES[speciesId]?.turn : undefined) ?? PARTNER_TURN;
}

/** Camera basis on the floor: screen-right and toward-the-camera (unit, XZ). */
export function floorBasis(cam: THREE.Camera): { right: THREE.Vector3; toward: THREE.Vector3 } {
  cam.updateMatrixWorld();
  const f = cam.getWorldDirection(new THREE.Vector3());
  const h = new THREE.Vector3(f.x, 0, f.z);
  if (h.lengthSq() < 1e-8) h.set(0, 0, -1);
  h.normalize();
  return { right: new THREE.Vector3().crossVectors(h, new THREE.Vector3(0, 1, 0)).normalize(), toward: h.negate() };
}

/** Yaw that turns a +Z-facing model to screen-right, swung `turn` rad toward the camera. */
export function sideYaw(cam: THREE.Camera, turn = PARTNER_TURN): number {
  const { right, toward } = floorBasis(cam);
  const d = right.multiplyScalar(Math.cos(turn)).addScaledVector(toward, Math.sin(turn));
  return Math.atan2(d.x, d.z);
}

/** Rest height (world) of a kin, for the sprite texel density. */
function kinHeight(view: CreatureView): number {
  const bb = view.mesh.geometry.boundingBox;
  return bb ? (bb.max.y - bb.min.y) * view.baseScale * view.root.scale.y : 1;
}

/** Floor radius of a kin's footprint after fitKin (world units). */
function kinRadius(view: CreatureView): number {
  const bb = view.mesh.geometry.boundingBox;
  if (!bb) return 0.5;
  return 0.5 * Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * view.baseScale * view.root.scale.x;
}

/**
 * Per-species sprite treatment: emissive parts (flames, magma cracks, lava) drawn unlit and
 * over-bright with a warm pool of light on the floor, rocky kin shaded as faceted plates with
 * creases, near-black crust lifted to a readable dark tone.
 */
export const KIN_SPRITE: Record<string, SpriteOptions> = {
  // Lighter basalt crust in plates, glowing magma cracks between them, a warm pool on the floor.
  vulcrag: {
    emissive: ['#ff6a1a', '#ffd84a', FLAME.outer, FLAME.mid, FLAME.core, FLAME.hot], emissiveGain: 1.25,
    minValue: 0.3, facet: 0.4, plates: { size: 0.75, width: 0.022, crack: '#ff7020', crackGain: 1.35 },
    glow: { color: '#ff6a24', radius: 1.25, intensity: 1.1 },
  },
  pyrelord: { emissive: [FLAME.outer, FLAME.mid, FLAME.core, FLAME.hot], emissiveGain: 1.1, glow: { color: '#ff8a3a', radius: 1.0, intensity: 0.55 } },
  // Cindertail's body red sits next to the outer flame colour: only the hotter flame glows.
  cindertail: { emissive: [FLAME.mid, FLAME.core, FLAME.hot], emissiveGain: 1.1, glow: { color: '#ff8a3a', radius: 0.9, intensity: 0.5 } },
  // Rock kin: faceted light, stone plates with dark creases.
  pebblet: { facet: 0.45, plates: { size: 0.6, width: 0.016 } },
  cragmaul: { facet: 0.45, plates: { size: 0.42, width: 0.026 } },
};

/** Sprite options for a kin (shared by the battle, Arena and Hall stages). */
export function kinSpriteOptions(view: CreatureView, extra: SpriteOptions = {}): SpriteOptions {
  const pose = view.speciesId ? FLAT_POSES[view.speciesId] : undefined;
  // Idle bobs of a few hundredths of a unit would never move a 2-px texel: exaggerate them.
  view.idleGain = 1.8;
  return {
    rig: view.uniforms, emissiveFrom: view.material, ground: view.root,
    texelHeight: TEXELS.kin[stageOf(view.speciesId)],
    nominalHeight: () => kinHeight(view),
    bakePitch: pose?.bakePitch,
    live: () => view.animating,
    hidden: () => view.blinkOff,
    ...(view.speciesId ? KIN_SPRITE[view.speciesId] : undefined),
    ...extra,
  };
}

/** Sprite options for a person figure. */
export function figureSpriteOptions(f: Figure, extra: SpriteOptions = {}): SpriteOptions {
  // Softer light contrast on people: faces stay in the base / light tones with a soft shadow side.
  return { rig: f.uniforms, texelHeight: TEXELS.person, nominalHeight: () => f.height * f.mesh.scale.x, live: () => f.walking, contrast: 0.68, ...extra };
}

/** Pitch a flat kin toward the camera (on its inner group, so lunges/hits keep working). */
export function poseFlatKin(view: CreatureView, cam: THREE.Camera) {
  const pose = view.speciesId ? FLAT_POSES[view.speciesId] : undefined;
  if (!pose) { view.inner.quaternion.identity(); return; }
  // The camera's right axis in the root's frame: rotating about it tips the top toward us.
  const { right } = floorBasis(cam);
  const axis = right.applyAxisAngle(new THREE.Vector3(0, 1, 0), -view.root.rotation.y).normalize();
  view.inner.quaternion.setFromAxisAngle(axis, pose.pitch);
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
  private views: [CreatureView | null, CreatureView | null] = [null, null];
  private hero: Figure;
  private foeTrainer: Figure | null = null;
  private figures = new Map<Figure, SpriteSubject>();
  private inScene = postFlags().has('mesh');
  private pxPerTexel = postFlags().has('px2') ? 2 : undefined;
  /** Footprint radius of each side's kin (for staging the people around them). */
  private radius: [number, number] = [0.5, 0.5];
  private heroMove = 0;

  constructor(private game: Game, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, readonly terrain: Hd2dTerrain) {
    this.quality = detectQuality();
    const def = terrain.def;
    this.rig = def.build({ quality: this.quality, ctx: terrain.ctx, trainerBattle: !!terrain.ctx.trainerId });
    scene.add(this.rig.group);
    scene.background = new THREE.Color(def.background);
    scene.fog = def.fog === null ? null : new THREE.Fog(new THREE.Color(def.fog), 18, 42);
    this.spots = [this.rig.spots[0].clone(), this.rig.spots[1].clone()];
    this.pipeline = new Hd2dPipeline(game.renderer.gl, scene, camera, this.quality, def.grade?.());
    this.uninstall = installPipeline(game.renderer, this.pipeline);
    this.baker = new SpriteBaker(scene, camera, this.rig.spriteLight);
    this.pipeline.beforeRender.push((r) => this.baker.bake(r));
    scene.userData.render = () => this.pipeline.render();
    // The player stands behind-left of their kin, seen from the back (placed in frame()).
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

  /** Sprite subjects by name (debug / captures). */
  sprites(): Record<string, SpriteSubject | null> {
    return { mine: this.kin[0], foe: this.kin[1], player: this.figures.get(this.hero) ?? null, trainer: this.foeTrainer ? this.figures.get(this.foeTrainer) ?? null : null };
  }

  private addFigure(f: Figure) {
    this.figures.set(f, this.baker.add(f.mesh, figureSpriteOptions(f, { pxPerTexel: this.pxPerTexel, inScene: this.inScene, lift: 0.05 })));
  }

  /** Yaw for your kin: a side / 3-4 profile facing the foe across the screen. */
  partnerYaw(speciesId?: string): number { return sideYaw(this.camera, partnerTurn(speciesId)); }

  /** Sprite-ify a kin as it is sent out. */
  attachKin(view: CreatureView, side: 0 | 1) {
    this.detachKin(side);
    poseFlatKin(view, this.camera);
    const sub = this.baker.add(view.mesh, kinSpriteOptions(view, { pxPerTexel: this.pxPerTexel, inScene: this.inScene, lift: side === 0 ? 0.1 : 0.04 }));
    if (this.pxPerTexel) sub.opts.texelHeight = undefined;
    // Dark kin get a light rim inside their outline (they would melt into a dark floor).
    sub.setLightRim(view.dark ? 0.35 : 0);
    this.kin[side] = sub;
    this.views[side] = view;
    // The sprite stands on its own pixel contact shadow: the round blob would double it.
    view.shadow.visible = !!this.inScene;
  }

  detachKin(side: 0 | 1) {
    this.baker.remove(this.kin[side]);
    this.kin[side] = null;
    this.views[side] = null;
  }

  /** Normalise a kin's size for the arena (root scale, so the shadow follows); returns its footprint radius. */
  fitKin(view: CreatureView, side: 0 | 1): number {
    const g = view.mesh.geometry;
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const size = Math.max(bb.max.y - bb.min.y, 0.8 * Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z)) * view.baseScale;
    const k = (KIN_SIZE[side] * STAGE_K[stageOf(view.speciesId)]! / size) * Math.pow(size / 1.1, 0.4);
    view.root.scale.setScalar(THREE.MathUtils.clamp(k, 0.5, 1.7));
    const r = kinRadius(view);
    this.radius[side] = r;
    if (side === 0) this.placeHero(true);
    return r;
  }

  /** Where the player stands: behind-left of your kin with clear floor between (screen basis). */
  private heroSpot(): THREE.Vector3 {
    const { right, toward } = floorBasis(this.camera);
    const p = this.spots[0].clone().addScaledVector(right, -(this.radius[0] + 0.6)).addScaledVector(toward, 0.35);
    p.y = this.rig.people[0].y;
    return p;
  }

  /** Move the player to their spot (tweened over 200 ms when the kin changes size). */
  private placeHero(animate: boolean) {
    const m = this.hero.mesh;
    const to = this.heroSpot();
    const id = ++this.heroMove;
    if (!animate || m.position.distanceTo(to) < 0.01) { m.position.copy(to); face(m, this.spots[1]); return; }
    const from = m.position.clone();
    this.hero.walking = true;
    void tween(200, (k) => {
      if (id !== this.heroMove) return;
      m.position.lerpVectors(from, to, ease.inOut(k));
      face(m, this.spots[1]);
    }).then(() => { if (id === this.heroMove) this.hero.walking = false; });
  }

  /** The foe trainer's post: the arena's, pushed back so it clears the foe kin by 0.5. */
  private trainerPost(): THREE.Vector3 {
    const post = this.rig.people[1].clone();
    const d = post.clone().sub(this.spots[1]).setY(0);
    const need = this.radius[1] + 0.5 + 0.25;
    const len = d.length();
    if (len < need) {
      if (len < 1e-3) d.copy(floorBasis(this.camera).toward).negate();
      post.addScaledVector(d.normalize(), need - len);
    }
    return post;
  }

  /** The foe trainer as a figure, starting centre stage on the foe spot. */
  trainer(id: string): THREE.Mesh {
    const f = trainerFigure(id);
    f.mesh.scale.setScalar(PERSON_SCALE);
    f.mesh.position.copy(this.spots[1]);
    this.faceFront(f.mesh);
    this.scene.add(f.mesh);
    this.foeTrainer = f;
    this.addFigure(f);
    return f.mesh;
  }

  /** The foe trainer faces the camera, turned a little toward the player (their face reads). */
  private faceFront(m: THREE.Object3D) {
    const { right, toward } = floorBasis(this.camera);
    const d = toward.multiplyScalar(Math.cos(0.18)).addScaledVector(right, -Math.sin(0.18));
    m.rotation.set(0, Math.atan2(d.x, d.z), 0);
  }

  /** Trainer walks between centre stage (entering) and their post behind the foe kin (leaving). */
  trainerPath(entering: boolean): [THREE.Vector3, THREE.Vector3] {
    const stage = this.spots[1].clone().add(new THREE.Vector3(1.0, 0, 0.35));
    const post = this.trainerPost();
    return entering ? [post, stage] : [stage, post];
  }

  /** The trainer is walking (sprites re-bake every frame meanwhile). */
  setTrainerWalking(on: boolean) { if (this.foeTrainer) this.foeTrainer.walking = on; }

  /** Where your orb is thrown from (the player's hand). */
  throwOrigin(): THREE.Vector3 {
    return this.hero.mesh.position.clone().add(new THREE.Vector3(0.25, 1.1, 0.1));
  }

  /** Elevated 3/4 camera; the image is slid so the kin land on the layout's targets. */
  frame(w: number, h: number) {
    const mode = layoutMode(w, h);
    const c: CameraPreset = { ...HD2D_CAMERA[mode], ...this.terrain.def.camera?.[mode] };
    const cam = this.camera;
    cam.fov = c.fov;
    cam.aspect = w / h;
    cam.near = 0.5; cam.far = 90;
    const dir = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.elev), Math.sin(c.elev), Math.cos(c.yaw) * Math.cos(c.elev));
    const mid = this.spots[0].clone().add(this.spots[1]).multiplyScalar(0.5);
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
    cam.updateMatrixWorld();
    this.baseOffset = [(a[0] + b[0]) / 2 - tx, (a[1] + b[1]) / 2 - ty, w, h];
    const [fogNear, fogFar] = this.terrain.def.fogRange ?? [6, 30];
    if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = dist + fogNear; this.scene.fog.far = dist + fogFar; }
    this.pipeline.setSize();
    // Dust motes: 1 internal px on high (the pixel grid is already chunky), 1.5 on low.
    this.rig.setPixelSize(this.quality === 'high' ? 1 : 1.5);
    // The camera basis may have changed: re-stage the people and re-pose flat kin.
    if (!this.hero.walking) this.placeHero(false);
    if (this.foeTrainer && !this.foeTrainer.walking) this.faceFront(this.foeTrainer.mesh);
    if (this.views[0]) poseFlatKin(this.views[0], cam);
    if (this.views[1]) poseFlatKin(this.views[1], cam);
  }

  private baseOffset: [number, number, number, number] | null = null;

  /**
   * Camera shake in WHOLE internal pixels (a view-offset jitter), so the pixel grid never
   * smears: (dx, dy) in internal px; (0, 0) restores the framing.
   */
  shake(dx: number, dy: number) {
    const o = this.baseOffset;
    if (!o) return;
    const s = o[3] / Math.max(1, this.game.renderer.gl.getDrawingBufferSize(new THREE.Vector2()).y); // CSS px per internal px
    this.camera.setViewOffset(o[2], o[3], o[0] + Math.round(dx) * s, o[1] + Math.round(dy) * s, o[2], o[3]);
    this.camera.updateProjectionMatrix();
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
