// HD-2D pixel foliage: hand-pixel-style sprites (tree canopies, bushes, tall grass, tufts,
// flowers) painted procedurally into one RGBA atlas, drawn as camera-facing cylindrical
// billboards — all in ONE mesh (one draw call) with a Lambert material, so they take the
// arena's key/hemisphere light and receive shadows, and cast sprite-shaped shadows through a
// matching depth material. Wind sway runs in the vertex shader and is quantised to whole
// texels, so it reads as sprite frames, not smooth wobble.
//
//   const fol = new FoliageBatch();
//   fol.add('bush', [x, 0, z], { scale: 1.2 });
//   tree(trunks, fol, [x, 0, z], rng, { height: 3 });     // trunk boxes + canopy sprites
//   const f = fol.build({ strength: 1, speed: 1.4 });      // { mesh, update(t), dispose() }
//   group.add(f.mesh); …update: f.update(t)
//
// Sprite texel = TEXEL world units (same pixel density as every other surface).
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import type { V3, VoxelBatch } from '../arena';
import { RAMPS, pixelTexture, type Ramp } from '../textures';
import { TEXEL } from './units';

export type FoliageKind = 'canopy' | 'canopy2' | 'bush' | 'tallgrass' | 'tuft' | 'flowerRed' | 'flowerYellow' | 'flowerBlue' | 'flowerWhite';

/** Atlas rects in texels: x, y, w, h (y down). */
const ATLAS_W = 128, ATLAS_H = 96;
export const FOLIAGE_RECTS: Record<FoliageKind, [number, number, number, number]> = {
  canopy: [0, 0, 48, 40],
  canopy2: [0, 40, 40, 34],
  bush: [48, 0, 32, 22],
  tallgrass: [80, 0, 16, 24],
  tuft: [96, 0, 16, 12],
  flowerRed: [112, 0, 8, 12],
  flowerYellow: [120, 0, 8, 12],
  flowerBlue: [112, 12, 8, 12],
  flowerWhite: [120, 12, 8, 12],
};

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

class Rgba {
  readonly d: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) { this.d = new Uint8ClampedArray(w * h * 4); }
  set(x: number, y: number, c: string) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = hex(c), i = (y * this.w + x) * 4;
    this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = 255;
  }
  alpha(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[(y * this.w + x) * 4 + 3]!; }
}

/** Shade index from a continuous value with ordered dither. */
const dith = (v: number, x: number, y: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(v + BAYER[(y & 3) * 4 + (x & 3)]! / 16)));

/**
 * Leafy blob made of overlapping clumps; each texel is shaded from its position inside its
 * clump (lit upper-left, dark lower-right), with leaf flecks and a 1-texel dark rim.
 */
function paintLeafBlob(t: Rgba, rect: [number, number, number, number], rng: Rng, ramp: Ramp, clumps: number, flat = 1) {
  const [x0, y0, w, h] = rect;
  const cs: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < clumps; i++) {
    const r = (Math.min(w, h / flat) * (0.2 + rng.next() * 0.12));
    const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next()) * 0.32;
    cs.push({ x: w / 2 + Math.cos(a) * d * w, y: h * 0.52 + Math.sin(a) * d * h * 0.8 - (i === 0 ? h * 0.05 : 0), r });
  }
  const n = ramp.length;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = -1, bv = -Infinity;
    cs.forEach((c, i) => { const dx = (x + 0.5 - c.x) / c.r, dy = (y + 0.5 - c.y) / (c.r * flat); const v = 1 - (dx * dx + dy * dy); if (v > 0 && c.y - (i * 0.01) > bv - 100 && v + c.y * 0.02 > bv) { bv = v + c.y * 0.02; best = i; } });
    if (best < 0) continue;
    const c = cs[best]!;
    const dx = (x + 0.5 - c.x) / c.r, dy = (y + 0.5 - c.y) / (c.r * flat);
    // Lambert-ish on a sphere, light from upper-left; lower clumps a touch darker.
    const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
    const l = Math.max(0, -dx * 0.5 - dy * 0.7 + nz * 0.55) * (0.85 + 0.15 * (1 - y / h));
    let v = 1 + l * (n - 2.2);
    if (rng.chance(0.18)) v += rng.chance(0.5) ? 1 : -1; // leaf flecks
    t.set(x0 + x, y0 + y, ramp[dith(v, x, y, n)]!);
  }
  // 1-texel dark rim on the lower/right silhouette, bright specks on the upper-left.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!t.alpha(x0 + x, y0 + y)) continue;
    if (!t.alpha(x0 + x + 1, y0 + y) || !t.alpha(x0 + x, y0 + y + 1)) t.set(x0 + x, y0 + y, ramp[0]!);
    else if ((!t.alpha(x0 + x - 1, y0 + y) || !t.alpha(x0 + x, y0 + y - 1)) && rng.chance(0.6)) t.set(x0 + x, y0 + y, ramp[n - 1]!);
  }
}

function paintBlades(t: Rgba, rect: [number, number, number, number], rng: Rng, ramp: Ramp, blades: number) {
  const [x0, y0, w, h] = rect;
  const n = ramp.length;
  for (let b = 0; b < blades; b++) {
    const bx = 1 + rng.next() * (w - 2), lean = (rng.next() - 0.5) * 0.9, len = h * (0.45 + rng.next() * 0.55);
    for (let k = 0; k < len; k++) {
      const f = k / len;
      const x = Math.round(bx + lean * k * f), y = h - 1 - k;
      t.set(x0 + x, y0 + y, ramp[dith(1 + f * (n - 1.6), x, y, n)]!);
    }
  }
}

function paintFlower(t: Rgba, rect: [number, number, number, number], petal: string[], centre: string) {
  const [x0, y0, w, h] = rect;
  const cx = Math.floor(w / 2), top = 3;
  for (let y = top + 2; y < h; y++) t.set(x0 + cx, y0 + y, RAMPS.leaf[y > h - 4 ? 2 : 3]!);
  t.set(x0 + cx - 1, y0 + h - 4, RAMPS.leaf[4]!); t.set(x0 + cx + 1, y0 + h - 6, RAMPS.leaf[4]!); // leaves
  for (const [dx, dy, k] of [[0, -2, 2], [-2, 0, 1], [2, 0, 1], [0, 2, 0], [-1, -1, 2], [1, -1, 2], [-1, 1, 1], [1, 1, 0]] as const) t.set(x0 + cx + dx, y0 + top + dy, petal[k]!);
  t.set(x0 + cx, y0 + top, centre);
}

let atlas: THREE.CanvasTexture | null = null;
/** The shared foliage atlas (painted once per session, never disposed). */
export function foliageAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const t = new Rgba(ATLAS_W, ATLAS_H);
  const rng = new Rng(77);
  const R = FOLIAGE_RECTS;
  paintLeafBlob(t, R.canopy, rng, RAMPS.leaf, 9);
  paintLeafBlob(t, R.canopy2, rng, RAMPS.leaf, 7, 0.9);
  paintLeafBlob(t, R.bush, rng, RAMPS.grass, 6, 0.7);
  paintBlades(t, R.tallgrass, rng, RAMPS.grass, 14);
  paintBlades(t, R.tuft, rng, RAMPS.grass, 9);
  paintFlower(t, R.flowerRed, ['#7a1a2a', '#c8354a', '#ff7a8a'], '#ffd860');
  paintFlower(t, R.flowerYellow, ['#a86a10', '#e8b020', '#fff07a'], '#c86a20');
  paintFlower(t, R.flowerBlue, ['#2a3a8a', '#4a6ad0', '#9ab8ff'], '#fff0a0');
  paintFlower(t, R.flowerWhite, ['#a8a8b8', '#e0e0e8', '#ffffff'], '#ffd040');
  const c = document.createElement('canvas');
  c.width = ATLAS_W; c.height = ATLAS_H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(ATLAS_W, ATLAS_H);
  img.data.set(t.d);
  ctx.putImageData(img, 0, 0);
  // Through textures.ts pixelTexture (nearest, sRGB), without mips: thin blades and 1-texel
  // petals of an alpha atlas must not merge with neighbouring sprites in a minified level.
  atlas = pixelTexture(c, { mips: false });
  atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
  atlas.userData.persistent = true;
  atlas.dispose = () => {};
  return atlas;
}

export interface FoliageItem {
  /** World scale (1 = 1 sprite texel per TEXEL). */
  scale?: number;
  /** Sway amount: 0 = rigid (trunks/bushes barely move), 1 = grass. */
  sway?: number;
  /** Vertex tint (×). */
  tint?: THREE.ColorRepresentation;
  /** Lift above the base (e.g. a canopy on a trunk). */
  lift?: number;
}

const VERT_HEAD = /* glsl */ `
attribute vec2 aCorner;   // x: -0.5..0.5 across, y: 0..1 up
attribute vec2 aSize;     // world width, height
attribute vec2 aSway;     // amount, phase
uniform float uTime;
uniform float uWind;
uniform float uSpeed;
`;

/** Billboard expansion (shared by colour and depth passes): cylindrical, facing the camera. */
const VERT_BILL = /* glsl */ `
  vec3 base = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 toCam = cameraPosition - base; toCam.y = 0.0;
  toCam = length(toCam) > 1e-4 ? normalize(toCam) : vec3(0.0, 0.0, 1.0);
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);
  float sw = aSway.x * uWind * aCorner.y * aCorner.y * (sin(uTime * uSpeed + aSway.y) + 0.35 * sin(uTime * uSpeed * 2.3 + aSway.y * 1.7));
  sw = floor(sw / ${TEXEL.toFixed(5)} + 0.5) * ${TEXEL.toFixed(5)};
  vec3 wp = base + right * (aCorner.x * aSize.x + sw) + vec3(0.0, aCorner.y * aSize.y, 0.0);
  vec3 transformed = (inverse(modelMatrix) * vec4(wp, 1.0)).xyz;
`;

export class FoliageBatch {
  private pos: number[] = [];
  private corner: number[] = [];
  private size: number[] = [];
  private sway: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private rng = new Rng(5);

  get count() { return this.idx.length / 6; }

  /** One billboard sprite standing at `at` (its bottom centre). */
  add(kind: FoliageKind, at: V3, o: FoliageItem = {}) {
    const [rx, ry, rw, rh] = FOLIAGE_RECTS[kind];
    const s = o.scale ?? 1;
    const w = rw * TEXEL * s, h = rh * TEXEL * s;
    const sway = o.sway ?? (kind === 'tallgrass' || kind === 'tuft' || kind.startsWith('flower') ? 1 : kind === 'bush' ? 0.25 : 0.35);
    const tint = new THREE.Color(o.tint ?? '#ffffff');
    const ph = this.rng.next() * Math.PI * 2;
    const base = this.pos.length / 3;
    const u0 = rx / ATLAS_W, u1 = (rx + rw) / ATLAS_W, v1 = 1 - ry / ATLAS_H, v0 = 1 - (ry + rh) / ATLAS_H;
    for (const [cx, cy, u, v] of [[-0.5, 0, u0, v0], [0.5, 0, u1, v0], [0.5, 1, u1, v1], [-0.5, 1, u0, v1]] as const) {
      this.pos.push(at[0], at[1] + (o.lift ?? 0), at[2]);
      this.corner.push(cx, cy);
      this.size.push(w, h);
      this.sway.push(sway * 0.12 * h, ph);
      this.uv.push(u, v);
      this.col.push(tint.r, tint.g, tint.b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Scatter `n` sprites of the given kinds over a rectangle, skipping keep-out circles. */
  scatter(kinds: FoliageKind[], area: [number, number, number, number], n: number, rng: Rng, o: FoliageItem & { keepOut?: { x: number; z: number; r: number }[]; y?: (x: number, z: number) => number } = {}) {
    for (let i = 0; i < n; i++) {
      const x = area[0] + rng.next() * (area[2] - area[0]), z = area[1] + rng.next() * (area[3] - area[1]);
      if (o.keepOut?.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r)) continue;
      const k = 0.8 + rng.next() * 0.4;
      this.add(rng.pick(kinds), [x, o.y?.(x, z) ?? 0, z], { ...o, scale: (o.scale ?? 1) * k, tint: new THREE.Color(o.tint ?? '#ffffff').multiplyScalar(0.88 + rng.next() * 0.24) });
    }
  }

  /** Build the mesh: Lambert lit, alpha-tested, shadow casting; `wind` strength/speed. */
  build(wind: { strength?: number; speed?: number } = {}): { mesh: THREE.Mesh; update(t: number): void; dispose(): void } {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aCorner', new THREE.Float32BufferAttribute(this.corner, 2));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(this.size, 2));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 2));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(this.pos.length).fill(0), 3));
    g.setIndex(this.idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    const map = foliageAtlas();
    const uniforms = { uTime: { value: 0 }, uWind: { value: wind.strength ?? 1 }, uSpeed: { value: wind.speed ?? 1.4 } };
    const patch = (sh: THREE.WebGLProgramParametersWithUniforms, normal: boolean) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', VERT_BILL);
      // Foliage normal: toward the camera and up (soft, sprite-like lighting).
      if (normal) sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', `
        vec3 fb = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 fc = cameraPosition - fb; fc.y = 0.0;
        vec3 objectNormal = normalize((length(fc) > 1e-4 ? normalize(fc) : vec3(0.0, 0.0, 1.0)) * 0.6 + vec3(0.0, 0.8, 0.0));`);
    };
    const material = new THREE.MeshLambertMaterial({ map, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
    material.onBeforeCompile = (sh) => patch(sh, true);
    material.customProgramCacheKey = () => 'hd2d-foliage';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 });
    depth.onBeforeCompile = (sh) => patch(sh, false);
    depth.customProgramCacheKey = () => 'hd2d-foliage-depth';
    const mesh = new THREE.Mesh(g, material);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = 'hd2d-foliage';
    return { mesh, update(t) { uniforms.uTime.value = t; }, dispose() { g.dispose(); material.dispose(); depth.dispose(); } };
  }
}

/**
 * A tree: a tapered trunk of stacked boxes (bark-textured VoxelBatch, e.g. paintRock(…,
 * RAMPS.bark) or paintBoards) with a root flare, and 1–3 canopy sprites at the top.
 */
export function tree(trunks: VoxelBatch, fol: FoliageBatch, at: V3, rng: Rng, o: { height?: number; canopy?: number; tint?: THREE.ColorRepresentation } = {}) {
  const h = o.height ?? 2.6, cs = o.canopy ?? 1;
  const [x, y, z] = at;
  const segs = 4;
  for (let i = 0; i < segs; i++) {
    const r = 0.17 * (1 - i / segs * 0.45);
    const y0 = y + (h * i) / segs, y1 = y + (h * (i + 1)) / segs;
    const ox = (rng.next() - 0.5) * 0.05;
    trunks.box([x - r + ox, y0, z - r], [x + r + ox, y1, z + r], new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rng.next() * 0.2), rng, { skip: [false, false, false, true, false, false], aoBottom: i === 0 ? 0.55 : 0.85 });
  }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    trunks.box([x + dx * 0.17 - 0.08, y, z + dz * 0.17 - 0.08], [x + dx * 0.17 + 0.08, y + 0.18, z + dz * 0.17 + 0.08], new THREE.Color(0.8, 0.8, 0.8), rng, { skip: [false, false, false, true, false, false], aoBottom: 0.5 });
  }
  const tint = new THREE.Color(o.tint ?? '#ffffff');
  fol.add('canopy', [x, y, z], { scale: cs * 1.1, lift: h - 0.6 * cs, tint });
  if (cs > 0.8) {
    fol.add('canopy2', [x - 0.5 * cs, y, z + 0.05], { scale: cs * 0.8, lift: h - 1.1 * cs, tint: tint.clone().multiplyScalar(0.88) });
    fol.add('canopy2', [x + 0.55 * cs, y, z - 0.05], { scale: cs * 0.75, lift: h - 1.0 * cs, tint: tint.clone().multiplyScalar(0.94) });
  }
}
