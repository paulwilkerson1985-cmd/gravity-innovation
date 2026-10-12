// Reusable anatomy for the bespoke creature builders: eyes that sit on a head surface,
// jointed tapered legs with paws, layered flames, leaves, petals, bolts.
import * as THREE from 'three';
import { basisQ, Kit, surface, V, v3, type Col, type Ellipsoid, type Paint, type V3 } from './kit';

export const EYE = '#1d1426';
export const WHITE = '#ffffff';

export interface EyeOpts {
  yaw: number;
  pitch: number;
  size: number;
  /** Height / width. */
  aspect?: number;
  color?: Col;
  /** Coloured iris ring (drawn as a bigger disc behind the pupil). */
  iris?: Col;
  /** White sclera behind everything. */
  sclera?: boolean;
  shine?: boolean;
  /** Brow ridge: tilt > 0 = angry (inner end lower). */
  brow?: { color: Col; tilt: number; lift?: number; thick?: number };
  /** Rotate the eye about its own normal (radians, mirrored). */
  roll?: number;
}

/** A mirrored pair of eyes placed exactly on the surface of `head` (never sunk inside it). */
export function eyes(k: Kit, head: Ellipsoid, o: EyeOpts) {
  const aspect = o.aspect ?? 1.15;
  k.sym((sx) => {
    const s = surface(head, sx * o.yaw, o.pitch);
    const n = s.n;
    const right = new THREE.Vector3().crossVectors(V(0, 1, 0), n).normalize();
    const up = new THREE.Vector3().crossVectors(n, right).normalize();
    if (o.roll) {
      const rq = new THREE.Quaternion().setFromAxisAngle(n, -sx * o.roll);
      right.applyQuaternion(rq);
      up.applyQuaternion(rq);
    }
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
    const c = s.p.clone().addScaledVector(n, o.size * 0.08);
    k.withRig({ kind: 'blink', pivot: c, amp: 1 }, () => {
      const seg = { q, w: 8, h: 5, jitter: 0 };
      if (o.sclera) k.orb(WHITE, c.clone().addScaledVector(n, -o.size * 0.06), [o.size * 1.3, o.size * aspect * 1.25, o.size * 0.42], seg);
      if (o.iris) k.orb(o.iris, c.clone().addScaledVector(n, o.size * 0.04), [o.size * 1.0, o.size * aspect, o.size * 0.45], seg);
      const pupil = o.iris ? 0.62 : 1;
      k.orb(o.color ?? EYE, c.clone().addScaledVector(n, o.size * (o.iris ? 0.1 : 0.02)), [o.size * pupil, o.size * aspect * pupil, o.size * 0.45], seg);
      if (o.shine ?? true) {
        const hp = c.clone().addScaledVector(n, o.size * 0.42).addScaledVector(up, o.size * aspect * 0.4).addScaledVector(right, o.size * 0.3);
        k.ball(WHITE, hp, [o.size * 0.3, o.size * 0.3, o.size * 0.18], { q, detail: 0, jitter: 0 });
      }
    });
    if (o.brow) {
      const b = o.brow;
      const lift = b.lift ?? 1.15;
      const inner = c.clone().addScaledVector(up, o.size * aspect * (lift - b.tilt)).addScaledVector(right, -sx * o.size * 0.95).addScaledVector(n, o.size * 0.25);
      const outer = c.clone().addScaledVector(up, o.size * aspect * (lift + b.tilt * 0.4)).addScaledVector(right, sx * o.size * 1.05).addScaledVector(n, o.size * 0.05);
      k.limb(b.color, inner, outer, o.size * (b.thick ?? 0.3), o.size * (b.thick ?? 0.3) * 0.8, 4);
    }
  });
}

/** Simple mouth: a small dark wedge on the surface (smile when `smile` > 0). */
export function mouth(k: Kit, head: Ellipsoid, pitch: number, width: number, color: Col = '#5a2236', smile = 0.4) {
  const s = surface(head, 0, pitch);
  const right = new THREE.Vector3().crossVectors(V(0, 1, 0), s.n).normalize();
  const up = new THREE.Vector3().crossVectors(s.n, right).normalize();
  const c = s.p.clone().addScaledVector(s.n, width * 0.05);
  for (const sx of [-1, 1]) {
    const a = c.clone().addScaledVector(right, sx * width * 0.05);
    const b = c.clone().addScaledVector(right, sx * width).addScaledVector(up, width * smile);
    k.limb(color, a, b, width * 0.22, width * 0.16, 4);
  }
}

export interface LegOpts {
  /** Joint chain from hip/shoulder to ankle. The paw is added at the last point. */
  pts: V3[];
  radii: number[];
  /** Paint per segment (defaults to the first). */
  paints: Paint[];
  paw?: { paint: Paint; r: V3; toes?: { paint: Paint; n: number; size: number } };
  sides?: number;
}

/** Tapered, jointed leg; the paw's sole sits on y = 0. */
export function leg(k: Kit, o: LegOpts) {
  const pts = o.pts.map(v3);
  const sides = o.sides ?? 6;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = o.paints[Math.min(i, o.paints.length - 1)]!;
    k.limb(p, pts[i]!, pts[i + 1]!, o.radii[i]!, o.radii[i + 1]!, sides);
    if (i > 0) k.orb(p, pts[i]!, o.radii[i]! * 1.02, { w: sides, h: 3 });
  }
  if (o.paw) {
    const last = pts[pts.length - 1]!;
    const r = v3(o.paw.r);
    const c = V(last.x, r.y, last.z + r.z * 0.25);
    k.orb(o.paw.paint, c, r, { w: 7, h: 3 });
    if (o.paw.toes) {
      const t = o.paw.toes;
      for (let i = 0; i < t.n; i++) {
        const x = (i - (t.n - 1) / 2) * r.x * 0.62;
        k.cone(t.paint, V(c.x + x, t.size * 0.9, c.z + r.z * 0.75), V(c.x + x * 1.1, t.size * 0.6, c.z + r.z * 0.75 + t.size * 1.6), t.size, 4);
      }
    }
  }
}

export interface FlameOpts {
  dir?: V3;
  outer?: Col;
  mid?: Col;
  core?: Col;
  phase?: number;
  tongues?: number;
  speed?: number;
  /** No flicker rig of its own: inherits the caller's rig (e.g. a wagging tail). */
  static?: boolean;
}

export const FLAME = { outer: '#ff5a1f', mid: '#ff9a1e', core: '#ffe14d', hot: '#fff3b0' };

/** Layered low-poly flame (readable from every angle), flickering via the rig. */
export function flame(k: Kit, base: V3, h: number, w: number, o: FlameOpts = {}) {
  const b = v3(base);
  const dir = v3(o.dir ?? [0, 1, 0]).normalize();
  const n = o.tongues ?? 3;
  const ph = o.phase ?? 0;
  const sp = o.speed ?? 9;
  const rig = (spec: Parameters<Kit['withRig']>[0], fn: () => void) => (o.static ? fn() : k.withRig(spec, fn));
  // Side axes perpendicular to dir.
  const ax = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0)).normalize();
  const az = new THREE.Vector3().crossVectors(ax, dir).normalize();
  rig({ kind: 'flicker', pivot: b, amp: 0.12, phase: ph, speed: sp }, () => {
    k.orb(o.mid ?? FLAME.mid, b.clone().addScaledVector(dir, w * 0.35), w * 0.82, { w: 6, h: 4 });
    k.cone(o.mid ?? FLAME.mid, b.clone().addScaledVector(dir, w * 0.3), b.clone().addScaledVector(dir, h * 0.92), w * 0.8, 5);
  });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + ph;
    const off = ax.clone().multiplyScalar(Math.cos(a)).addScaledVector(az, Math.sin(a));
    const from = b.clone().addScaledVector(off, w * 0.45);
    const tipDir = dir.clone().addScaledVector(off, 0.35).normalize();
    rig({ kind: 'flicker', pivot: from, amp: 0.18, phase: ph + i * 2.1, speed: sp * (1 + i * 0.13) }, () => {
      k.cone(o.outer ?? FLAME.outer, from, from.clone().addScaledVector(tipDir, h * (0.62 + 0.12 * ((i * 7) % 3))), w * 0.5, 4);
    });
  }
  rig({ kind: 'flicker', pivot: b, amp: 0.2, phase: ph + 1, speed: sp * 1.3 }, () => {
    k.cone(o.core ?? FLAME.core, b.clone().addScaledVector(dir, w * 0.4).addScaledVector(az, w * 0.42), b.clone().addScaledVector(dir, h * 0.62).addScaledVector(az, w * 0.3), w * 0.45, 5);
    k.cone(o.core ?? FLAME.core, b.clone().addScaledVector(dir, w * 0.4).addScaledVector(az, -w * 0.42), b.clone().addScaledVector(dir, h * 0.5).addScaledVector(az, -w * 0.3), w * 0.38, 5);
  });
}

/** Leaf outline (pointed tip, rounded base) along +Y. */
export function leafShape(len: number, width: number): [number, number][] {
  return [[0, 0], [width * 0.45, len * 0.18], [width * 0.5, len * 0.45], [width * 0.32, len * 0.75], [0, len], [-width * 0.32, len * 0.75], [-width * 0.5, len * 0.45], [-width * 0.45, len * 0.18]];
}

/** Rounded petal outline along +Y. */
export function petalShape(len: number, width: number): [number, number][] {
  return [[0, 0], [width * 0.35, len * 0.2], [width * 0.5, len * 0.55], [width * 0.4, len * 0.85], [width * 0.12, len], [-width * 0.12, len], [-width * 0.4, len * 0.85], [-width * 0.5, len * 0.55], [-width * 0.35, len * 0.2]];
}

/** Lightning bolt outline along +Y (about `len` long). */
export function boltShape(len: number, width: number): [number, number][] {
  const w = width, l = len;
  return [[-w * 0.15, 0], [w * 0.55, l * 0.48], [w * 0.1, l * 0.48], [w * 0.45, l], [-w * 0.55, l * 0.42], [-w * 0.08, l * 0.42], [-w * 0.6, 0]];
}

/** Place a slab outline (drawn along +Y) from `base`, pointing along `up`, facing `normal`. */
export function slabAt(k: Kit, paint: Paint, outline: [number, number][], thick: number, base: V3, up: V3, normal: V3, bevel = 0.35) {
  k.slab(paint, outline, thick, base, basisQ(up, normal), [1, 1, 1], bevel);
}

/** Leaf slab with a lighter midrib ridge. */
export function leaf(k: Kit, color: Col, base: V3, up: V3, normal: V3, len: number, width: number, thick = 0.035, rib?: Col) {
  slabAt(k, color, leafShape(len, width), thick, base, up, normal);
  if (rib) {
    const b = v3(base);
    const u = v3(up).normalize();
    const nn = v3(normal).normalize();
    k.limb(rib, b.clone().addScaledVector(nn, thick * 0.3), b.clone().addScaledVector(u, len * 0.8).addScaledVector(nn, thick * 0.3), thick * 0.6, thick * 0.3, 4);
  }
}

/** Spiky thistle bloom: green cup + purple spiky head. */
export function thistle(k: Kit, at: V3, r: number, petal: Col, cup = '#2f8a3a', phase = 0) {
  const c = v3(at);
  k.cone(cup, c.clone().add(V(0, -r * 0.9, 0)), c.clone().add(V(0, r * 0.25, 0)), r * 0.85, 6);
  k.withRig({ kind: 'nod', pivot: c.clone().add(V(0, -r, 0)), amp: 0.06, phase, speed: 2 }, () => {
    k.ball(petal, c.clone().add(V(0, r * 0.35, 0)), [r * 0.8, r * 0.7, r * 0.8], { detail: 0 });
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + phase;
      const d = V(Math.cos(a) * 0.55, 1, Math.sin(a) * 0.55).normalize();
      const from = c.clone().add(V(0, r * 0.35, 0)).addScaledVector(d, r * 0.4);
      k.cone(petal, from, from.clone().addScaledVector(d, r * 1.0), r * 0.22, 4);
    }
    k.cone(new THREE.Color(petal).multiplyScalar(1.15), c.clone().add(V(0, r * 0.6, 0)), c.clone().add(V(0, r * 1.6, 0)), r * 0.25, 4);
  });
}

/** Countershading painter: `under` on faces pointing down past `thr`. */
export const under = (main: Col, belly: Col, thr = -0.35): Paint => (n) => (n.y < thr ? belly : main);

/** Flat oval painted onto an ellipsoid surface (cheeks, spots, shine). */
export function decal(k: Kit, e: Ellipsoid, yaw: number, pitch: number, w: number, h: number, color: Col, depth = 0.35) {
  const s = surface(e, yaw, pitch);
  const right = new THREE.Vector3().crossVectors(V(0, 1, 0), s.n).normalize();
  const up = new THREE.Vector3().crossVectors(s.n, right).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, s.n));
  k.ball(color, s.p.clone().addScaledVector(s.n, w * 0.05), [w, h, Math.min(w, h) * depth], { q, detail: 0, jitter: 0 });
}

/** Local frame helper for building flat appendages (wings, fins): local (x, y, z) → world. */
export function frame(base: V3, up: V3, normal: V3) {
  const q = basisQ(up, normal);
  const b = v3(base);
  return {
    q,
    at: (x: number, y: number, z = 0) => V(x, y, z).applyQuaternion(q).add(b),
    slab: (k: Kit, paint: Paint, outline: [number, number][], thick: number, x = 0, y = 0, z = 0, bevel = 0.35) =>
      k.slab(paint, outline, thick, V(x, y, z).applyQuaternion(q).add(b), q, [1, 1, 1], bevel),
  };
}
