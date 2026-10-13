// HD-2D staging for the Arena (PvP) scenes behind `?gfx=hd2d`: the stadium set, the post
// pipeline, sprite-ified kin, and BOTH hotseat/online players as figures — each stands behind
// their own kin (the near seat behind-left of its kin, seen from the back; the far seat one
// step behind the far kin). `setNear(seat)` swaps everything for the hotseat per-seat
// perspective. Same sprite staging rules as the adventure stage (scenes/hd2dBattle.ts): the
// near kin in a side / 3-4 profile facing across the screen, clear floor between each player
// and their kin, sprites baked from a near-side view with a fixed texel density.
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { CreatureView } from '../render/creature';
import { tween, ease } from '../render/anim';
import { Hd2dPipeline, detectQuality, installPipeline, type Quality } from '../render/hd2d/pipeline';
import { SpriteBaker, type SpriteSubject } from '../render/hd2d/sprite';
import { Figure, HERO_LOOK } from '../render/hd2d/characters';
import { buildStadiumArena, stadiumGrade, type StadiumRig } from '../render/hd2d/arenas/stadium';
import type { PersonLook } from '../render/trainer';
import { layoutMode } from './framing';
import type { Seat } from './arenaFlow';
import { HD2D_CAMERA, KIN_SIZE, PERSON_SCALE, figureSpriteOptions, floorBasis, kinSpriteOptions, partnerTurn, poseFlatKin, sideYaw, stageOf } from './hd2dBattle';

const STAGE_K = [1, 1, 1.07, 1.15] as const;

/** Two distinct, original player outfits in the seat colours. */
export function seatLook(seat: Seat, color: string, dark: string): PersonLook {
  return seat === 0
    ? { ...HERO_LOOK, top: color, accent: dark, hatColor: '#ffffff', hat: 'cap', prop: 'pack' }
    : { ...HERO_LOOK, skin: '#e8b48a', hair: '#2a1d1a', top: color, accent: dark, bottom: '#2a2d44', hat: 'beanie', hatColor: '#ffcf3f', prop: 'scarf' };
}

function face(o: THREE.Object3D, target: THREE.Vector3) {
  o.rotation.set(0, Math.atan2(target.x - o.position.x, target.z - o.position.z), 0);
}

export class Hd2dArenaStage {
  readonly quality: Quality;
  readonly rig: StadiumRig;
  readonly pipeline: Hd2dPipeline;
  readonly baker: SpriteBaker;
  readonly spots: readonly [THREE.Vector3, THREE.Vector3];
  private uninstall: () => void;
  private kin = new Map<CreatureView, SpriteSubject>();
  /** Player figures by seat (empty on the victory podium). */
  readonly figures: Figure[] = [];
  private near: Seat;
  private extra: Figure[] = [];
  /** Footprint radius of the kin on each SPOT (0 = near spot, 1 = far spot). */
  private radius: [number, number] = [0.5, 0.5];
  private moveId = 0;

  constructor(private game: Game, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private opts: { near: Seat; colors: readonly [string, string]; darks: readonly [string, string]; players?: boolean }) {
    this.quality = detectQuality();
    this.near = opts.near;
    const other = (opts.near === 0 ? 1 : 0) as Seat;
    this.rig = buildStadiumArena({ quality: this.quality, colors: [opts.colors[opts.near], opts.colors[other]] });
    scene.add(this.rig.group);
    scene.background = new THREE.Color('#0c0a22');
    scene.fog = new THREE.Fog(new THREE.Color('#241a40'), 30, 60);
    this.spots = [this.rig.spots[0].clone(), this.rig.spots[1].clone()];
    this.pipeline = new Hd2dPipeline(game.renderer.gl, scene, camera, this.quality, stadiumGrade());
    this.uninstall = installPipeline(game.renderer, this.pipeline);
    this.baker = new SpriteBaker(scene, camera, this.rig.spriteLight);
    this.pipeline.beforeRender.push((r) => this.baker.bake(r));
    scene.userData.render = () => this.pipeline.render();
    if (opts.players !== false) {
      for (const seat of [0, 1] as const) {
        const f = new Figure(seatLook(seat, opts.colors[seat], opts.darks[seat]), seat + 1);
        f.mesh.scale.setScalar(PERSON_SCALE);
        scene.add(f.mesh);
        this.addFigure(f);
        this.figures.push(f);
      }
      this.placeFigures(false);
    }
    (window as unknown as { __hd2d?: unknown }).__hd2d = this;
  }

  /** Add a figure (e.g. the winner on the podium) as a sprite. */
  addFigure(f: Figure) {
    this.baker.add(f.mesh, figureSpriteOptions(f, { lift: 0.05 }));
    if (!this.figures.includes(f)) this.extra.push(f);
  }

  /** Near player: behind-left of the near kin with clear floor; far player: behind the far kin. */
  private posts(): [THREE.Vector3, THREE.Vector3] {
    const { right, toward } = floorBasis(this.camera);
    const nearPost = this.spots[0].clone().addScaledVector(right, -(this.radius[0] + 0.6)).addScaledVector(toward, 0.35);
    nearPost.y = this.rig.people[0].y;
    const farPost = this.rig.people[1].clone();
    const d = farPost.clone().sub(this.spots[1]).setY(0);
    const need = this.radius[1] + 0.75;
    if (d.length() < need) farPost.addScaledVector(d.lengthSq() > 1e-6 ? d.normalize() : toward.clone().negate(), need - d.length());
    return [nearPost, farPost];
  }

  private placeFigures(animate: boolean) {
    if (!this.figures.length) return;
    const other = (this.near === 0 ? 1 : 0) as Seat;
    const n = this.figures[this.near]!, fr = this.figures[other]!;
    const [np, fp] = this.posts();
    const id = ++this.moveId;
    const look = () => {
      face(n.mesh, this.spots[1]);
      // The far player faces the camera, turned a little toward the near side (face reads).
      const { right, toward } = floorBasis(this.camera);
      const d = toward.multiplyScalar(Math.cos(0.18)).addScaledVector(right, -Math.sin(0.18));
      fr.mesh.rotation.set(0, Math.atan2(d.x, d.z), 0);
    };
    if (!animate) { n.mesh.position.copy(np); fr.mesh.position.copy(fp); look(); return; }
    const a0 = n.mesh.position.clone(), b0 = fr.mesh.position.clone();
    n.walking = fr.walking = true;
    void tween(200, (k) => {
      if (id !== this.moveId) return;
      const e = ease.inOut(k);
      n.mesh.position.lerpVectors(a0, np, e);
      fr.mesh.position.lerpVectors(b0, fp, e);
      look();
    }).then(() => { if (id === this.moveId) n.walking = fr.walking = false; });
  }

  /** Hotseat perspective: `seat` comes to the front (its kin, ring colour and player). */
  setNear(seat: Seat) {
    this.near = seat;
    const other = (seat === 0 ? 1 : 0) as Seat;
    this.rig.setColors(this.opts.colors[seat], this.opts.colors[other]);
    this.placeFigures(false);
  }

  figureMesh(seat: Seat): THREE.Mesh | null { return this.figures[seat]?.mesh ?? null; }

  /** Yaw for the near kin: a side / 3-4 profile facing the far kin across the screen. */
  partnerYaw(speciesId?: string): number { return sideYaw(this.camera, partnerTurn(speciesId)); }

  attachKin(view: CreatureView, near: boolean) {
    this.detachKin(view);
    poseFlatKin(view, this.camera);
    const sub = this.baker.add(view.mesh, kinSpriteOptions(view, { lift: near ? 0.1 : 0.04 }));
    sub.setLightRim(view.dark ? 0.35 : 0);
    this.kin.set(view, sub);
    view.shadow.visible = false; // the sprite's own pixel contact shadow replaces the blob
  }

  detachKin(view: CreatureView) {
    const s = this.kin.get(view);
    if (s) { this.baker.remove(s); this.kin.delete(view); }
  }

  /** Normalise a kin's size for the arena (root scale); returns its footprint radius. */
  fitKin(view: CreatureView, near: boolean, k0 = 1): number {
    const g = view.mesh.geometry;
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const size = Math.max(bb.max.y - bb.min.y, 0.8 * Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z)) * view.baseScale;
    const k = (KIN_SIZE[near ? 0 : 1] * STAGE_K[stageOf(view.speciesId)]! / size) * Math.pow(size / 1.1, 0.4) * k0;
    view.root.scale.setScalar(THREE.MathUtils.clamp(k, 0.5, 1.7));
    const r = 0.5 * Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * view.baseScale * view.root.scale.x;
    this.radius[near ? 0 : 1] = r;
    this.placeFigures(true);
    return r;
  }

  /** Elevated 3/4 battle camera; the image slides so the kin land on the layout targets. */
  frame(w: number, h: number) {
    const c = HD2D_CAMERA[layoutMode(w, h)];
    const cam = this.camera;
    cam.fov = c.fov; cam.aspect = w / h; cam.near = 0.5; cam.far = 120;
    const dir = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.elev), Math.sin(c.elev), Math.cos(c.yaw) * Math.cos(c.elev));
    const mid = this.spots[0].clone().add(this.spots[1]).multiplyScalar(0.5);
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
    if (!this.figures.some((f) => f.walking)) this.placeFigures(false);
    for (const v of this.kin.keys()) poseFlatKin(v, cam);
    this.afterFrame(dist);
  }

  /** Call after a scene placed the camera itself (victory podium framing). */
  afterFrame(dist: number) {
    if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = dist + 14; this.scene.fog.far = dist + 50; }
    this.pipeline.setSize();
    this.rig.setPixelSize(this.quality === 'high' ? 1 : 1.5);
  }

  update(t: number) {
    this.rig.update(t);
    for (const f of this.figures) f.update(t);
    for (const f of this.extra) f.update(t);
  }

  /** ArenaSet-compatible facade for the arena scenes. */
  get set() {
    return { update: (t: number) => this.update(t), cheer: (s?: number) => this.rig.cheer(s), platforms: this.rig.pads };
  }

  perf() { return this.pipeline.stats(); }

  dispose() {
    this.baker.dispose();
    for (const f of [...this.figures, ...this.extra]) f.dispose();
    this.rig.dispose();
    delete this.scene.userData.render;
    this.uninstall();
  }
}
