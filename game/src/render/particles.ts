// Small CPU particle systems and billboard primitives for move/catch FX. Every system is one
// mesh (one draw call) with a pooled, persistent material, so effects never create GL programs.
import * as THREE from 'three';
import { GEO } from './builder';
import { tween } from './anim';
import { acquireFx, markPersistent, releaseFx, type FxBlend } from './materials';

/**
 * HD-2D render-order contract (`?gfx=hd2d`): sprite billboards draw at renderOrder 7, so normal
 * FX stay at ≤ 6 (under the target sprite) and additive glows/sparks go to ≥ 8 (over it).
 * Default renderer: 2 / 3 as before. (Read from the URL directly: no import of the HD-2D
 * pipeline from this low-level module.)
 */
const HD2D = typeof location !== 'undefined' && new URLSearchParams(location.search).get('gfx') === 'hd2d';
export function fxRenderOrder(blend: FxBlend): number { return blend === 'add' ? (HD2D ? 8 : 3) : 2; }

// ------------------------------------------------------------------ deterministic rng

let seed = 1;
/** Reseed the FX rng (effects look the same every time they play — nicer for screenshots). */
export function fxSeed(s: number) {
  seed = (Math.abs(Math.floor(s)) % 2147483646) + 1;
}
export function rnd(a = 0, b = 1): number {
  seed = (seed * 16807) % 2147483647;
  return a + ((seed - 1) / 2147483646) * (b - a);
}

/** Run `fn(k, dt)` every frame for `ms` (dt in seconds of animation time). */
export function animate(ms: number, fn: (k: number, dt: number) => void): Promise<void> {
  let last = 0;
  return tween(ms, (k) => {
    const dt = Math.max(0, (k - last) * ms) / 1000;
    last = k;
    fn(k, dt);
  });
}

// ------------------------------------------------------------------ shapes

/** Triangle soup positions of a primitive (non-indexed), used as a particle stamp. */
function stamp(geo: THREE.BufferGeometry): Float32Array {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const a = (g.attributes.position!.array as Float32Array).slice();
  if (g !== geo) g.dispose();
  return a;
}
const stamps = new Map<THREE.BufferGeometry, Float32Array>();
function stampOf(geo: THREE.BufferGeometry) {
  let s = stamps.get(geo);
  if (!s) { s = stamp(geo); stamps.set(geo, s); }
  return s;
}

const shapeCache = new Map<string, THREE.BufferGeometry>();
/** A persistent flat shape in the XY plane (for billboards / particle stamps). */
export function flatShape(kind: 'star4' | 'star8' | 'diamond' | 'chevron' | 'plus' | 'zee' | 'ring' | 'disc' | 'crescent' | 'leaf'): THREE.BufferGeometry {
  const hit = shapeCache.get(kind);
  if (hit) return hit;
  const tris: number[] = [];
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => tris.push(ax, ay, 0, bx, by, 0, cx, cy, 0);
  const quad = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => { tri(ax, ay, bx, by, cx, cy); tri(ax, ay, cx, cy, dx, dy); };
  const star = (points: number, inner: number, outerAlt = 1) => {
    for (let i = 0; i < points * 2; i++) {
      const a0 = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
      const a1 = ((i + 1) / (points * 2)) * Math.PI * 2 + Math.PI / 2;
      const r0 = i % 2 ? inner : (i % 4 === 0 ? 1 : outerAlt);
      const r1 = (i + 1) % 2 ? inner : ((i + 1) % 4 === 0 ? 1 : outerAlt);
      tri(0, 0, Math.cos(a0) * r0, Math.sin(a0) * r0, Math.cos(a1) * r1, Math.sin(a1) * r1);
    }
  };
  switch (kind) {
    case 'star4': star(4, 0.22, 1); break;
    case 'star8': star(8, 0.3, 0.6); break;
    case 'diamond': quad(0, 1, -0.55, 0, 0, -1, 0.55, 0); break;
    case 'chevron': quad(-1, -0.2, 0, 0.8, 0, 0.35, -1, -0.65); quad(0, 0.8, 1, -0.2, 1, -0.65, 0, 0.35); break;
    case 'plus': quad(-0.3, -1, 0.3, -1, 0.3, 1, -0.3, 1); quad(-1, -0.3, 1, -0.3, 1, 0.3, -1, 0.3); break;
    case 'zee': quad(-0.8, 1, 0.8, 1, 0.8, 0.62, -0.8, 0.62); quad(0.8, 0.62, 0.3, 0.62, -0.8, -0.62, -0.3, -0.62); quad(-0.8, -0.62, 0.8, -0.62, 0.8, -1, -0.8, -1); break;
    case 'ring':
    case 'disc': {
      const n = 16;
      const r0 = kind === 'ring' ? 0.78 : 0;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        if (r0) quad(Math.cos(a0) * r0, Math.sin(a0) * r0, Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1), Math.cos(a1) * r0, Math.sin(a1) * r0);
        else tri(0, 0, Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1));
      }
      break;
    }
    case 'crescent': {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI * 0.45 + (i / n) * Math.PI * 0.9, a1 = -Math.PI * 0.45 + ((i + 1) / n) * Math.PI * 0.9;
        const w0 = 0.72 + 0.28 * Math.abs(i / n - 0.5) * 2, w1 = 0.72 + 0.28 * Math.abs((i + 1) / n - 0.5) * 2;
        quad(Math.cos(a0) * w0, Math.sin(a0) * w0, Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1), Math.cos(a1) * w1, Math.sin(a1) * w1);
      }
      break;
    }
    case 'leaf': quad(0, 1, -0.45, 0.1, 0, -1, 0.45, 0.1); break;
  }
  const g = markPersistent(new THREE.BufferGeometry());
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris), 3));
  const col = new Float32Array(tris.length).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  shapeCache.set(kind, g);
  return g;
}

// ------------------------------------------------------------------ particles

export interface EmitOpts {
  color: THREE.ColorRepresentation;
  size: number;
  /** Seconds. */
  life: number;
  /** Units/s² along Y (negative falls). */
  gravity?: number;
  /** Fraction of velocity lost per second (0..1). */
  drag?: number;
  /** Radians per second. */
  spin?: number;
  /** End-of-life scale factor (0 shrinks away). */
  end?: number;
  /** Stretch along Y of the stamp. */
  stretch?: number;
}

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; end: number; g: number; drag: number; spin: number; ax: THREE.Vector3; stretch: number; alive: boolean }

const tM = new THREE.Matrix4();
const tQ = new THREE.Quaternion();
const tP = new THREE.Vector3();
const tS = new THREE.Vector3();
const tC = new THREE.Color();
const ID_Q = new THREE.Quaternion();

/** A fixed-capacity CPU particle system drawn as one mesh of little primitives. */
export class Particles {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.MeshBasicMaterial;
  private ps: P[] = [];
  private shape: Float32Array;
  private nv: number;
  private pos: Float32Array;
  private col: Float32Array;
  private next = 0;
  private billboard: boolean;

  constructor(readonly scene: THREE.Scene, readonly capacity: number, shape: THREE.BufferGeometry = GEO.oct, blend: FxBlend = 'normal', opts: { billboard?: boolean } = {}) {
    this.shape = stampOf(shape);
    this.nv = this.shape.length / 3;
    this.pos = new Float32Array(capacity * this.nv * 3);
    this.col = new Float32Array(capacity * this.nv * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = acquireFx(blend);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = fxRenderOrder(blend);
    this.mesh.userData.fx = true;
    this.billboard = !!opts.billboard;
    if (this.billboard) {
      // Face the camera: stamps are written in camera space orientation each frame.
      this.mesh.onBeforeRender = (_r, _s, cam) => { this.camQ.copy(cam.quaternion); };
    }
    scene.add(this.mesh);
  }

  private camQ = new THREE.Quaternion();

  emit(p: THREE.Vector3, v: THREE.Vector3, o: EmitOpts) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    const ax = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1));
    if (ax.lengthSq() < 1e-4) ax.set(0, 1, 0);
    ax.normalize();
    this.ps[i] = {
      x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, age: 0, life: o.life, size: o.size, end: o.end ?? 0,
      g: o.gravity ?? 0, drag: o.drag ?? 0, spin: o.spin ?? 0, ax, stretch: o.stretch ?? 1, alive: true,
    };
    tC.set(o.color);
    const base = i * this.nv * 3;
    for (let k = 0; k < this.nv; k++) {
      this.col[base + k * 3] = tC.r;
      this.col[base + k * 3 + 1] = tC.g;
      this.col[base + k * 3 + 2] = tC.b;
    }
    this.mesh.geometry.attributes.color!.needsUpdate = true;
  }

  /** Emit `n` particles from `at` in random directions (biased by `dir`, spread 0..1). */
  spray(n: number, at: THREE.Vector3, speed: [number, number], o: EmitOpts & { dir?: THREE.Vector3; spread?: number; radius?: number; colors?: THREE.ColorRepresentation[]; sizeJitter?: number }) {
    const dir = o.dir ?? new THREE.Vector3(0, 0, 0);
    const spread = o.spread ?? 1;
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1));
      if (d.lengthSq() < 1e-3) d.set(0, 1, 0);
      d.normalize().multiplyScalar(spread).add(dir);
      if (d.lengthSq() < 1e-3) d.set(0, 1, 0);
      d.normalize();
      const start = at.clone().addScaledVector(d, o.radius ?? 0);
      const v = d.multiplyScalar(rnd(speed[0], speed[1]));
      const color = o.colors ? o.colors[i % o.colors.length]! : o.color;
      this.emit(start, v, { ...o, color, size: o.size * (1 + rnd(-1, 1) * (o.sizeJitter ?? 0.3)), life: o.life * rnd(0.75, 1.15) });
    }
  }

  /** Move a live particle directly (for scripted motion such as orbits). */
  place(i: number, x: number, y: number, z: number) {
    const p = this.ps[i];
    if (p) { p.x = x; p.y = y; p.z = z; p.vx = p.vy = p.vz = 0; }
  }

  alive(): number {
    let n = 0;
    for (const p of this.ps) if (p?.alive) n++;
    return n;
  }

  step(dt: number) {
    const s = this.shape;
    const nv = this.nv;
    for (let i = 0; i < this.capacity; i++) {
      const p = this.ps[i];
      const base = i * nv * 3;
      if (!p || !p.alive) { if (p) this.pos.fill(0, base, base + nv * 3); continue; }
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; this.pos.fill(0, base, base + nv * 3); continue; }
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vx *= damp; p.vy = p.vy * damp + p.g * dt; p.vz *= damp;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.age / p.life;
      const sc = p.size * (1 + (p.end - 1) * k);
      if (this.billboard) tQ.copy(this.camQ);
      else if (p.spin) tQ.setFromAxisAngle(p.ax, p.spin * p.age);
      else tQ.copy(ID_Q);
      tM.compose(tP.set(p.x, p.y, p.z), tQ, tS.set(sc, sc * p.stretch, sc));
      const e = tM.elements;
      for (let v = 0; v < nv * 3; v += 3) {
        const x = s[v]!, y = s[v + 1]!, z = s[v + 2]!;
        this.pos[base + v] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
        this.pos[base + v + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
        this.pos[base + v + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
      }
    }
    this.mesh.geometry.attributes.position!.needsUpdate = true;
  }

  /** Step until every particle has died (or `maxMs` passed), then remove and release. */
  async run(maxMs = 1500, fade = 0) {
    await animate(maxMs, (k, dt) => {
      this.step(dt);
      if (fade) this.mat.opacity = k < 1 - fade ? 1 : (1 - k) / fade;
    });
    this.dispose();
  }

  dispose() {
    if (!this.mesh.parent) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    releaseFx(this.mat);
  }
}

// ------------------------------------------------------------------ billboards & meshes

/** Add a mesh with a pooled FX material; `done()` removes it and returns the material. */
export function fxMesh(scene: THREE.Scene, geo: THREE.BufferGeometry, blend: FxBlend = 'normal', tint?: THREE.ColorRepresentation) {
  const mat = acquireFx(blend);
  if (tint !== undefined) mat.color.set(tint);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = fxRenderOrder(blend);
  mesh.userData.fx = true;
  scene.add(mesh);
  return {
    mesh, mat,
    done() {
      if (!mesh.parent) return;
      scene.remove(mesh);
      geo.dispose(); // no-op for persistent/cached shapes
      releaseFx(mat);
    },
  };
}

/** Make a mesh face the camera every frame. */
export function faceCamera(mesh: THREE.Object3D, roll = 0) {
  const q = new THREE.Quaternion();
  const z = new THREE.Vector3(0, 0, 1);
  mesh.onBeforeRender = (_r, _s, cam) => {
    mesh.quaternion.copy(cam.quaternion);
    if (roll) mesh.quaternion.multiply(q.setFromAxisAngle(z, roll + (mesh.userData.roll as number ?? 0)));
    else if (mesh.userData.roll) mesh.quaternion.multiply(q.setFromAxisAngle(z, mesh.userData.roll as number));
    mesh.updateMatrixWorld();
  };
}

/** A camera-facing flash (star/ring/disc) that pops and fades. */
export async function flash(scene: THREE.Scene, at: THREE.Vector3, color: THREE.ColorRepresentation, size: number, ms = 260, kind: Parameters<typeof flatShape>[0] = 'star8', blend: FxBlend = 'add', spin = 0.6) {
  const f = fxMesh(scene, flatShape(kind), blend, color);
  f.mesh.position.copy(at);
  faceCamera(f.mesh);
  await tween(ms, (k) => {
    const s = size * (k < 0.25 ? 0.4 + (k / 0.25) * 0.6 : 1 + (k - 0.25) * 0.25);
    f.mesh.scale.set(s, s, s);
    f.mesh.userData.roll = k * spin;
    f.mat.opacity = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6;
  });
  f.done();
}

/** A flat ring lying on the ground that expands and fades (shockwave / ripple). */
export async function groundRing(scene: THREE.Scene, at: THREE.Vector3, color: THREE.ColorRepresentation, radius: number, ms = 380, blend: FxBlend = 'normal', delay = 0) {
  if (delay) await tween(delay, () => {});
  const f = fxMesh(scene, flatShape('ring'), blend, color);
  f.mesh.position.copy(at);
  f.mesh.rotation.x = -Math.PI / 2;
  await tween(ms, (k) => {
    const s = radius * (0.25 + 0.75 * (1 - (1 - k) ** 2));
    f.mesh.scale.set(s, s, s);
    f.mat.opacity = 1 - k * k;
  });
  f.done();
}
