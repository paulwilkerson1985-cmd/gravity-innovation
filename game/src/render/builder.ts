// Merges many flat-shaded, vertex-coloured primitives into one BufferGeometry so a whole
// creature (or a whole diorama of props) costs a single draw call.
//
// Every material that draws builder geometry is either flat-shaded Lambert (normals come from
// screen-space derivatives) or unlit, so the merged geometry carries only `position` and
// `color` — no normals. Parts are kept as raw Float32Arrays until build(), and the
// non-indexed positions of the shared GEO primitives are computed once and cached.
import * as THREE from 'three';
import { isPersistent } from './materials';

export const GEO = {
  ball: new THREE.IcosahedronGeometry(1, 1),
  rock: new THREE.IcosahedronGeometry(1, 0),
  cone5: new THREE.ConeGeometry(1, 1, 5),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  oct: new THREE.OctahedronGeometry(1, 0),
  tet: new THREE.TetrahedronGeometry(1, 0),
  disc: new THREE.CylinderGeometry(1, 1, 1, 10),
};

const GEO_SET = new Set<THREE.BufferGeometry>(Object.values(GEO));

export interface Xf {
  p?: [number, number, number];
  r?: [number, number, number];
  s?: [number, number, number] | number;
  /** Optional quaternion; overrides `r`. */
  q?: THREE.Quaternion;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const tmpBase = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const tmpD = new THREE.Vector3();
const tmpCentre = new THREE.Vector3();
const tmpQ2 = new THREE.Quaternion();

/** Non-indexed (triangle soup) positions of a geometry; cached for the shared GEO primitives. */
const soupCache = new WeakMap<THREE.BufferGeometry, Float32Array>();
function soup(geo: THREE.BufferGeometry): Float32Array {
  const cached = soupCache.get(geo);
  if (cached) return cached;
  const pos = geo.attributes.position!;
  let out: Float32Array;
  if (geo.index) {
    const idx = geo.index;
    out = new Float32Array(idx.count * 3);
    for (let i = 0; i < idx.count; i++) {
      const j = idx.getX(i);
      out[i * 3] = pos.getX(j);
      out[i * 3 + 1] = pos.getY(j);
      out[i * 3 + 2] = pos.getZ(j);
    }
  } else {
    out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      out[i * 3] = pos.getX(i);
      out[i * 3 + 1] = pos.getY(i);
      out[i * 3 + 2] = pos.getZ(i);
    }
  }
  if (GEO_SET.has(geo)) soupCache.set(geo, out);
  return out;
}

export class MeshBuilder {
  private pos: Float32Array[] = [];
  private col: Float32Array[] = [];
  private verts = 0;

  /** Vertices added so far. */
  get vertexCount(): number {
    return this.verts;
  }

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, xf: Xf = {}, jitter = 0): this {
    const src = soup(geo);
    const n = src.length / 3;
    const s = xf.s ?? 1;
    if (typeof s === 'number') tmpS.set(s, s, s);
    else tmpS.set(s[0], s[1], s[2]);
    if (xf.q) tmpQ.copy(xf.q);
    else if (xf.r) tmpQ.setFromEuler(tmpE.set(xf.r[0], xf.r[1], xf.r[2]));
    else tmpQ.identity();
    if (xf.p) tmpV.set(xf.p[0], xf.p[1], xf.p[2]);
    else tmpV.set(0, 0, 0);
    tmpM.compose(tmpV, tmpQ, tmpS);
    const e = tmpM.elements;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i += 3) {
      const x = src[i]!, y = src[i + 1]!, z = src[i + 2]!;
      pos[i] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
      pos[i + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
      pos[i + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
    }
    const col = new Float32Array(n * 3);
    tmpBase.set(color);
    for (let i = 0; i < n; i += 3) {
      // Optional per-face brightness jitter for a hand-painted low-poly feel.
      const k = jitter ? 1 + (((i * 2654435761) >>> 0) % 1000 / 1000 - 0.5) * jitter : 1;
      tmpC.copy(tmpBase).multiplyScalar(k);
      for (let v = 0; v < 3 && i + v < n; v++) {
        const o = (i + v) * 3;
        col[o] = tmpC.r;
        col[o + 1] = tmpC.g;
        col[o + 2] = tmpC.b;
      }
    }
    this.pos.push(pos);
    this.col.push(col);
    this.verts += n;
    return this;
  }

  /** Place a primitive (whose axis is +Y, height 1) from `from` along `dir` for `length`. */
  along(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, from: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, flat = 1): this {
    const d = tmpD.copy(dir).normalize();
    const q = tmpQ2.setFromUnitVectors(UP, d);
    const c = tmpCentre.copy(from).addScaledVector(d, length / 2);
    return this.add(geo, color, { p: [c.x, c.y, c.z], q, s: [radius, length, radius * flat] });
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    if (this.verts === 0) return geo;
    const pos = new Float32Array(this.verts * 3);
    const col = new Float32Array(this.verts * 3);
    let o = 0;
    for (let i = 0; i < this.pos.length; i++) {
      pos.set(this.pos[i]!, o);
      col.set(this.col[i]!, o);
      o += this.pos[i]!.length;
    }
    this.pos = [];
    this.col = [];
    this.verts = 0;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

export { flatMaterial } from './materials';

/**
 * Release every geometry, material and texture under an object. Shared GEO primitives and
 * anything marked `userData.persistent` (pooled materials, cached FX geometry) are kept so
 * their GPU programs/buffers survive scene changes.
 */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !GEO_SET.has(mesh.geometry) && !isPersistent(mesh.geometry)) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      if (isPersistent(m)) continue;
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}
