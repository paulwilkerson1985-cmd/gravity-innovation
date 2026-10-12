// Procedural, part-based low-poly creature generator driven by SpeciesData.look.
// Every creature is built facing +Z, feet on y = 0, merged into one mesh.
import * as THREE from 'three';
import { GEO, MeshBuilder } from './builder';
import { ease, tween } from './anim';
import type { LookData, PartKind } from '../engine/types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const LEAF = '#6fdc4c';
const EYE_WHITE = '#ffffff';
const EYE_DARK = '#1b1b2a';
const FLAME_HOT = '#ff8a1e';

interface Anchors { head: THREE.Vector3; r: number; tail: THREE.Vector3; back: THREE.Vector3; side: number; neck: THREE.Vector3 }

function shade(hex: string, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

function buildBody(b: MeshBuilder, look: LookData): Anchors {
  const { main, belly } = look.colors;
  const dark = shade(main, 0.75);
  switch (look.body) {
    case 'quad': {
      b.add(GEO.ball, main, { p: [0, 0.55, 0], s: [0.42, 0.38, 0.55] });
      b.add(GEO.ball, belly, { p: [0, 0.47, 0.1], s: [0.33, 0.27, 0.45] });
      for (const x of [-0.22, 0.22]) for (const z of [-0.28, 0.28]) b.add(GEO.cyl, dark, { p: [x, 0.17, z], s: [0.09, 0.34, 0.09] });
      b.add(GEO.ball, main, { p: [0, 0.92, 0.46], s: 0.32 });
      b.add(GEO.ball, belly, { p: [0, 0.83, 0.74], s: [0.16, 0.12, 0.13] });
      b.add(GEO.oct, EYE_DARK, { p: [0, 0.87, 0.87], s: 0.045 });
      return { head: V(0, 0.92, 0.46), r: 0.32, tail: V(0, 0.65, -0.5), back: V(0, 0.9, -0.05), side: 0.42, neck: V(0, 0.8, 0.33) };
    }
    case 'blob': {
      b.add(GEO.ball, main, { p: [0, 0.5, 0], s: [0.56, 0.5, 0.5] });
      b.add(GEO.ball, belly, { p: [0, 0.4, 0.2], s: [0.4, 0.33, 0.34] });
      for (const x of [-0.26, 0.26]) b.add(GEO.ball, dark, { p: [x, 0.06, 0.16], s: [0.15, 0.08, 0.17] });
      return { head: V(0, 0.52, 0), r: 0.5, tail: V(0, 0.42, -0.46), back: V(0, 0.9, -0.12), side: 0.55, neck: V(0, 0.5, 0) };
    }
    case 'biped': {
      for (const x of [-0.2, 0.2]) b.add(GEO.cyl, dark, { p: [x, 0.2, 0], s: [0.13, 0.4, 0.13] });
      b.add(GEO.ball, main, { p: [0, 0.75, 0], s: [0.44, 0.48, 0.37] });
      b.add(GEO.ball, belly, { p: [0, 0.7, 0.13], s: [0.33, 0.37, 0.28] });
      b.add(GEO.ball, main, { p: [0, 1.33, 0.05], s: 0.3 });
      b.add(GEO.ball, belly, { p: [0, 1.25, 0.3], s: [0.15, 0.1, 0.1] });
      return { head: V(0, 1.33, 0.05), r: 0.3, tail: V(0, 0.55, -0.33), back: V(0, 1.02, -0.27), side: 0.44, neck: V(0, 1.1, 0) };
    }
    case 'bird': {
      b.add(GEO.ball, main, { p: [0, 0.55, 0], s: [0.42, 0.42, 0.45] });
      b.add(GEO.ball, belly, { p: [0, 0.5, 0.16], s: [0.32, 0.32, 0.32] });
      b.add(GEO.ball, main, { p: [0, 0.98, 0.12], s: 0.28 });
      b.along(GEO.cone4, look.colors.accent, V(0, 0.94, 0.36), V(0, -0.2, 1), 0.22, 0.09);
      for (const x of [-0.13, 0.13]) b.add(GEO.cyl, look.colors.accent, { p: [x, 0.1, 0.05], s: [0.04, 0.22, 0.04] });
      return { head: V(0, 0.98, 0.12), r: 0.28, tail: V(0, 0.55, -0.42), back: V(0, 0.8, -0.1), side: 0.42, neck: V(0, 0.82, 0.08) };
    }
    case 'fish': {
      b.add(GEO.ball, main, { p: [0, 0.72, 0], s: [0.36, 0.38, 0.64] });
      b.add(GEO.ball, belly, { p: [0, 0.62, 0.06], s: [0.3, 0.26, 0.54] });
      return { head: V(0, 0.76, 0.34), r: 0.3, tail: V(0, 0.72, -0.6), back: V(0, 1.05, 0), side: 0.36, neck: V(0, 0.72, 0.2) };
    }
    case 'bug': {
      b.add(GEO.ball, main, { p: [0, 0.55, -0.33], s: [0.32, 0.3, 0.42] });
      for (let i = 0; i < 3; i++) b.add(GEO.ball, look.colors.accent, { p: [0, 0.56, -0.2 - i * 0.16], s: [0.33, 0.06, 0.07] });
      b.add(GEO.ball, belly, { p: [0, 0.6, 0.1], s: 0.26 });
      b.add(GEO.ball, main, { p: [0, 0.76, 0.38], s: 0.24 });
      for (const sx of [-1, 1]) for (const z of [-0.05, 0.2]) b.along(GEO.cyl, shade(main, 0.6), V(sx * 0.15, 0.55, z), V(sx, -1.1, 0.15), 0.5, 0.035);
      return { head: V(0, 0.76, 0.38), r: 0.24, tail: V(0, 0.55, -0.74), back: V(0, 0.84, 0), side: 0.3, neck: V(0, 0.68, 0.25) };
    }
    case 'serpent': {
      const segs: [number, number, number, number][] = [[0.34, 0.16, -0.5, 0.19], [-0.12, 0.22, -0.42, 0.24], [-0.3, 0.3, -0.02, 0.27], [0.02, 0.42, 0.2, 0.28], [0.06, 0.78, 0.3, 0.25]];
      for (const [x, y, z, r] of segs) {
        b.add(GEO.ball, main, { p: [x, y, z], s: r });
        b.add(GEO.ball, belly, { p: [x, y - r * 0.15, z + r * 0.45], s: [r * 0.75, r * 0.7, r * 0.6] });
      }
      b.add(GEO.ball, main, { p: [0, 1.15, 0.36], s: [0.3, 0.27, 0.34] });
      b.add(GEO.ball, belly, { p: [0, 1.06, 0.6], s: [0.18, 0.1, 0.14] });
      return { head: V(0, 1.15, 0.36), r: 0.3, tail: V(0.5, 0.18, -0.62), back: V(-0.2, 0.55, -0.1), side: 0.3, neck: V(0, 0.95, 0.32) };
    }
  }
}

function addEyes(b: MeshBuilder, a: Anchors) {
  const { head: h, r } = a;
  for (const sx of [-1, 1]) {
    const p = V(h.x + sx * r * 0.42, h.y + r * 0.22, h.z + r * 0.82);
    b.add(GEO.ball, EYE_WHITE, { p: [p.x, p.y, p.z], s: r * 0.24 });
    b.add(GEO.ball, EYE_DARK, { p: [p.x + sx * r * 0.02, p.y - r * 0.02, p.z + r * 0.12], s: r * 0.16 });
    b.add(GEO.oct, EYE_WHITE, { p: [p.x + sx * r * 0.05, p.y + r * 0.06, p.z + r * 0.25], s: r * 0.05 });
  }
}

function flameCluster(b: MeshBuilder, at: THREE.Vector3, size: number, accent: string) {
  b.along(GEO.cone5, FLAME_HOT, at, V(0, 1, -0.2), size * 1.1, size * 0.45);
  b.along(GEO.cone5, accent, at.clone().add(V(0, 0.02, 0.05)), V(0, 1, 0), size * 0.75, size * 0.3);
  for (const sx of [-1, 1]) b.along(GEO.cone4, FLAME_HOT, at.clone().add(V(sx * size * 0.25, 0, 0)), V(sx * 0.5, 1, -0.2), size * 0.6, size * 0.2);
}

function tailDir(): THREE.Vector3 { return V(0, 0.6, -1); }

function addPart(b: MeshBuilder, kind: PartKind, a: Anchors, look: LookData) {
  const { main, belly, accent } = look.colors;
  const { head: h, r } = a;
  switch (kind) {
    case 'ears':
      for (const sx of [-1, 1]) {
        b.along(GEO.cone5, main, V(h.x + sx * r * 0.5, h.y + r * 0.7, h.z - r * 0.1), V(sx * 0.5, 1, -0.1), r * 0.7, r * 0.28, 0.6);
        b.along(GEO.cone5, belly, V(h.x + sx * r * 0.5, h.y + r * 0.72, h.z - r * 0.02), V(sx * 0.5, 1, -0.1), r * 0.5, r * 0.16, 0.5);
      }
      break;
    case 'pointyEars':
      for (const sx of [-1, 1]) {
        b.along(GEO.cone4, main, V(h.x + sx * r * 0.45, h.y + r * 0.7, h.z - r * 0.1), V(sx * 0.35, 1, -0.05), r * 1.0, r * 0.3, 0.55);
        b.along(GEO.cone4, accent, V(h.x + sx * r * 0.45, h.y + r * 0.74, h.z - r * 0.02), V(sx * 0.35, 1, -0.05), r * 0.7, r * 0.17, 0.5);
      }
      break;
    case 'horns':
      for (const sx of [-1, 1]) b.along(GEO.cone5, accent, V(h.x + sx * r * 0.42, h.y + r * 0.75, h.z), V(sx * 0.7, 1, -0.4), r * 0.85, r * 0.15);
      break;
    case 'horn':
      b.along(GEO.cone5, accent, V(h.x, h.y + r * 0.8, h.z + r * 0.35), V(0, 1, 0.5), r * 0.95, r * 0.16);
      break;
    case 'crest':
      for (let i = 0; i < 3; i++) b.along(GEO.cone4, accent, V(h.x, h.y + r * 0.8, h.z + r * (0.2 - i * 0.3)), V(0, 1, -0.4 - i * 0.5), r * (0.85 - i * 0.18), r * 0.15, 0.4);
      break;
    case 'leaf': {
      const top = V(h.x, h.y + r * 0.92, h.z);
      b.along(GEO.cyl, '#3c7a2a', top, V(0, 1, 0), r * 0.35, r * 0.04);
      for (const sx of [-1, 1]) b.add(GEO.oct, sx < 0 ? LEAF : accent === belly ? LEAF : shade(LEAF, 0.85), { p: [h.x + sx * r * 0.22, top.y + r * 0.38, h.z], r: [0, 0, sx * 0.4], s: [r * 0.3, r * 0.06, r * 0.16] });
      break;
    }
    case 'antennae':
      for (const sx of [-1, 1]) {
        const from = V(h.x + sx * r * 0.3, h.y + r * 0.75, h.z + r * 0.2);
        const dir = V(sx * 0.4, 1, 0.5);
        b.along(GEO.cyl, shade(main, 0.5), from, dir, r * 1.1, r * 0.04);
        const tip = from.clone().addScaledVector(dir.normalize(), r * 1.1);
        b.add(GEO.ball, accent, { p: [tip.x, tip.y, tip.z], s: r * 0.14 });
      }
      break;
    case 'whiskers':
      for (const sx of [-1, 1]) for (const dy of [0, -0.12]) b.along(GEO.cyl, accent, V(h.x + sx * r * 0.5, h.y + dy * r, h.z + r * 0.6), V(sx, 0.1 - dy, 0.3), r * 1.0, r * 0.03);
      break;
    case 'tusks':
      for (const sx of [-1, 1]) b.along(GEO.cone5, '#fff6dc', V(h.x + sx * r * 0.32, h.y - r * 0.3, h.z + r * 0.75), V(sx * 0.2, 0.6, 1), r * 0.7, r * 0.11);
      break;
    case 'mane': {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const dir = V(Math.cos(ang), Math.sin(ang) * 0.9 + 0.25, -0.35);
        b.along(GEO.cone4, i % 2 ? accent : FLAME_HOT, a.neck.clone().add(V(0, 0, -0.02)), dir, r * 0.95, r * 0.22);
      }
      break;
    }
    case 'flame':
      flameCluster(b, V(h.x, h.y + r * 0.8, h.z - r * 0.15), r * 0.9, accent);
      break;
    case 'tail':
      b.along(GEO.cone5, main, a.tail, tailDir(), 0.75, 0.12);
      b.along(GEO.cone4, accent, a.tail.clone().add(V(0, 0.38, -0.6)), V(0, 0.5, -1), 0.35, 0.1, 0.4);
      break;
    case 'flameTail': {
      b.along(GEO.cone5, main, a.tail, tailDir(), 0.5, 0.11);
      const tip = a.tail.clone().addScaledVector(tailDir().normalize(), 0.45);
      flameCluster(b, tip, 0.32 * look.scale ** 0.3, accent);
      break;
    }
    case 'leafTail': {
      b.along(GEO.cyl, main, a.tail, tailDir(), 0.4, 0.06);
      const tip = a.tail.clone().addScaledVector(tailDir().normalize(), 0.42);
      b.add(GEO.oct, LEAF, { p: [tip.x, tip.y + 0.08, tip.z - 0.1], r: [0.8, 0, 0], s: [0.16, 0.3, 0.05] });
      b.add(GEO.oct, accent, { p: [tip.x, tip.y + 0.1, tip.z - 0.06], s: 0.06 });
      break;
    }
    case 'finTail':
      b.add(GEO.cone4, accent, { p: [a.tail.x, a.tail.y + 0.1, a.tail.z - 0.12], r: [-1.0, 0, 0], s: [0.05, 0.42, 0.34] });
      b.add(GEO.cone4, accent, { p: [a.tail.x, a.tail.y - 0.08, a.tail.z - 0.1], r: [-2.2, 0, 0], s: [0.05, 0.34, 0.28] });
      break;
    case 'wings':
      for (const sx of [-1, 1]) {
        const big = look.body === 'bug' ? 1.4 : 1;
        b.add(GEO.cone4, look.body === 'bug' ? belly : main, { p: [sx * (a.side + 0.12 * big), a.back.y + 0.08, a.back.z - 0.05], r: [-0.4, 0, -sx * 1.0], s: [0.05, 0.62 * big, 0.38 * big] });
        b.add(GEO.cone4, accent, { p: [sx * (a.side + 0.16 * big), a.back.y + 0.06, a.back.z - 0.12], r: [-0.4, 0, -sx * 1.1], s: [0.03, 0.38 * big, 0.22 * big] });
      }
      break;
    case 'fins':
      for (const sx of [-1, 1]) b.add(GEO.cone4, accent, { p: [sx * a.side * 0.95, a.back.y - 0.38, a.back.z + 0.1], r: [-0.6, 0, -sx * 1.4], s: [0.04, 0.32, 0.22] });
      break;
    case 'dorsal':
      b.add(GEO.cone4, accent, { p: [0, a.back.y + 0.12, a.back.z - 0.05], r: [-0.45, 0, 0], s: [0.05, 0.42, 0.3] });
      break;
    case 'spikes':
      for (let i = 0; i < 3; i++) b.along(GEO.cone5, accent, V(0, a.back.y - 0.05 - i * 0.04, a.back.z - i * 0.22), V(0, 1, -0.4), 0.3 - i * 0.04, 0.08);
      break;
    case 'shell':
      b.add(GEO.ball, accent, { p: [0, a.back.y - 0.08, a.back.z], s: [0.4, 0.22, 0.45] });
      break;
    case 'crystals': {
      const spots: [number, number, number, number][] = [[0, 0.06, 0, 0.2], [-0.16, -0.02, -0.12, 0.14], [0.17, -0.03, -0.08, 0.13], [0.04, -0.04, -0.26, 0.11]];
      for (const [x, y, z, s] of spots) b.add(GEO.oct, accent, { p: [a.back.x + x, a.back.y + y, a.back.z + z], r: [x, 0, z], s: [s * 0.55, s * 1.4, s * 0.55] });
      break;
    }
    case 'arms':
      for (const sx of [-1, 1]) {
        b.along(GEO.ball, shade(main, 0.9), V(sx * (a.side + 0.02), a.back.y - 0.05, 0.05), V(sx * 0.35, -1, 0.25), 0.55, 0.15);
        b.add(GEO.ball, shade(main, 0.7), { p: [sx * (a.side + 0.18), a.back.y - 0.55, 0.15], s: 0.17 });
      }
      break;
  }
}

export function buildCreatureGeometry(look: LookData): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const anchors = buildBody(b, look);
  for (const p of look.parts) addPart(b, p, anchors, look);
  addEyes(b, anchors);
  return b.build();
}

/** A creature in the scene with idle/attack/hit/faint animations. */
export class CreatureView {
  readonly root = new THREE.Group();
  readonly inner = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshLambertMaterial;
  readonly shadow: THREE.Mesh;
  private phase: number;
  private busy = false;
  baseScale: number;
  hovering: boolean;

  constructor(look: LookData, seed = 0) {
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mesh = new THREE.Mesh(buildCreatureGeometry(look), this.material);
    this.baseScale = look.scale;
    this.hovering = look.body === 'fish' || look.body === 'bird' || look.body === 'bug';
    this.inner.add(this.mesh);
    this.root.add(this.inner);
    this.inner.scale.setScalar(this.baseScale);
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55 * look.scale, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.01;
    this.root.add(this.shadow);
    this.phase = seed * 1.7;
  }

  faceTowards(target: THREE.Vector3) {
    const d = target.clone().sub(this.root.position);
    this.root.rotation.y = Math.atan2(d.x, d.z);
  }

  update(t: number) {
    if (this.busy) return;
    const k = t * 3.2 + this.phase;
    const bob = Math.abs(Math.sin(k));
    const lift = this.hovering ? 0.12 + Math.sin(k * 0.5) * 0.06 : 0;
    this.mesh.position.y = bob * 0.06 + lift;
    const squash = 1 + (bob - 0.5) * 0.06;
    this.mesh.scale.set(2 - squash, squash, 2 - squash);
  }

  async appear() {
    this.busy = true;
    this.inner.scale.setScalar(0.001);
    await tween(320, (k) => this.inner.scale.setScalar(this.baseScale * Math.max(0.001, ease.outBack(k))));
    this.busy = false;
  }

  async lunge(towards: THREE.Vector3) {
    this.busy = true;
    const start = this.inner.position.clone();
    const dir = towards.clone().sub(this.root.position).setY(0).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.root.rotation.y);
    const s = this.baseScale;
    await tween(110, (k) => this.inner.scale.set(s * (1 + 0.22 * k), s * (1 - 0.25 * k), s * (1 + 0.22 * k)));
    await tween(120, (k) => {
      this.inner.scale.set(s * (1.22 - 0.35 * k), s * (0.75 + 0.5 * k), s * (1.22 - 0.35 * k));
      this.inner.position.copy(start).addScaledVector(dir, 0.9 * ease.outCubic(k));
    });
    await tween(200, (k) => {
      this.inner.scale.set(s * (0.87 + 0.13 * k), s * (1.25 - 0.25 * k), s * (0.87 + 0.13 * k));
      this.inner.position.copy(start).addScaledVector(dir, 0.9 * (1 - ease.inOut(k)));
    });
    this.inner.position.copy(start);
    this.inner.scale.setScalar(s);
    this.busy = false;
  }

  async pulse(color: THREE.ColorRepresentation) {
    const c = new THREE.Color(color);
    await tween(380, (k) => this.material.emissive.copy(c).multiplyScalar(Math.sin(k * Math.PI) * 0.8));
    this.material.emissive.setRGB(0, 0, 0);
  }

  async hit(strong: boolean) {
    const x0 = this.inner.position.x;
    await tween(strong ? 420 : 300, (k) => {
      const blink = Math.floor(k * 8) % 2 === 0;
      this.material.emissive.setRGB(blink ? 0.9 : 0, blink ? 0.9 : 0, blink ? 0.9 : 0);
      this.inner.position.x = x0 + Math.sin(k * Math.PI * 6) * 0.12 * (1 - k);
    });
    this.material.emissive.setRGB(0, 0, 0);
    this.inner.position.x = x0;
  }

  async faint() {
    this.busy = true;
    const s = this.baseScale;
    await tween(520, (k) => {
      this.inner.position.y = -k * 0.6;
      this.inner.scale.set(s * (1 + k * 0.3), s * (1 - k * 0.95), s * (1 + k * 0.3));
      (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.22 * (1 - k);
    });
    this.root.visible = false;
  }

  reset() {
    this.root.visible = true;
    this.inner.position.set(0, 0, 0);
    this.inner.scale.setScalar(this.baseScale);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.22;
    this.material.emissive.setRGB(0, 0, 0);
    this.busy = false;
  }

  setBusy(b: boolean) { this.busy = b; }
}
