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
import { RAMPS, cachedTexture, paintBoulderAtlas, paintBoards, paintDirt, paintPlanks, paintPlaster, paintRock, paintRug, paintSteel, paintStone } from './textures';
import type { SpriteLight } from './sprite';
import { boulder, boulderColumns, clusterBump, pebbles, rubblePile, terraceLevel, wobbleAt } from './kit/rock';
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
  /**
   * Opt-in baked sky key (world direction, normalised on use): at build() every vertex colour is
   * multiplied by 0.55 + 0.75 · max(0, n · bake) — bright top planes, mid fronts, dark undersides
   * whatever the dynamic lights do. Off (null) by default.
   */
  bake: THREE.Vector3 | null = null;
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
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, uv: [number, number][], tint: THREE.Color, ao: [number, number, number, number] = [1, 1, 1, 1], flat = false) {
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
      if (flat) this.face.push(0, 0, -1, 1);
      else this.face.push(fl[i]![0], fl[i]![1], W, H * sideSign);
      this.col.push(tint.r * ao[i]!, tint.g * ao[i]!, tint.b * ao[i]!);
    }
  }

  /**
   * Axis-aligned box from `min` to `max`. `faces` skips sides (order: +x -x +y -y +z -z).
   * `ao(face, corner)` may return a per-corner AO factor; default darkens side bottoms.
   * `flat` codes every face as a seamless bevel facet (no dark seam, no lip) in any material.
   */
  box(min: V3, max: V3, tint: THREE.Color, rng: Rng, o: { skip?: boolean[]; aoBottom?: number; aoTop?: [number, number, number, number]; texOff?: [number, number]; topK?: number; flat?: boolean } = {}) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const t = 1 / (TEXEL * this.tileTexels);
    const ox = o.texOff?.[0] ?? rng.int(this.tileTexels) / this.tileTexels;
    const oy = o.texOff?.[1] ?? rng.int(this.tileTexels) / this.tileTexels;
    const sx = (x1 - x0) * t, sy = (y1 - y0) * t, sz = (z1 - z0) * t;
    const ab = o.aoBottom ?? 0.62;
    const top = o.aoTop ?? [1, 1, 1, 1];
    const sk = o.skip ?? [];
    const fl = !!o.flat;
    // Side faces: bottom corners get `ab`, top corners 1.
    const side = (a: V3, b: V3, c: V3, d: V3, n: V3, w: number) =>
      this.quad(a, b, c, d, n, [[ox, oy], [ox + w, oy], [ox + w, oy + sy], [ox, oy + sy]], tint, [ab, ab, 1, 1], fl);
    if (!sk[0]) side([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], sz);
    if (!sk[1]) side([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], sz);
    if (!sk[2]) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[ox, oy], [ox + sx, oy], [ox + sx, oy + sz], [ox, oy + sz]], o.topK ? tint.clone().multiplyScalar(o.topK) : tint, top, fl);
    if (!sk[3]) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[ox, oy], [ox + sx, oy], [ox + sx, oy + sz], [ox, oy + sz]], tint, [ab, ab, ab, ab], fl);
    if (!sk[4]) side([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], sx);
    if (!sk[5]) side([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], sx);
  }

  /** Box rotated about Y by `ry` (then X by `rx`, Z by `rz`) around its centre (props, rubble). */
  rotBox(center: V3, size: V3, ry: number, tint: THREE.Color, rng: Rng, rx = 0, rz = 0) {
    const start = this.pos.length;
    const h: V3 = [size[0] / 2, size[1] / 2, size[2] / 2];
    this.box([-h[0], -h[1], -h[2]], [h[0], h[1], h[2]], tint, rng, { skip: [false, false, false, true, false, false], aoBottom: 0.7 });
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...center), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
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

  /** Multiply the colour of every vertex so far by `k(x, y, z)` (e.g. darken the foreground). */
  shade(k: (x: number, y: number, z: number) => number) {
    for (let i = 0; i < this.pos.length; i += 3) {
      const f = k(this.pos[i]!, this.pos[i + 1]!, this.pos[i + 2]!);
      if (f !== 1) { this.col[i]! *= f; this.col[i + 1]! *= f; this.col[i + 2]! *= f; }
    }
  }

  build(): THREE.BufferGeometry {
    if (this.bake) {
      const L = this.bake.clone().normalize();
      for (let i = 0; i < this.nor.length; i += 3) {
        const f = 0.55 + 0.75 * Math.max(0, this.nor[i]! * L.x + this.nor[i + 1]! * L.y + this.nor[i + 2]! * L.z);
        this.col[i]! *= f; this.col[i + 1]! *= f; this.col[i + 2]! *= f;
      }
      this.bake = null; // applied once
    }
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

/**
 * A lit, pixel-textured surface material (shadows on). Vertex colour carries tint × AO.
 * `bevel` adds the texel bevel (addBevel); `seam = false` drops its dark 1-texel seam on box
 * faces (rock, stone and core materials — planks and crates keep it).
 */
export function surfaceMaterial(map: THREE.Texture | null, emissive?: THREE.ColorRepresentation, bevel = false, seam = true): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map, vertexColors: true });
  if (bevel) addBevel(m, seam);
  if (emissive !== undefined) { m.emissive = new THREE.Color(emissive); m.emissiveMap = map; }
  return m;
}

/**
 * Pixel bevel for VoxelBatch geometry, quantised to the texel grid, coded per vertex in `aFace`
 * (u, v, width, ±height):
 *  * box faces (width > 0): a 1-texel dark seam around the face (unless `seam` is false) and a
 *    1–2 texel lit lip along the top of side faces — chunky hand-made planks and crates;
 *  * rock faces (width ≤ -1.5, kit/rock.ts boulders; real width = -width - 2): never a seam;
 *    sides get a quantised vertical value gradient (×0.75 at the foot → 1.0 at the top), tops a
 *    soft 2-texel lit rim along their far edge — rounded, lit rock;
 *  * bevel facets (width = -1): no seam, brightness × height.
 */
export function addBevel(m: THREE.MeshLambertMaterial, seam = true) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute vec4 aFace;\nvarying vec4 vFace;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFace = aFace;');
    sh.fragmentShader = 'varying vec4 vFace;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        float tx = ${TEXEL.toFixed(5)};
        if (vFace.z < -1.5) {
          // Rock face: no seam. Quantised per texel and in 4 value bands.
          vec2 p = floor(vFace.xy / tx);
          float n = max(1.0, floor(abs(vFace.w) / tx));
          if (vFace.w < 0.0) {
            float t = clamp((p.y + 0.5) / n, 0.0, 1.0);
            diffuseColor.rgb *= 0.75 + 0.25 * min(1.0, floor(t * 4.0) / 3.0);
          } else {
            float top = n - 1.0 - p.y;
            diffuseColor.rgb *= top < 0.5 ? 1.12 : top < 1.5 ? 1.06 : 1.0;
          }
        } else if (vFace.z < 0.0) {
          // Bevel facet (kit/rock.ts): no seam; a fixed brightness.
          diffuseColor.rgb *= vFace.w;
        } else {
        vec2 p = floor(vFace.xy / tx);
        vec2 n = max(vec2(1.0), floor(abs(vFace.zw) / tx));
        float e = min(min(p.x, n.x - 1.0 - p.x), min(p.y, n.y - 1.0 - p.y));
        float k = ${seam ? 'e < 0.5 ? 0.58 : e < 1.5 ? 0.84 : 1.0' : '1.0'};
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
  m.customProgramCacheKey = () => (seam ? 'hd2d-bevel' : 'hd2d-bevel-rock');
}

/**
 * Scale the ambient (hemisphere) light a Lambert material receives by `k`, leaving direct light
 * alone: a floor with dark shade and full-strength sun patches. Composes with addBevel.
 */
export function scaleAmbient(m: THREE.MeshLambertMaterial, k: number) {
  const prev = m.onBeforeCompile.bind(m);
  const prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>\n\treflectedLight.indirectDiffuse *= ${k.toFixed(3)};`);
  };
  m.customProgramCacheKey = () => `${prevKey()}|amb${k.toFixed(3)}`;
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
attribute float aGain;  // per-shaft intensity (haze cones are dim)
varying vec2 vSide;
varying float vSeed;
varying float vGain;
void main() {
  vec3 axis = aEnd - aStart;
  vec3 p = mix(aStart, aEnd, aSide.y);
  vec3 toCam = normalize(cameraPosition - p);
  vec3 across = normalize(cross(axis, toCam));
  p += across * aSide.x * mix(aWidth.x, aWidth.y, aSide.y) * 0.5;
  vSide = aSide;
  vSeed = aSeed;
  vGain = aGain;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
varying vec2 vSide;
varying float vSeed;
varying float vGain;
void main() {
  // Broad, soft shaft: gaussian across, a soft start and a long fade toward the floor.
  float x = vSide.x, y = vSide.y;
  float across = exp(-x * x * 3.0) * (1.0 - smoothstep(0.8, 1.0, abs(x)));
  float along = smoothstep(0.0, 0.15, y) * (1.0 - 0.6 * y) * (1.0 - smoothstep(0.9, 1.0, y));
  // Faint internal streaks running down the shaft, and a slow shimmer of drifting dust.
  float streak = 0.86 + 0.14 * sin(x * 7.0 + vSeed * 17.0) * sin(x * 17.0 - vSeed * 5.0);
  float flick = 0.9 + 0.1 * sin(y * 7.0 - uTime * 0.6 + vSeed * 6.0);
  float a = across * along * streak * flick * uIntensity * vGain;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;

/** A light shaft: axis from `start` to `end`, ribbon width at both ends, optional gain (default 1). */
export interface BeamSpec { start: THREE.Vector3; end: THREE.Vector3; width: [number, number]; gain?: number }

/** Volumetric light shafts: camera-facing ribbons around each beam axis, additive. One draw call. */
export function lightBeams(beams: BeamSpec[], color: THREE.ColorRepresentation, intensity = 0.32): { mesh: THREE.Mesh; update: (t: number) => void } {
  const n = beams.length;
  const g = new THREE.BufferGeometry();
  const segs = 6;
  const start: number[] = [], end: number[] = [], side: number[] = [], width: number[] = [], seed: number[] = [], gain: number[] = [], pos: number[] = [];
  const index: number[] = [];
  beams.forEach((b, k) => {
    const base = (start.length / 3);
    // Across: 4 columns (-1, -0.33, 0.33, 1) so the gaussian profile interpolates smoothly.
    const cols = [-1, -1 / 3, 1 / 3, 1];
    for (let s = 0; s <= segs; s++) for (const x of cols) {
      start.push(b.start.x, b.start.y, b.start.z); end.push(b.end.x, b.end.y, b.end.z);
      side.push(x, s / segs); width.push(b.width[0], b.width[1]); seed.push(k / n); gain.push(b.gain ?? 1); pos.push(0, 0, 0);
    }
    const nc = cols.length;
    for (let s = 0; s < segs; s++) for (let c = 0; c + 1 < nc; c++) {
      const a = base + s * nc + c;
      index.push(a, a + 1, a + nc + 1, a, a + nc + 1, a + nc);
    }
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aStart', new THREE.Float32BufferAttribute(start, 3));
  g.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 2));
  g.setAttribute('aWidth', new THREE.Float32BufferAttribute(width, 2));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  g.setAttribute('aGain', new THREE.Float32BufferAttribute(gain, 1));
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
attribute vec2 aWidth;  // shaft width at start, end
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
  // Motes glow with the shaft they float in: its gaussian across-profile and length fade, so
  // they gather in the bright core.
  float hw = max(0.05, 0.5 * mix(aWidth.x, aWidth.y, t));
  float x = aRnd.y * w / hw;
  float core = exp(-x * x * 3.0) * smoothstep(0.0, 0.15, t) * (1.0 - 0.6 * t) * (1.0 - smoothstep(0.8, 1.0, t));
  vA = (0.5 + 0.5 * sin(uTime * 2.0 + aRnd.w * 40.0)) * core;
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
  const start: number[] = [], end: number[] = [], rnd: number[] = [], width: number[] = [], pos: number[] = [];
  for (const b of beams) for (let i = 0; i < perBeam; i++) {
    start.push(b.start.x, b.start.y, b.start.z); end.push(b.end.x, b.end.y, b.end.z);
    rnd.push(rng.next(), (rng.next() - 0.5) * b.width[0] * 0.5, (rng.next() - 0.5) * b.width[0] * 0.5, rng.next());
    width.push(b.width[0], b.width[1]);
    pos.push(0, 0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aStart', new THREE.Float32BufferAttribute(start, 3));
  g.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 3));
  g.setAttribute('aRnd', new THREE.Float32BufferAttribute(rnd, 4));
  g.setAttribute('aWidth', new THREE.Float32BufferAttribute(width, 2));
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
 * Ember Ridge cave arena: a sunken dirt floor ringed by 2–3 concentric boulder ledges, a raised
 * miners' lodge (wood floor, shelves, crates, workbench, cart) up a stair with red stringers at
 * the back right, a big window in the back cliff pouring broad warm shafts onto the floor, grey
 * rubble piles on the floor and the ledges, an open front with a small stair at the left
 * corner. All original.
 */
export function buildCaveArena(opts: CaveArenaOptions = {}): ArenaRig {
  const flags = new Set((new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('post') ?? '').split(','));
  const rng = new Rng(opts.seed ?? 11);
  const q = opts.quality ?? 'high';
  const group = new THREE.Group();
  group.name = 'hd2d-cave-arena';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const voxel = flags.has('voxel');

  // ---- textures (cached for the session). Rock and rubble: 64² atlases of four variants.
  const texRock = voxel ? cachedTexture('rock', () => paintRock(5, 32)) : cachedTexture('cave-boulder-atlas', () => paintBoulderAtlas(5, RAMPS.boulder));
  const texStone = voxel ? cachedTexture('stone', () => paintStone(9, 32)) : cachedTexture('cave-rubble-atlas', () => paintBoulderAtlas(9, RAMPS.rubble));
  const texDirt = cachedTexture('dirt', () => paintDirt(3, 64));
  const texPlank = cachedTexture('plank', () => paintPlanks(4, 64, 64, 8));
  const texBoards = cachedTexture('boards', () => paintBoards(6, 32));
  const texPlaster = cachedTexture('plaster', () => paintPlaster(8, 32));
  const texSteel = cachedTexture('paint', () => paintSteel(2, 16, RAMPS.paint));
  const texRug = cachedTexture('rug', () => paintRug(32));

  // ---- heightmap: the floor (0) ringed by stepped ledges from a smooth SDF
  const X0 = -13.5, Z0 = -12.6;
  const hm = new Heightmap(30, 23, X0, Z0); // z to 8.1: past the bottom edge of the frame
  const floorHalfX = 5.4, floorFront = 3.6, floorBack = -3.0;
  const platformY = 3; // lodge floor in LEVELs (2.1 units)
  const lodge = { x0: 1.6, x1: 9.4, z0: -10.0, z1: -4.4 };
  const stair = { x0: 2.7, x1: 4.5 };
  const frontStair = { x0: -5.4, x1: -3.6, z0: 3.65, z1: 5.4 };
  const cliffZ = -6.3; // back wall face (windows) for x < lodge.x0
  // Signed distance to the floor: a rounded rectangle open toward the camera (+z).
  const R = 2.6;
  const sdf = (x: number, z: number) => {
    const qx = Math.abs(x) - (floorHalfX - R), qz = floorBack + R - z;
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - R;
  };
  // Each ledge is two cells deep and 1–2 LEVELs high; three tiers, then the walls.
  const TIER_LV = [0, 2, 3, 5];
  const ph = rng.next() * 10;
  for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
    const x = hm.cx(i), z = hm.cz(j);
    const tier = terraceLevel(sdf(x, z) - wobbleAt(x, z, ph, 0.2), 2 * CELL, 9);
    let lv = tier < TIER_LV.length ? TIER_LV[tier]! : 8;
    if (tier > 0 && tier < TIER_LV.length) lv = Math.max(1, lv + clusterBump(i, j, ph, 0.03));
    // The open front: floor in the middle, a low 1–2 level corner either side.
    if (z > floorFront && Math.abs(x) <= floorHalfX) lv = Math.abs(x) < 3.5 ? 0 : Math.abs(x) < 4.5 ? 1 : 2;
    // Ledges in front of the window cliff stay low so the windows sit above them.
    if (z > cliffZ && z < floorBack && x > -9.0 && x < lodge.x0) lv = Math.min(lv, z > floorBack - 2 * CELL ? 2 : 3);
    // The lodge sits on a level shelf; the ledge in front of it rises to the platform height.
    if (x > lodge.x0 && x < lodge.x1 && z < lodge.z1) lv = 0;
    else if (x > lodge.x0 && x < lodge.x1 && z < floorBack) lv = z > floorBack - 0.9 ? Math.min(lv, 2) : platformY;
    // Stair cuts.
    if (x > stair.x0 && x < stair.x1 && z < floorBack + 0.5 && z > lodge.z1 - 0.2) lv = 0;
    if (x > frontStair.x0 && x < frontStair.x1 && z > frontStair.z0 - 0.1 && z < frontStair.z1) lv = 0;
    // Back cliff (window wall), wall behind the lodge, right wall.
    if (z < cliffZ && x < lodge.x0) lv = Math.max(lv, 9);
    if (z < lodge.z0) lv = Math.max(lv, 9);
    if (x > lodge.x1 && z < floorBack) lv = Math.max(lv, 5);
    // The right side stays low (≤ 5 levels) in front of the lodge's back wall: its lit tops read
    // at the top right of the frame instead of a tall dark cliff.
    if (x > lodge.x0 && z > lodge.z0) lv = Math.min(lv, 5);
    hm.set(i, j, lv);
  }
  const isStair = (x: number, z: number) => (x > stair.x0 - 0.1 && x < stair.x1 + 0.1 && z < floorBack + 0.6 && z > lodge.z1 - 0.3) || (x > frontStair.x0 - 0.1 && x < frontStair.x1 + 0.4 && z > frontStair.z0 - 0.2 && z < frontStair.z1 + 0.2);
  // Kin, people and the trainer's walk stay clear of props.
  const keepOut = [{ x: -1.3, z: 1.0, r: 1.3 }, { x: 1.5, z: -1.0, r: 1.3 }, { x: -2.5, z: 1.9, r: 0.8 }, { x: 2.75, z: -1.95, r: 0.8 }, { x: 2.5, z: -0.65, r: 0.7 }];
  const clear = (x: number, z: number, r: number) => keepOut.every((c) => (x - c.x) ** 2 + (z - c.z) ** 2 > (c.r + r) ** 2);
  // Baked sky key for rock and stone: lit tops, mid fronts, dark undersides.
  const LBAKE = new THREE.Vector3(0, 1, 0.4);
  // Geometry nearer than the floor front sinks into foreground shade (× ≈0.66).
  const fore = (_x: number, _y: number, z: number) => 1 - 0.34 * THREE.MathUtils.smoothstep(z, floorFront, floorFront + 0.8);

  // ---- rock (one mesh)
  const rock = new VoxelBatch(voxel ? 32 : 64);
  if (voxel) rockColumns(hm, rock, rng, RAMPS.rock);
  else boulderColumns(hm, rock, rng, { lite: q === 'low', shade: [0.74, 1.0], topK: 1.75, deep: 0.75 });
  // A dark pebble skirt along the wall foot (≤ 0.4 units out onto the floor).
  {
    const per = q === 'high' ? 3 : 1;
    for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
      if (hm.get(i, j) !== 0) continue;
      const cx = hm.cx(i), cz = hm.cz(j);
      if (cz < lodge.z1 + 0.3 || Math.abs(cx) > floorHalfX + 2 || isStair(cx, cz)) continue;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nv = hm.get(i + a, j + b);
        if (nv <= 0 || nv > 90 || isStair(hm.cx(i + a), hm.cz(j + b))) continue;
        for (let k = 0; k < per; k++) {
          const along = (rng.next() - 0.5) * CELL, out = rng.next() ** 2 * 0.4 + 0.02;
          const x = cx + a * (CELL / 2 - out) + (b !== 0 ? along : 0), z = cz + b * (CELL / 2 - out) + (a !== 0 ? along : 0);
          if (!clear(x, z, 0.1)) continue;
          const s = 0.07 + rng.next() * 0.1 * (1 - out);
          boulder(rock, [x, s * 0.2, z], [s * 1.3, s * 0.7, s * 1.1], new THREE.Color(1, 1, 1).multiplyScalar(0.45 + rng.next() * 0.25), rng, {
            ry: rng.next() * 3, jitter: s * 0.08, topJitter: s * 0.1, aoBottom: 0.5, topK: 1.2, topOnly: true,
          });
        }
      }
    }
  }
  rock.shade(fore);
  rock.bake = LBAKE;
  const rockMat = track(surfaceMaterial(texRock, undefined, true, false));
  group.add(mesh(rock.build(), rockMat));

  // ---- floor: one textured grid (2 vertices per cell) with a soft AO band along the wall foot
  {
    const g = new THREE.PlaneGeometry(hm.nx * CELL, hm.nz * CELL, hm.nx * 2, hm.nz * 2);
    g.rotateX(-Math.PI / 2);
    g.translate(X0 + (hm.nx * CELL) / 2, 0, Z0 + (hm.nz * CELL) / 2);
    const pos = g.attributes.position!;
    const uv = g.attributes.uv!;
    const col = new Float32Array(pos.count * 3);
    const tile = TEXEL * 64;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      uv.setXY(k, x / tile, -z / tile);
      const [i, j] = hm.cell(x, z);
      let dmin = 9, tall = 0;
      for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
        const v = hm.get(i + a, j + b);
        if (v <= 0 || v > 90 || isStair(hm.cx(i + a), hm.cz(j + b))) continue;
        const d = Math.hypot(Math.max(0, Math.abs(x - hm.cx(i + a)) - CELL / 2), Math.max(0, Math.abs(z - hm.cz(j + b)) - CELL / 2));
        dmin = Math.min(dmin, d);
        tall = Math.max(tall, Math.min(v, 4) * Math.exp(-d / 1.2));
      }
      const ao = 1 - 0.45 * Math.exp(-dmin / 0.3) - 0.035 * tall;
      col.set([ao, ao * 0.98, ao * 0.96], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const floorMat = track(surfaceMaterial(texDirt));
    scaleAmbient(floorMat, 0.62); // shade stays earthy while the sun patches burn bright
    group.add(mesh(g, floorMat, false, true));
  }

  // ---- stairs (stone) with red stringers, rubble piles, pebbles (one stone mesh)
  const stone = new VoxelBatch(voxel ? 32 : 64);
  const metal = new VoxelBatch(16);
  const wood = new VoxelBatch(32);
  const props = new VoxelBatch(32);
  const red = rampColor(RAMPS.rail, 3).multiplyScalar(2.6); // painted red reads bright even in shade
  /**
   * A solid stone stair running along `axis` from `from` (floor, y = 0) to `to` (y = yTo), between
   * `c0`..`c1` across: bright treads, dark risers, and a solid sloped red stringer slab either
   * side with a lit cap along its top.
   */
  const steps = (axis: 'x' | 'z', c0: number, c1: number, from: number, to: number, yTo: number, n: number) => {
    for (let s = 0; s < n; s++) {
      const a = from + ((to - from) * s) / n, b = from + ((to - from) * (s + 1)) / n;
      const y = (yTo * (s + 1)) / n;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      // Bright treads, dark risers: a dark tint with a strong top multiplier.
      const tint = new THREE.Color(1, 1, 1).multiplyScalar(0.55 + rng.next() * 0.06);
      const o = { skip: [false, false, false, true, false, false], aoBottom: 0.8, topK: 2.1 };
      if (axis === 'z') stone.box([c0, 0, lo], [c1, y, hi], tint, rng, o);
      else stone.box([lo, 0, c0], [hi, y, c1], tint, rng, o);
    }
    const len = Math.hypot(to - from, yTo);
    const mid = (from + to) / 2;
    const cap = red.clone().multiplyScalar(1.6);
    for (const c of [c0 - 0.13, c1 + 0.13]) {
      if (axis === 'z') {
        const ang = Math.atan2(yTo, from - to);
        const up = new THREE.Vector3(0, Math.cos(ang), Math.sin(ang));
        if (up.y < 0) up.negate();
        metal.rotBox([c, yTo / 2 + 0.16, mid], [0.26, 0.62, len + 0.2], 0, red, rng, ang);
        metal.rotBox([c, yTo / 2 + 0.16 + up.y * 0.32, mid + up.z * 0.32], [0.28, 0.06, len + 0.2], 0, cap, rng, ang);
      } else {
        const ang = Math.atan2(yTo, to - from);
        const up = new THREE.Vector3(-Math.sin(ang), Math.cos(ang), 0);
        if (up.y < 0) up.negate();
        metal.rotBox([mid, yTo / 2 + 0.16, c], [len + 0.2, 0.62, 0.26], 0, red, rng, 0, ang);
        metal.rotBox([mid + up.x * 0.32, yTo / 2 + 0.16 + up.y * 0.32, c], [len + 0.2, 0.06, 0.28], 0, cap, rng, 0, ang);
      }
    }
  };
  steps('z', stair.x0, stair.x1, floorBack + 0.5, lodge.z1 - 0.1, platformY * LEVEL, 5);
  // The front stair climbs sideways from the floor up onto the left corner ledge.
  steps('x', frontStair.z0, frontStair.z1, frontStair.x1 + 0.1, frontStair.x0, 2 * LEVEL, 4);

  // Grey rubble on a cool, light stone ramp: on the floor, at each stair foot and on ledge tops.
  const topAt = (x: number, z: number) => { const [i, j] = hm.cell(x, z); const v = hm.get(i, j); return v > 90 ? 0 : v * LEVEL; };
  const rubble = (x: number, z: number, r: number) => {
    if (!clear(x, z, r * 1.1)) return;
    // A mound of many chunky stones (not one boulder): the biggest ≈ 0.55 × min(0.95, r).
    rubblePile(stone, [x, topAt(x, z), z], rng, { radius: r * 1.25, count: 18 + rng.int(7), big: Math.min(0.95, r) * 0.55, heap: 0.75 });
  };
  rubble(-4.3, -2.0, 1.1); // left back floor, in the window light
  rubble(-4.45, 2.05, 0.95); // left front floor
  rubble(4.4, 2.1, 1.2); // right front floor
  rubble(5.0, -2.2, 0.8); // foot of the lodge stair
  rubble(-3.0, 3.35, 0.55); // foot of the front stair
  rubble(-6.6, -1.0, 0.8); // on the first left ledge
  rubble(6.6, 0.6, 0.7); // on the first right ledge
  rubble(6.3, 5.0, 0.85); // on the right front corner ledge
  rubble(-6.5, 5.4, 0.8); // on the left front ledge, beside the front stair
  // Scattered pebbles on the floor.
  pebbles(stone, [-floorHalfX, floorBack, floorHalfX, floorFront + 2], 46, rng, keepOut.map((c) => ({ ...c, r: c.r * 0.8 })));

  // ---- the lodge: plank floor, plaster back wall with steel frame, shelves and props
  const ly = platformY * LEVEL;
  wood.box([lodge.x0, ly - 0.25, lodge.z0], [lodge.x1, ly, lodge.z1], new THREE.Color(1, 1, 1), rng, { skip: [false, false, false, true, true, false], texOff: [0, 0] });
  // Front trim beam along the ledge.
  metal.box([lodge.x0, ly - 0.05, lodge.z1 - 0.08], [lodge.x1, ly + 0.07, lodge.z1 + 0.06], rampColor(RAMPS.steel, 4), rng);
  const plaster = new VoxelBatch(32);
  plaster.box([lodge.x0, ly, lodge.z0 - 0.3], [lodge.x1, ly + 3.4, lodge.z0], new THREE.Color(1.15, 1.12, 1.08), rng, { aoBottom: 0.6 });
  plaster.box([lodge.x1 - 0.05, ly, lodge.z0], [lodge.x1 + 0.3, ly + 3.4, lodge.z1 - 1.6], new THREE.Color(1, 0.98, 0.95), rng, { aoBottom: 0.6 });
  // Steel posts + header beam.
  const steelC = rampColor(RAMPS.steel, 4);
  for (const x of [lodge.x0 + 0.15, (lodge.x0 + lodge.x1) / 2 + 0.6, lodge.x1 - 0.2]) {
    metal.box([x - 0.16, ly, lodge.z0 + 0.0], [x + 0.16, ly + 3.4, lodge.z0 + 0.3], steelC, rng);
  }
  metal.box([lodge.x0, ly + 3.0, lodge.z0], [lodge.x1, ly + 3.4, lodge.z0 + 0.35], steelC, rng);
  metal.box([lodge.x0 - 0.05, ly, lodge.z1 - 0.2], [lodge.x0 + 0.25, ly + 3.4, lodge.z1 + 0.1], steelC, rng);
  // Fewer, bigger, readable props (kit/props.ts): bookcases pulled forward into frame, crates,
  // a table on the rug, banners on the wall, a brazier on the floor.
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
    for (let u = 0; u < 3; u++) bookcase(pb, [lodge.x0 + 1.3 + u * 1.55, ly, lodge.z0 + 2.0], rng, { w: 1.4, h: 1.95, d: 0.5 });
  }
  // Crates (stacked), a table on the rug, banners, a brazier, a crate and barrel by the wall.
  crate(pb, [lodge.x0 + 1.0, ly, lodge.z1 - 0.9], 0.55, rng, { ry: 0.2 });
  crate(pb, [lodge.x0 + 1.65, ly, lodge.z1 - 0.75], 0.45, rng, { ry: -0.15 });
  crate(pb, [lodge.x0 + 1.1, ly + 0.55, lodge.z1 - 0.9], 0.4, rng, { ry: 0.45 });
  crate(pb, [4.85, 0, 0.1], 0.5, rng, { ry: -0.4 });
  barrel(pb, [4.95, 0, -0.65], 0.24, 0.62, rng);
  if (!legacyProps) {
    table(pb, [lodge.x0 + 4.4, ly, lodge.z1 - 1.5], [1.5, 0.75, 0.5], rng);
    banner(pb, [lodge.x0 + 6.1, ly + 2.8, lodge.z0 + 0.02], rng, { w: 0.75, h: 1.5, cloth: '#2f5a8a', trim: '#e0b048' });
    banner(pb, [lodge.x0 + 7.1, ly + 2.8, lodge.z0 + 0.02], rng, { w: 0.75, h: 1.5, cloth: '#9a3328', trim: '#e0b048' });
  }
  const brazierLights = legacyProps ? [] : [brazier(pb, [-5.0, 0, -0.15], rng)];
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
  // A pickaxe leaning by the left wall (props).
  wood.rotBox([-5.15, 0.42, 0.85], [0.06, 0.84, 0.06], 0.3, new THREE.Color(0.9, 0.9, 0.9), rng, 0.25);
  metal.rotBox([-5.05, 0.84, 0.85], [0.42, 0.07, 0.07], 0.3, rampColor(RAMPS.steel, 4), rng, 0.25);

  // Rug in the lodge (its own texture).
  {
    const g = new THREE.PlaneGeometry(2.4, 1.6);
    g.rotateX(-Math.PI / 2);
    const rug = mesh(g, track(new THREE.MeshLambertMaterial({ map: texRug })), false, true);
    rug.position.set(lodge.x0 + 4.4, ly + 0.012, lodge.z1 - 1.5);
    group.add(rug);
  }

  stone.shade(fore);
  stone.bake = LBAKE;
  const stoneMat = track(surfaceMaterial(texStone, undefined, true, false));
  group.add(mesh(stone.build(), stoneMat));
  // Wood: a warm lift (the lodge glows in the window light).
  const woodMat = track(surfaceMaterial(texPlank, undefined, true));
  woodMat.color.setRGB(1.22, 1.12, 0.96);
  woodMat.emissive.set('#2a1608');
  woodMat.emissiveMap = texPlank;
  group.add(mesh(wood.build(), woodMat));
  group.add(mesh(metal.build(), track(surfaceMaterial(texSteel, undefined, true))));
  // Plaster glows a little (bounce from the sunlit planks) so the lodge reads at the top edge.
  group.add(mesh(plaster.build(), track(surfaceMaterial(texPlaster, '#8a6a4a')), false, true));
  group.add(mesh(props.build(), track(surfaceMaterial(texSteel))));

  // ---- window in the back cliff (big) + a smaller one to its left (emissive)
  const win = { x: -2.7, y: 3.2, z: cliffZ - 0.08, w: 2.8, h: 1.8 };
  const win2 = { x: -7.4, y: 3.4, z: cliffZ - 0.08, w: 1.6, h: 1.5 };
  const glow = new VoxelBatch(16);
  glow.append(glowProps);
  const frame = new VoxelBatch(32);
  const pane = new THREE.Color('#fff2cc').multiplyScalar(3.2);
  const addWindow = (cx: number, cy: number, cz: number, w: number, hh: number) => {
    const cols = 3, rows = 2;
    glow.box([cx - w / 2, cy - hh / 2, cz - 0.05], [cx + w / 2, cy + hh / 2, cz + 0.02], pane, rng);
    for (let i = 0; i <= cols; i++) { const x = cx - w / 2 + (w * i) / cols; frame.box([x - 0.07, cy - hh / 2 - 0.07, cz], [x + 0.07, cy + hh / 2 + 0.07, cz + 0.12], new THREE.Color(0.55, 0.55, 0.55), rng); }
    for (let j = 0; j <= rows; j++) { const y = cy - hh / 2 + (hh * j) / rows; frame.box([cx - w / 2 - 0.07, y - 0.07, cz], [cx + w / 2 + 0.07, y + 0.07, cz + 0.12], new THREE.Color(0.55, 0.55, 0.55), rng); }
  };
  addWindow(win.x, win.y, win.z, win.w, win.h);
  addWindow(win2.x, win2.y, win2.z, win2.w, win2.h);
  // Ember crystals: tapered hex-prism clusters seated in the wall foot and on a ledge (bloom).
  for (const [x, y, z, n] of [[-5.42, 0, 0.75, 4], [5.42, 0, 1.0, 3], [0.6, 2 * LEVEL, -3.25, 5]] as const) crystalCluster(glow, [x, y, z], n, rng);
  const glowMat = track(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true, fog: false }));
  group.add(mesh(glow.build(), glowMat, false, false));
  group.add(mesh(frame.build(), track(surfaceMaterial(texBoards))));
  // Clear rock in front of the windows (and keep a sight line for the light).
  carveWindow(group, win, win2);

  // ---- lights: warm window key (cookie spot, shadows), side fill, hemisphere
  const keyColor = new THREE.Color('#ffd7a0');
  const key = new THREE.SpotLight(keyColor, 150, 0, 0.42, 0.55, 1.2);
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
  const key2 = new THREE.SpotLight(keyColor, 0, 0, 0.42, 0.55, 1.2);
  key2.position.set(win2.x + 0.2, win2.y + 0.5, win2.z - 0.6);
  key2.target.position.set(-4.3, 0, 1.2);
  const hemi = new THREE.HemisphereLight(new THREE.Color('#ffe0b8'), new THREE.Color('#24130b'), 1.8);
  group.add(hemi);
  // Weak side fill (no shadows): keeps camera-facing rock out of pure black without flattening it.
  const fill = new THREE.DirectionalLight(new THREE.Color('#ffb98a'), 0.3);
  fill.position.set(-8, 7, 3);
  group.add(fill, fill.target);
  // Lodge lantern + ember glow (warm point accents) on the high tier only.
  if (q === 'high' && !flags.has('nopoints')) {
    const lantern = new THREE.PointLight(new THREE.Color('#ffb060'), 16, 9, 1.4);
    lantern.position.set(lodge.x0 + 4.2, ly + 2.2, lodge.z1 - 1.6);
    group.add(lantern);
    const ember = new THREE.PointLight(new THREE.Color('#ff7a2e'), 3, 4.5, 1.6);
    ember.position.copy(brazierLights[0] ?? new THREE.Vector3(-5.0, 1.2, -0.2));
    group.add(ember);
  }

  // ---- god rays + dust: two broad soft shafts per window plus a wide dim haze cone
  const beamColor = new THREE.Color('#ffd49a');
  const beams: BeamSpec[] = [];
  const shafts = (w: typeof win, from: THREE.Object3D, to: THREE.Vector3, gain: number) => {
    const dir = to.clone().sub(from.position).normalize();
    for (const ox of [-0.25, 0.25]) {
      const s = new THREE.Vector3(w.x + ox * w.w, w.y - 0.05, w.z + 0.25);
      const len = (s.y / -dir.y) * 0.97;
      beams.push({ start: s, end: s.clone().addScaledVector(dir, len), width: [w.w * 0.62, w.w * 0.62 * 1.6], gain });
    }
  };
  shafts(win, key, key.target.position, 1);
  shafts(win2, key2, key2.target.position, 0.85);
  const shaftCount = beams.length;
  {
    const dir = key.target.position.clone().sub(key.position).normalize();
    const s = new THREE.Vector3(win.x, win.y, win.z + 0.3);
    beams.push({ start: s, end: s.clone().addScaledVector(dir, (s.y / -dir.y) * 0.95), width: [win.w * 1.5, win.w * 2.9], gain: 0.3 });
  }
  const rays = lightBeams(beams, beamColor, 0.27);
  track(rays.mesh.geometry); track(rays.mesh.material as THREE.Material);
  if (!flags.has('norays')) group.add(rays.mesh);
  const dust = dustMotes(beams.slice(0, shaftCount), q === 'high' ? 22 : 12, rng, new THREE.Color('#ffd9a0').multiplyScalar(0.75));
  track(dust.points.geometry); track(dust.points.material as THREE.Material);
  group.add(dust.points);
  // Light pools: a soft additive decal where the shafts land, shaped like the projected window
  // cookie (the key's real light does the shading; this adds the hazy bounce the reference glows
  // with, and IS the small window's patch), plus a window-light patch on the lodge planks.
  group.add(lightPools(track, [key, key2], [1, 1.4], { x0: -8.5, x1: 4.5, z0: floorBack - 0.4, z1: floorFront + 2.6 }, { x0: lodge.x0 + 1.3, x1: lodge.x0 + 4.1, z0: lodge.z1 - 3.1, z1: lodge.z1 - 0.9, y: ly + 0.014 }));

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

/** The window cookie (windowCookie layout) as an analytic soft mask at cookie uv. */
function cookieMask(u: number, v: number, cols = 3, rows = 2): number {
  const px = u * 64, py = v * 64;
  if (px < 4 || px > 60 || py < 8 || py > 56) return 0;
  const ss = THREE.MathUtils.smoothstep;
  let m = ss(px, 5, 10) * (1 - ss(px, 54, 59)) * ss(py, 9, 14) * (1 - ss(py, 50, 55));
  const r = Math.hypot(px - 32, py - 32);
  m *= 1 - ss(r, 19, 32);
  for (let i = 1; i < cols; i++) m *= ss(Math.abs(px - (6 + (52 * i) / cols)), 0.5, 3.5);
  for (let j = 1; j < rows; j++) m *= ss(Math.abs(py - (10 + (44 * j) / rows)), 0.5, 3.5);
  return m;
}

/**
 * One additive decal mesh (one draw call) with two quads: the floor light pools of the given
 * cookie spots (projected exactly like SpotLight.map, softened), and a pane-shaped window-light
 * patch on the lodge planks.
 */
function lightPools(track: <T extends { dispose(): void }>(x: T) => T, spots: THREE.SpotLight[], gains: number[], fl: { x0: number; x1: number; z0: number; z1: number }, lp: { x0: number; x1: number; z0: number; z1: number; y: number }): THREE.Mesh {
  const W = 104, H = 72, H2 = 24;
  const c = document.createElement('canvas');
  c.width = W; c.height = H + H2;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H + H2);
  const col = [255, 208, 148];
  const put = (x: number, y: number, v: number) => {
    const k = (y * W + x) * 4, a = Math.min(1, v);
    img.data[k] = col[0]! * a; img.data[k + 1] = col[1]! * a; img.data[k + 2] = col[2]! * a; img.data[k + 3] = 255;
  };
  const p = new THREE.Vector3();
  const mats = spots.map((s) => {
    s.updateMatrixWorld(true); s.target.updateMatrixWorld(true);
    s.shadow.updateMatrices(s);
    return s.shadow.matrix.clone();
  });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wx = fl.x0 + ((x + 0.5) / W) * (fl.x1 - fl.x0), wz = fl.z0 + ((y + 0.5) / H) * (fl.z1 - fl.z0);
    let v = 0;
    mats.forEach((m, k) => {
      // 5-tap blur in world space (≈ 0.12 units) for soft pane edges.
      let acc = 0;
      for (const [dx, dz] of [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]] as const) {
        p.set(wx + dx, 0, wz + dz);
        const e = m.elements;
        const w = e[3]! * p.x + e[7]! * p.y + e[11]! * p.z + e[15]!;
        if (w <= 0) continue;
        p.applyMatrix4(m);
        acc += cookieMask(p.x, p.y);
      }
      v += (acc / 5) * gains[k]!;
    });
    put(x, y, v * 0.4);
  }
  // Lodge patch: a 2×2-pane window of light slanting across the planks.
  for (let y = 0; y < H2; y++) for (let x = 0; x < W; x++) {
    const u = x / W, t = y / H2;
    const su = u - (1 - t) * 0.18; // slant
    const ss = THREE.MathUtils.smoothstep;
    let m = ss(su, 0.08, 0.2) * (1 - ss(su, 0.7, 0.82)) * ss(t, 0.06, 0.22) * (1 - ss(t, 0.8, 0.95));
    m *= ss(Math.abs(su - 0.45), 0.01, 0.05) * ss(Math.abs(t - 0.5), 0.02, 0.07);
    put(x, H + y, m * 0.85);
  }
  ctx.putImageData(img, 0, 0);
  const tex = track(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.BufferGeometry();
  const vF = 1 - H / (H + H2); // canvas row 0 is v = 1 (flipY)
  const quad = (x0: number, x1: number, z0: number, z1: number, y: number, va: number, vb: number) => [
    [x0, y, z0, 0, va], [x0, y, z1, 0, vb], [x1, y, z1, 1, vb], [x0, y, z0, 0, va], [x1, y, z1, 1, vb], [x1, y, z0, 1, va],
  ];
  const verts = [...quad(fl.x0, fl.x1, fl.z0, fl.z1, 0.02, 1, vF), ...quad(lp.x0, lp.x1, lp.z0, lp.z1, lp.y, vF, 0)];
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts.flatMap((v) => [v[0]!, v[1]!, v[2]!]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(verts.flatMap((v) => [v[3]!, v[4]!]), 2));
  const m = track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const out = new THREE.Mesh(g, m);
  out.renderOrder = 2;
  return out;
}

/** A cluster of `n` tapered hex-prism crystals (HDR ≈ 1.3, bloom) growing from `at`. */
function crystalCluster(b: VoxelBatch, at: V3, n: number, rng: Rng) {
  const F: Face4 = [0, 0, -1, 1];
  for (let k = 0; k < n; k++) {
    const h = 0.22 + rng.next() * 0.32 * (k === 0 ? 1.4 : 1), r = 0.05 + rng.next() * 0.035;
    const a = rng.next() * Math.PI * 2, d = k === 0 ? 0 : 0.07 + rng.next() * 0.1;
    const base = new THREE.Vector3(at[0] + Math.cos(a) * d, at[1] - 0.03, at[2] + Math.sin(a) * d * 0.7);
    const axis = new THREE.Vector3(Math.cos(a) * (k === 0 ? 0.1 : 0.45), 1, Math.sin(a) * (k === 0 ? 0.1 : 0.35)).normalize();
    const side = new THREE.Vector3(1, 0, 0).cross(axis).normalize(), side2 = axis.clone().cross(side).normalize();
    const ring = (t: number, rr: number) => Array.from({ length: 6 }, (_, i) => {
      const th = (i / 6) * Math.PI * 2;
      return base.clone().addScaledVector(axis, h * t).addScaledVector(side, Math.cos(th) * rr).addScaledVector(side2, Math.sin(th) * rr);
    });
    const r0 = ring(0, r), r1 = ring(0.72, r * 0.62), tip = base.clone().addScaledVector(axis, h);
    const hot = new THREE.Color('#ff6418').multiplyScalar(1.3), tipC = new THREE.Color('#ffa040').multiplyScalar(1.3);
    const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
    for (let i = 0; i < 6; i++) {
      const i2 = (i + 1) % 6;
      const mid = r0[i]!.clone().add(r0[i2]!).multiplyScalar(0.5).sub(base).normalize();
      const shade = 0.62 + 0.38 * Math.max(0, mid.z * 0.8 + mid.x * 0.3); // faces toward the camera glow most
      const cA = hot.clone().multiplyScalar(shade), cB = tipC.clone().multiplyScalar(shade);
      const n: V3 = [mid.x, mid.y, mid.z];
      b.tri([v3(r0[i]!), v3(r0[i2]!), v3(r1[i2]!)], n, [[0, 0], [0, 0], [0, 0]], [cA, cA, cB], [F, F, F]);
      b.tri([v3(r0[i]!), v3(r1[i2]!), v3(r1[i]!)], n, [[0, 0], [0, 0], [0, 0]], [cA, cB, cB], [F, F, F]);
      b.tri([v3(r1[i]!), v3(r1[i2]!), v3(tip)], n, [[0, 0], [0, 0], [0, 0]], [cB, cB, tipC], [F, F, F]);
    }
  }
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
