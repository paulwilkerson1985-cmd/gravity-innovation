// HD-2D staging for the Arena (PvP) scenes behind `?gfx=hd2d`: the stadium set, the post
// pipeline, sprite-ified kin, and BOTH hotseat/online players as figures — each stands behind
// their own kin (the near seat seen from the back, bottom-left; the far seat behind the foe,
// upper-right). `setNear(seat)` swaps everything for the hotseat per-seat perspective.
// The arena scenes keep all their flow and UI; they only branch on this stage.
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { CreatureView } from '../render/creature';
import { Hd2dPipeline, detectQuality, installPipeline, type Quality } from '../render/hd2d/pipeline';
import { SpriteBaker, type SpriteSubject } from '../render/hd2d/sprite';
import { Figure, HERO_LOOK } from '../render/hd2d/characters';
import { buildStadiumArena, stadiumGrade, type StadiumRig } from '../render/hd2d/arenas/stadium';
import type { PersonLook } from '../render/trainer';
import { layoutMode } from './framing';
import type { Seat } from './arenaFlow';

/** Per-layout camera (same language as the adventure stage). */
const CAMERA = {
  wide: { elev: 0.6, yaw: -0.06, fov: 32, person: 0.15, mine: [0.38, 0.7], foe: [0.6, 0.53] },
  portrait: { elev: 0.7, yaw: -0.4, fov: 34, person: 0.14, mine: [0.4, 0.525], foe: [0.62, 0.34] },
  land: { elev: 0.7, yaw: -0.08, fov: 30, person: 0.18, mine: [0.3, 0.68], foe: [0.52, 0.44] },
} as const;

const KIN_SIZE = [1.3, 1.2] as const;
const PERSON_SCALE = 1.55;

/** Two distinct, original player outfits in the seat colours. */
export function seatLook(seat: Seat, color: string, dark: string): PersonLook {
  return seat === 0
    ? { ...HERO_LOOK, top: color, accent: dark, hatColor: '#ffffff', hat: 'cap', prop: 'pack' }
    : { ...HERO_LOOK, skin: '#e8b48a', hair: '#2a1d1a', top: color, accent: dark, bottom: '#2a2d44', hat: 'beanie', hatColor: '#ffcf3f', prop: 'scarf' };
}

function contactShadow(target: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.32, 14), new THREE.MeshBasicMaterial({ color: 0x0d0a18, transparent: true, opacity: 0.38, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -0.5;
  m.onBeforeRender = () => { m.position.set(target.position.x, target.position.y + 0.015, target.position.z); m.updateMatrixWorld(); };
  m.frustumCulled = false;
  return m;
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
      this.placeFigures();
    }
    (window as unknown as { __hd2d?: unknown }).__hd2d = this;
  }

  /** Add a figure (e.g. the winner on the podium) as a sprite. */
  addFigure(f: Figure) {
    this.baker.add(f.mesh, { rig: f.uniforms, lift: 0.05 });
    if (this.pipeline.settings.staticShadows) { f.mesh.castShadow = false; this.scene.add(contactShadow(f.mesh)); }
    if (!this.figures.includes(f)) this.extra.push(f);
  }

  private placeFigures() {
    if (!this.figures.length) return;
    const other = (this.near === 0 ? 1 : 0) as Seat;
    const n = this.figures[this.near]!, fr = this.figures[other]!;
    n.mesh.position.copy(this.rig.people[0]);
    face(n.mesh, this.spots[1]);
    fr.mesh.position.copy(this.rig.people[1]);
    face(fr.mesh, this.rig.people[0].clone().add(new THREE.Vector3(0, 0, 1)));
  }

  /** Hotseat perspective: `seat` comes to the front (its kin, ring colour and player). */
  setNear(seat: Seat) {
    this.near = seat;
    const other = (seat === 0 ? 1 : 0) as Seat;
    this.rig.setColors(this.opts.colors[seat], this.opts.colors[other]);
    this.placeFigures();
  }

  figureMesh(seat: Seat): THREE.Mesh | null { return this.figures[seat]?.mesh ?? null; }

  attachKin(view: CreatureView, near: boolean) {
    this.detachKin(view);
    this.kin.set(view, this.baker.add(view.mesh, { rig: view.uniforms, emissiveFrom: view.material, lift: near ? 0.1 : 0.04 }));
    if (this.pipeline.settings.staticShadows) view.mesh.castShadow = false;
    else (view.shadow.material as THREE.MeshBasicMaterial).opacity *= 0.7;
  }

  detachKin(view: CreatureView) {
    const s = this.kin.get(view);
    if (s) { this.baker.remove(s); this.kin.delete(view); }
  }

  /** Normalise a kin's size for the arena (root scale). */
  fitKin(view: CreatureView, near: boolean, k0 = 1) {
    const g = view.mesh.geometry;
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const size = Math.max(bb.max.y - bb.min.y, 0.8 * Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z)) * view.baseScale;
    const k = (KIN_SIZE[near ? 0 : 1] / size) * Math.pow(size / 1.1, 0.5) * k0;
    view.root.scale.setScalar(THREE.MathUtils.clamp(k, 0.55, 1.7));
  }

  /** Elevated 3/4 battle camera; the image slides so the kin land on the layout targets. */
  frame(w: number, h: number) {
    const c = CAMERA[layoutMode(w, h)];
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
    this.afterFrame(dist);
  }

  /** Call after a scene placed the camera itself (victory podium framing). */
  afterFrame(dist: number) {
    if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = dist + 14; this.scene.fog.far = dist + 50; }
    this.pipeline.setSize();
    this.rig.setPixelSize(this.quality === 'high' ? 2 : 1.5);
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
