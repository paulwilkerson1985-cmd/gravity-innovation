// HD-2D arena kit: chunky pixel-textured voxel rock, floors, stairs with rails, props, window
// light (cookie spotlight + volumetric beam meshes + dust motes) and the cave/quarry arena that
// the Ember Ridge battles use. Other terrains are built from the same pieces (docs/HD2D.md).
//
// Units & scale (keep these consistent across arenas):
//  * 1 unit ≈ a kin's height. People are ~1.6 units tall, blocks are CELL (0.9) wide and
//    LEVEL (0.7) tall, so a kin stands about 1.5 blocks high (chunky boulders).
//  * TEXEL = 1/16 unit per texture texel on every surface (floor, rock, wood) → one shared pixel
//    density on screen (~3 internal px per texel at the battle camera).
//  * Arena floor is y = 0, centred on the origin; the camera looks from +z (front) toward -z.
//  * Draw calls: every material is one merged mesh (rock, stone, floor, wood, props, metal,
//    glow, beams, dust) — ~12 calls for the whole set.
import * as THREE from 'three';
import { Rng } from '../../engine/rng';
import { RAMPS, cachedTexture, paintBoulder, paintBoards, paintDirt, paintPlanks, paintPlaster, paintRock, paintRug, paintSteel, paintStone } from './textures';
import type { SpriteLight } from './sprite';
import { boulderColumns, pebbles, rubblePile } from './kit/rock';
import { banner, barrel, bookcase, brazier, crate, table, type PropBatches } from './kit/props';

import { CELL, LEVEL, TEXEL } from './kit/units';
export { CELL, LEVEL, TEXEL };

// ------------------------------------------------------------------ voxel batch

export type V3 = [number, number, number];
/** Per-vertex bevel attribute (see VoxelBatch.tri). */
export type Face4 = [number, number, number, number];

/**
 * Accumulates textured boxes (and quads) into one BufferGeometry with position / normal / uv /
 * colour. UVs are block-local in world units / (TEXEL × tile texels), starting at a whole texel
 * with a random integer texel offset, so every block shows the same pixel density but a
 * different part of the tile. Vertex colour = tint × baked AO.
 */
export class VoxelBatch {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  /** Face-local coords for the pixel bevel: (u, v, width, ±height); negative height = side face. */
  private face: number[] = [];
  constructor(readonly tileTexels = 32) {}

  get count() { return this.pos.length / 3; }

  /**
   * Low-level: one triangle with explicit per-corner attributes (kit/rock.ts boulders use it).
   * `face` = the bevel attribute per corner: (u, v, width, ±height) in world units for bevelled
   * faces, or (0, 0, -1, k) for a chamfer facet — no seam, brightness multiplied by `k`.
   */
  tri(p: [V3, V3, V3], n: V3, uv: [[number, number], [number, number], [number, number]], col: [THREE.Color, THREE.Color, THREE.Color], face: [Face4, Face4, Face4]) {
    for (let i = 0; i < 3; i++) {
      const q = p[i]!, c = col[i]!, f = face[i]!;
      this.pos.push(q[0], q[1], q[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uv[i]![0], uv[i]![1]);
      this.col.push(c.r, c.g, c.b);
      this.face.push(f[0], f[1], f[2], f[3]);
    }
  }

  /** One quad (two triangles). `ao` per corner [a, b, c, d]; corners in CCW order seen from the normal side. */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, uv: [number, number][], tint: THREE.Color, ao: [number, number, number, number] = [1, 1, 1, 1]) {
    const corners = [a, b, c, d];
    const W = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), H = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    const fl: [number, number][] = [[0, 0], [W, 0], [W, H], [0, H]];
    const sideSign = Math.abs(n[1]) < 0.5 ? -1 : 1;
    const idx = [0, 1, 2, 0, 2, 3];
    // Flip the diagonal when AO is anisotropic, so the darkening interpolates the right way.
    if (ao[0] + ao[2] < ao[1] + ao[3]) idx.splice(0, 6, 1, 2, 3, 1, 3, 0);
    for (const i of idx) {
      const p = corners[i]!;
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uv[i]![0], uv[i]![1]);
      this.face.push(fl[i]![0], fl[i]![1], W, H * sideSign);
      this.col.push(tint.r * ao[i]!, tint.g * ao[i]!, tint.b * ao[i]!);
    }
  }

  /**
   * Axis-aligned box from `min` to `max`. `faces` skips sides (order: +x -x +y -y +z -z).
   * `ao(face, corner)` may return a per-corner AO factor; default darkens side bottoms.
   */
  box(min: V3, max: V3, tint: THREE.Color, rng: Rng, o: { skip?: boolean[]; aoBottom?: number; aoTop?: [number, number, number, number]; texOff?: [number, number]; topK?: number } = {}) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const t = 1 / (TEXEL * this.tileTexels);
    const ox = o.texOff?.[0] ?? rng.int(this.tileTexels) / this.tileTexels;
    const oy = o.texOff?.[1] ?? rng.int(this.tileTexels) / this.tileTexels;
    const sx = (x1 - x0) * t, sy = (y1 - y0) * t, sz = (z1 - z0) * t;
    const ab = o.aoBottom ?? 0.62;
    const top = o.aoTop ?? [1, 1, 1, 1];
    const sk = o.skip ?? [];
    // Side faces: bottom corners get `ab`, top corners 1.
    const side = (a: V3, b: V3, c: V3, d: V3, n: V3, w: number) =>
      this.quad(a, b, c, d, n, [[ox, oy], [ox + w, oy], [ox + w, oy + sy], [ox, oy + sy]], tint, [ab, ab, 1, 1]);
    if (!sk[0]) side([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], sz);
    if (!sk[1]) side([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], sz);
    if (!sk[2]) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[ox, oy], [ox + sx, oy], [ox + sx, oy + sz], [ox, oy + sz]], o.topK ? tint.clone().multiplyScalar(o.topK) : tint, top);
    if (!sk[3]) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[ox, oy], [ox + sx, oy], [ox + sx, oy + sz], [ox, oy + sz]], tint, [ab, ab, ab, ab]);
    if (!sk[4]) side([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], sx);
    if (!sk[5]) side([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], sx);
  }

  /** Box rotated about Y by `ry` around its centre (props, rubble). */
  rotBox(center: V3, size: V3, ry: number, tint: THREE.Color, rng: Rng, rx = 0) {
    const start = this.pos.length;
    const h: V3 = [size[0] / 2, size[1] / 2, size[2] / 2];
    this.box([-h[0], -h[1], -h[2]], [h[0], h[1], h[2]], tint, rng, { skip: [false, false, false, true, false, false], aoBottom: 0.7 });
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...center), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(1, 1, 1));
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3();
    for (let i = start; i < this.pos.length; i += 3) {
      v.set(this.pos[i]!, this.pos[i + 1]!, this.pos[i + 2]!).applyMatrix4(m);
      this.pos[i] = v.x; this.pos[i + 1] = v.y; this.pos[i + 2] = v.z;
      v.set(this.nor[i]!, this.nor[i + 1]!, this.nor[i + 2]!).applyMatrix3(nm).normalize();
      this.nor[i] = v.x; this.nor[i + 1] = v.y; this.nor[i + 2] = v.z;
    }
  }

  /** Append another batch's triangles (e.g. deferred back-most geometry: draw order = early-z). */
  append(o: VoxelBatch) {
    const cat = (a: number[], b: number[]) => { for (let i = 0; i < b.length; i++) a.push(b[i]!); };
    cat(this.pos, o.pos); cat(this.nor, o.nor); cat(this.uv, o.uv); cat(this.col, o.col); cat(this.face, o.face);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aFace', new THREE.Float32BufferAttribute(this.face, 4));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** A lit, pixel-textured surface material (shadows on). Vertex colour carries tint × AO. */
export function surfaceMaterial(map: THREE.Texture | null, emissive?: THREE.ColorRepresentation, bevel = false): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map, vertexColors: true });
  if (bevel) addBevel(m);
  if (emissive !== undefined) { m.emissive = new THREE.Color(emissive); m.emissiveMap = map; }
  return m;
}

/**
 * Pixel bevel for VoxelBatch geometry: a 1-texel dark seam around every face and a 1–2 texel
 * lit lip along the top of side faces, quantised to the texel grid. Turns flat cubes into
 * chunky hand-shaded boulders (the reference's "each rock is drawn" look) at no geometry cost.
 */
export function addBevel(m: THREE.MeshLambertMaterial) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute vec4 aFace;\nvarying vec4 vFace;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFace = aFace;');
    sh.fragmentShader = 'varying vec4 vFace;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        float tx = ${TEXEL.toFixed(5)};
        if (vFace.z < 0.0) {
          // Chamfer facet (kit/rock.ts): no seam; a fixed brightness, quantised per texel row
          // so the facet keeps a crisp 1-texel edge against the face it bevels.
          diffuseColor.rgb *= vFace.w;
        } else {
        vec2 p = floor(vFace.xy / tx);
        vec2 n = max(vec2(1.0), floor(abs(vFace.zw) / tx));
        float e = min(min(p.x, n.x - 1.0 - p.x), min(p.y, n.y - 1.0 - p.y));
        float k = e < 0.5 ? 0.58 : e < 1.5 ? 0.84 : 1.0;
        if (vFace.w < 0.0) {
          float top = n.y - 1.0 - p.y;
          if (top < 1.5 && min(p.x, n.x - 1.0 - p.x) > 0.5) k = top < 0.5 ? 1.32 : 1.16;
        } else if (e > 0.5 && e < 2.5 && p.y > n.y - 3.5) {
          k = 1.12; // a lit rim on the far half of top faces catches the window light
        }
        diffuseColor.rgb *= k;
        }
      }`);
  };
  m.customProgramCacheKey = () => 'hd2d-bevel';
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true): THREE.Mesh {
  const out = new THREE.Mesh(g, m);
  out.castShadow = cast;
  out.receiveShadow = receive;
  return out;
}

/** A ramp shade as a linear colour (for vertex tints). */
function rampColor(ramp: readonly string[], i: number): THREE.Color {
  return new THREE.Color(ramp[Math.max(0, Math.min(ramp.length - 1, i))]!);
}

// ------------------------------------------------------------------ terraced rock heightmap

/** A grid of rock column heights (in LEVELs) around an arena floor. */
export class Heightmap {
  readonly h: Float32Array;
  constructor(readonly nx: number, readonly nz: number, readonly x0: number, readonly z0: number) { this.h = new Float32Array(nx * nz); }
  idx(i: number, j: number) { return j * this.nx + i; }
  get(i: number, j: number): number { return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? 99 : this.h[this.idx(i, j)]!; }
  set(i: number, j: number, v: number) { if (i >= 0 && j >= 0 && i < this.nx && j < this.nz) this.h[this.idx(i, j)] = v; }
  cx(i: number) { return this.x0 + (i + 0.5) * CELL; }
  cz(j: number) { return this.z0 + (j + 0.5) * CELL; }
  cell(x: number, z: number): [number, number] { return [Math.floor((x - this.x0) / CELL), Math.floor((z - this.z0) / CELL)]; }
  /** Highest column within `r` cells (for floor AO). */
  maxNear(i: number, j: number, r: number): number {
    let m = 0;
    for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) { const v = this.get(i + a, j + b); if (v < 90) m = Math.max(m, v); }
    return m;
  }
}

/**
 * Stack chunky rock blocks on every column: each LEVEL is its own slightly inset, jittered block
 * with a tint picked from the ramp (darker low down, lighter toward the top tier) and baked AO
 * (side faces darken toward the bottom; top corners darken next to taller neighbours).
 */
export function rockColumns(hm: Heightmap, batch: VoxelBatch, rng: Rng, ramp: readonly string[], o: { baseY?: number } = {}) {
  const baseY = o.baseY ?? 0;
  for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
    const levels = hm.get(i, j);
    if (levels <= 0) continue;
    const full = Math.ceil(levels);
    for (let l = 0; l < full; l++) {
      const y0 = baseY + l * LEVEL;
      const isTop = l === full - 1;
      const y1 = baseY + Math.min(levels, l + 1) * LEVEL + (isTop ? (rng.next() - 0.5) * 0.1 : 0);
      const ins = 0.008 + rng.next() * 0.03;
      // Staggered like masonry: alternate levels shift a little, plus per-block jitter.
      const jx = (rng.next() - 0.5) * 0.05 + (l % 2 ? 0.03 : -0.03), jz = (rng.next() - 0.5) * 0.05;
      const x0 = hm.cx(i) - CELL / 2 + ins + jx, x1 = hm.cx(i) + CELL / 2 - ins + jx;
      const z0 = hm.cz(j) - CELL / 2 + ins + jz, z1 = hm.cz(j) + CELL / 2 - ins + jz;
      // Tint: a ramp index from height + noise; a few blocks much darker/lighter for chunkiness.
      const tierLight = Math.min(1, (l + 1) / 7);
      let shade = 0.78 + tierLight * 0.25 + (rng.next() - 0.5) * 0.26;
      if (rng.chance(0.08)) shade *= 0.78;
      const tint = new THREE.Color(1, 1, 1).multiplyScalar(shade);
      // Hidden faces: sides fully covered by a neighbour column at least this tall.
      const cover = (a: number, b: number) => hm.get(a, b) >= l + 1;
      const topAo = (a: number, b: number) => (hm.get(i + a, j) > levels + 0.2 ? 0.72 : 1) * (hm.get(i, j + b) > levels + 0.2 ? 0.72 : 1);
      batch.box([x0, y0, z0], [x1, y1, z1], tint, rng, {
        skip: [cover(i + 1, j), cover(i - 1, j), !isTop && hm.get(i, j) > l + 1, true, cover(i, j + 1), cover(i, j - 1)],
        aoBottom: l === 0 ? 0.45 : 0.7,
        topK: 1.45,
        aoTop: isTop ? [topAo(-1, 1), topAo(1, 1), topAo(1, -1), topAo(-1, -1)] : [1, 1, 1, 1],
      });
    }
  }
  void ramp;
}

// ------------------------------------------------------------------ light beams & dust

const BEAM_VERT = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec2 aSide;   // x: -1..1 across, y: 0..1 along
attribute vec2 aWidth;  // width at start, end
attribute float aSeed;
varying vec2 vSide;
varying float vSeed;
void main() {
  vec3 axis = aEnd - aStart;
  vec3 p = mix(aStart, aEnd, aSide.y);
  vec3 toCam = normalize(cameraPosition - p);
  vec3 across = normalize(cross(axis, toCam));
  p += across * aSide.x * mix(aWidth.x, aWidth.y, aSide.y) * 0.5;
  vSide = aSide;
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
varying vec2 vSide;
varying float vSeed;
void main() {
  float across = 1.0 - smoothstep(0.55, 0.95, abs(vSide.x));
  float along = smoothstep(0.0, 0.35, vSide.y) * (1.0 - smoothstep(0.75, 1.0, vSide.y));
  // Slow shimmer: dust drifting through the shaft.
  float flick = 0.82 + 0.18 * sin(vSide.y * 9.0 - uTime * 0.7 + vSeed * 6.0) * sin(vSide.x * 3.0 + uTime * 0.4 + vSeed);
  float a = across * along * flick * uIntensity;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;

export interface BeamSpec { start: THREE.Vector3; end: THREE.Vector3; width: [number, number] }

/** Volumetric light shafts: camera-facing ribbons around each beam axis, additive. One draw call. */
export function lightBeams(beams: BeamSpec[], color: THREE.ColorRepresentation, intensity = 0.32): { mesh: THREE.Mesh; update: (t: number) => void } {
  const n = beams.length;
  const g = new THREE.BufferGeometry();
  const segs = 6;
  const start: number[] = [], end: number[] = [], side: number[] = [], width: number[] = [], seed: number[] = [], pos: number[] = [];
  const index: number[] = [];
  beams.forEach((b, k) => {
    const base = (start.length / 3);
    for (let s = 0; s <= segs; s++) for (const x of [-1, 1]) {
      start.push(b.start.x, b.start.y, b.start.z); end.push(b.end.x, b.end.y, b.end.z);
      side.push(x, s / segs); width.push(b.width[0], b.width[1]); seed.push(k / n); pos.push(0, 0, 0);
    }
    for (let s = 0; s < segs; s++) {
      const a = base + s * 2;
      index.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aStart', new THREE.Float32BufferAttribute(start, 3));
  g.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 2));
  g.setAttribute('aWidth', new THREE.Float32BufferAttribute(width, 2));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  g.setIndex(index);
  const m = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uIntensity: { value: intensity } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const out = new THREE.Mesh(g, m);
  out.frustumCulled = false;
  out.renderOrder = 5;
  return { mesh: out, update: (t) => { m.uniforms.uTime!.value = t; } };
}

const DUST_VERT = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec4 aRnd;    // along, across-x, across-y, phase
uniform float uTime;
uniform float uSize;
varying float vA;
void main() {
  vec3 axis = aEnd - aStart;
  float t = fract(aRnd.x + uTime * 0.012 * (0.5 + aRnd.w));
  vec3 p = mix(aStart, aEnd, t);
  vec3 u = normalize(cross(axis, vec3(0.0, 1.0, 0.0)));
  vec3 v = normalize(cross(axis, u));
  float w = mix(0.6, 1.6, t);
  p += u * aRnd.y * w + v * aRnd.z * w * 0.6;
  p.x += sin(uTime * 0.6 + aRnd.w * 20.0) * 0.08;
  p.y += sin(uTime * 0.45 + aRnd.w * 13.0) * 0.06;
  vA = (0.5 + 0.5 * sin(uTime * 2.0 + aRnd.w * 40.0)) * smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.8, 1.0, t));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize;
}`;

const DUST_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() { gl_FragColor = vec4(uColor * vA, 1.0); }`;

/** Floating dust motes inside the beams: square 1–2 px points (no texture), additive. One draw call. */
export function dustMotes(beams: BeamSpec[], perBeam: number, rng: Rng, color: THREE.ColorRepresentation = '#fff0c8'): { points: THREE.Points; update: (t: number) => void; setPixelSize: (px: number) => void } {
  const start: number[] = [], end: number[] = [], rnd: number[] = [], pos: number[] = [];
  for (const b of beams) for (let i = 0; i < perBeam; i++) {
    start.push(b.start.x, b.start.y, b.start.z); end.push(b.end.x, b.end.y, b.end.z);
    rnd.push(rng.next(), (rng.next() - 0.5) * b.width[0] * 0.5, (rng.next() - 0.5) * b.width[0] * 0.5, rng.next());
    pos.push(0, 0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aStart', new THREE.Float32BufferAttribute(start, 3));
  g.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 3));
  g.setAttribute('aRnd', new THREE.Float32BufferAttribute(rnd, 4));
  const m = new THREE.ShaderMaterial({
    vertexShader: DUST_VERT, fragmentShader: DUST_FRAG,
    uniforms: { uTime: { value: 0 }, uSize: { value: 1 }, uColor: { value: new THREE.Color(color).multiplyScalar(1.1) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = 6;
  return { points, update: (t) => { m.uniforms.uTime!.value = t; }, setPixelSize: (px) => { m.uniforms.uSize!.value = px; } };
}

/** Window-pane cookie for a SpotLight.map: bright panes, dark mullions, soft falloff. */
export function windowCookie(cols = 3, rows = 2): THREE.CanvasTexture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, s, s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#ffffff'); g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(6, 10, s - 12, s - 20);
  ctx.fillStyle = '#000';
  for (let i = 1; i < cols; i++) ctx.fillRect(6 + ((s - 12) * i) / cols - 2, 0, 4, s);
  for (let j = 1; j < rows; j++) ctx.fillRect(0, 10 + ((s - 20) * j) / rows - 2, s, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ the cave arena

export interface ArenaRig {
  group: THREE.Group;
  /** Kin spots [yours, foe] and people spots [player, trainer] on the floor. */
  spots: [THREE.Vector3, THREE.Vector3];
  people: [THREE.Vector3, THREE.Vector3];
  /** Where a leaving trainer walks to (up the stairs). */
  trainerExit: THREE.Vector3;
  spriteLight: SpriteLight;
  /** The shadow-casting key light (window spot, or a directional sun from kit/lights.ts). */
  key: THREE.SpotLight | THREE.DirectionalLight;
  update(t: number): void;
  setPixelSize(px: number): void;
  dispose(): void;
}

export interface CaveArenaOptions { seed?: number; quality?: 'high' | 'low' }

/**
 * Ember Ridge cave arena: a sunken dirt floor inside tiered blocky rock, a raised miners'
 * lodge (wood floor, shelves, crates, workbench, cart) up a stair with red rails at the back
 * right, a big window high in the back-left wall pouring warm light shafts onto the floor,
 * grey rubble piles, a front ledge with its own stair. All original.
 */
export function buildCaveArena(opts: CaveArenaOptions = {}): ArenaRig {
  const flags = new Set((new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('post') ?? '').split(','));
  const rng = new Rng(opts.seed ?? 11);
  const q = opts.quality ?? 'high';
  const group = new THREE.Group();
  group.name = 'hd2d-cave-arena';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // ---- textures (cached for the session)
  const texRock = cachedTexture('rock', () => paintRock(5, 32));
  const texStone = flags.has('voxel') ? cachedTexture('stone', () => paintStone(9, 32)) : cachedTexture('boulder-stone', () => paintBoulder(9, 32, RAMPS.stone));
  const texDirt = cachedTexture('dirt', () => paintDirt(3, 64));
  const texPlank = cachedTexture('plank', () => paintPlanks(4, 64, 64, 8));
  const texBoards = cachedTexture('boards', () => paintBoards(6, 32));
  const texPlaster = cachedTexture('plaster', () => paintPlaster(8, 32));
  const texSteel = cachedTexture('paint', () => paintSteel(2, 16, RAMPS.paint));
  const texRug = cachedTexture('rug', () => paintRug(32));

  // ---- heightmap: floor (0) ringed by rising tiers
  const X0 = -13.5, Z0 = -12.6;
  const hm = new Heightmap(30, 21, X0, Z0);
  const floorHalfX = 5.4, floorFront = 3.6, floorBack = -3.0;
  const platformY = 3; // lodge floor in LEVELs (2.1 units)
  const lodge = { x0: 1.6, x1: 9.4, z0: -10.0, z1: -4.4 };
  const stair = { x0: 2.5, x1: 3.6 };
  const frontStair = { x0: -4.6, x1: -3.5 };
  const cliffZ = -6.3; // back wall face (windows) for x < lodge.x0
  for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
    const x = hm.cx(i), z = hm.cz(j);
    // Distance outside the (slightly ragged) floor rectangle.
    const wob = Math.sin(x * 1.3 + z * 0.7) * 0.35 + Math.sin(z * 2.1 - x * 0.4) * 0.25;
    const dx = Math.max(0, Math.abs(x) - floorHalfX - wob);
    const dzB = Math.max(0, floorBack - z - wob * 0.6);
    const dzF = Math.max(0, z - floorFront - wob * 0.5);
    let lv = 0;
    if (dzF > 0 && dx <= 0) lv = Math.min(2, 1 + Math.floor(dzF / 2.2)); // front ledge: low, lets the camera in
    else {
      const d = Math.max(dx, dzB, dzF * 0.6);
      // Terraces: each tier is a ledge about two blocks deep, one or two blocks high.
      if (d > 0) lv = 1 + Math.floor(d / 1.75) + (d > 3.5 ? Math.floor((d - 3.5) / 1.2) : 0);
      // The left wall rises higher than the right.
      if (x < -1 && d > 0) lv += Math.floor((-1 - x) / 8);
      if (dzB > 0 && dx <= 0) lv = Math.min(lv, 1 + Math.floor(dzB / 0.8));
    }
    // The lodge sits on a level shelf; the ledge in front of it rises to the platform height.
    if (x > lodge.x0 && x < lodge.x1 && z < lodge.z1) lv = 0;
    else if (x > lodge.x0 && x < lodge.x1 && z < floorBack) lv = z > floorBack - 0.9 ? Math.min(lv, 2) : platformY;
    // Stair cuts.
    if (x > stair.x0 && x < stair.x1 && z < floorBack + 0.5 && z > lodge.z1 - 0.2) lv = 0;
    if (x > frontStair.x0 && x < frontStair.x1 && z > floorFront - 0.3) lv = 0;
    // Back cliff (window wall), tall left wall, right wall, wall behind the lodge.
    if (z < cliffZ && x < lodge.x0) lv = Math.max(lv, 9);
    if (x < -9) lv = Math.max(lv, 7 + Math.floor((-9 - x) * 0.5));
    if (x > 9.4) lv = Math.max(lv, 5);
    if (z < lodge.z0) lv = Math.max(lv, 9);
    // Jagged tops: quantise with noise so tiers read as stacked boulders, not steps.
    // Boulder clusters (2×2 cells) poke up or sink a level, so ledges aren't ruler-straight.
    const cl = Math.sin(Math.floor(i / 2) * 12.9898 + Math.floor(j / 2) * 78.233) * 43758.5453;
    const n = cl - Math.floor(cl);
    if (lv > 0 && lv < 9) lv = Math.max(1, lv + (n > 0.8 ? 1 : n < 0.1 ? -1 : 0) + (rng.chance(0.06) ? 1 : 0));
    hm.set(i, j, lv);
  }

  // ---- rock (one mesh)
  const rock = new VoxelBatch(32);
  if (flags.has('voxel')) rockColumns(hm, rock, rng, RAMPS.rock);
  else boulderColumns(hm, rock, rng, { lite: q === 'low' });
  const rockMat = track(surfaceMaterial(flags.has('voxel') ? texRock : cachedTexture('boulder-earth', () => paintBoulder(5, 32, RAMPS.boulder)), undefined, true));
  group.add(mesh(rock.build(), rockMat));

  // ---- floor: one textured grid with baked AO toward the walls
  {
    const g = new THREE.PlaneGeometry(hm.nx * CELL, hm.nz * CELL, hm.nx, hm.nz);
    g.rotateX(-Math.PI / 2);
    g.translate(X0 + (hm.nx * CELL) / 2, 0, Z0 + (hm.nz * CELL) / 2);
    const pos = g.attributes.position!;
    const uv = g.attributes.uv!;
    const col = new Float32Array(pos.count * 3);
    const tile = TEXEL * 64;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      uv.setXY(k, x / tile, -z / tile);
      const [i, j] = hm.cell(x - 0.01, z - 0.01);
      let near = 0;
      for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, -1], [1, -1], [-1, 1]] as const) {
        const v = hm.get(i + a, j + b);
        if (v < 90) near = Math.max(near, Math.min(v, 3) * (a === 0 && b === 0 ? 1 : 0.8));
      }
      const wide = Math.min(4, hm.maxNear(i, j, 2));
      const ao = 1 - 0.13 * near - 0.06 * wide;
      col.set([ao, ao * 0.98, ao * 0.96], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    group.add(mesh(g, track(surfaceMaterial(texDirt)), false, true));
  }

  // ---- stairs (stone) with red rails, and rubble piles (one stone mesh)
  const stone = new VoxelBatch(32);
  const metal = new VoxelBatch(16);
  const wood = new VoxelBatch(32);
  const props = new VoxelBatch(32);
  const steps = (x0: number, x1: number, zFrom: number, zTo: number, yFrom: number, yTo: number, n: number) => {
    for (let s = 0; s < n; s++) {
      const za = zFrom + ((zTo - zFrom) * s) / n, zb = zFrom + ((zTo - zFrom) * (s + 1)) / n;
      const y = yFrom + ((yTo - yFrom) * (s + 1)) / n;
      stone.box([x0, 0, Math.min(za, zb)], [x1, y, Math.max(za, zb)], new THREE.Color(1, 1, 1).multiplyScalar(0.95 + rng.next() * 0.12), rng, { skip: [false, false, false, true, false, false], aoBottom: 0.7 });
    }
    // Rails: posts + a sloped bar on each side.
    const red = rampColor(RAMPS.rail, 4).multiplyScalar(1.3);
    for (const x of [x0 - 0.1, x1 + 0.1]) {
      for (let s = 0; s <= 2; s++) {
        const k = s / 2;
        const z = zFrom + (zTo - zFrom) * k, y = yFrom + (yTo - yFrom) * k;
        metal.box([x - 0.08, y, z - 0.08], [x + 0.08, y + 0.7, z + 0.08], red, rng);
      }
      const len = Math.hypot(zTo - zFrom, yTo - yFrom);
      const ang = Math.atan2(yTo - yFrom, zFrom - zTo);
      metal.rotBox([x, (yFrom + yTo) / 2 + 0.7, (zFrom + zTo) / 2], [0.2, 0.16, len + 0.24], 0, red, rng, ang);
    }
  };
  steps(stair.x0, stair.x1, floorBack + 0.5, lodge.z1 - 0.1, 0, platformY * LEVEL, 6);
  steps(frontStair.x0, frontStair.x1, floorFront - 0.2, floorFront + 1.6, 0, 2 * LEVEL, 3);

  const rubble = (cx: number, cz: number, r: number, n: number) => rubblePile(stone, [cx, 0, cz], rng, { radius: r * 1.3, count: Math.round(n * 0.8), big: Math.min(0.8, r * 0.75), heap: 0.6, tint: new THREE.Color(0.95, 0.95, 0.97) });
  rubble(-4.7, -2.1, 1.0, 22);
  rubble(-5.0, 1.5, 0.9, 18);
  rubble(4.9, 2.3, 1.2, 26);
  rubble(5.1, -1.3, 0.7, 12);
  rubble(-1.6, -2.9, 0.6, 9);
  rubble(1.0, 3.5, 0.8, 12);
  // Scattered pebbles on the floor.
  pebbles(stone, [-floorHalfX, floorBack, floorHalfX, floorFront], 40, rng, [{ x: -1.3, z: 1.0, r: 1.2 }, { x: 1.5, z: -1.0, r: 1.2 }, { x: -2.5, z: 1.9, r: 0.6 }, { x: 2.75, z: -1.95, r: 0.6 }]);

  // ---- the lodge: plank floor, plaster back wall with steel frame, shelves and props
  const ly = platformY * LEVEL;
  wood.box([lodge.x0, ly - 0.25, lodge.z0], [lodge.x1, ly, lodge.z1], new THREE.Color(1, 1, 1), rng, { skip: [false, false, false, true, true, false], texOff: [0, 0] });
  // Front trim beam along the ledge.
  metal.box([lodge.x0, ly - 0.05, lodge.z1 - 0.08], [lodge.x1, ly + 0.07, lodge.z1 + 0.06], rampColor(RAMPS.steel, 4), rng);
  const plaster = new VoxelBatch(32);
  plaster.box([lodge.x0, ly, lodge.z0 - 0.3], [lodge.x1, ly + 3.4, lodge.z0], new THREE.Color(1, 1, 1), rng, { aoBottom: 0.55 });
  plaster.box([lodge.x1 - 0.05, ly, lodge.z0], [lodge.x1 + 0.3, ly + 3.4, lodge.z1 - 1.6], new THREE.Color(0.85, 0.85, 0.85), rng, { aoBottom: 0.55 });
  // Steel posts + header beam.
  const steelC = rampColor(RAMPS.steel, 4);
  for (const x of [lodge.x0 + 0.15, (lodge.x0 + lodge.x1) / 2 + 0.6, lodge.x1 - 0.2]) {
    metal.box([x - 0.16, ly, lodge.z0 + 0.0], [x + 0.16, ly + 3.4, lodge.z0 + 0.3], steelC, rng);
  }
  metal.box([lodge.x0, ly + 3.0, lodge.z0], [lodge.x1, ly + 3.4, lodge.z0 + 0.35], steelC, rng);
  metal.box([lodge.x0 - 0.05, ly, lodge.z1 - 0.2], [lodge.x0 + 0.25, ly + 3.4, lodge.z1 + 0.1], steelC, rng);
  // Fewer, bigger, readable props (kit/props.ts): bookcases with same-hue runs of books,
  // framed crates, a table, banners on the wall, braziers on the floor.
  const glowProps = new VoxelBatch(16);
  const pb: PropBatches = { wood, paint: props, glow: glowProps, stone };
  const legacyProps = flags.has('oldprops');
  if (legacyProps) {
    const shelfC = new THREE.Color(1, 1, 1).multiplyScalar(0.9);
    const itemColors = ['#3f8a58', '#2f5f8f', '#c8452f', '#e0a83a', '#efe2c4', '#7a4fa0', '#4fb8c8'];
    for (let u = 0; u < 3; u++) {
      const sx = lodge.x0 + 1.1 + u * 1.5, sz = lodge.z0 + 0.35;
      wood.box([sx, ly, sz], [sx + 1.25, ly + 1.7, sz + 0.45], shelfC, rng, { skip: [false, false, false, true, true, false] });
      for (let s2 = 0; s2 < 3; s2++) {
        const y = ly + 0.25 + s2 * 0.52;
        wood.box([sx + 0.04, y - 0.04, sz + 0.05], [sx + 1.21, y, sz + 0.5], shelfC, rng);
        let x = sx + 0.1;
        while (x < sx + 1.12) {
          const w = 0.08 + rng.next() * 0.14, hh = 0.18 + rng.next() * 0.22;
          if (x + w > sx + 1.18) break;
          props.box([x, y, sz + 0.12], [x + w, y + hh, sz + 0.42], new THREE.Color(rng.pick(itemColors)), rng);
          x += w + 0.02 + (rng.chance(0.25) ? 0.08 : 0);
        }
      }
    }
  } else {
    for (let u = 0; u < 3; u++) bookcase(pb, [lodge.x0 + 1.3 + u * 1.55, ly, lodge.z0 + 0.8], rng, { w: 1.4, h: 1.95, d: 0.5 });
  }
  // Crates (stacked), a table on the rug, banners, braziers.
  crate(pb, [lodge.x0 + 1.0, ly, lodge.z1 - 0.9], 0.55, rng, { ry: 0.2 });
  crate(pb, [lodge.x0 + 1.65, ly, lodge.z1 - 0.75], 0.45, rng, { ry: -0.15 });
  crate(pb, [lodge.x0 + 1.1, ly + 0.55, lodge.z1 - 0.9], 0.4, rng, { ry: 0.45 });
  crate(pb, [-5.3, 0, -2.75], 0.55, rng, { ry: 0.3 });
  crate(pb, [-5.75, 0, -2.4], 0.42, rng, { ry: -0.2 });
  crate(pb, [5.8, 0, 0.5], 0.5, rng, { ry: -0.4 });
  barrel(pb, [6.0, 0, -0.35], 0.24, 0.62, rng);
  if (!legacyProps) {
    table(pb, [lodge.x0 + 4.4, ly, lodge.z1 - 1.5], [1.5, 0.75, 0.5], rng);
    banner(pb, [lodge.x0 + 6.1, ly + 2.8, lodge.z0 + 0.02], rng, { w: 0.75, h: 1.5, cloth: '#2f5a8a', trim: '#e0b048' });
    banner(pb, [lodge.x0 + 7.1, ly + 2.8, lodge.z0 + 0.02], rng, { w: 0.75, h: 1.5, cloth: '#9a3328', trim: '#e0b048' });
  }
  const brazierLights = legacyProps ? [] : [brazier(pb, [-5.1, 0, -0.4], rng), brazier(pb, [4.0, 0, -3.0], rng, { r: 0.28, h: 0.7 })];
  // Workbench.
  const benchX = lodge.x1 - 2.6, benchZ = lodge.z0 + 1.5;
  table(pb, [benchX + 0.8, ly, benchZ + 0.35], [1.6, 0.7, 0.72], rng);
  props.box([benchX + 0.2, ly + 0.72, benchZ + 0.15], [benchX + 0.7, ly + 0.76, benchZ + 0.5], new THREE.Color('#efe2c4'), rng); // papers
  props.box([benchX + 1.1, ly + 0.72, benchZ + 0.2], [benchX + 1.3, ly + 0.95, benchZ + 0.4], new THREE.Color('#2f5f8f'), rng);
  // Mine cart on a short rail by the lodge edge.
  const cartX = lodge.x1 - 1.4, cartZ = lodge.z1 - 1.1;
  metal.box([cartX - 0.5, ly + 0.15, cartZ - 0.35], [cartX + 0.5, ly + 0.75, cartZ + 0.35], rampColor(RAMPS.steel, 4), rng);
  props.box([cartX - 0.42, ly + 0.7, cartZ - 0.28], [cartX + 0.42, ly + 0.86, cartZ + 0.28], new THREE.Color('#ff8a3a'), rng); // ember ore
  for (const sx of [-0.32, 0.32]) for (const sz of [-0.36, 0.36]) metal.box([cartX + sx - 0.1, ly, cartZ + sz - 0.03], [cartX + sx + 0.1, ly + 0.2, cartZ + sz + 0.03], rampColor(RAMPS.steel, 0), rng);
  for (const sz of [-0.36, 0.36]) metal.box([lodge.x1 - 2.6, ly, cartZ + sz - 0.03], [lodge.x1 - 0.1, ly + 0.04, cartZ + sz + 0.03], rampColor(RAMPS.steel, 4), rng);
  // Map board on the wall (legacy dressing only: banners replace it).
  if (legacyProps) wood.box([lodge.x0 + 5.6, ly + 1.2, lodge.z0 - 0.02], [lodge.x0 + 6.8, ly + 2.1, lodge.z0 + 0.06], new THREE.Color(0.75, 0.75, 0.75), rng);
  if (legacyProps) for (let i = 0; i < 5; i++) {
    const px = lodge.x0 + 5.7 + rng.next() * 0.9, py = ly + 1.3 + rng.next() * 0.55;
    props.box([px, py, lodge.z0 + 0.06], [px + 0.18, py + 0.22, lodge.z0 + 0.08], new THREE.Color(rng.pick(['#efe2c4', '#ffd23f', '#9ad0ff'])), rng);
  }
  // Pickaxes and a lantern post on the arena floor (props).
  for (const [x, z, ry] of [[-5.5, 0.3, 0.3], [5.8, -0.6, -0.4]] as const) {
    wood.rotBox([x, 0.42, z], [0.06, 0.84, 0.06], ry, new THREE.Color(0.9, 0.9, 0.9), rng, 0.25);
    metal.rotBox([x + 0.1, 0.84, z], [0.42, 0.07, 0.07], ry, rampColor(RAMPS.steel, 4), rng, 0.25);
  }

  // Rug in the lodge (its own texture).
  {
    const g = new THREE.PlaneGeometry(2.4, 1.6);
    g.rotateX(-Math.PI / 2);
    const rug = mesh(g, track(new THREE.MeshLambertMaterial({ map: texRug })), false, true);
    rug.position.set(lodge.x0 + 4.4, ly + 0.012, lodge.z1 - 1.5);
    group.add(rug);
  }

  const stoneMat = track(surfaceMaterial(texStone, undefined, true));
  group.add(mesh(stone.build(), stoneMat));
  group.add(mesh(wood.build(), track(surfaceMaterial(texPlank, undefined, true))));
  group.add(mesh(metal.build(), track(surfaceMaterial(texSteel, undefined, true))));
  group.add(mesh(plaster.build(), track(surfaceMaterial(texPlaster)), false, true));
  group.add(mesh(props.build(), track(surfaceMaterial(texSteel))));

  // ---- window high in the back-left cliff + a smaller one on the left wall (emissive)
  const win = { x: -2.7, y: 4.0, z: cliffZ - 0.08, w: 2.8, h: 1.8 };
  const win2 = { x: -6.6, y: 4.3, z: cliffZ - 0.08, w: 1.6, h: 1.5 };
  const glow = new VoxelBatch(16);
  glow.append(glowProps);
  const frame = new VoxelBatch(32);
  const pane = new THREE.Color('#fff2cc').multiplyScalar(3.2);
  const addWindow = (cx: number, cy: number, cz: number, w: number, hh: number, normalX: boolean) => {
    const cols = normalX ? 2 : 3, rows = 2;
    if (!normalX) {
      glow.box([cx - w / 2, cy - hh / 2, cz - 0.05], [cx + w / 2, cy + hh / 2, cz + 0.02], pane, rng);
      for (let i = 0; i <= cols; i++) { const x = cx - w / 2 + (w * i) / cols; frame.box([x - 0.07, cy - hh / 2 - 0.07, cz], [x + 0.07, cy + hh / 2 + 0.07, cz + 0.12], new THREE.Color(0.55, 0.55, 0.55), rng); }
      for (let j = 0; j <= rows; j++) { const y = cy - hh / 2 + (hh * j) / rows; frame.box([cx - w / 2 - 0.07, y - 0.07, cz], [cx + w / 2 + 0.07, y + 0.07, cz + 0.12], new THREE.Color(0.55, 0.55, 0.55), rng); }
    } else {
      glow.box([cx - 0.02, cy - hh / 2, cz - w / 2], [cx + 0.05, cy + hh / 2, cz + w / 2], pane, rng);
      for (let i = 0; i <= cols; i++) { const z = cz - w / 2 + (w * i) / cols; frame.box([cx, cy - hh / 2 - 0.07, z - 0.07], [cx + 0.12, cy + hh / 2 + 0.07, z + 0.07], new THREE.Color(0.55, 0.55, 0.55), rng); }
      for (let j = 0; j <= rows; j++) { const y = cy - hh / 2 + (hh * j) / rows; frame.box([cx, y - 0.07, cz - w / 2 - 0.07], [cx + 0.12, y + 0.07, cz + w / 2 + 0.07], new THREE.Color(0.55, 0.55, 0.55), rng); }
    }
  };
  // Carve the window openings out of the rock (no blocks in front of the panes).
  addWindow(win.x, win.y, win.z, win.w, win.h, false);
  addWindow(win2.x, win2.y, win2.z, win2.w, win2.h, false);
  // Ember crystals glowing in the rock (bloom accents).
  for (const [x, y, z] of [[-6.9, 1.5, -4.1], [6.8, 1.0, -3.6], [-6.6, 0.9, 3.1], [7.4, 1.7, 1.0], [-2.9, 1.5, -4.2]] as const) {
    for (let i = 0; i < 3; i++) glow.rotBox([x + (rng.next() - 0.5) * 0.3, y + rng.next() * 0.2, z + (rng.next() - 0.5) * 0.3], [0.09, 0.26 + rng.next() * 0.18, 0.09], rng.next() * 3, new THREE.Color('#ff8a2a').multiplyScalar(2.4), rng, (rng.next() - 0.5) * 0.8);
  }
  const glowMat = track(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }));
  group.add(mesh(glow.build(), glowMat, false, false));
  group.add(mesh(frame.build(), track(surfaceMaterial(texBoards))));
  // Clear rock in front of the windows (and keep a sight line for the light).
  carveWindow(group, win, win2);

  // ---- lights: warm window key (cookie spot, shadows), small window spot, fill, hemisphere
  const keyColor = new THREE.Color('#ffd7a0');
  const key = new THREE.SpotLight(keyColor, 110, 0, 0.42, 0.55, 1.2);
  key.position.set(win.x + 0.3, win.y + 0.6, win.z - 0.6);
  key.target.position.set(-0.6, 0, 0.6);
  key.map = track(windowCookie(3, 2));
  key.castShadow = !flags.has('noshadow');
  key.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 22;
  group.add(key, key.target);
  // The small window gets beams and a light-pool decal but no light of its own: a second
  // cookie spot cost ~20% of the frame for a patch the decal fakes well (docs/HD2D.md).
  const key2 = { position: new THREE.Vector3(win2.x + 0.2, win2.y + 0.5, win2.z - 0.6), target: { position: new THREE.Vector3(-3.2, 0, 1.2) } };
  const hemi = new THREE.HemisphereLight(new THREE.Color('#ffd9b0'), new THREE.Color('#3a2116'), 1.7);
  group.add(hemi);
  // Soft front fill so camera-facing rock never drops to black (no shadows).
  const fill = new THREE.DirectionalLight(new THREE.Color('#ffb98a'), 1.1);
  fill.position.set(3, 6, 10);
  group.add(fill, fill.target);
  // Lodge lantern + ember glows (warm point accents) on the high tier only.
  if (q === 'high' && !flags.has('nopoints')) {
    const lantern = new THREE.PointLight(new THREE.Color('#ffa24a'), 6, 6, 1.6);
    lantern.position.set(lodge.x0 + 4.2, ly + 2.2, lodge.z1 - 1.6);
    group.add(lantern);
    const ember = new THREE.PointLight(new THREE.Color('#ff7a2e'), 3, 4.5, 1.6);
    ember.position.copy(brazierLights[0] ?? new THREE.Vector3(-7.0, 1.2, -4.0));
    group.add(ember);
  }

  // ---- god rays + dust
  const beamColor = new THREE.Color('#ffd49a');
  const beams: BeamSpec[] = [];
  const dir = key.target.position.clone().sub(key.position).normalize();
  const shafts = [[-0.95, -0.35], [-0.55, 0.3], [-0.15, -0.1], [0.25, 0.35], [0.6, -0.3], [0.95, 0.15]] as const;
  for (const [ox, oy] of shafts) {
    const s = new THREE.Vector3(win.x + ox * win.w * 0.4, win.y + oy * win.h * 0.4, win.z + 0.2);
    const len = (s.y / -dir.y) * (0.92 + rng.next() * 0.08);
    beams.push({ start: s, end: s.clone().addScaledVector(dir, len), width: [0.32, 0.8 + rng.next() * 0.45] });
  }
  const dir2 = key2.target.position.clone().sub(key2.position).normalize();
  for (const ox of [-0.3, 0.3]) {
    const s = new THREE.Vector3(win2.x + ox * win2.w, win2.y, win2.z + 0.2);
    beams.push({ start: s, end: s.clone().addScaledVector(dir2, (s.y / -dir2.y) * 0.9), width: [0.45, 1.1] });
  }
  const rays = lightBeams(beams, beamColor, 0.26);
  track(rays.mesh.geometry); track(rays.mesh.material as THREE.Material);
  if (!flags.has('norays')) group.add(rays.mesh);
  const dust = dustMotes(beams, q === 'high' ? 50 : 26, rng);
  track(dust.points.geometry); track(dust.points.material as THREE.Material);
  group.add(dust.points);
  // Bright light pools where the main shafts land (a soft additive decal; the cookie light
  // does the real lighting, this adds the hazy bounce the reference glows with).
  {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const gr = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,214,150,0.55)'); gr.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 32, 32);
    const tex = track(new THREE.CanvasTexture(c));
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    const m = track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(0.55, 0.42, 0.28) }));
    for (const [land, sx, sz, k] of [[key.target.position, 5.5, 3.8, 1], [key2.target.position, 3.2, 2.4, 1.4]] as const) {
      const pool = new THREE.Mesh(g, k === 1 ? m : track(m.clone()));
      if (k !== 1) (pool.material as THREE.MeshBasicMaterial).color.multiplyScalar(k);
      pool.position.set(land.x, 0.02, land.z);
      pool.scale.set(sx, 1, sz);
      pool.renderOrder = 2;
      group.add(pool);
    }
  }

  // Shadow camera: the spot's frustum is already tight around the floor.
  const spriteLight: SpriteLight = {
    keyDir: key.position.clone().sub(key.target.position).normalize(),
    keyColor: new THREE.Color('#ffd7a0').multiplyScalar(0.62),
    sky: new THREE.Color('#ffd2a6').multiplyScalar(0.62),
    ground: new THREE.Color('#5a3524').multiplyScalar(0.62),
    rim: new THREE.Color('#ffe2b0').multiplyScalar(0.55),
  };

  return {
    group,
    spots: [new THREE.Vector3(-1.3, 0, 1.0), new THREE.Vector3(1.5, 0, -1.0)],
    people: [new THREE.Vector3(-2.5, 0, 1.9), new THREE.Vector3(2.75, 0, -1.95)],
    trainerExit: new THREE.Vector3((stair.x0 + stair.x1) / 2, platformY * LEVEL, lodge.z1 - 0.8),
    spriteLight,
    key,
    update(t) { rays.update(t); dust.update(t); },
    setPixelSize(px) { dust.setPixelSize(px); },
    dispose() { for (const d of disposables) d.dispose(); group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); },
  };
}

/** Remove rock blocks that would sit in front of the window panes (post-pass on the rock mesh). */
function carveWindow(group: THREE.Group, ...wins: { x: number; y: number; z: number; w: number; h: number }[]) {
  const rockMesh = group.children[0] as THREE.Mesh;
  const g = rockMesh.geometry;
  const pos = g.attributes.position!;
  const keep: number[] = [];
  const tri = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    tri.set(0, 0, 0);
    for (let k = 0; k < 3; k++) tri.add(new THREE.Vector3(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k)).multiplyScalar(1 / 3));
    let hit = false;
    for (const w of wins) {
      const wall = Math.abs(w.x) > 8; // the left-wall window faces +x
      if (!wall && Math.abs(tri.x - w.x) < w.w / 2 + 0.05 && Math.abs(tri.y - w.y) < w.h / 2 + 0.05 && tri.z > w.z - 0.05 && tri.z < w.z + 0.6) hit = true;
      if (wall && Math.abs(tri.z - w.z) < w.w / 2 + 0.05 && Math.abs(tri.y - w.y) < w.h / 2 + 0.05 && tri.x > w.x - 0.05) hit = true;
    }
    if (!hit) keep.push(t);
  }
  if (keep.length * 3 === pos.count) return;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name]!;
    const arr = new Float32Array(keep.length * 3 * a.itemSize);
    keep.forEach((t, n) => { for (let k = 0; k < 3 * a.itemSize; k++) arr[n * 3 * a.itemSize + k] = (a.array as Float32Array)[t * a.itemSize + k]!; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  out.computeBoundingSphere();
  out.computeBoundingBox();
  g.dispose();
  rockMesh.geometry = out;
}
