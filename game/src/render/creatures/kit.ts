// Geometry kit for bespoke creature models. Everything is emitted as one flat-shaded,
// vertex-coloured triangle soup (one draw call per creature). Each vertex also carries a
// tiny "rig" record (pivot + kind + amplitude/phase/speed) that the creature material's
// vertex shader uses for cheap secondary motion: wing flaps, tail wags, ear twitches,
// flame flicker and eye blinks — all without extra meshes or bones.
import * as THREE from 'three';

export type V3 = THREE.Vector3 | [number, number, number];
export type Col = THREE.ColorRepresentation;
/** A flat colour, or a painter choosing a colour from the face's world normal / centroid. */
/** Painters get the face normal, centroid and the face's index within the primitive. */
export type Paint = Col | ((n: THREE.Vector3, c: THREE.Vector3, i: number) => Col);

export const RIG = { none: 0, flap: 1, wag: 2, nod: 3, flicker: 4, blink: 5, twitch: 6, roll: 7 } as const;
export type RigKind = keyof typeof RIG;

export interface RigSpec {
  kind: RigKind;
  pivot: V3;
  /** Radians for rotations, relative scale for flicker. */
  amp: number;
  phase?: number;
  /** Angular speed (rad/s). */
  speed?: number;
}

export const v3 = (p: V3): THREE.Vector3 => (p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]));
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Ellipsoid handle returned by `ball`, used to place eyes/parts exactly on a surface. */
export interface Ellipsoid {
  c: THREE.Vector3;
  r: THREE.Vector3;
  q: THREE.Quaternion;
}

/** Point on an ellipsoid along a direction given by yaw (around Y, 0 = +Z) and pitch (up). */
export function surface(e: Ellipsoid, yaw: number, pitch: number, out = 1): { p: THREE.Vector3; n: THREE.Vector3 } {
  const d = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  // Intersect the ray c + t·d (in ellipsoid-local space) with the unit-scaled surface.
  const inv = e.q.clone().invert();
  const dl = d.clone().applyQuaternion(inv);
  const t = 1 / Math.sqrt((dl.x / e.r.x) ** 2 + (dl.y / e.r.y) ** 2 + (dl.z / e.r.z) ** 2);
  const pl = dl.multiplyScalar(t * out);
  const nl = V(pl.x / e.r.x ** 2, pl.y / e.r.y ** 2, pl.z / e.r.z ** 2).normalize();
  return { p: pl.applyQuaternion(e.q).add(e.c), n: nl.applyQuaternion(e.q) };
}

/** Non-indexed position array of a geometry (positions only). */
function soup(g: THREE.BufferGeometry): Float32Array {
  const src = g.index ? g.toNonIndexed() : g;
  const out = new Float32Array(src.attributes.position!.array as ArrayLike<number>);
  if (src !== g) src.dispose();
  return out;
}

const SOUPS = new Map<string, Float32Array>();
/** Cached unit primitives (built once, reused by every creature). */
function prim(key: string, make: () => THREE.BufferGeometry): Float32Array {
  let a = SOUPS.get(key);
  if (!a) {
    const g = make();
    a = soup(g);
    g.dispose();
    SOUPS.set(key, a);
  }
  return a;
}

const COLORS = new Map<string | number, THREE.Color>();
/** Colour lookup with a cache (hex strings are parsed once). */
function resolve(c: Col): THREE.Color {
  if (c instanceof THREE.Color) return c;
  const key = typeof c === 'string' || typeof c === 'number' ? c : String(c);
  let v = COLORS.get(key);
  if (!v) { v = new THREE.Color(c); COLORS.set(key, v); }
  return v;
}

const BASE = {
  ico0: () => prim('ico0', () => new THREE.IcosahedronGeometry(1, 0)),
  ico1: () => prim('ico1', () => new THREE.IcosahedronGeometry(1, 1)),
  oct: () => prim('oct', () => new THREE.OctahedronGeometry(1, 0)),
  sphere: (w: number, h: number) => prim(`s${w}x${h}`, () => new THREE.SphereGeometry(1, w, h)),
  /** Unit-height cylinder/cone centred on the origin; top radius `top`, bottom radius 1. */
  cyl: (top: number, sides: number, twist = 0) => prim(`c${top.toFixed(2)}x${sides}x${twist.toFixed(2)}`, () => new THREE.CylinderGeometry(Math.round(top * 100) / 100, 1, 1, sides, 1, false, twist)),
};

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpM = new THREE.Vector3();

export interface AddOpts {
  /** Per-face brightness jitter (0..~0.15). */
  jitter?: number;
  /** Bake a little top-light into the vertex colour (default on). */
  bake?: boolean;
}

export class Kit {
  private pos: number[] = [];
  private colr: number[] = [];
  private rigA: number[] = [];
  private rigB: number[] = [];
  private rig: RigSpec | null = null;
  private faceSeed = 1;
  jitter = 0.05;
  /** Run `fn` with every emitted triangle tagged with `spec`. */
  withRig(spec: RigSpec | null, fn: () => void) {
    const prev = this.rig;
    this.rig = spec;
    try { fn(); } finally { this.rig = prev; }
  }

  /** Emit `fn(sx)` for sx = -1 and +1. */
  sym(fn: (sx: number) => void) { fn(-1); fn(1); }

  /** Append a geometry (or a cached triangle-soup position array) transformed by `m`, painting each face. */
  geo(g: THREE.BufferGeometry | Float32Array, m: THREE.Matrix4, paint: Paint, o: AddOpts = {}) {
    const arr = g instanceof Float32Array ? g : soup(g);
    const count = arr.length / 3;
    const jit = o.jitter ?? this.jitter;
    const bake = o.bake ?? true;
    const flip = m.determinant() < 0;
    const r = this.rig;
    const kind = r ? RIG[r.kind] : 0;
    const pv = r ? v3(r.pivot) : null;
    const px = pv?.x ?? 0, py = pv?.y ?? 0, pz = pv?.z ?? 0;
    const amp = r?.amp ?? 0, ph = r?.phase ?? 0, sp = r?.speed ?? 0;
    const flat = typeof paint === 'function' ? null : resolve(paint);
    const P = this.pos, C = this.colr, RA = this.rigA, RB = this.rigB;
    for (let i = 0; i < count; i += 3) {
      tmpA.set(arr[i * 3]!, arr[i * 3 + 1]!, arr[i * 3 + 2]!).applyMatrix4(m);
      if (flip) {
        tmpC.set(arr[i * 3 + 3]!, arr[i * 3 + 4]!, arr[i * 3 + 5]!).applyMatrix4(m);
        tmpB.set(arr[i * 3 + 6]!, arr[i * 3 + 7]!, arr[i * 3 + 8]!).applyMatrix4(m);
      } else {
        tmpB.set(arr[i * 3 + 3]!, arr[i * 3 + 4]!, arr[i * 3 + 5]!).applyMatrix4(m);
        tmpC.set(arr[i * 3 + 6]!, arr[i * 3 + 7]!, arr[i * 3 + 8]!).applyMatrix4(m);
      }
      tmpN.subVectors(tmpC, tmpB).cross(tmpM.subVectors(tmpA, tmpB));
      const len = tmpN.length();
      if (!(len > 1e-12)) continue; // degenerate (e.g. sphere poles)
      tmpN.multiplyScalar(1 / len);
      const base = flat ?? resolve((paint as (n: THREE.Vector3, c: THREE.Vector3, i: number) => Col)(tmpN, tmpM.copy(tmpA).add(tmpB).add(tmpC).multiplyScalar(1 / 3), i / 3));
      this.faceSeed = (this.faceSeed * 1103515245 + 12345) >>> 0;
      let k = 1 + ((this.faceSeed >>> 8) % 1000 / 1000 - 0.5) * jit;
      if (bake) k *= 1 + 0.07 * tmpN.y;
      const cr = base.r * k, cg = base.g * k, cb = base.b * k;
      P.push(tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z, tmpC.x, tmpC.y, tmpC.z);
      C.push(cr, cg, cb, cr, cg, cb, cr, cg, cb);
      RA.push(px, py, pz, kind, px, py, pz, kind, px, py, pz, kind);
      RB.push(amp, ph, sp, amp, ph, sp, amp, ph, sp);
    }
    return this;
  }

  /** Ellipsoid. `s` = radii. detail 0 = 20 tris, 1 = 80 tris. */
  ball(paint: Paint, p: V3, s: number | V3, o: { rot?: V3; q?: THREE.Quaternion; detail?: 0 | 1; jitter?: number } = {}): Ellipsoid {
    const r = typeof s === 'number' ? V(s, s, s) : v3(s);
    const q = o.q ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ? v3(o.rot).toArray() : [0, 0, 0])));
    const c = v3(p);
    const m = new THREE.Matrix4().compose(c, q, r);
    this.geo(o.detail === 0 ? BASE.ico0() : BASE.ico1(), m, paint, { jitter: o.jitter });
    return { c, r, q };
  }

  /** Low-poly UV-ish sphere with a chosen number of sides (smoother silhouettes than ico1 for heads). */
  orb(paint: Paint, p: V3, s: number | V3, o: { rot?: V3; q?: THREE.Quaternion; w?: number; h?: number; jitter?: number } = {}): Ellipsoid {
    const r = typeof s === 'number' ? V(s, s, s) : v3(s);
    const q = o.q ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ? v3(o.rot).toArray() : [0, 0, 0])));
    const c = v3(p);
    this.geo(BASE.sphere(o.w ?? 9, o.h ?? 6), new THREE.Matrix4().compose(c, q, r), paint, { jitter: o.jitter });
    return { c, r, q };
  }

  /** Octahedron gem. */
  gem(paint: Paint, p: V3, s: V3, rot: V3 = [0, 0, 0]) {
    const m = new THREE.Matrix4().compose(v3(p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...v3(rot).toArray())), v3(s));
    this.geo(BASE.oct(), m, paint, { jitter: 0.02 });
  }

  /** Tapered cylinder from `a` to `b` (radius r0 at a, r1 at b). */
  limb(paint: Paint, a: V3, b: V3, r0: number, r1: number, sides = 6, flat = 1) {
    const A = v3(a), B = v3(b);
    const d = B.clone().sub(A);
    const len = d.length();
    if (len < 1e-5) return;
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, V(1, 1, flat)).multiply(new THREE.Matrix4().makeScale(r0, len, r0));
    this.geo(BASE.cyl(r1 / Math.max(r0, 1e-6), sides), m, paint);
  }

  /** Cone with its base at `a` and tip at `b`. `flat` squashes it across (for blades/ears). */
  cone(paint: Paint, a: V3, b: V3, r: number, sides = 5, flat = 1, twist = 0) {
    const A = v3(a), B = v3(b);
    const d = B.clone().sub(A);
    const len = d.length();
    if (len < 1e-5) return;
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, V(1, 1, flat)).multiply(new THREE.Matrix4().makeScale(r, len, r));
    this.geo(BASE.cyl(0, sides, twist), m, paint);
  }

  /** Flattened cone whose flat side faces `face` (useful for ears that face forward). */
  blade(paint: Paint, a: V3, b: V3, width: number, thick: number, face: V3, sides = 4) {
    const A = v3(a), B = v3(b);
    const up = B.clone().sub(A);
    const len = up.length();
    up.normalize();
    const f = v3(face).normalize();
    const x = new THREE.Vector3().crossVectors(up, f).normalize();
    const z = new THREE.Vector3().crossVectors(x, up).normalize();
    const basis = new THREE.Matrix4().makeBasis(x, up, z);
    const m = new THREE.Matrix4().makeTranslation(A.x + up.x * len / 2, A.y + up.y * len / 2, A.z + up.z * len / 2)
      .multiply(basis).multiply(new THREE.Matrix4().makeScale(width, len, thick));
    this.geo(BASE.cyl(0, sides, sides === 4 ? Math.PI / 4 : 0), m, paint);
  }

  /** Tube along a Catmull-Rom curve through `pts` with radius `rad(t)` (t: 0..1). */
  tube(paint: Paint, pts: V3[], rad: (t: number) => number, o: { segs?: number; sides?: number; capStart?: boolean; capEnd?: boolean; flat?: number } = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map(v3), false, 'centripetal');
    const segs = o.segs ?? 12;
    const centers: THREE.Vector3[] = [];
    const radii: number[] = [];
    for (let i = 0; i <= segs; i++) { centers.push(curve.getPointAt(i / segs)); radii.push(rad(i / segs)); }
    this.tubePath(paint, centers, radii, o);
    return curve;
  }

  /** Tube through explicit ring centres with explicit radii (no smoothing). */
  tubePath(paint: Paint, centers: THREE.Vector3[], radii: number[], o: { sides?: number; capStart?: boolean; capEnd?: boolean; flat?: number } = {}) {
    const sides = o.sides ?? 7;
    const flat = o.flat ?? 1;
    const n = centers.length;
    const rings: THREE.Vector3[][] = [];
    let prevSide: THREE.Vector3 | null = null;
    for (let i = 0; i < n; i++) {
      const p = centers[i]!;
      const tan = centers[Math.min(n - 1, i + 1)]!.clone().sub(centers[Math.max(0, i - 1)]!).normalize();
      // Parallel transport: carry the previous ring's side vector onto this ring's plane, so the
      // tube never twists (twisted quads shade as zig-zags at low resolution).
      let side: THREE.Vector3;
      if (prevSide) side = prevSide.clone().addScaledVector(tan, -prevSide.dot(tan));
      else side = new THREE.Vector3().crossVectors(tan, V(0, 1, 0));
      if (side.lengthSq() < 1e-6) side = new THREE.Vector3().crossVectors(tan, V(1, 0, 0));
      side.normalize();
      prevSide = side;
      const up = new THREE.Vector3().crossVectors(side, tan).normalize();
      const r = radii[i]!;
      const ring: THREE.Vector3[] = [];
      for (let j = 0; j < sides; j++) {
        const a = (j / sides) * Math.PI * 2 + Math.PI / 2;
        ring.push(p.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r * flat));
      }
      rings.push(ring);
    }
    const posArr: number[] = [];
    // Each quad is painted as a whole from its smooth radial direction, so colour bands
    // (bellies, stripes) follow ring edges instead of zig-zagging across triangle pairs.
    const quadN: THREE.Vector3[] = [];
    const quadC: THREE.Vector3[] = [];
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => posArr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < n - 1; i++) {
      const axis = centers[i]!.clone().add(centers[i + 1]!).multiplyScalar(0.5);
      for (let j = 0; j < sides; j++) {
        const a = rings[i]![j]!, b = rings[i]![(j + 1) % sides]!, c = rings[i + 1]![j]!, d = rings[i + 1]![(j + 1) % sides]!;
        tri(a, c, b);
        tri(b, c, d);
        const qc = a.clone().add(b).add(c).add(d).multiplyScalar(0.25);
        const qn = qc.clone().sub(axis).normalize();
        quadN.push(qn, qn);
        quadC.push(qc, qc);
      }
    }
    const nQuadTris = quadN.length;
    const cap = (ring: THREE.Vector3[], rev: boolean) => {
      const cen = ring.reduce((s, v) => s.add(v), V(0, 0, 0)).multiplyScalar(1 / ring.length);
      for (let j = 0; j < sides; j++) {
        const a = ring[j]!, b = ring[(j + 1) % sides]!;
        if (rev) tri(cen, b, a); else tri(cen, a, b);
      }
    };
    if (o.capStart ?? true) cap(rings[0]!, false);
    if (o.capEnd ?? true) cap(rings[n - 1]!, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    const smooth: Paint = typeof paint === 'function'
      ? (fn, fc, i) => (i < nQuadTris ? paint(quadN[i]!, quadC[i]!, i) : paint(fn, fc, i))
      : paint;
    this.geo(g, new THREE.Matrix4(), smooth);
    g.dispose();
  }

  /**
   * Solid slab: a 2D outline (x right, y up in the slab's own plane) extruded by `thick`,
   * then placed at `p` with rotation `rot` (Euler XYZ) and optional scale. Wings and fins
   * are slabs, never zero-thickness planes.
   */
  slab(paint: Paint, outline: [number, number][], thick: number, p: V3, rot: V3 | THREE.Quaternion = [0, 0, 0], s: V3 = [1, 1, 1], bevel = 0.35) {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    // A shallow bevel keeps edges from reading as razor-thin lines at low resolution.
    const g = new THREE.ExtrudeGeometry(shape, { depth: thick * (1 - bevel), bevelEnabled: bevel > 0, bevelThickness: thick * bevel * 0.5, bevelSize: thick * bevel * 0.5, bevelSegments: 1, curveSegments: 1 });
    g.translate(0, 0, -thick * (1 - bevel) / 2);
    const q = rot instanceof THREE.Quaternion ? rot : new THREE.Quaternion().setFromEuler(new THREE.Euler(...v3(rot).toArray()));
    this.geo(g, new THREE.Matrix4().compose(v3(p), q, v3(s)), paint);
    g.dispose();
  }

  /** Lathe a profile of [radius, y] pairs around Y, then place it. */
  lathe(paint: Paint, profile: [number, number][], p: V3, o: { rot?: V3; q?: THREE.Quaternion; s?: V3; segs?: number } = {}) {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), o.segs ?? 8);
    const q = o.q ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ? v3(o.rot).toArray() : [0, 0, 0])));
    this.geo(g, new THREE.Matrix4().compose(v3(p), q, v3(o.s ?? [1, 1, 1])), paint);
    g.dispose();
  }

  triangles() { return this.pos.length / 9; }

  /** Merge everything. With `ground`, the model is shifted so its lowest point sits on y = 0. */
  build(ground = true): THREE.BufferGeometry {
    if (ground && this.pos.length) {
      let minY = Infinity;
      for (let i = 1; i < this.pos.length; i += 3) minY = Math.min(minY, this.pos[i]!);
      for (let i = 1; i < this.pos.length; i += 3) this.pos[i]! -= minY;
      for (let i = 1; i < this.rigA.length; i += 4) this.rigA[i]! -= minY;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colr, 3));
    g.setAttribute('rigA', new THREE.Float32BufferAttribute(this.rigA, 4));
    g.setAttribute('rigB', new THREE.Float32BufferAttribute(this.rigB, 3));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    this.pos = []; this.colr = []; this.rigA = []; this.rigB = [];
    return g;
  }
}

/** Rotation whose local +Y is `up` and local +Z is (as close as possible to) `normal`. */
export function basisQ(up: V3, normal: V3): THREE.Quaternion {
  const y = v3(up).normalize();
  let z = v3(normal);
  z.addScaledVector(y, -z.dot(y));
  if (z.lengthSq() < 1e-6) z = Math.abs(y.z) < 0.9 ? V(0, 0, 1) : V(1, 0, 0);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Paint helper: `top` above a world-space y threshold or normal criterion, else `base`. */
export const byNormal = (base: Col, other: Col, test: (n: THREE.Vector3, c: THREE.Vector3) => boolean): Paint =>
  (n, c) => (test(n, c) ? other : base);

export function mix(a: Col, b: Col, k: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), k);
}

export function shade(a: Col, k: number): THREE.Color {
  return new THREE.Color(a).multiplyScalar(k);
}
