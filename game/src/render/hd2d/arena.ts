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
import { RAMPS, cachedTexture, paintBoulderAtlas, paintBoards, paintDirt, paintPlanks, paintPlaster, paintRug, paintSteel } from './textures';
import type { SpriteLight } from './sprite';
import { courseWall, coursedTerrace, groundGrid, nextRiser, pebbles, polygonSdf, rubblePile, terraceHeight, type Path2, type TerraceTier } from './kit/rock';
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
   * multiplied by bakeMin + bakeGain · max(0, n · bake) (default 0.55 + 0.75 ·) — bright top
   * planes, mid fronts, dark undersides whatever the dynamic lights do. Off (null) by default.
   */
  bake: THREE.Vector3 | null = null;
  /** The baked sky key's floor and gain: colour × (bakeMin + bakeGain · max(0, n · bake)). */
  bakeMin = 0.55;
  bakeGain = 0.75;
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
        const f = this.bakeMin + this.bakeGain * Math.max(0, this.nor[i]! * L.x + this.nor[i + 1]! * L.y + this.nor[i + 2]! * L.z);
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
 *  * coursed stone faces (width ≤ -1000, kit/rock.ts course stones; real width = -width - 1000):
 *    a 1-texel seam at ~46% albedo (ragged 2nd texel), dark underside → mid front → lit top band
 *    on sides, a lit front lip and soft back/side seams on tops — one readable cut stone;
 *  * rock faces (-1000 < width ≤ -1.5, kit/rock.ts boulders; real width = -width - 2): never a seam;
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
        if (vFace.z < -500.0) {
          // Coursed stone face (kit/rock.ts course stones): quantised per texel. A 1-texel seam
          // at ~46% albedo round the face with a ragged second texel, then dark underside → mid
          // front → lit top band on sides; tops get a lit front lip and a soft back/side seam.
          vec2 p = floor(vFace.xy / tx);
          vec2 n = max(vec2(1.0), floor(vec2(-vFace.z - 1000.0, abs(vFace.w)) / tx));
          float hs = fract(sin(dot(p, vec2(12.9898, 78.233)) + n.x * 1.7 + n.y * 3.1) * 43758.5453);
          float ex = min(p.x, n.x - 1.0 - p.x);
          float k = 1.0;
          if (vFace.w < 0.0) {
            float t = (p.y + 0.5) / n.y + (hs - 0.5) * 0.1;
            k = t < 0.16 ? 0.68 : t < 0.36 ? 0.85 : t > 0.86 ? 1.1 : 1.0;
            float e = min(ex, p.y);
            if (e < 0.5) k = 0.46;
            else if (e < 1.5 && hs < 0.4) k = min(k, 0.64);
          } else {
            if (p.y < 0.5) k = 1.08;
            else if (p.y > n.y - 1.5) k = hs < 0.6 ? 0.74 : 0.86;
            if (ex < 0.5 && p.y > 0.5) k = hs < 0.55 ? 0.72 : 0.84;
          }
          diffuseColor.rgb *= k;
        } else if (vFace.z < -1.5) {
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

/**
 * Bake an aerial haze into a geometry's vertex colours: each colour moves toward `tint` (linear,
 * times the albedo the texture adds) by `k(x, y, z)` (0..1) — distant or high walls lighter and
 * less saturated, without a fog pass.
 */
export function haze(g: THREE.BufferGeometry, k: (x: number, y: number, z: number) => number, tint: THREE.Color): THREE.BufferGeometry {
  const pos = g.attributes.position!, col = g.attributes.color;
  if (!col) return g;
  for (let i = 0; i < pos.count; i++) {
    const t = k(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (t <= 0) continue;
    col.setXYZ(i, col.getX(i) + (tint.r * 2 - col.getX(i)) * t, col.getY(i) + (tint.g * 2 - col.getY(i)) * t, col.getZ(i) + (tint.b * 2 - col.getZ(i)) * t);
  }
  col.needsUpdate = true;
  return g;
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
attribute float aFade;  // how much the shaft fades along its length (0.6 default; low = reaches the floor)
varying vec2 vSide;
varying float vSeed;
varying float vGain;
varying float vFade;
void main() {
  vec3 axis = aEnd - aStart;
  vec3 p = mix(aStart, aEnd, aSide.y);
  vec3 toCam = normalize(cameraPosition - p);
  vec3 across = normalize(cross(axis, toCam));
  p += across * aSide.x * mix(aWidth.x, aWidth.y, aSide.y) * 0.5;
  vSide = aSide;
  vSeed = aSeed;
  vGain = aGain;
  vFade = aFade;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
varying vec2 vSide;
varying float vSeed;
varying float vGain;
varying float vFade;
void main() {
  // Broad, soft shaft: gaussian across, a soft start and a long fade toward the floor.
  float x = vSide.x, y = vSide.y;
  float across = exp(-x * x * 3.0) * (1.0 - smoothstep(0.8, 1.0, abs(x)));
  float along = smoothstep(0.0, 0.15, y) * (1.0 - vFade * y) * (1.0 - smoothstep(0.9, 1.0, y));
  // Faint internal streaks running down the shaft, and a slow shimmer of drifting dust.
  float streak = 0.86 + 0.14 * sin(x * 7.0 + vSeed * 17.0) * sin(x * 17.0 - vSeed * 5.0);
  float flick = 0.9 + 0.1 * sin(y * 7.0 - uTime * 0.6 + vSeed * 6.0);
  float a = across * along * streak * flick * uIntensity * vGain;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;

/**
 * A light shaft: axis from `start` to `end`, ribbon width at both ends, optional gain (default 1)
 * and fade along its length (default 0.6; ≈ 0.25 for shafts that should visibly reach the floor).
 */
export interface BeamSpec { start: THREE.Vector3; end: THREE.Vector3; width: [number, number]; gain?: number; fade?: number }

/** Volumetric light shafts: camera-facing ribbons around each beam axis, additive. One draw call. */
export function lightBeams(beams: BeamSpec[], color: THREE.ColorRepresentation, intensity = 0.32): { mesh: THREE.Mesh; update: (t: number) => void } {
  const n = beams.length;
  const g = new THREE.BufferGeometry();
  const segs = 6;
  const start: number[] = [], end: number[] = [], side: number[] = [], width: number[] = [], seed: number[] = [], gain: number[] = [], fade: number[] = [], pos: number[] = [];
  const index: number[] = [];
  beams.forEach((b, k) => {
    const base = (start.length / 3);
    // Across: 4 columns (-1, -0.33, 0.33, 1) so the gaussian profile interpolates smoothly.
    const cols = [-1, -1 / 3, 1 / 3, 1];
    for (let s = 0; s <= segs; s++) for (const x of cols) {
      start.push(b.start.x, b.start.y, b.start.z); end.push(b.end.x, b.end.y, b.end.z);
      side.push(x, s / segs); width.push(b.width[0], b.width[1]); seed.push(k / n); gain.push(b.gain ?? 1); fade.push(b.fade ?? 0.6); pos.push(0, 0, 0);
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
  g.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
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
 * Ember Ridge cave arena: a wide sunken dirt floor ringed by coursed stone terraces (kit/rock.ts
 * coursedTerrace: 2-course tiers of rounded, top-lit cut stones with flat dirt ledges) climbing
 * diagonally up the left and to a tall window wall at the back; a raised miners' lodge (plank
 * floor, painted shelving, workbench, rug, crates) on a stone shelf in the right third, reached
 * by a clean stone stair with parallel red rails; one big window light pool under the kin; grey
 * rubble at the wall feet and on the ledges, never in the middle. All original.
 */
export function buildCaveArena(opts: CaveArenaOptions = {}): ArenaRig {
  const flags = new Set((new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('post') ?? '').split(','));
  const rng = new Rng(opts.seed ?? 11);
  const q = opts.quality ?? 'high';
  const group = new THREE.Group();
  group.name = 'hd2d-cave-arena';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // ---- textures (cached for the session). Stone and rubble: 64² cut-stone atlases.
  const texRock = cachedTexture('cave-stone-atlas', () => paintBoulderAtlas(5, RAMPS.caveStone));
  const texStone = cachedTexture('cave-rubble-atlas2', () => paintBoulderAtlas(9, RAMPS.rubble));
  const texDirt = cachedTexture('dirt-128c', () => paintDirt(3, 128));
  const texPlank = cachedTexture('plank-honey', () => paintPlanks(4, 64, 64, 8));
  const texBoards = cachedTexture('boards', () => paintBoards(6, 32));
  const texPlaster = cachedTexture('plaster', () => paintPlaster(8, 32));
  const texSteel = cachedTexture('paint', () => paintSteel(2, 16, RAMPS.paint));
  const texRug = cachedTexture('rug', () => paintRug(32));

  // ---- layout. The floor is a polygon open toward the camera: its left edge runs diagonally
  // from the front-left corner to the back (the terraces climb away from it), its back edge
  // sits under the window wall, the lodge shelf takes the back right. The polygon runs on past
  // the portrait (phone) camera's bottom edge.
  // (The front edge lies past the build bounds: no riser ever runs across the near foreground.)
  const FLOOR: Path2 = [[-14.5, 20], [-3.0, -4.0], [2.2, -4.0], [2.2, -3.1], [8.7, -3.1], [8.7, 20]];
  const floorD = polygonSdf(FLOOR);
  const DEPTH = 0.62;
  // Two tall terraces of two courses each (1.4 units) on narrow ledges, then the tall cave wall
  // (the window wall at the back) rising past the top of the frame.
  const TIERS: TerraceTier[] = [{ d: 0, y: 1.4 }, { d: 1.05, y: 2.8 }, { d: 2.1, y: 7.6, course: 0.8, length: 0.95 }];
  const ly = TIERS[0]!.y; // lodge shelf top
  const lodge = { x0: 2.2, x1: 13, z0: -6.6, z1: -3.1 };
  const stair = { x0: 2.75, x1: 3.95, foot: -1.3, n: 6 };
  const winWallZ = -6.1; // the back terrace wall (TIERS[2] at the back edge)
  const inLodge = (x: number, z: number) => x > lodge.x0 + 0.3 && z < lodge.z1 - 0.3;
  // Windows high in the back wall (right of the foe's HUD box, top left of the screen).
  // Panes sit just proud of the wall face; only stones centred inside an opening are left out.
  const win = { x: -3.0, y: 3.65, z: winWallZ + 0.08, w: 2.0, h: 1.2 };
  const win2 = { x: -0.3, y: 3.75, z: winWallZ + 0.08, w: 1.4, h: 1.05 };
  const inWindow = (x: number, y: number) => [win, win2].some((w) => Math.abs(x - w.x) < w.w / 2 && Math.abs(y - w.y) < w.h / 2);
  const stairCut = (x: number, z: number) => x > stair.x0 - 0.15 && x < stair.x1 + 0.15 && z > lodge.z1 - 0.4 && z < lodge.z1 + 0.3;
  // Ground behind a wall steps up only once well inside its stones (the grid ramp stays hidden).
  const groundY = (x: number, z: number) => {
    if (inLodge(x, z)) return z < lodge.z0 - 0.35 - DEPTH * 0.7 ? TIERS[TIERS.length - 1]!.y : ly;
    if (frontRight(x, z - 0.3)) return 0;
    return terraceHeight(floorD(x, z), TIERS, DEPTH);
  };
  // Kin, people and the trainer's walk stay clear of props.
  const SPOTS: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-1.3, 0, 1.0), new THREE.Vector3(1.5, 0, -1.0)];
  const PEOPLE: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-2.5, 0, 1.9), new THREE.Vector3(4.4, 0, -1.5)];
  const keepOut = [{ x: -1.3, z: 1.0, r: 1.3 }, { x: 1.5, z: -1.0, r: 1.3 }, { x: -2.5, z: 1.9, r: 0.8 }, { x: 4.4, z: -1.5, r: 0.9 }, { x: 0.1, z: 0, r: 3.2 }];
  const clear = (x: number, z: number, r: number) => keepOut.every((c) => (x - c.x) ** 2 + (z - c.z) ** 2 > (c.r + r) ** 2);
  // Baked sky key for rock and stone: lit tops, mid fronts, dark undersides. Course stones get a
  // soft, mostly overhead bake leaning toward the room (the lit floor's bounce): fronts stay
  // mid-value on every wall, tops ≈ 25% brighter.
  const LBAKE = new THREE.Vector3(-0.2, 1, 0.75);
  const CBAKE = new THREE.Vector3(0.15, 1, 0.6);
  // Geometry nearer than the floor front sinks into foreground shade (× ≈0.7).
  const FRONT = 3.6;
  const fore = (_x: number, _y: number, z: number) => 1 - 0.3 * THREE.MathUtils.smoothstep(z, FRONT, FRONT + 1.4);

  // ---- coursed stone terraces + the window wall + the wall behind the lodge (one mesh)
  const rock = new VoxelBatch(64);
  const stone = new VoxelBatch(64); // grey: rubble, pebbles, the stairs
  const lite = q === 'low';
  const course = { depth: DEPTH, lite, tint: ['#ffffff', '#fbf0e4', '#f2f2ec'], core: 0.36, gap: TEXEL * 2.5, length: 0.75 };
  // Past the phone camera's view of the stage (front right, under the move menu) the right wall
  // stops: no magnified stones in the portrait foreground.
  const frontRight = (x: number, z: number) => x > 7.6 && z > 6.0;
  const keepTerrace = (x: number, z: number, y: number) =>
    !frontRight(x, z) && !(inLodge(x, z) && y > ly + 0.05) && !(stairCut(x, z) && y < ly + 0.05) && !(x > lodge.x0 + 0.3 && z < lodge.z1 + 0.1 && y < ly + 0.05 && z < lodge.z1 - DEPTH);
  // The tall wall is the window wall at the back: a bay is left open for each window.
  coursedTerrace(rock, floorD, TIERS, rng, {
    ...course, bounds: [-17, -9.5, 17, 13], keep: (x, z, y) => keepTerrace(x, z, y) && !(z < winWallZ + 0.3 && inWindow(x, y)),
    pebbles: { batch: stone, perUnit: q === 'high' ? 0.45 : 0.25, tint: '#d8d6d2' },
  });
  // Behind the lodge: the cave wall rises over the lodge's back wall.
  courseWall(rock, [[lodge.x0 - 0.2, lodge.z0 - 0.35], [17, lodge.z0 - 0.35]], ly, 7.6, rng, { ...course, course: 0.8, length: 0.95, ends: false });
  rock.shade(fore);
  // Upper courses catch the window light and the bounce off the lit floor (no black band); low
  // courses sit in a little warm shade.
  rock.shade((_x, y) => 0.9 + 0.22 * Math.min(1, Math.max(0, y) / 4));
  rock.bake = CBAKE; rock.bakeMin = 0.8; rock.bakeGain = 0.6;
  const rockMat = track(surfaceMaterial(texRock, undefined, true, false));
  // The high wall sits in the warm, dusty haze of the window light: lighter and greyer with height.
  group.add(mesh(haze(rock.build(), (_x, y) => THREE.MathUtils.smoothstep(y, 2.2, 6.0) * 0.55, new THREE.Color(0.62, 0.5, 0.38)), rockMat));

  // ---- floor and every ledge: ONE ground mesh at terrace height, AO at the wall feet
  {
    // Low tier: a coarser grid (the ledge ramps still sit inside the stones).
    const ground = groundGrid([-17, -9.5, 17, 13], lite ? 0.3 : 0.25, 128, groundY, (x, z) => {
      if (inLodge(x, z)) return [0.8, 0.78, 0.76];
      const d = floorD(x, z);
      const dn = nextRiser(d, TIERS, DEPTH);
      const ao = 1 - 0.42 * Math.exp(-Math.max(0, dn) / 0.28) - (d > 0 ? 0.06 : 0);
      const f = fore(x, 0, z);
      return [ao * f, ao * 0.98 * f, ao * 0.95 * f];
    });
    const floorMat = track(surfaceMaterial(texDirt));
    scaleAmbient(floorMat, 0.95); // shade stays a light sandy tan while the window pool burns bright
    group.add(mesh(ground, floorMat, false, true));
  }

  // ---- stair (stone) with parallel red rails, rubble piles, pebbles
  const metal = new VoxelBatch(16);
  const wood = new VoxelBatch(64); // the 64-texel plank tile at the shared TEXEL density
  const props = new VoxelBatch(32);
  const red = rampColor(RAMPS.rail, 3).multiplyScalar(2.6); // painted red reads bright even in shade
  {
    // Clean stepped boxes: each step a riser block with a lighter slab tread that noses out a
    // little; light treads, mid risers, dark sides (bake). Rails: two parallel sloped red slabs
    // with a lit cap, from the floor to the shelf edge.
    const { x0, x1, foot, n } = stair;
    const top = lodge.z1;
    const run = (foot - top) / n;
    for (let s = 0; s < n; s++) {
      const zf = foot - s * run, zb = top - 0.02;
      const y = (ly * (s + 1)) / n;
      stone.box([x0, 0, zf - run], [x1, y - 0.06, zb], new THREE.Color(1, 1, 1).multiplyScalar(0.62), rng, { skip: [false, false, false, true, false, true], aoBottom: 0.75 });
      stone.box([x0 - 0.02, y - 0.07, zf - run - 0.02], [x1 + 0.02, y, zf + 0.04], new THREE.Color(1, 1, 1).multiplyScalar(0.86), rng, { skip: [false, false, false, true, false, true], aoBottom: 0.85, topK: 1.35 });
    }
    const len = Math.hypot(foot - top, ly);
    const ang = Math.atan2(ly, foot - top);
    const up = new THREE.Vector3(0, Math.cos(ang), Math.sin(ang));
    const mid = (foot + top) / 2;
    const cap = red.clone().multiplyScalar(1.5);
    for (const c of [x0 - 0.12, x1 + 0.12]) {
      metal.rotBox([c, ly / 2 + 0.16, mid], [0.22, 0.56, len + 0.12], 0, red, rng, ang);
      metal.rotBox([c, ly / 2 + 0.16 + up.y * 0.29, mid + up.z * 0.29], [0.24, 0.05, len + 0.12], 0, cap, rng, ang);
    }
  }
  // Grey blocky rubble at the wall feet and on the ledges (never in the middle of the floor).
  const rubble = (x: number, z: number, r: number) => {
    if (!clear(x, z, r * 1.1)) return;
    rubblePile(stone, [x, groundY(x, z), z], rng, { radius: r * 1.1, big: Math.min(0.95, r) * 0.6, heap: 0.8, blocky: true, tint: '#d2d0ce' });
  };
  rubble(-3.9, -3.2, 0.85); // back-left corner of the floor
  rubble(6.7, -2.4, 0.75); // right of the lodge stair, at the shelf foot
  rubble(7.8, 1.5, 0.9); // right wall foot
  rubble(6.9, 3.9, 1.0); // bottom-right framing pile
  rubble(-5.6, 2.9, 0.7); // left wall foot, front
  rubble(-5.6, -1.3, 0.65); // first left ledge
  rubble(-7.3, -3.6, 0.6); // second left ledge
  rubble(-1.6, -4.85, 0.55); // back ledge, under the windows
  rubble(9.5, -0.6, 0.6); // first right ledge
  // A few pebbles at the wall feet (the middle of the floor stays clean).
  pebbles(stone, [-7, -3.9, 8.6, 4.5], q === 'high' ? 70 : 40, rng, [...keepOut.map((c) => ({ ...c, r: c.r * 0.9 })), { x: 1.5, z: 1.5, r: 3.6 }]);

  // ---- the lodge: plank floor on the stone shelf, plaster back wall with steel frame, shelves,
  // a workbench, a rug with a low table, crates and barrels
  wood.box([lodge.x0, ly - 0.2, lodge.z0], [lodge.x1, ly + 0.02, lodge.z1 + 0.06], new THREE.Color(1, 1, 1), rng, { skip: [false, false, false, true, false, false], texOff: [0, 0] });
  // A lit plank fascia along the shelf edge.
  wood.box([lodge.x0, ly - 0.14, lodge.z1 + 0.02], [lodge.x1, ly + 0.05, lodge.z1 + 0.12], new THREE.Color(1.05, 0.98, 0.9), rng, { skip: [false, false, false, true, false, true] });
  const plaster = new VoxelBatch(32);
  const wallH = 2.45;
  plaster.box([lodge.x0, ly, lodge.z0 - 0.3], [lodge.x1, ly + wallH, lodge.z0], new THREE.Color(1.0, 0.97, 0.92), rng, { aoBottom: 0.65 });
  plaster.box([lodge.x0 - 0.3, ly, lodge.z0 - 0.3], [lodge.x0, ly + wallH, lodge.z0 + 0.9], new THREE.Color(0.9, 0.87, 0.83), rng, { aoBottom: 0.65 });
  // Steel columns + header beam (on the back wall only) and a dark painted wainscot.
  const steelC = rampColor(RAMPS.steel, 4).multiplyScalar(1.45);
  for (const x of [lodge.x0 + 0.2, lodge.x0 + 4.3, lodge.x0 + 8.4]) metal.box([x - 0.22, ly, lodge.z0], [x + 0.22, ly + wallH, lodge.z0 + 0.32], steelC, rng);
  metal.box([lodge.x0, ly + wallH - 0.36, lodge.z0], [lodge.x1, ly + wallH, lodge.z0 + 0.34], steelC, rng);
  metal.box([lodge.x0, ly, lodge.z0 - 0.02], [lodge.x1, ly + 0.5, lodge.z0 + 0.04], rampColor(RAMPS.steel, 2).multiplyScalar(1.2), rng, { skip: [false, false, false, true, false, true] });
  const glowProps = new VoxelBatch(16);
  const pb: PropBatches = { wood, paint: props, glow: glowProps, stone };
  // Painted sage metal shelving with bright runs of books (cabinet bases).
  const bookHues = ['#4fa86a', '#3f7cc8', '#d4553a', '#e8b440', '#f0e6cc', '#8a5ac0', '#e07a2a'];
  for (let u = 0; u < 4; u++) bookcase(pb, [lodge.x0 + 2.6 + u * 1.42, ly, lodge.z0 + 0.6], rng, { w: 1.32, h: 1.5, d: 0.45, frame: 'paint', tint: '#a8b8a0', hues: bookHues });
  // Workbench at the left end: papers, a lamp (glow) and a stool.
  const benchX = lodge.x0 + 1.05, benchZ = lodge.z0 + 0.8;
  table(pb, [benchX, ly, benchZ], [1.4, 0.72, 0.72], rng);
  props.box([benchX - 0.5, ly + 0.72, benchZ - 0.2], [benchX - 0.08, ly + 0.76, benchZ + 0.15], new THREE.Color('#efe2c4'), rng); // papers
  props.box([benchX + 0.12, ly + 0.72, benchZ - 0.25], [benchX + 0.5, ly + 1.04, benchZ + 0.05], new THREE.Color('#5a6f8a'), rng); // a strongbox
  props.box([benchX + 0.28, ly + 0.72, benchZ + 0.1], [benchX + 0.36, ly + 1.08, benchZ + 0.18], new THREE.Color('#3a3640'), rng); // lamp post
  glowProps.box([benchX + 0.22, ly + 1.08, benchZ + 0.04], [benchX + 0.42, ly + 1.2, benchZ + 0.24], new THREE.Color('#ffc070').multiplyScalar(1.8), rng);
  table(pb, [benchX + 0.15, ly, benchZ + 0.85], [0.4, 0.4, 0.42], rng); // stool
  // Crates at the front left of the shelf, barrels by the right.
  crate(pb, [lodge.x0 + 0.6, ly, lodge.z1 - 0.55], 0.52, rng, { ry: 0.2 });
  crate(pb, [lodge.x0 + 1.25, ly, lodge.z1 - 0.45], 0.42, rng, { ry: -0.15 });
  crate(pb, [lodge.x0 + 0.7, ly + 0.52, lodge.z1 - 0.55], 0.38, rng, { ry: 0.45 });
  barrel(pb, [lodge.x0 + 8.6, ly, lodge.z1 - 0.7], 0.26, 0.64, rng);
  barrel(pb, [lodge.x0 + 9.2, ly, lodge.z1 - 1.0], 0.24, 0.6, rng);
  // A rug with a low table on it (the lodge's warm centre).
  const rugX = lodge.x0 + 5.6, rugZ = lodge.z1 - 1.2;
  table(pb, [rugX, ly + 0.012, rugZ], [1.4, 0.7, 0.42], rng);
  banner(pb, [lodge.x0 + 3.4, ly + 2.15, lodge.z0 + 0.02], rng, { w: 0.6, h: 0.75, cloth: '#2f5a8a', trim: '#e0b048' });
  banner(pb, [lodge.x0 + 6.3, ly + 2.15, lodge.z0 + 0.02], rng, { w: 0.6, h: 0.75, cloth: '#9a3328', trim: '#e0b048' });
  // A brazier at the left wall foot (warm accent), a crate and a barrel at the right wall foot.
  const brazierLights = [brazier(pb, [-4.35, 0, -0.9], rng)];
  crate(pb, [7.95, 0, -0.4], 0.5, rng, { ry: -0.4 });
  barrel(pb, [8.05, 0, 0.35], 0.24, 0.62, rng);
  // A pickaxe leaning on the left wall.
  wood.rotBox([-4.75, 0.42, 0.55], [0.06, 0.84, 0.06], 0.4, new THREE.Color(0.9, 0.9, 0.9), rng, 0.25);
  metal.rotBox([-4.65, 0.84, 0.55], [0.42, 0.07, 0.07], 0.4, rampColor(RAMPS.steel, 4), rng, 0.25);
  {
    const g = new THREE.PlaneGeometry(2.4, 1.5);
    g.rotateX(-Math.PI / 2);
    const rug = mesh(g, track(new THREE.MeshLambertMaterial({ map: texRug })), false, true);
    rug.position.set(rugX, ly + 0.03, rugZ);
    group.add(rug);
  }

  stone.shade(fore);
  stone.bake = LBAKE;
  const stoneMat = track(surfaceMaterial(texStone, undefined, true, false));
  group.add(mesh(stone.build(), stoneMat));
  // Wood: a warm lift (the lodge glows in its lamplight).
  const woodMat = track(surfaceMaterial(texPlank, undefined, true));
  woodMat.color.setRGB(1.18, 1.1, 0.98);
  woodMat.emissive.set('#2e1c0e');
  woodMat.emissiveMap = texPlank;
  group.add(mesh(wood.build(), woodMat));
  group.add(mesh(metal.build(), track(surfaceMaterial(texSteel, undefined, true))));
  // Plaster glows (warm lamplight and bounce from the planks) so the lodge reads at the top edge.
  group.add(mesh(plaster.build(), track(surfaceMaterial(texPlaster, '#3e2c1c')), false, true));
  group.add(mesh(props.build(), track(surfaceMaterial(texSteel))));

  // ---- two windows in the back wall (emissive, capped below the bloom wash) with a stone
  // reveal round each opening
  const glow = new VoxelBatch(16);
  glow.append(glowProps);
  const frame = new VoxelBatch(32);
  const pane = new THREE.Color('#fff0c8').multiplyScalar(1.45);
  const addWindow = (cx: number, cy: number, cz: number, w: number, hh: number) => {
    const cols = 3, rows = 2;
    glow.box([cx - w / 2, cy - hh / 2, cz - 0.05], [cx + w / 2, cy + hh / 2, cz + 0.02], pane, rng);
    for (let i = 0; i <= cols; i++) { const x = cx - w / 2 + (w * i) / cols; frame.box([x - 0.07, cy - hh / 2 - 0.07, cz], [x + 0.07, cy + hh / 2 + 0.07, cz + 0.12], new THREE.Color(0.55, 0.55, 0.55), rng); }
    for (let j = 0; j <= rows; j++) { const y = cy - hh / 2 + (hh * j) / rows; frame.box([cx - w / 2 - 0.07, y - 0.07, cz], [cx + w / 2 + 0.07, y + 0.07, cz + 0.12], new THREE.Color(0.55, 0.55, 0.55), rng); }
    // Reveal: a recessed stone surround filling the bay the course stones left open.
    const rv = new THREE.Color(1, 1, 1).multiplyScalar(0.78);
    rock2.box([cx - w / 2 - 0.3, cy - hh / 2 - 0.25, cz - 0.4], [cx + w / 2 + 0.3, cy - hh / 2 - 0.02, cz + 0.22], rv.clone().multiplyScalar(1.3), rng, { skip: [false, false, false, true, false, true], topK: 1.3 });
    rock2.box([cx - w / 2 - 0.3, cy + hh / 2 + 0.02, cz - 0.4], [cx + w / 2 + 0.3, cy + hh / 2 + 0.25, cz + 0.1], rv, rng, { skip: [false, false, false, false, false, true] });
    for (const sx of [-1, 1]) rock2.box([cx + sx * (w / 2 + 0.02) - (sx > 0 ? 0 : 0.28), cy - hh / 2 - 0.02, cz - 0.4], [cx + sx * (w / 2 + 0.02) + (sx > 0 ? 0.28 : 0), cy + hh / 2 + 0.02, cz + 0.08], rv, rng, { skip: [false, false, true, true, false, true] });
  };
  const rock2 = new VoxelBatch(64);
  addWindow(win.x, win.y, win.z, win.w, win.h);
  addWindow(win2.x, win2.y, win2.z, win2.w, win2.h);
  rock2.bake = CBAKE; rock2.bakeMin = 0.8; rock2.bakeGain = 0.6;
  group.add(mesh(rock2.build(), rockMat, false, true));
  // Ember crystals: tapered hex-prism clusters seated at wall feet and on a ledge (bloom).
  for (const [x, y, z, n] of [[-5.3, 0, 1.4, 4], [8.45, 0, 2.6, 3], [-0.6, ly, -4.55, 5]] as const) crystalCluster(glow, [x, y, z], n, rng);
  const glowMat = track(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true, fog: false }));
  group.add(mesh(glow.build(), glowMat, false, false));
  group.add(mesh(frame.build(), track(surfaceMaterial(texBoards))));

  // ---- lights: warm window key (soft cookie spot, shadows) slanting in from the upper left,
  // aimed so ONE big pool lands under both kin; side fill, hemisphere, a warm lodge lamp
  const keyColor = new THREE.Color('#ffd7a0');
  const winPos = new THREE.Vector3(win.x, win.y, win.z), win2Pos = new THREE.Vector3(win2.x, win2.y, win2.z);
  const poolA = new THREE.Vector3(0.0, 0, 0.15), poolB = new THREE.Vector3(1.2, 0, -0.7);
  const keyDir = poolA.clone().sub(winPos).normalize(), key2Dir = poolB.clone().sub(win2Pos).normalize();
  const key = new THREE.SpotLight(keyColor, 175, 0, 0.3, 0.75, 1.2);
  key.position.copy(winPos).addScaledVector(keyDir, -2.2);
  key.target.position.copy(poolA);
  key.map = track(windowCookie(3, 2));
  key.castShadow = !flags.has('noshadow');
  key.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  key.shadow.camera.near = 1.5;
  key.shadow.camera.far = 24;
  group.add(key, key.target);
  // The small window gets a shaft and a light-pool decal but no light of its own: a second
  // cookie spot cost ~20% of the frame for a patch the decal fakes well (docs/HD2D.md).
  const key2 = new THREE.SpotLight(keyColor, 0, 0, 0.3, 0.75, 1.2);
  key2.position.copy(win2Pos).addScaledVector(key2Dir, -2.2);
  key2.target.position.copy(poolB);
  const hemi = new THREE.HemisphereLight(new THREE.Color('#ffe0b8'), new THREE.Color('#3a2214'), 1.75);
  group.add(hemi);
  // Weak side fill (no shadows): keeps camera-facing stone out of black without flattening it.
  const fill = new THREE.DirectionalLight(new THREE.Color('#ffc49a'), 0.85);
  fill.position.set(-4, 6, 9);
  group.add(fill, fill.target);
  // Lodge lamp + ember glow (warm point accents) on the high tier only.
  if (q === 'high' && !flags.has('nopoints')) {
    const lantern = new THREE.PointLight(new THREE.Color('#ffb060'), 18, 8, 1.4);
    lantern.position.set(lodge.x0 + 4.4, ly + 2.0, lodge.z1 - 1.0);
    group.add(lantern);
    const ember = new THREE.PointLight(new THREE.Color('#ff7a2e'), 3, 4.5, 1.6);
    ember.position.copy(brazierLights[0] ?? new THREE.Vector3(-4.35, 1.2, -0.9));
    group.add(ember);
  }

  // ---- god rays + dust: two broad shafts from the big window, one from the small one
  const beamColor = new THREE.Color('#ffd49a');
  const beams: BeamSpec[] = [];
  const shafts = (w: typeof win, dir: THREE.Vector3, offs: number[], gain: number) => {
    for (const ox of offs) {
      const s = new THREE.Vector3(w.x + ox * w.w, w.y - 0.05, w.z + 0.2);
      const len = (s.y / -dir.y) * 0.98;
      beams.push({ start: s, end: s.clone().addScaledVector(dir, len), width: [w.w * 0.55, w.w * 0.55 * 1.9], gain, fade: 0.18 });
    }
  };
  shafts(win, keyDir, [-0.22, 0.24], 1);
  shafts(win2, key2Dir, [0], 0.8);
  const rays = lightBeams(beams, beamColor, 0.36);
  track(rays.mesh.geometry); track(rays.mesh.material as THREE.Material);
  if (!flags.has('norays')) group.add(rays.mesh);
  const dust = dustMotes(beams, q === 'high' ? 24 : 12, rng, new THREE.Color('#ffd9a0').multiplyScalar(0.75));
  track(dust.points.geometry); track(dust.points.material as THREE.Material);
  group.add(dust.points);
  // Light pools: a soft additive decal where the shafts land (the projected cookie, blurred),
  // plus a pane-shaped lamplight patch on the lodge planks.
  group.add(lightPools(track, [key, key2], [1, 1.1], { x0: -6.5, x1: 7.5, z0: -4.0, z1: 5.0 }, { x0: lodge.x0 + 2.6, x1: lodge.x0 + 5.6, z0: lodge.z0 + 1.0, z1: lodge.z1 - 0.15, y: ly + 0.04 }));

  const spriteLight: SpriteLight = {
    keyDir: key.position.clone().sub(key.target.position).normalize(),
    keyColor: new THREE.Color('#ffd7a0').multiplyScalar(0.62),
    sky: new THREE.Color('#ffd2a6').multiplyScalar(0.62),
    ground: new THREE.Color('#5a3524').multiplyScalar(0.62),
    rim: new THREE.Color('#ffe2b0').multiplyScalar(0.55),
  };

  return {
    group,
    spots: SPOTS,
    people: PEOPLE,
    // Up the stair onto the lodge shelf.
    trainerExit: new THREE.Vector3((stair.x0 + stair.x1) / 2, ly, lodge.z1 - 0.9),
    spriteLight,
    key,
    update(t) { rays.update(t); dust.update(t); },
    setPixelSize(px) { dust.setPixelSize(px); },
    dispose() { for (const d of disposables) d.dispose(); group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); },
  };
}

/**
 * The window cookie as an analytic soft mask at cookie uv: the pane rectangle with a wide
 * penumbra and a gentle round falloff, mullions that only dip to ~45% (low contrast) with soft
 * edges — a big, soft, warm pool rather than a hard stencil.
 */
function cookieMask(u: number, v: number, cols = 3, rows = 2): number {
  const px = u * 64, py = v * 64;
  const ss = THREE.MathUtils.smoothstep;
  let m = ss(px, 1, 15) * (1 - ss(px, 49, 63)) * ss(py, 4, 18) * (1 - ss(py, 46, 60));
  m *= 1 - 0.45 * ss(Math.hypot(px - 32, (py - 32) * 1.2), 14, 34);
  for (let i = 1; i < cols; i++) m *= 0.45 + 0.55 * ss(Math.abs(px - (6 + (52 * i) / cols)), 0.5, 5.5);
  for (let j = 1; j < rows; j++) m *= 0.45 + 0.55 * ss(Math.abs(py - (10 + (44 * j) / rows)), 0.5, 5.5);
  return m;
}

/** Window-pane cookie for a SpotLight.map (cookieMask: soft panes, low-contrast mullions). */
export function windowCookie(cols = 3, rows = 2): THREE.CanvasTexture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const v = Math.round(255 * cookieMask((x + 0.5) / s, (y + 0.5) / s, cols, rows)), i = (y * s + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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

