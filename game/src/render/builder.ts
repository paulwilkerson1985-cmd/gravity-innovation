// Merges many flat-shaded, vertex-coloured primitives into one BufferGeometry so a whole
// creature (or a whole diorama of props) costs a single draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

export class MeshBuilder {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, xf: Xf = {}, jitter = 0): this {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()) as THREE.BufferGeometry;
    for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
    const s = xf.s ?? 1;
    tmpS.set(...(typeof s === 'number' ? ([s, s, s] as [number, number, number]) : s));
    if (xf.q) tmpQ.copy(xf.q);
    else tmpQ.setFromEuler(tmpE.set(...(xf.r ?? [0, 0, 0])));
    tmpM.compose(tmpV.set(...(xf.p ?? [0, 0, 0])), tmpQ, tmpS);
    g.applyMatrix4(tmpM);
    g.computeVertexNormals();
    const n = g.attributes.position!.count;
    const col = new Float32Array(n * 3);
    const base = new THREE.Color(color);
    const c = new THREE.Color();
    for (let i = 0; i < n; i += 3) {
      // Optional per-face brightness jitter for a hand-painted low-poly feel.
      const k = jitter ? 1 + (((i * 2654435761) >>> 0) % 1000 / 1000 - 0.5) * jitter : 1;
      c.copy(base).multiplyScalar(k);
      for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], (i + v) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  /** Place a primitive (whose axis is +Y, height 1) from `from` along `dir` for `length`. */
  along(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, from: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, flat = 1): this {
    const d = dir.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    const c = from.clone().addScaledVector(d, length / 2);
    return this.add(geo, color, { p: [c.x, c.y, c.z], q, s: [radius, length, radius * flat] });
  }

  build(): THREE.BufferGeometry {
    if (this.parts.length === 0) return new THREE.BufferGeometry();
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!merged) throw new Error('merge failed');
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}

export function flatMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}

/** Release every geometry, material and texture under an object. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !Object.values(GEO).includes(mesh.geometry as never)) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}
