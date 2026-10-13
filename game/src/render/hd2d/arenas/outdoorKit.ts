// Outdoor arena helpers (meadow, flower field, hollow, scrub). Not an arena itself (no ARENA
// export). Builds on the kit in ../arena.ts and ../textures.ts:
//
//  * RgbaTile — a multi-ramp RGBA texel painter (sprites need several ramps + transparency).
//  * SpriteAtlas + painters — procedural pixel-art sprites (canopies, bushes, grass tufts,
//    flowers, vines, butterflies, dead twigs…) on one atlas at the arena's texel density.
//  * Foliage — ONE mesh of cylindrical billboards over the atlas (alpha-tested, lit, cast
//    shadows through a matching depth material). Wind sway / butterfly flutter / falling
//    petals run in the vertex shader, quantised to whole texels so they read as sprite frames.
//  * terraces() — stacked blocks with separate top (grass/moss) and side (earth/rock) batches
//    plus hanging fringe quads on exposed top edges.
//  * groundMesh() — one unique painted floor texture over the whole stage (no tiling seams; the
//    battle-ground marking is painted into it) with baked AO toward the banks.
//  * backdrop() — a far painted plane (sky, clouds, distant silhouettes) with optional heat haze.
//  * sunRig() — a far SpotLight "sun" with a dapple cookie + soft shadows, hemisphere and fill.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { CELL, LEVEL, TEXEL, VoxelBatch, type Face4, type Heightmap } from '../arena';
import { boulder } from '../kit/rock';
import { PixelTile, ditherIndex, fbm, type Ramp } from '../textures';
import type { SpriteLight } from '../sprite';

export type V3 = [number, number, number];

// ------------------------------------------------------------------ colour helpers

const rgbCache = new Map<string, [number, number, number]>();
export function rgb(hex: string): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) { c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; rgbCache.set(hex, c); }
  return c;
}

/** A ramp shade as a THREE colour (vertex tints). */
export function rampColor(ramp: Ramp, i: number): THREE.Color {
  return new THREE.Color(ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(i)))]!);
}

export function mkMesh(g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true): THREE.Mesh {
  const out = new THREE.Mesh(g, m);
  out.castShadow = cast;
  out.receiveShadow = receive;
  return out;
}

// ------------------------------------------------------------------ RGBA texel painter

/** RGBA texel image; every colour comes from a ramp (dithered between neighbouring shades). */
export class RgbaTile {
  readonly data: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) { this.data = new Uint8ClampedArray(w * h * 4); }
  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x: number, y: number, hex: string, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inside(x, y)) return;
    const [r, g, b] = rgb(hex);
    const i = (y * this.w + x) * 4;
    this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a;
  }
  alpha(x: number, y: number): number { return this.inside(x, y) ? this.data[(y * this.w + x) * 4 + 3]! : 0; }
  /** Paint a continuous ramp position with the 4×4 Bayer dither. */
  shade(x: number, y: number, ramp: Ramp, v: number) { this.set(x, y, ramp[ditherIndex(v, x, y, ramp.length)]!); }
  /** Paint a continuous ramp position posterised into bands (clustered dither near band edges only). */
  band(x: number, y: number, ramp: Ramp, v: number, edge = 0.14) { this.set(x, y, ramp[bandIndex(v, x, y, ramp.length, edge)]!); }
  /** Scale a texel's colour (keeps alpha): compaction, scuffs, wear. */
  scale(x: number, y: number, k: number) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    for (let c = 0; c < 3; c++) this.data[i + c] = Math.min(255, this.data[i + c]! * k);
  }
  /** Copy a texel's colour from a ramp index, keeping alpha. */
  toCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

/**
 * Clustered threshold in 0..1: interleaved-gradient noise on 2×2 texel clumps (blue-noise-like,
 * no Bayer lattice), so a band-edge dither reads as little clumps of pixels, not a checkerboard.
 */
export function clumpNoise(x: number, y: number): number {
  const cx = (x >> 1) & 1023, cy = (y >> 1) & 1023;
  const v = 52.9829189 * ((0.06711056 * cx + 0.00583715 * cy) % 1);
  return v - Math.floor(v);
}

/**
 * Posterised ramp index: flat bands (one per shade), dithered ONLY within ±`edge` of a band
 * edge with the clustered threshold — painterly bands instead of a full-field Bayer carpet.
 */
export function bandIndex(v: number, x: number, y: number, n: number, edge = 0.14): number {
  const b = Math.floor(v), e = v - b - 0.5;
  const i = Math.abs(e) < edge ? b + ((e + edge) / (2 * edge) > clumpNoise(x, y) ? 1 : 0) : Math.round(v);
  return Math.max(0, Math.min(n - 1, i));
}

/** Crisp texture from a tile (nearest, no mips, sRGB). */
export function crispTexture(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ sprite atlas

export interface SpriteRect {
  /** Texel rect in the atlas. */
  x: number; y: number; w: number; h: number;
  /** Pivot in sprite texels from the top-left (where the sprite touches its anchor). */
  px: number; py: number;
}

/** Shelf-packed RGBA atlas; sprites are painted in local texel coords. */
export class SpriteAtlas {
  readonly tile: RgbaTile;
  readonly sprites = new Map<string, SpriteRect[]>();
  private cx = 1; private cy = 1; private row = 0;
  constructor(readonly size = 512) { this.tile = new RgbaTile(size, size); }

  /** Reserve a w×h slot and paint it; `paint(set)` gets a local setter. Returns the rect. */
  add(name: string, w: number, h: number, paint: (p: SpriteCanvas) => void, pivot: [number, number] = [w / 2, h]): SpriteRect {
    if (this.cx + w + 1 > this.size) { this.cx = 1; this.cy += this.row + 1; this.row = 0; }
    if (this.cy + h + 1 > this.size) throw new Error(`sprite atlas full (${name})`);
    const r: SpriteRect = { x: this.cx, y: this.cy, w, h, px: pivot[0], py: pivot[1] };
    this.cx += w + 2; this.row = Math.max(this.row, h);
    paint(new SpriteCanvas(this.tile, r.x, r.y, w, h));
    const list = this.sprites.get(name) ?? [];
    list.push(r);
    this.sprites.set(name, list);
    return r;
  }
  get(name: string, rng?: Rng): SpriteRect {
    const l = this.sprites.get(name);
    if (!l?.length) throw new Error(`no sprite ${name}`);
    return rng ? rng.pick(l) : l[0]!;
  }
  texture(): THREE.CanvasTexture { return crispTexture(this.tile.toCanvas()); }
}

/** Local view of an atlas slot. */
export class SpriteCanvas {
  constructor(private t: RgbaTile, readonly ox: number, readonly oy: number, readonly w: number, readonly h: number) {}
  in(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x: number, y: number, hex: string) { x = Math.round(x); y = Math.round(y); if (this.in(x, y)) this.t.set(this.ox + x, this.oy + y, hex); }
  shade(x: number, y: number, ramp: Ramp, v: number) { x = Math.round(x); y = Math.round(y); if (this.in(x, y)) this.t.set(this.ox + x, this.oy + y, ramp[ditherIndex(v, x, y, ramp.length)]!); }
  /** Posterised (band) shade: flat shades, clustered dither only near band edges. */
  band(x: number, y: number, ramp: Ramp, v: number) { x = Math.round(x); y = Math.round(y); if (this.in(x, y)) this.t.set(this.ox + x, this.oy + y, ramp[bandIndex(v, x, y, ramp.length)]!); }
  has(x: number, y: number) { return this.in(x, y) && this.t.alpha(this.ox + x, this.oy + y) > 0; }
  clear(x: number, y: number) { if (this.in(x, y)) { const i = ((this.oy + y) * this.t.w + this.ox + x) * 4; this.t.data[i + 3] = 0; } }
  /** Outline: every empty texel next to a filled one gets `hex` (only below/sides when `noTop`). */
  outline(hex: string, noTop = false) {
    const add: [number, number][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.has(x, y)) continue;
      if (this.has(x - 1, y) || this.has(x + 1, y) || this.has(x, y - 1) || (!noTop && this.has(x, y + 1))) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, hex);
  }
}

// ------------------------------------------------------------------ sprite painters

/**
 * Leafy canopy: a union of round leaf clumps painted back to front; each clump is shaded like a
 * sphere lit from the upper left, with a leaf-texture noise, a darker rim where it overlaps
 * older clumps, a few bright leaf flecks, and a dark outline. Optional trunk/branch stubs.
 */
export function paintCanopy(p: SpriteCanvas, rng: Rng, ramp: Ramp, o: { clumps?: number; flat?: number; light?: [number, number] } = {}) {
  const { w, h } = p;
  const n = o.clumps ?? 9;
  const L = o.light ?? [-0.55, -0.65];
  const clumps: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    // Lower clumps first (back), the crown last.
    const r = (Math.min(w, h) * (0.2 + rng.next() * 0.1)) * (o.flat ?? 1);
    const cx = w * (0.22 + rng.next() * 0.56);
    const cy = h * (0.72 - t * 0.42) + (rng.next() - 0.5) * h * 0.12;
    clumps.push([cx, Math.min(cy, h - r - 1), Math.min(r, cx - 1, w - cx - 1)]);
  }
  const top = ramp.length - 1;
  const leaf = fbm(32, rng, [[8, 0.6], [16, 0.4]]);
  for (const [cx, cy, r] of clumps) {
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
      // Ragged edge made of little leaf cells (4×3 texels, staggered rows).
      const row = Math.floor(y / 3), col = Math.floor((x + (row % 2) * 2) / 4);
      const cellR = hash2(col, row, 9);
      const d2 = dx * dx + dy * dy;
      if (d2 > 1 + (cellR - 0.55) * 0.5 - 0.12 * leaf[((y & 31) * 32 + (x & 31))]!) continue;
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d2)));
      const lit = -(dx * L[0] + dy * L[1]) + nz * 0.5;
      const rim = d2 > 0.7 && p.has(x, y) ? -1.6 : 0;
      // Leaf cell shading: a lit top-left texel pair, a dark bottom-right corner.
      const lx = (x + (row % 2) * 2) - col * 4, ly = y - row * 3;
      const cell = ly === 0 && lx < 2 ? 0.45 : ly === 2 && lx === 3 ? -0.6 : 0;
      const v = 2.1 + lit * 2.7 + cell + (cellR - 0.5) * 0.5 + rim + (0.45 - y / h) * 1.6;
      p.shade(x, y, ramp, Math.max(0.6, Math.min(top - 0.1, v)));
    }
  }
  // Leaf flecks: bright little 2-texel leaves on the lit side.
  for (let i = 0; i < w * h * 0.02; i++) {
    const x = rng.int(w), y = rng.int(Math.ceil(h * 0.6));
    if (!p.has(x, y) || !p.has(x + 1, y) || x / w > 0.7) continue;
    p.set(x, y, ramp[top]!); if (rng.chance(0.5)) p.set(x + 1, y, ramp[top - 1]!);
  }
  p.outline(ramp[0]!);
}

/** A tuft of grass blades fanning up from the bottom centre (no outline, dark roots, light tips). */
export function paintTuft(p: SpriteCanvas, rng: Rng, ramp: Ramp, blades: number, lean = 1) {
  const { w, h } = p;
  const top = ramp.length - 1;
  for (let b = 0; b < blades; b++) {
    const x0 = w / 2 + (rng.next() - 0.5) * w * 0.5;
    const len = h * (0.45 + rng.next() * 0.55);
    const dir = (rng.next() - 0.5) * 1.6 * lean;
    const shade = 1 + rng.next() * 2;
    for (let s = 0; s < len; s++) {
      const t = s / len;
      const x = x0 + dir * t * t * len * 0.5;
      p.shade(x, h - 1 - s, ramp, Math.min(top, shade + t * 2.6));
      if (t < 0.4) p.shade(x + (dir > 0 ? -1 : 1), h - 1 - s, ramp, shade - 0.5 + t * 2);
    }
  }
}

/** A flower: a stem with a leaf and a little head (petals around a centre). */
export function paintFlower(p: SpriteCanvas, rng: Rng, stem: Ramp, petal: Ramp, centre: string, x: number, base: number, height: number, size = 1) {
  const top = petal.length - 1;
  for (let s = 0; s < height; s++) p.shade(x + (s > height * 0.6 ? Math.sign(x - p.w / 2) * 0 : 0), base - s, stem, 1.5 + (s / height) * 2);
  const ly = base - Math.floor(height * 0.4);
  p.set(x + 1, ly, stem[3]!); p.set(x + 2, ly - 1, stem[4]!); p.set(x - 1, ly + 1, stem[2]!);
  const hy = base - height;
  if (size >= 2) {
    for (const [dx, dy, v] of [[0, -2, top], [-1, -1, top - 1], [1, -1, top], [-2, 0, top - 2], [2, 0, top - 1], [-1, 1, top - 2], [1, 1, top - 2], [0, 2, top - 3], [-1, 0, top - 1], [1, 0, top], [0, -1, top], [0, 1, top - 2]] as const) p.set(x + dx, hy + dy, petal[Math.max(0, v)]!);
    p.set(x, hy, centre);
    p.set(x - 2, hy - 1, petal[0]!); p.set(x + 2, hy + 1, petal[0]!);
  } else {
    for (const [dx, dy, v] of [[0, -1, top], [-1, 0, top - 1], [1, 0, top], [0, 1, top - 2]] as const) p.set(x + dx, hy + dy, petal[Math.max(0, v)]!);
    p.set(x, hy, centre);
  }
  void rng;
}

/** A hanging vine strand: a wavy stem with alternating small leaves, anchored at the top. */
export function paintVine(p: SpriteCanvas, rng: Rng, ramp: Ramp) {
  const { w, h } = p;
  let x = w / 2;
  for (let y = 0; y < h; y++) {
    x += Math.sin(y * 0.35 + rng.next()) * 0.35;
    p.shade(x, y, ramp, 1.5 + (1 - y / h) * 1.5);
    if (y % 3 === 1) {
      const side = (y / 3) % 2 ? 1 : -1;
      p.shade(x + side, y, ramp, 3.2); p.shade(x + side * 2, y + 1, ramp, 2.4);
      if (rng.chance(0.5)) p.shade(x + side, y + 1, ramp, 4);
    }
  }
}

/** Bare twiggy branches (dead scrub / dead tree crown). */
export function paintTwigs(p: SpriteCanvas, rng: Rng, ramp: Ramp, branches: number, spread = 1) {
  const { w, h } = p;
  const grow = (x: number, y: number, ang: number, len: number, depth: number) => {
    for (let s = 0; s < len; s++) {
      x += Math.cos(ang); y -= Math.sin(ang);
      p.shade(x, y, ramp, 1.2 + (depth * 0.7) + (Math.cos(ang) < 0 ? 0.6 : 0));
      if (depth === 0 && s < len * 0.4) p.shade(x + 1, y, ramp, 0.8);
    }
    if (depth < 3) {
      const k = 1 + (rng.chance(0.6) ? 1 : 0);
      for (let i = 0; i < k + 1; i++) grow(x, y, ang + (rng.next() - 0.5) * 1.6 * spread, len * (0.5 + rng.next() * 0.25), depth + 1);
    }
  };
  for (let b = 0; b < branches; b++) grow(w / 2 + (rng.next() - 0.5) * 3, h - 1, Math.PI / 2 + (rng.next() - 0.5) * 1.1 * spread, h * (0.3 + rng.next() * 0.15), 0);
}

/** Butterfly frame: two wings (ramp) around a dark body, wings folded by `open` (0..1). */
export function paintButterfly(p: SpriteCanvas, wing: Ramp, open: number) {
  const cx = Math.floor(p.w / 2);
  const span = Math.max(1, Math.round(3 * open));
  for (let y = 0; y < 5; y++) for (let dx = 1; dx <= span; dx++) {
    if ((y === 0 || y === 4) && dx === span) continue;
    const v = y < 2 ? wing.length - 1 - (dx === span ? 1 : 0) : 2;
    p.set(cx - dx, y, wing[v]!); p.set(cx + dx, y, wing[v]!);
  }
  if (span >= 2) { p.set(cx - span + 1, 1, '#fff6e0'); p.set(cx + span - 1, 1, '#fff6e0'); }
  for (let y = 0; y < 5; y++) p.set(cx, y, '#2a1a20');
}

const fract = (v: number) => v - Math.floor(v);

/** Integer hash → [0, 1) (stable per texel / cell). */
export function hash2(x: number, y: number, seed = 0): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453);
}

// ------------------------------------------------------------------ tile painters (single ramp)

/** Earth bank side: strata bands, embedded pebbles, dark root threads. */
export function paintEarth(seed: number, ramp: Ramp, size = 32, o: { roots?: number; pebbles?: number; strata?: number } = {}): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  const f = fbm(size, rng, [[2, 0.4], [4, 0.35], [16, 0.25]]);
  const top = ramp.length - 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const band = Math.sin((y + Math.sin(x * 0.3) * 1.5) * (o.strata ?? 0.55)) * 0.45;
    t.idx[y * size + x] = bandIndex(1.8 + f[y * size + x]! * 2.6 + band, x, y, ramp.length);
  }
  for (let i = 0; i < (o.pebbles ?? 7); i++) {
    const x = rng.int(size), y = rng.int(size), r = rng.chance(0.4) ? 1 : 0;
    for (let j = -r; j <= r; j++) for (let k = -r - 1; k <= r; k++) t.set(x + k, y + j, top - 1 - (j > 0 ? 1 : 0));
    t.set(x - r - 1, y - r, top); t.set(x + r, y + r + 1, 0);
  }
  for (let i = 0; i < (o.roots ?? 3); i++) {
    let x = rng.int(size), y = rng.int(size);
    for (let s = 0; s < 6 + rng.int(8); s++) { t.set(x, y, 0); t.nudge(x, y - 1, 1); x += rng.chance(0.7) ? 1 : 0; y += rng.chance(0.6) ? 1 : -0; }
  }
  return t;
}

/** Turf / moss top: noisy ramp with blade flecks (light tip over a dark root texel). */
export function paintTurf(seed: number, ramp: Ramp, size = 32, o: { lo?: number; hi?: number; flecks?: number } = {}): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  const f = fbm(size, rng, [[2, 0.5], [4, 0.3], [16, 0.2]]);
  const lo = o.lo ?? 1.6, hi = o.hi ?? 4.4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = Math.max(0, Math.min(1, 0.5 + (f[y * size + x]! - 0.5) * 1.4));
    t.idx[y * size + x] = bandIndex(lo + v * (hi - lo), x, y, ramp.length);
  }
  for (let i = 0; i < size * size * (o.flecks ?? 0.12); i++) {
    const x = rng.int(size), y = rng.int(size);
    t.nudge(x, y, 2); t.nudge(x, y + 1, -1);
  }
  return t;
}

/** Bark: vertical grain streaks, knots, a lit left edge per plate. */
export function paintBark(seed: number, ramp: Ramp, size = 32): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  for (let x = 0; x < size; x++) {
    const plate = Math.floor(x / 4 + Math.sin(x * 0.7) * 0.3);
    const tone = 1.8 + ((plate * 37) % 7) / 7 * 1.6;
    for (let y = 0; y < size; y++) {
      const v = tone + Math.sin(y * 0.4 + plate * 2.1) * 0.5 + (x % 4 === 0 ? -1.2 : x % 4 === 1 ? 0.8 : 0);
      t.idx[y * size + x] = ditherIndex(v, x, y, ramp.length);
    }
  }
  for (let i = 0; i < 3; i++) { const x = rng.int(size), y = rng.int(size); t.set(x, y, 0); t.set(x + 1, y, 0); t.set(x, y + 1, 1); t.set(x - 1, y - 1, 4); }
  return t;
}

// ------------------------------------------------------------------ foliage billboard batch

export type FoliageMode = 'billboard' | 'static' | 'flutter' | 'fall';
const MODE: Record<FoliageMode, number> = { billboard: 0, static: 1, flutter: 2, fall: 3 };

export interface FoliageOpts {
  /** World units per sprite texel (default TEXEL). */
  scale?: number;
  /** Wind sway amplitude at the top (world units). */
  sway?: number;
  flip?: boolean;
  tint?: THREE.Color;
  /** flutter: path radius; fall: drop height. */
  range?: number;
  /** Lean the sprite back toward −z by this angle (rad), for ground-hugging clumps. */
  lean?: number;
  /** Cast a shadow (default true). Far backdrop foliage opts out so a low sun still reaches the stage. */
  shadow?: boolean;
}

const FOLIAGE_VERT_HEAD = /* glsl */ `
attribute vec2 aOff;
attribute vec4 aPar; // sway, phase, mode, height
attribute float aRange;
uniform float uTime;
`;
const FOLIAGE_VERT_BODY = /* glsl */ `
vec3 transformed = position;
{
  float mode = aPar.z;
  if (mode < 0.5 || mode > 1.5) {
    vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    camR.y = 0.0; camR = normalize(camR);
    vec2 off = aOff;
    vec3 anchor = position;
    float tx = ${TEXEL.toFixed(5)};
    if (mode > 1.5 && mode < 2.5) {
      // Butterfly: wander on a lissajous path, flap by squashing x (3 frames).
      float t = uTime * 0.35 + aPar.y * 6.0;
      anchor += vec3(sin(t) * aRange, 0.25 * sin(t * 2.3 + aPar.y) + 0.15 * sin(t * 5.1), cos(t * 0.7 + aPar.y) * aRange * 0.6);
      float f = floor(fract(uTime * 5.0 + aPar.y * 3.0) * 3.0);
      off.x *= f < 0.5 ? 1.0 : f < 1.5 ? 0.6 : 0.25;
    } else if (mode > 2.5) {
      // Falling petal / leaf: drop through aRange, drift sideways, tumble.
      float t = fract(uTime * 0.07 + aPar.y);
      anchor += vec3(sin(t * 9.0 + aPar.y * 20.0) * 0.5 + t * 1.2, -t * aRange, cos(t * 7.0 + aPar.y * 11.0) * 0.3);
      off.x *= sign(sin(uTime * 4.0 + aPar.y * 30.0)) * 0.5 + 0.5 * sin(uTime * 4.0 + aPar.y * 30.0);
    }
    float s = aPar.x * (sin(uTime * 1.6 + aPar.y * 6.2831) + 0.35 * sin(uTime * 3.7 + aPar.y * 17.0));
    float k = clamp(aOff.y / max(aPar.w, 0.001), 0.0, 1.0);
    s = floor(s * k * k / tx + 0.5) * tx;
    transformed = anchor + camR * (off.x + s) + vec3(0.0, off.y, 0.0);
  }
}
`;

/**
 * One merged mesh of atlas sprites. Billboards turn around Y toward the camera (and toward the
 * light in the shadow pass, so canopies cast full silhouettes). Static quads (fringes) keep
 * their world vertices. One draw call (+1 in the shadow pass).
 */
export class Foliage {
  private pos: number[] = [];
  private off: number[] = [];
  private uv: number[] = [];
  private par: number[] = [];
  private rng: number[] = [];
  private col: number[] = [];
  private nor: number[] = [];
  private idx: number[] = [];
  readonly uTime = { value: 0 };
  constructor(readonly atlas: SpriteAtlas) {}

  private uvOf(r: SpriteRect, flip: boolean): [number, number][] {
    const S = this.atlas.size;
    const u0 = r.x / S, u1 = (r.x + r.w) / S, v0 = 1 - (r.y + r.h) / S, v1 = 1 - r.y / S;
    return flip ? [[u1, v0], [u0, v0], [u0, v1], [u1, v1]] : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  }

  /** A billboard sprite standing on `at` (its pivot touches the anchor). */
  add(r: SpriteRect, at: V3, mode: FoliageMode = 'billboard', o: FoliageOpts = {}) {
    const k = o.scale ?? TEXEL;
    const x0 = -r.px * k, x1 = (r.w - r.px) * k, y0 = -(r.h - r.py) * k, y1 = r.py * k;
    const base = this.pos.length / 3;
    const uvs = this.uvOf(r, !!o.flip);
    const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const tint = o.tint ?? new THREE.Color(1, 1, 1);
    const ph = fract(Math.sin(this.pos.length * 12.9898 + at[0] * 78.233 + at[2] * 37.719) * 43758.5453);
    const lean = o.lean ?? 0;
    corners.forEach(([ox, oy], i) => {
      this.pos.push(at[0], at[1], at[2] - Math.sin(lean) * Math.max(0, oy));
      this.off.push(ox, oy * Math.cos(lean));
      this.uv.push(uvs[i]![0], uvs[i]![1]);
      this.par.push(o.sway ?? 0, ph, MODE[mode], y1);
      // aRange < 0 marks a sprite that casts no shadow (billboards/static never read the range).
      this.rng.push(o.shadow === false && (mode === 'billboard' || mode === 'static') ? -1 : o.range ?? 0);
      this.col.push(tint.r, tint.g, tint.b);
      this.nor.push(0, 1, 0);
    });
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** A static textured quad (world corners a,b,c,d CCW from the front: bottom-left first). */
  quad(r: SpriteRect, a: V3, b: V3, c: V3, d: V3, n: V3, tint = new THREE.Color(1, 1, 1), flip = false) {
    const base = this.pos.length / 3;
    const uvs = this.uvOf(r, flip);
    [a, b, c, d].forEach((p, i) => {
      this.pos.push(p[0], p[1], p[2]);
      this.off.push(0, 0);
      this.uv.push(uvs[i]![0], uvs[i]![1]);
      this.par.push(0, 0, MODE.static, 1);
      this.rng.push(0);
      this.col.push(tint.r, tint.g, tint.b);
      this.nor.push(n[0], n[1], n[2]);
    });
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  get count() { return this.idx.length / 6; }

  /** Build the mesh. `upNormal` (0..1) bends billboard normals toward +Y (how much the sun lights them). */
  build(texture: THREE.Texture, o: { upNormal?: number; emissive?: number } = {}): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aOff', new THREE.Float32BufferAttribute(this.off, 2));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aPar', new THREE.Float32BufferAttribute(this.par, 4));
    g.setAttribute('aRange', new THREE.Float32BufferAttribute(this.rng, 1));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const up = (o.upNormal ?? 0.65).toFixed(3);
    const uTime = this.uTime;
    const inject = (sh: THREE.WebGLProgramParametersWithUniforms, normals: boolean) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = FOLIAGE_VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', FOLIAGE_VERT_BODY + (normals ? '' : '\nif (aRange < -0.5) transformed = vec3(0.0, -9999.0, 0.0);'));
      if (normals) {
        sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', `vec3 objectNormal = vec3(normal);
          if (aPar.z < 0.5 || aPar.z > 1.5) {
            vec3 camB = vec3(viewMatrix[0][2], 0.0, viewMatrix[2][2]);
            objectNormal = normalize(mix(normalize(camB), vec3(0.0, 1.0, 0.0), ${up}));
          }`);
      }
    };
    const m = new THREE.MeshLambertMaterial({ map: texture, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
    if (o.emissive) { m.emissive = new THREE.Color(o.emissive, o.emissive, o.emissive); m.emissiveMap = texture; }
    m.onBeforeCompile = (sh) => inject(sh, true);
    m.customProgramCacheKey = () => `hd2d-foliage-${up}`;
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texture, alphaTest: 0.5, side: THREE.DoubleSide });
    depth.onBeforeCompile = (sh) => inject(sh, false);
    depth.customProgramCacheKey = () => 'hd2d-foliage-depth';
    const mesh = new THREE.Mesh(g, m);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.disposeExtra = depth;
    return mesh;
  }
}

// ------------------------------------------------------------------ terraces (top / side split)

export interface TerraceOpts {
  /** Darken toward the bottom of each side face (wall-foot AO; faces reaching the floor get it fully). */
  aoBottom?: number;
  /** Tint multiplier for top faces (catching the sky). */
  topK?: number;
  /** Per-slab brightness jitter. */
  jitter?: number;
  /**
   * Fringe sprites hung on exposed top edges (null = none). `long` scales the overhang (sprite
   * texels × TEXEL × long), `chance` the share of exposed edges that get one (default 1).
   */
  fringe?: { foliage: Foliage; sprite: string; rng: Rng; chance?: number; long?: number } | null;
  /** Rounded turf lip: inset of the flat top and drop of the rounded edge (world units). */
  lip?: number;
  /** Rock-kit boulders poking out of the earth faces (`batch` takes the rock material). */
  rocks?: { batch: VoxelBatch; chance?: number; tint?: THREE.ColorRepresentation } | null;
  /** Cut convex corners diagonally (marching-squares half cells). Default true. */
  diagonals?: boolean;
  /** World y of level 0 (default 0). */
  baseY?: number;
  /** Emit the earth side slabs (default true); false when another builder walls the columns (rock kit boulders). */
  sides?: boolean;
  /** Cells to skip entirely (e.g. off the cliff edge). */
  skip?: (i: number, j: number) => boolean;
}

type P2 = [number, number];

/**
 * Drop polygon points whose edge to the next point has zero length (two neighbouring cut
 * corners share a mid-edge point; the zero edge must not exist).
 */
function dedupe<T extends { p: P2 }>(poly: T[]) {
  for (let m = 0; m < poly.length && poly.length > 2; m++) {
    const a = poly[m]!.p, b = poly[(m + 1) % poly.length]!.p;
    if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) { poly.splice(m, 1); m--; }
  }
}

/** Deterministic hash for slab breaks (stable per edge). */
const edgeHash = (i: number, j: number, k: number) => hash2(i * 3 + k, j * 7 - k, 17);

/**
 * Organic terraces from a Heightmap (levels may be fractional: 0.5 = half a LEVEL):
 *  * the turf top (`tops`) is one continuous surface across a plateau, with a ROUNDED lip on
 *    every exposed edge (inset flat top + two chamfer facets) instead of a cube edge;
 *  * convex corners are cut diagonally (marching-squares half-cell triangles), filled below by
 *    a lower step at the height of the neighbours, so ledges read as rounded, not a 90° lattice;
 *  * the earth sides (`sides`) are tall slabs (no seam per LEVEL; 1–3 cells wide), darkened
 *    toward their foot; optional rock-kit boulders poke out of them;
 *  * exposed lips get a long hanging fringe from the foliage atlas.
 */
export function terraces(hm: Heightmap, sides: VoxelBatch, tops: VoxelBatch, rng: Rng, o: TerraceOpts = {}) {
  const jit = o.jitter ?? 0.2;
  const lip = o.lip ?? 0.14;
  const drop = lip * 0.95;
  const diag = o.diagonals ?? true;
  const by = o.baseY ?? 0;
  const H = CELL / 2;
  const t = 1 / (TEXEL * sides.tileTexels);
  const tt = 1 / (TEXEL * tops.tileTexels);
  const lvl = (i: number, j: number, own: number) => { const v = hm.get(i, j); return v >= 90 ? own : v; };
  const flat: Face4 = [0, 0, -1, 1];
  // Corners in CCW order seen from above, their (dx, dz) signs; edge k runs corner k → k+1.
  const CS: P2[] = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
  const EDGE_NB: P2[] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const rockTint = new THREE.Color(o.rocks?.tint ?? '#ffffff');
  const fr = o.fringe;

  /** A side quad a→b (bottom edge, CCW seen from outside) from y0 to y1, as part of a slab. */
  const sideQuad = (a: P2, b: P2, y0: number, y1: number, n: V3, u0: number, slabW: number, tint: THREE.Color, foot: number) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const hh = y1 - y0;
    if (hh < 0.01 || len < 0.01 || o.sides === false) return;
    const ox = (Math.floor(hash2(Math.round(a[0] * 7), Math.round(a[1] * 7), 3) * 32) / 32);
    const uv = (u: number, y: number): [number, number] => [ox + u * t, y * t];
    const P = (q: P2, y: number): V3 => [q[0], y, q[1]];
    const ca = tint.clone().multiplyScalar(foot), cb = tint;
    const fa = (u: number, v: number): Face4 => [u, v, slabW, -(hh)];
    const A = P(a, y0), B = P(b, y0), C = P(b, y1), D = P(a, y1);
    sides.tri([A, B, C], n, [uv(u0, y0), uv(u0 + len, y0), uv(u0 + len, y1)], [ca, ca, cb], [fa(u0, 0), fa(u0 + len, 0), fa(u0 + len, hh)]);
    sides.tri([A, C, D], n, [uv(u0, y0), uv(u0 + len, y1), uv(u0, y1)], [ca, cb, cb], [fa(u0, 0), fa(u0 + len, hh), fa(u0, hh)]);
    // A boulder poking out of a tall earth face now and then.
    if (o.rocks && hh > 0.55 && rng.chance(o.rocks.chance ?? 0.18)) {
      const k = 0.25 + rng.next() * 0.5;
      const px = a[0] + (b[0] - a[0]) * k, pz = a[1] + (b[1] - a[1]) * k;
      const s = 0.34 + rng.next() * 0.3;
      const y = y0 + Math.min(hh - s * 0.6, 0.15 + rng.next() * (hh - 0.3));
      boulder(o.rocks.batch, [px - n[0] * 0.08, Math.max(y0 + s * 0.35, y), pz - n[2] * 0.08], [s * 1.6, s, s * 1.0], rockTint.clone().multiplyScalar(0.85 + rng.next() * 0.3), rng, {
        ry: Math.atan2(n[0], n[2]) + (rng.next() - 0.5) * 0.4, rx: (rng.next() - 0.5) * 0.2, aoBottom: 0.5, topK: 1.3,
      });
    }
  };

  /** Ambient occlusion on a top vertex: darker next to a taller neighbour. */
  const topAo = (x: number, z: number, y: number) => {
    let k = 1;
    for (const [a, b] of [[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]] as const) {
      const [ci, cj] = hm.cell(x + a, z + b);
      const v = hm.get(ci, cj);
      if (v < 90 && by + v * LEVEL > y + 0.2) k = Math.min(k, 0.76);
    }
    return k;
  };

  for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
    const L = hm.get(i, j);
    if (L <= 0 || o.skip?.(i, j)) continue;
    const cx = hm.cx(i), cz = hm.cz(j);
    const yTop = by + L * LEVEL;
    const nb = EDGE_NB.map(([a, b]) => lvl(i + a, j + b, L));
    // Corner k sits between edge k-1 and edge k.
    const cutH = CS.map(([sx, sz], k) => {
      if (!diag) return L;
      const ea = nb[(k + 3) % 4]!, eb = nb[k]!;
      const d = lvl(i + sx, j + sz, L);
      if (ea < L - 0.01 && eb < L - 0.01 && d < L - 0.01) return Math.max(ea, eb, d);
      return L;
    });
    const shade = (0.84 + Math.min(1, L / 5) * 0.16 + (edgeHash(i, j, 9) - 0.5) * jit);
    const tint = new THREE.Color(1, 1, 1).multiplyScalar(shade);

    // Bands between distinct heights (0, the corner-cut heights, the top).
    const hs = [...new Set([0, ...cutH.filter((h) => h < L), L])].sort((a, b) => a - b);
    for (let bi = 0; bi < hs.length - 1; bi++) {
      const h0 = hs[bi]!, h1 = hs[bi + 1]!;
      const isTop = h1 >= L;
      const y0 = by + h0 * LEVEL, y1 = by + h1 * LEVEL - (isTop ? drop : 0);
      // The band's polygon: a corner is cut when its cut height lies at or below h0.
      const poly: { p: P2; edge: number }[] = [];
      for (let k = 0; k < 4; k++) {
        const [sx, sz] = CS[k]!;
        const corner: P2 = [cx + sx * H, cz + sz * H];
        if (cutH[k]! <= h0) {
          // Cut: the corner becomes two points half way along its edges (prev edge, then next).
          const prev = CS[(k + 3) % 4]!, next = CS[(k + 1) % 4]!;
          poly.push({ p: [cx + (sx + prev[0]) * H / 2, cz + (sz + prev[1]) * H / 2], edge: -1 - k });
          poly.push({ p: [cx + (sx + next[0]) * H / 2, cz + (sz + next[1]) * H / 2], edge: k });
        } else poly.push({ p: corner, edge: k });
      }
      dedupe(poly);
      // Sides: poly[m] → poly[m+1] runs along edge poly[m].edge (≥ 0 axis edge, < 0 a diagonal).
      for (let m = 0; m < poly.length; m++) {
        const A = poly[m]!, B = poly[(m + 1) % poly.length]!;
        const dx = B.p[0] - A.p[0], dz = B.p[1] - A.p[1];
        const len = Math.hypot(dx, dz);
        const n: V3 = [dz / len, 0, -dx / len];
        // Outward = d × up = (-dz, 0, dx); our corner order is CCW from above, so flip.
        n[0] = -n[0]; n[2] = -n[2];
        if (A.edge < 0) {
          // Diagonal face (cut corner): everything outside it is below h0.
          const foot = h0 <= 0 ? (o.aoBottom ?? 0.55) : 0.74;
          sideQuad(A.p, B.p, y0, y1, n, 0, len, tint, foot);
          continue;
        }
        const nl = nb[A.edge]!;
        if (nl >= h1 - 0.01) continue;
        const yb = Math.max(y0, by + nl * LEVEL);
        const foot = nl <= 0 ? (o.aoBottom ?? 0.55) : 0.74;
        // Slab: cells along the same wall share one face (1–3 cells wide; consistent breaks).
        const [ex, ez] = EDGE_NB[A.edge]!;
        const di = Math.sign(dx), dj = Math.sign(dz);
        const same = (ii: number, jj: number) => {
          const v = hm.get(ii, jj);
          return v >= 90 ? false : Math.abs(v - L) < 0.01 && Math.abs(lvl(ii + ex, jj + ez, v) - nl) < 0.01;
        };
        const start = (ii: number, jj: number) => edgeHash(ii, jj, A.edge) <= 0.42 || (di !== 0 ? ii : jj) % 3 === 0;
        let back = 0;
        while (!start(i - di * back, j - dj * back) && same(i - di * (back + 1), j - dj * (back + 1))) back++;
        let fwd = 0;
        while (same(i + di * (fwd + 1), j + dj * (fwd + 1)) && !start(i + di * (fwd + 1), j + dj * (fwd + 1))) fwd++;
        const [kx, kz] = CS[A.edge]!;
        const u0 = back * CELL + Math.hypot(A.p[0] - (cx + kx * H), A.p[1] - (cz + kz * H));
        sideQuad(A.p, B.p, yb, y1, n, u0, (back + fwd + 1) * CELL, tint, foot);
      }
      // Corner-cut triangles that stop at h1 get their own (lower) turf top.
      if (!isTop) {
        for (let k = 0; k < 4; k++) {
          if (cutH[k] !== h1) continue;
          const [sx, sz] = CS[k]!;
          const prev = CS[(k + 3) % 4]!, next = CS[(k + 1) % 4]!;
          const c: P2 = [cx + sx * H, cz + sz * H];
          const a: P2 = [cx + (sx + prev[0]) * H / 2, cz + (sz + prev[1]) * H / 2];
          const b: P2 = [cx + (sx + next[0]) * H / 2, cz + (sz + next[1]) * H / 2];
          const y = by + h1 * LEVEL;
          const tk = (o.topK ?? 1) * 0.94;
          const col = (q: P2) => new THREE.Color(tk, tk, tk).multiplyScalar(topAo(q[0], q[1], y) * (q === c ? 1 : 0.84));
          tops.tri([[a[0], y, a[1]], [c[0], y, c[1]], [b[0], y, b[1]]], [0, 1, 0], [[a[0] * tt, -a[1] * tt], [c[0] * tt, -c[1] * tt], [b[0] * tt, -b[1] * tt]], [col(a), col(c), col(b)], [flat, flat, flat]);
        }
      }
    }

    // ---- the turf top at L: flat inset polygon + rounded lip (two facets) on exposed edges
    const outer: { p: P2; exposed: boolean }[] = [];
    for (let k = 0; k < 4; k++) {
      const [sx, sz] = CS[k]!;
      if (cutH[k]! < L) {
        const prev = CS[(k + 3) % 4]!, next = CS[(k + 1) % 4]!;
        outer.push({ p: [cx + (sx + prev[0]) * H / 2, cz + (sz + prev[1]) * H / 2], exposed: true }); // diagonal follows
        outer.push({ p: [cx + (sx + next[0]) * H / 2, cz + (sz + next[1]) * H / 2], exposed: nb[k]! < L - 0.01 });
      } else outer.push({ p: [cx + sx * H, cz + sz * H], exposed: nb[k]! < L - 0.01 });
    }
    dedupe(outer);
    // outer[m].exposed = the edge outer[m] → outer[m+1] is exposed. Offset exposed edges inward.
    const N = outer.length;
    const lines = outer.map((v, m) => {
      const w = outer[(m + 1) % N]!;
      const dx = w.p[0] - v.p[0], dz = w.p[1] - v.p[1];
      const len = Math.hypot(dx, dz);
      const inward: P2 = [-dz / len, dx / len];
      // inward for CCW-from-above order: rotate the direction toward the polygon centre.
      const toC = (cx - v.p[0]) * inward[0] + (cz - v.p[1]) * inward[1];
      if (toC < 0) { inward[0] = -inward[0]; inward[1] = -inward[1]; }
      const off = v.exposed ? lip : 0;
      return { a: [v.p[0] + inward[0] * off, v.p[1] + inward[1] * off] as P2, d: [dx / len, dz / len] as P2, inward };
    });
    const isect = (l1: typeof lines[0], l2: typeof lines[0]): P2 => {
      const den = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0];
      if (Math.abs(den) < 1e-6) return l2.a;
      const tq = ((l2.a[0] - l1.a[0]) * l2.d[1] - (l2.a[1] - l1.a[1]) * l2.d[0]) / den;
      return [l1.a[0] + l1.d[0] * tq, l1.a[1] + l1.d[1] * tq];
    };
    // Inner vertex m = intersection of the offset lines of edge m-1 and edge m.
    const inner: P2[] = outer.map((_, m) => isect(lines[(m + N - 1) % N]!, lines[m]!));
    const tk = (o.topK ?? 1) * (0.97 + edgeHash(i, j, 5) * 0.06);
    const topCol = (q: P2, y: number, k = 1) => new THREE.Color(tk, tk, tk).multiplyScalar(topAo(q[0], q[1], y) * k);
    const P = (q: P2, y: number): V3 => [q[0], y, q[1]];
    const UV = (q: P2): [number, number] => [q[0] * tt, -q[1] * tt];
    for (let m = 1; m < N - 1; m++) {
      tops.tri([P(inner[0]!, yTop), P(inner[m]!, yTop), P(inner[m + 1]!, yTop)], [0, 1, 0], [UV(inner[0]!), UV(inner[m]!), UV(inner[m + 1]!)], [topCol(inner[0]!, yTop), topCol(inner[m]!, yTop), topCol(inner[m + 1]!, yTop)], [flat, flat, flat]);
    }
    // Lip facets per exposed edge: inner (yTop) → mid (rounded shoulder) → outer (yTop - drop).
    for (let m = 0; m < N; m++) {
      if (!outer[m]!.exposed) continue;
      const m2 = (m + 1) % N;
      const o0 = outer[m]!.p, o1 = outer[m2]!.p, i0 = inner[m]!, i1 = inner[m2]!;
      const mid = (a: P2, b: P2): P2 => [a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55];
      const m0 = mid(i0, o0), m1 = mid(i1, o1);
      const ym = yTop - drop * 0.3;
      const yo = yTop - drop;
      const facet = (a: V3, b: V3, c: V3, d: V3, k: number, ua: P2, ub: P2, uc: P2, ud: P2) => {
        const e1 = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), e2 = new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
        const nn = e1.clone().cross(e2).normalize();
        if (nn.y < 0) nn.negate();
        const n3: V3 = [nn.x, nn.y, nn.z];
        const ca = topCol(ua, yTop, k), cb = topCol(ub, yTop, k), cc = topCol(uc, yTop, k), cd = topCol(ud, yTop, k);
        tops.tri([a, b, c], n3, [UV(ua), UV(ub), UV(uc)], [ca, cb, cc], [flat, flat, flat]);
        tops.tri([a, c, d], n3, [UV(ua), UV(uc), UV(ud)], [ca, cc, cd], [flat, flat, flat]);
      };
      facet(P(i1, yTop), P(i0, yTop), P(m0, ym), P(m1, ym), 0.93, i1, i0, m0, m1);
      facet(P(m1, ym), P(m0, ym), P(o0, yo), P(o1, yo), 0.8, m1, m0, o0, o1);
      // Fringe: long grass hanging off the rounded lip.
      if (fr && fr.rng.chance(fr.chance ?? 1)) {
        const s = fr.foliage.atlas.get(fr.sprite, fr.rng);
        const hang = s.h * TEXEL * (fr.long ?? 1);
        const dx = o1[0] - o0[0], dz = o1[1] - o0[1], len = Math.hypot(dx, dz);
        const nx = dz / len, nz = -dx / len;
        // Outward normal (away from the cell centre).
        const sgn = (o0[0] - cx) * nx + (o0[1] - cz) * nz > 0 ? 1 : -1;
        const ox = nx * sgn * 0.014, oz = nz * sgn * 0.014;
        const y = yo + 0.02;
        const ftint = new THREE.Color(1, 1, 1).multiplyScalar(0.88 + fr.rng.next() * 0.16);
        fr.foliage.quad(s, [o0[0] + ox, y - hang, o0[1] + oz], [o1[0] + ox, y - hang, o1[1] + oz], [o1[0] + ox, y, o1[1] + oz], [o0[0] + ox, y, o0[1] + oz], [nx * sgn, 0, nz * sgn], ftint);
      }
    }
  }
}

// ------------------------------------------------------------------ ground (one unique texture)

export interface GroundSpec {
  x0: number; x1: number; z0: number; z1: number;
  /** Paint the whole floor: (tile, texel → world x/z helpers). */
  paint(t: RgbaTile, wx: (x: number) => number, wz: (y: number) => number): void;
  /** Heightmap for baked AO toward banks (optional). */
  hm?: Heightmap;
  aoK?: number;
}

/** One floor plane with a unique painted texture at TEXEL density + baked AO near the banks. */
export function groundMesh(spec: GroundSpec): { mesh: THREE.Mesh; texture: THREE.Texture } {
  const W = spec.x1 - spec.x0, D = spec.z1 - spec.z0;
  const tw = Math.round(W / TEXEL), th = Math.round(D / TEXEL);
  const t = new RgbaTile(tw, th);
  spec.paint(t, (x) => spec.x0 + (x + 0.5) * TEXEL, (y) => spec.z0 + (y + 0.5) * TEXEL);
  const tex = crispTexture(t.toCanvas());
  tex.flipY = false;
  const nx = Math.round(W / CELL) * 2, nz = Math.round(D / CELL) * 2;
  const g = new THREE.PlaneGeometry(W, D, nx, nz);
  g.rotateX(-Math.PI / 2);
  g.translate(spec.x0 + W / 2, 0, spec.z0 + D / 2);
  const pos = g.attributes.position!, uv = g.attributes.uv!;
  const col = new Float32Array(pos.count * 3);
  const hm = spec.hm;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k);
    uv.setXY(k, (x - spec.x0) / W, (z - spec.z0) / D);
    let ao = 1;
    if (hm) {
      const [i, j] = hm.cell(x - 0.01, z - 0.01);
      let near = 0;
      for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, -1], [1, -1], [-1, 1]] as const) {
        const v = hm.get(i + a, j + b);
        if (v < 90) near = Math.max(near, Math.min(v, 3) * (a === 0 && b === 0 ? 1 : 0.8));
      }
      ao = 1 - (spec.aoK ?? 0.1) * near - 0.04 * Math.min(4, hm.maxNear(i, j, 2));
    }
    col.set([ao, ao, ao * 0.98], k * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
  return { mesh: mkMesh(g, m, false, true), texture: tex };
}

/** Ramp-noise ground fill helper: paint a region of a tile from a 0..1 field and a ramp. */
export function noiseField(w: number, h: number, rng: Rng, octaves: [number, number][]): (x: number, y: number) => number {
  const S = 64;
  const f = fbm(S, rng, octaves);
  return (x, y) => f[((y % S + S) % S) * S + ((x % S + S) % S)]!;
}

/** Big low-frequency field (not tiling at 64): sum of sines, 0..1. */
export function macro(seed: number): (x: number, z: number) => number {
  const r = new Rng(seed);
  const k = Array.from({ length: 4 }, () => [r.next() * 0.5 + 0.2, r.next() * 0.5 + 0.2, r.next() * 6.28] as const);
  return (x, z) => 0.5 + k.reduce((s, [a, b, p], i) => s + Math.sin(x * a * (i + 1) * 0.6 + z * b * (i + 1) * 0.5 + p) / (i + 2), 0) * 0.45;
}

// ------------------------------------------------------------------ backdrop

/** A far painted plane (sky, clouds, silhouettes); fog off. `haze` wobbles rows near its bottom. */
export function backdrop(paint: (t: RgbaTile) => void, w: number, h: number, size: [number, number], at: V3, o: { haze?: number; yaw?: number; gain?: number } = {}): { mesh: THREE.Mesh; update(t: number): void } {
  const t = new RgbaTile(w, h);
  paint(t);
  const tex = crispTexture(t.toCanvas());
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uTime: { value: 0 }, uHaze: { value: o.haze ?? 0 }, uRows: { value: h }, uGain: { value: o.gain ?? 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform float uTime, uHaze, uRows, uGain; varying vec2 vUv;
      void main(){
        vec2 uv = vUv;
        float row = floor(uv.y * uRows);
        float k = uHaze * smoothstep(0.55, 0.15, uv.y);
        uv.x += floor(sin(row * 0.9 + uTime * 3.0) * k * 2.0 + 0.5) / ${w.toFixed(1)};
        vec4 c = texture2D(map, uv);
        if (c.a < 0.5) discard;
        gl_FragColor = vec4(c.rgb * uGain, 1.0);
        #include <colorspace_fragment>
      }`,
    depthWrite: true,
  });
  const g = new THREE.PlaneGeometry(size[0], size[1]);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(...at);
  mesh.rotation.y = o.yaw ?? 0;
  mesh.renderOrder = -10;
  return { mesh, update: (time) => { m.uniforms.uTime!.value = time; } };
}

/**
 * Sky: flat horizontal bands of the ramp (top → bottom), with only 1–2 rows of sparse dither at
 * each band boundary (a row of every-other texel, then every fourth) — no full-field checkerboard.
 */
export function paintSky(t: RgbaTile, ramp: Ramp, y0: number, y1: number) {
  const n = ramp.length;
  const bandH = Math.max(1, (y1 - y0) / n);
  for (let y = y0; y < y1; y++) {
    const pos = (y - y0) / bandH;
    const b = Math.min(n - 1, Math.floor(pos));
    const into = (pos - b) * bandH; // rows into this band
    for (let x = 0; x < t.w; x++) {
      let i = b;
      // The first rows of a band keep a few texels of the band above (stepped transition).
      if (b > 0 && into < 1 && (x + y) % 2 === 0) i = b - 1;
      else if (b > 0 && into < 2 && bandH > 6 && (x + 2 * y) % 4 === 0) i = b - 1;
      t.set(x, y, ramp[i]!);
    }
  }
}

/**
 * A row of distant silhouettes filled down to `bottom`.
 *  * rounded (default): tree tops / hills — soft bumps, a lit rim, banded shading;
 *  * `flatTop`: stepped BUTTES / mesas of varied width — a cap ledge and one or two stepped
 *    shoulders, a lit left face, dark right face, horizontal strata and a bright rim on the cap.
 * `haze` (0..1) lifts the whole row toward the ramp's top shade (aerial perspective); the
 * bottom rows fade further into it.
 */
export function paintSilhouette(t: RgbaTile, rng: Rng, ramp: Ramp, base: number, amp: number, bump: number, bottom: number, o: { flatTop?: boolean; lightLeft?: boolean; haze?: number } = {}) {
  const n = ramp.length;
  const heights = new Float32Array(t.w);
  const lit = new Int8Array(t.w); // 1 = lit (left) face, -1 = shadow (right) face, 0 = cap/top
  let x = rng.next() * bump;
  if (o.flatTop) {
    while (x < t.w + bump) {
      const w = bump * (0.5 + rng.next() * 1.1);          // cap half-width (varied)
      const hh = amp * (0.45 + rng.next() * 0.55);
      const steps = 1 + rng.int(3);                       // stepped shoulders
      const slope = 0.6 + rng.next() * 0.8;
      for (let i = Math.floor(x - w * 2.4); i <= x + w * 2.4; i++) {
        if (i < 0 || i >= t.w) continue;
        const d = Math.abs(i - x);
        let v = 0;
        if (d <= w) v = hh;
        else {
          // Stair-stepped talus: each shoulder drops by a ledge, its riser is steep.
          const k = (d - w) / (w * 1.4);
          if (k < 1) v = hh * (1 - Math.ceil(k * steps) / (steps + 0.6)) * (1 - (k * steps - Math.floor(k * steps)) * 0.15 * slope);
        }
        if (v > heights[i]!) { heights[i] = v; lit[i] = d <= w * 0.92 ? 0 : i < x ? 1 : -1; }
      }
      x += w * (1.6 + rng.next() * 2.2);
    }
  } else {
    while (x < t.w) {
      const r = bump * (0.6 + rng.next() * 0.8);
      const hh = amp * (0.4 + rng.next() * 0.6);
      for (let i = Math.floor(x - r); i <= x + r; i++) {
        if (i < 0 || i >= t.w) continue;
        const d = (i - x) / r;
        const v = hh * Math.sqrt(Math.max(0, 1 - d * d));
        if (v > heights[i]!) { heights[i] = v; lit[i] = d < -0.25 ? 1 : d > 0.35 ? -1 : 0; }
      }
      x += r * 1.1;
    }
  }
  const haze = o.haze ?? 0;
  for (let i = 0; i < t.w; i++) {
    const top = Math.round(base - heights[i]!);
    for (let y = top; y < bottom; y++) {
      const depth = (y - top) / Math.max(1, bottom - top);
      let v = n - 2.4 - depth * 2.0;
      if (y - top < 1) v += 1.4;                                       // bright rim
      else if (y - top < 3 && lit[i] === 0) v += 0.7;                   // lit cap
      if (lit[i] === 1 && (o.lightLeft ?? true)) v += 0.9;             // lit left face
      if (lit[i] === -1) v -= 0.6;                                     // shadowed right face
      if (o.flatTop && ((y + (i >> 3)) % 7 === 0) && y - top > 3) v -= 0.7; // strata
      v += haze * (n - 1 - v) * (0.55 + depth * 0.45);
      t.set(i, y, ramp[bandIndex(Math.min(n - 1, Math.max(0, v)), i, y, n, 0.18)]!);
    }
  }
}

// ------------------------------------------------------------------ painted tree line

/**
 * A row of distant tree crowns on a backdrop tile, filled down to `bottom`: overlapping round
 * leaf clumps, each shaded like a sphere lit from `light` (screen direction, e.g. [-0.6, -0.7] =
 * upper left) with leaf-cell texture, a dark gap where clumps overlap, a few bright flecks on
 * the lit side; `haze` (0..1) lifts the row toward `hazeCol` (aerial perspective), more at the
 * bottom. Textured masses, not a flat cardboard silhouette.
 */
export function paintTreeLine(t: RgbaTile, rng: Rng, ramp: Ramp, o: { base: number; amp: number; size: [number, number]; bottom?: number; haze?: number; hazeCol?: string; light?: [number, number] }) {
  const n = ramp.length;
  const bottom = o.bottom ?? t.h;
  const L = o.light ?? [-0.6, -0.7];
  const hz = rgb(o.hazeCol ?? ramp[n - 1]!);
  const haze = o.haze ?? 0;
  const clumps: [number, number, number][] = [];
  let x = -o.size[1];
  while (x < t.w + o.size[1]) {
    const r = o.size[0] + rng.next() * (o.size[1] - o.size[0]);
    const top = o.base - o.amp * (0.35 + rng.next() * 0.65);
    clumps.push([x, top + r, r]);
    // A second, lower clump tucked beside it (crowns are lumpy, not single domes).
    if (rng.chance(0.7)) clumps.push([x + (rng.next() - 0.5) * r * 1.4, top + r * (1.5 + rng.next() * 0.6), r * (0.6 + rng.next() * 0.3)]);
    x += r * (0.9 + rng.next() * 0.7);
  }
  // Back to front: higher crowns first, lower clumps over them.
  clumps.sort((a, b) => a[1] - b[1]);
  const owner = new Int32Array(t.w * t.h).fill(-1);
  clumps.forEach(([cx, cy, r], ci) => {
    for (let y = Math.max(0, Math.floor(cy - r - 1)); y < Math.min(bottom, Math.ceil(cy + r * 3)); y++) for (let xx = Math.max(0, Math.floor(cx - r - 1)); xx <= Math.min(t.w - 1, cx + r + 1); xx++) {
      const dx = (xx + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
      // Leaf-cell edge: little 3×2 cells make a ragged rim.
      const cell = hash2(Math.floor((xx + (Math.floor(y / 2) % 2) * 1.5) / 3), Math.floor(y / 2), ci);
      const inside = dy > 0 ? Math.abs(dx) < 1 + (cell - 0.5) * 0.25 : dx * dx + dy * dy < 1 + (cell - 0.55) * 0.45;
      if (!inside) continue;
      const prev = owner[y * t.w + xx]!;
      owner[y * t.w + xx] = ci;
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, dx * dx + Math.min(0, dy) ** 2)));
      const lit = -(dx * L[0] + Math.min(dy, 0.6) * L[1]) + nz * 0.4;
      let v = 1.6 + lit * 2.2 + (cell - 0.5) * 0.9 - Math.max(0, dy) * 1.2;
      if (prev >= 0 && dx * dx + dy * dy > 0.72) v -= 1.4;           // dark gap where it overlaps
      if (cell > 0.93 && lit > 0.3) v += 1.2;                          // bright leaf fleck
      v = Math.max(0, Math.min(n - 1, v));
      const c = rgb(ramp[bandIndex(v, xx, y, n, 0.16)]!);
      const k0 = Math.min(1, haze + Math.max(0, (y - o.base) / Math.max(4, bottom - o.base)) * 0.35);
      const k = Math.min(1, bandIndex(k0 * 5, xx, y, 6, 0.1) / 5);
      const i = (y * t.w + xx) * 4;
      t.data[i] = c[0] + (hz[0] - c[0]) * k; t.data[i + 1] = c[1] + (hz[1] - c[1]) * k; t.data[i + 2] = c[2] + (hz[2] - c[2]) * k; t.data[i + 3] = 255;
    }
  });
  // Fill below the crowns down to `bottom` (trunks lost in the undergrowth's shade).
  for (let xx = 0; xx < t.w; xx++) {
    let y0 = -1;
    for (let y = 0; y < bottom; y++) if (t.data[(y * t.w + xx) * 4 + 3]! > 0) { y0 = y; break; }
    if (y0 < 0) continue;
    for (let y = y0; y < bottom; y++) {
      const i = (y * t.w + xx) * 4;
      if (t.data[i + 3]! > 0 && owner[y * t.w + xx]! >= 0) continue;
      const c = rgb(ramp[Math.min(n - 1, 1)]!);
      const k = Math.min(1, haze + 0.3);
      t.data[i] = c[0] + (hz[0] - c[0]) * k; t.data[i + 1] = c[1] + (hz[1] - c[1]) * k; t.data[i + 2] = c[2] + (hz[2] - c[2]) * k; t.data[i + 3] = 255;
    }
  }
}

// ------------------------------------------------------------------ layered land silhouettes

export interface MesaOpts {
  ramp: Ramp;
  /** Texel row of the canyon floor line (the mesas' feet). */
  foot: number;
  count: number;
  /** Cap half-width and height (texels) ranges. */
  w: [number, number]; h: [number, number];
  /** Aerial perspective: 0 = full colour, 1 = all haze. */
  haze: number;
  hazeCol: string;
  /** Texel column of the sun (that flank is lit, its rim glows). */
  sunX: number;
  /** Erosion gully density. */
  gullies: number;
  /** A low broken ridge instead of tall mesas. */
  ridge?: boolean;
  /** Grass/turf ramp for a cap on the top rows (headlands), and how many rows (default 3). */
  capRamp?: Ramp; capRows?: number;
  /** Foam colour for a broken surf line at the foot (islands in the sea). */
  foam?: string;
  /** Where mesas may stand: a column filter (e.g. keep the middle of the sea open). */
  allow?: (x: number) => boolean;
  /** Cliff steepness (texels down per texel out; default 5.5, ridge 1.4). */
  cliff?: number;
  /** Tilted caps: the top drops by up to this share of the height across the cap (headlands). */
  tilt?: number;
}

/**
 * A row of mesas / buttes on a backdrop tile (alpha above them): flat ragged caps over steep
 * cliff bodies and wide talus fans; horizontal strata bands running across each mesa; erosion
 * gullies down the cliffs; the flank toward the sun lit with a hot rim along cap edges (the sun
 * sits behind them: the fronts stay in soft shade); lower rows sink into the rising haze.
 */
export function paintMesas(t: RgbaTile, rng: Rng, o: MesaOpts) {
  const W = t.w, n = o.ramp.length;
  const H = new Float32Array(W).fill(-1);
  const own = new Int16Array(W).fill(-1);
  const kind = new Uint8Array(W); // 0 cap face, 1 cliff flank, 2 talus, 3 shoulder ledge face
  const side = new Int8Array(W);
  const mesas: { cx: number; w: number; h: number }[] = [];
  let x = rng.next() * o.w[1];
  while (x < W + o.w[1]) {
    const w = o.w[0] + rng.next() * (o.w[1] - o.w[0]);
    const h = o.h[0] + rng.next() * (o.h[1] - o.h[0]);
    if (!o.allow || o.allow(x)) mesas.push({ cx: x, w, h });
    x += w * (1.3 + rng.next() * (o.ridge ? 1.2 : 2.6)) + (o.ridge ? 0 : o.w[0]);
  }
  void o.count;
  mesas.forEach((m, mi) => {
    const reach = m.w + m.h * 2.4;
    for (let i = Math.floor(m.cx - reach); i <= m.cx + reach; i++) {
      if (i < 0 || i >= W) continue;
      const d = Math.abs(i - m.cx);
      // Ragged cap: a slow wander of 1–2 texels (value noise over ~8 columns), the odd notch
      // or fallen block — never a regular crenellation.
      const f = i / 8 + mi * 3.7, f0 = Math.floor(f), ft = f - f0;
      const wander = hash2(f0, mi, 3) * (1 - ft) + hash2(f0 + 1, mi, 3) * ft;
      const rag = Math.round((wander - 0.5) * 3.2) - (hash2(i >> 2, mi, 4) < 0.05 ? 1 + Math.round(hash2(i, mi, 5) * 2) : 0);
      const cliff = (o.cliff ?? (o.ridge ? 1.4 : 5.5)) + hash2(i >> 1, mi, 6) * 2;
      // Tilted cap: one end high (the seaward cliff), sloping down toward the other.
      const tdir = hash2(mi, 7, 15) < 0.5 ? -1 : 1;
      const th = o.tilt ? m.h * o.tilt * (0.5 + 0.5 * tdir * Math.max(-1, Math.min(1, (i - m.cx) / m.w))) : 0;
      const cap = d <= m.w ? m.h - th + rag : m.h - th - (d - m.w) * cliff + rag;
      // A stepped shoulder: a lower ledge reaching out past the cap on each side (asymmetric).
      const sw = m.w * (o.ridge ? 1.1 : 1.35 + hash2(mi, i < m.cx ? 1 : 2, 11) * 0.6);
      const sh = m.h * (0.55 + hash2(mi, i < m.cx ? 3 : 4, 12) * 0.15);
      const shoulder = d <= sw ? sh + rag * 0.5 : sh - (d - sw) * cliff * 0.8 + rag;
      const talusTop = m.h * (o.ridge ? 0.75 : 0.42);
      const talus = talusTop - Math.max(0, d - sw * 0.85) * (o.ridge ? 0.55 : 0.75) + (hash2(i >> 2, mi, 7) - 0.5) * 2;
      const v = Math.max(cap, shoulder, talus);
      if (v > H[i]!) { H[i] = v; own[i] = mi; kind[i] = d <= m.w ? 0 : Math.max(cap, shoulder) >= talus ? (d <= sw && cap < shoulder ? 3 : 1) : 2; side[i] = i < m.cx ? -1 : 1; }
    }
  });
  const hz = rgb(o.hazeCol);
  const sunSide = (i: number) => (o.sunX < mesas[own[i]!]!.cx ? -1 : 1);
  for (let i = 0; i < W; i++) {
    if (H[i]! <= 0) continue;
    const m = mesas[own[i]!]!;
    const top = Math.round(o.foot - H[i]!);
    const lit = kind[i] === 1 && side[i] === sunSide(i);
    const away = kind[i] === 1 && !lit;
    const gully = hash2(i, own[i]!, 8) < 0.07 * o.gullies ? 6 + hash2(i, own[i]!, 9) * m.h * 0.7 : 0;
    const glow = Math.max(0, 1 - Math.abs(i - o.sunX) / (W * 0.35));
    for (let y = Math.max(0, top); y < t.h; y++) {
      const depth = y - top;
      const capTop = o.foot - m.h;
      // Strata: continuous bands across the mesa (absolute rows, a gentle wobble).
      const sy = y - capTop + Math.sin(i * 0.05 + own[i]!) * 1.4;
      const band = Math.floor(sy / 3);
      const strata = [0, -0.6, 0.35, -0.25, -0.85, 0.2, 0.5, -0.4][((band % 8) + 8) % 8]!;
      // Backlit: the faces toward us sit in soft shade (low on the ramp), the strata read as
      // alternating bands; only the sun-side flank and the top edges catch the light.
      let v = 1.7 + strata * (kind[i] === 2 ? 0.35 : 1);
      if ((kind[i] === 0 || kind[i] === 3) && depth < 3) v += 0.8;          // cap rock / ledge lip
      if (lit) v += 1.9 + glow * 0.8;                                        // sun-side flank
      if (away) v -= 0.4;
      if (kind[i] === 2) v += 0.5 + (hash2(i, y, 10) - 0.5) * 1.2;           // talus scree
      if (gully && depth > 2 && depth < gully && kind[i] !== 2) v -= 0.9;   // erosion gully
      if (depth === 0) v += 2.4 + glow * 1.8;                                // hot rim on every top edge
      else if (depth === 1 && (lit || kind[i] === 0)) v += 1.1 + glow * 0.8;
      v = Math.max(0, Math.min(n - 1, v));
      let c = rgb(o.ramp[bandIndex(v, i, y, n, 0.16)]!);
      const capRows = o.capRows ?? 3;
      if (o.capRamp && depth < capRows + (hash2(i, 1, 13) < 0.4 ? 1 : 0) && kind[i] !== 2) {
        // Turf cap: lit on top, a dark fringe row hanging over the cliff.
        const cn = o.capRamp.length;
        const cv = depth === 0 ? cn - 1.2 + glow : depth >= capRows ? 0.8 : cn - 2.4 - depth * 0.6 + (lit ? 0.8 : 0);
        c = rgb(o.capRamp[bandIndex(Math.max(0, Math.min(cn - 1, cv)), i, y, cn, 0.16)]!);
      }
      if (o.foam && y >= o.foot - 1 && y <= o.foot && hash2(i >> 1, y, 14) < 0.55) c = rgb(o.foam);
      // Haze: more toward the canyon floor (rising haze), posterised into 5 flat steps (dither
      // only at step edges, so it never turns into a checker carpet).
      const below = Math.max(0, Math.min(1, (y - top) / Math.max(8, o.foot - top + 6)));
      const k = Math.min(1, o.haze + below * 0.3 + (y > o.foot ? 0.15 + (y - o.foot) * 0.02 : 0));
      const kq = Math.min(1, bandIndex(k * 5, i, y, 6, 0.1) / 5);
      const idx = (y * W + i) * 4;
      t.data[idx] = c[0] + (hz[0] - c[0]) * kq;
      t.data[idx + 1] = c[1] + (hz[1] - c[1]) * kq;
      t.data[idx + 2] = c[2] + (hz[2] - c[2]) * kq;
      t.data[idx + 3] = 255;
    }
  }
  // Dead snags on a low ridge (silhouettes against the haze).
  if (o.ridge) for (let k = 0; k < 7; k++) {
    const i = Math.floor(rng.next() * W);
    if (H[i]! <= 0) continue;
    const top = Math.round(o.foot - H[i]!);
    const hh = 6 + rng.int(8);
    for (let y = 0; y < hh; y++) t.set(i + (y > hh * 0.6 ? 1 : 0), top - y, o.ramp[0]!);
    t.set(i - 1, top - Math.round(hh * 0.6), o.ramp[0]!); t.set(i - 2, top - Math.round(hh * 0.6) - 1, o.ramp[0]!);
    t.set(i + 2, top - hh + 1, o.ramp[0]!);
  }
}

// ------------------------------------------------------------------ sun rig

export interface SunSpec {
  /** Where the sun light lands (centre of the stage) and the direction it comes FROM. */
  target: THREE.Vector3; from: THREE.Vector3; distance?: number;
  color: THREE.ColorRepresentation; intensity: number;
  /** Cone half-angle (rad). */
  angle?: number;
  cookie?: THREE.Texture | null;
  sky: THREE.ColorRepresentation; ground: THREE.ColorRepresentation; hemi: number;
  fill: THREE.ColorRepresentation; fillIntensity: number;
  quality: 'high' | 'low';
  /** Cone penumbra (default 0.35) and shadow softness (PCFSoft radius, default 3). */
  penumbra?: number;
  shadowRadius?: number;
  /** Front fill position (default (2, 6, 10)): a cool fill from the camera side. */
  fillFrom?: THREE.Vector3;
}

/** A far SpotLight acting as the sun (cookie + soft shadows), hemisphere and a front fill. */
export function sunRig(group: THREE.Group, s: SunSpec): { key: THREE.SpotLight; spriteLight: SpriteLight } {
  const flags = new Set((new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('post') ?? '').split(','));
  const dist = s.distance ?? 32;
  const key = new THREE.SpotLight(new THREE.Color(s.color), s.intensity, 0, s.angle ?? 0.36, s.penumbra ?? 0.35, 0);
  key.position.copy(s.target).addScaledVector(s.from.clone().normalize(), dist);
  key.target.position.copy(s.target);
  if (s.cookie) key.map = s.cookie;
  key.castShadow = !flags.has('noshadow');
  const ms = s.quality === 'high' ? 2048 : 1024;
  key.shadow.mapSize.set(ms, ms);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = s.shadowRadius ?? 3;
  key.shadow.camera.near = dist - 16;
  key.shadow.camera.far = dist + 16;
  group.add(key, key.target);
  group.add(new THREE.HemisphereLight(new THREE.Color(s.sky), new THREE.Color(s.ground), s.hemi));
  const fill = new THREE.DirectionalLight(new THREE.Color(s.fill), s.fillIntensity);
  fill.position.copy(s.fillFrom ?? new THREE.Vector3(2, 6, 10));
  group.add(fill, fill.target);
  const spriteLight: SpriteLight = {
    keyDir: key.position.clone().sub(key.target.position).normalize(),
    keyColor: new THREE.Color(s.color).multiplyScalar(0.62),
    sky: new THREE.Color(s.sky).multiplyScalar(0.6),
    ground: new THREE.Color(s.ground).multiplyScalar(0.6),
    rim: new THREE.Color(s.color).lerp(new THREE.Color('#ffffff'), 0.3).multiplyScalar(0.55),
  };
  return { key, spriteLight };
}

/** Dappled-light cookie: bright with leafy holes of shade (or the reverse for a canopy). */
export function dappleCookie(seed: number, o: { holes?: number; edge?: number } = {}): THREE.CanvasTexture {
  const S = 128;
  const rng = new Rng(seed);
  const f = fbm(S, rng, [[3, 0.55], [6, 0.3], [12, 0.15]]);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const holes = o.holes ?? 0.42;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
    const r = Math.hypot(dx, dy);
    const ring = Math.max(0, (r - (o.edge ?? 0.45)) / (1 - (o.edge ?? 0.45)));
    const v = f[y * S + x]!;
    let lit = v > holes + ring * 0.35 ? 1 : 0.3;
    lit *= 1 - Math.min(1, Math.max(0, (r - 0.82) / 0.18));
    const k = Math.round(lit * 255);
    img.data.set([k, k, k * 0.96, 255], (y * S + x) * 4);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Soft additive light-pool decals on the floor (one mesh per call): a soft ROUNDED RECTANGLE
 * (superellipse falloff, like a patch of sun through a gap) rather than a round blob.
 */
export function lightPools(pools: [x: number, z: number, sx: number, sz: number][], color: THREE.ColorRepresentation, strength = 1.6): THREE.Mesh {
  const S = 32;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = Math.abs((x + 0.5) / S * 2 - 1), v = Math.abs((y + 0.5) / S * 2 - 1);
    const d = Math.pow(Math.pow(u, 4) + Math.pow(v, 4), 0.25);
    const a = Math.max(0, Math.min(1, (1 - d) / 0.55));
    const k = Math.round(255 * Math.min(1, 0.55 * strength) * a * a * (3 - 2 * a));
    img.data.set([255, 255, 255, k], (y * S + x) * 4);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  const geos = pools.map(([x, z, sx, sz]) => {
    const g = new THREE.PlaneGeometry(sx, sz);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0.025, z);
    return g;
  });
  const merged = mergeGeos(geos);
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(color) });
  const mesh = new THREE.Mesh(merged, m);
  mesh.renderOrder = 2;
  return mesh;
}

/**
 * Bright glints (sun through leaves, sky holes, embers): soft round additive points in world
 * size, HDR colour so they bloom. One draw call. `twinkle` animates their brightness.
 */
export function glints(at: V3[], size: number, color: THREE.ColorRepresentation, hdr = 2.2): { points: THREE.Points; update(t: number): void } {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d')!;
  // A pixel-art soft dot: concentric squares-ish rings (no smooth gradient).
  for (const [r, a] of [[8, 0.18], [6, 0.38], [4, 0.7], [2, 1]] as const) {
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath(); ctx.arc(8, 8, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = crispTexture(c);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(at.flat(), 3));
  const m = new THREE.PointsMaterial({ size, map: tex, color: new THREE.Color(color).multiplyScalar(hdr), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = 4;
  const base = m.color.clone();
  return { points, update: (t) => { m.color.copy(base).multiplyScalar(0.85 + 0.15 * Math.sin(t * 1.3)); } };
}

// ------------------------------------------------------------------ world-space gobo (key cookie)

/**
 * The world ground point (x, z on the plane y = `y`) under every texel of a SpotLight cookie:
 * the spot's map is projected through its shadow camera (fov = 2·angle, up = +Y, looking at the
 * target), so a gobo painted from these points lands exactly where we want it in the WORLD — a
 * lit pool round the kin, leaf dapple or cloud shadows of a fixed world size, whatever the sun
 * elevation (a low sun would otherwise stretch a round cookie into a long streak).
 */
export function cookieGround(key: THREE.SpotLight, size: number, y = 0): Float32Array {
  key.updateMatrixWorld(true);
  key.target.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(key.angle) * 2, 1, 0.5, 200);
  cam.position.setFromMatrixPosition(key.matrixWorld);
  cam.lookAt(new THREE.Vector3().setFromMatrixPosition(key.target.matrixWorld));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const out = new Float32Array(size * size * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    // Canvas row 0 is the TOP of the light's view (CanvasTexture flipY).
    const nx = ((px + 0.5) / size) * 2 - 1, ny = 1 - ((py + 0.5) / size) * 2;
    a.set(nx, ny, -1).unproject(cam);
    b.set(nx, ny, 1).unproject(cam);
    const dy = b.y - a.y;
    const t = Math.abs(dy) < 1e-6 ? 0 : (y - a.y) / dy;
    const k = (py * size + px) * 2;
    out[k] = a.x + (b.x - a.x) * t;
    out[k + 1] = a.z + (b.z - a.z) * t;
  }
  return out;
}

/** Periodic 0..1 noise sampled at world coords (bilinear over a wrapped fbm grid of `cells` world units). */
export function worldNoise(seed: number, cells: number, octaves: [number, number][] = [[3, 0.55], [6, 0.3], [12, 0.15]], res = 64): (x: number, z: number) => number {
  const f = fbm(res, new Rng(seed), octaves);
  return (x, z) => {
    const u = ((x / cells) % 1 + 1) % 1 * res, v = ((z / cells) % 1 + 1) % 1 * res;
    const i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
    const g = (i: number, j: number) => f[((j + res) % res) * res + ((i + res) % res)]!;
    return (g(i0, j0) * (1 - fu) + g(i0 + 1, j0) * fu) * (1 - fv) + (g(i0, j0 + 1) * (1 - fu) + g(i0 + 1, j0 + 1) * fu) * fv;
  };
}

export interface GoboSpec {
  /** 'leaves': sun flecks through a canopy (hard-edged); 'clouds': big soft cloud shadows. */
  kind: 'leaves' | 'clouds';
  seed: number;
  /** The lit focal pool on the battle floor (world ellipse along the kin line). */
  pool?: { x: number; z: number; ru: number; rv: number; angle?: number; soft?: number };
  /** Light level outside the pool (0..1). */
  outside?: number;
  /** Light level in the dapple / cloud shade (0..1). */
  shade?: number;
  /** Share of the ground in shade (0..1). Default 0.45 (leaves) / 0.4 (clouds). */
  cover?: number;
  /** World size of one noise period (leaf clumps ≈ 3, clouds ≈ 14). */
  scale?: number;
  /** Cloud drift (world units / s along x, z); 0 = static. */
  drift?: [number, number];
  /** Cookie resolution (default 128). */
  size?: number;
  /** Ground plane height the gobo is painted for. */
  y?: number;
}

/**
 * A world-space gobo for a SpotLight key: a lit focal pool where the kin stand, leaf dapple or
 * drifting cloud shadows elsewhere, darker away from the pool (the light falls off toward the
 * set's edges, like the reference's sun patches). Sets `key.map`; `update(t)` drifts clouds in
 * steps of whole cookie texels (cheap: re-composes a 128² byte texture a few times a second).
 */
export function gobo(key: THREE.SpotLight, s: GoboSpec): { texture: THREE.DataTexture; update(t: number): void; dispose(): void } {
  const S = s.size ?? 128;
  const ground = cookieGround(key, S, s.y ?? 0);
  const leaves = s.kind === 'leaves';
  const scale = s.scale ?? (leaves ? 3.2 : 14);
  const nA = worldNoise(s.seed, scale, leaves ? [[2, 0.5], [4, 0.3], [8, 0.2]] : [[2, 0.6], [4, 0.28], [8, 0.12]]);
  const nB = worldNoise(s.seed + 7, scale * 0.37, [[2, 0.6], [4, 0.4]]);
  const cover = s.cover ?? (leaves ? 0.45 : 0.4);
  const shade = s.shade ?? (leaves ? 0.22 : 0.42);
  const outside = s.outside ?? 0.55;
  const p = s.pool;
  const ca = Math.cos(p?.angle ?? 0), sa = Math.sin(p?.angle ?? 0);
  const data = new Uint8Array(S * S * 4);
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  // Linear values: `outside` / `shade` are fractions of the key's light, not sRGB greys.
  // DataTexture rows run bottom-up (no flip): row 0 = v 0 = the BOTTOM of the light's view.
  tex.flipY = false;
  const poolK = new Float32Array(S * S);
  for (let k = 0; k < S * S; k++) {
    const x = ground[k * 2]!, z = ground[k * 2 + 1]!;
    if (!p) { poolK[k] = 1; continue; }
    const X = x - p.x, Z = z - p.z;
    const u = (X * ca + Z * sa) / p.ru, v = (-X * sa + Z * ca) / p.rv;
    const r = Math.hypot(u, v) + (nB(x, z) - 0.5) * 0.18;
    const soft = p.soft ?? 0.35;
    poolK[k] = 1 - THREE.MathUtils.smoothstep(r, 1 - soft, 1 + soft);
  }
  let last = '';
  const compose = (t: number) => {
    const dx = (s.drift?.[0] ?? 0) * t, dz = (s.drift?.[1] ?? 0) * t;
    // Step the drift by ~a cookie texel so the clouds move in pixel steps.
    const q = 0.12;
    const ox = Math.round(dx / q) * q, oz = Math.round(dz / q) * q;
    const tag = `${ox.toFixed(2)},${oz.toFixed(2)}`;
    if (tag === last) return false;
    last = tag;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const k = (S - 1 - py) * S + px; // ground[] is in canvas order (row 0 = top)
      const x = ground[k * 2]! - ox, z = ground[k * 2 + 1]! - oz;
      const n = nA(x, z) * 0.75 + nB(x, z) * 0.25;
      // Shade where the noise is above the cover threshold; leaves cut hard, clouds soft.
      const e = leaves ? 0.035 : 0.12;
      const inShade = THREE.MathUtils.smoothstep(n, 1 - cover - e, 1 - cover + e);
      const pk = poolK[k]!;
      // In the pool the dapple thins out (a clear gap in the canopy / a sun break).
      const dapple = 1 - inShade * (1 - shade) * (1 - pk * 0.8);
      const v = dapple * (outside + (1 - outside) * pk);
      const c = Math.round(255 * Math.max(0, Math.min(1, v)));
      const o = (py * S + px) * 4;
      data[o] = c; data[o + 1] = c; data[o + 2] = c; data[o + 3] = 255;
    }
    tex.needsUpdate = true;
    return true;
  };
  compose(0);
  key.map = tex;
  return {
    texture: tex,
    update: (t) => { if (s.drift) compose(t); },
    dispose: () => tex.dispose(),
  };
}

// ------------------------------------------------------------------ apron (phone world edge)

export interface ApronSpec {
  /** World rect covered (the set's own floor ends at one of its edges). */
  x0: number; x1: number; z0: number; z1: number;
  /** Height: a constant, or a heightfield. */
  y: number | ((x: number, z: number) => number);
  /** Repeat texture (e.g. the turf/sand of the set) at `tileTexels` texels per tile, world UVs like floorGrid. */
  map: THREE.Texture | null;
  tileTexels: number;
  /** Vertex brightness (multiplied into `tint`): darken toward the camera, macro mottling. */
  shade?: (x: number, z: number) => number;
  tint?: THREE.ColorRepresentation;
  /** Vertices per world unit (default 0.8). */
  res?: number;
  /** UV v sign: floorGrid maps v = -z / tile, terrace tops too (default -1). */
  vSign?: number;
  /** Multiply the ambient (hemisphere) light it receives (outdoorKit floors use < 1 for contrast). */
  ambient?: number;
}

/**
 * A cheap ground apron (ONE draw call, receives shadows): continues a set's floor far past the
 * near frustum so a portrait phone camera, which sees much more ground under the stage, never
 * shows the clear colour or the underside of the island. Same texture and world UV mapping as
 * the set's floor/terrace tops, so the join is seamless.
 */
export function apron(s: ApronSpec): THREE.Mesh {
  const W = s.x1 - s.x0, D = s.z1 - s.z0;
  const res = s.res ?? 0.8;
  const nx = Math.max(1, Math.round(W * res)), nz = Math.max(1, Math.round(D * res));
  const g = new THREE.PlaneGeometry(W, D, nx, nz);
  g.rotateX(-Math.PI / 2);
  g.translate(s.x0 + W / 2, 0, s.z0 + D / 2);
  const pos = g.attributes.position!, uv = g.attributes.uv!;
  const col = new Float32Array(pos.count * 3);
  const tile = TEXEL * s.tileTexels;
  const tint = new THREE.Color(s.tint ?? '#ffffff');
  const vs = s.vSign ?? -1;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k);
    pos.setY(k, typeof s.y === 'number' ? s.y : s.y(x, z));
    uv.setXY(k, x / tile, (vs * z) / tile);
    const f = s.shade?.(x, z) ?? 1;
    col.set([tint.r * f, tint.g * f, tint.b * f], k * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.MeshLambertMaterial({ map: s.map, vertexColors: true });
  if (s.ambient !== undefined && s.ambient !== 1) {
    const k = s.ambient.toFixed(3);
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>\n\treflectedLight.indirectDiffuse *= ${k};`); };
    m.customProgramCacheKey = () => `hd2d-apron-amb${k}`;
  }
  const mesh = mkMesh(g, m, false, true);
  mesh.name = 'hd2d-apron';
  return mesh;
}

/** Concatenate non-indexed/indexed geometries with the same attributes (position/normal/uv). */
export function mergeGeos(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'uv'];
  const idx: number[] = [];
  let base = 0;
  const arrs: Record<string, number[]> = { position: [], normal: [], uv: [] };
  for (const g of gs) {
    for (const n of names) arrs[n]!.push(...(g.attributes[n]!.array as Float32Array));
    const ix = g.index ? Array.from(g.index.array) : Array.from({ length: g.attributes.position!.count }, (_, i) => i);
    idx.push(...ix.map((i) => i + base));
    base += g.attributes.position!.count;
    g.dispose();
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(arrs.position!, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(arrs.normal!, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(arrs.uv!, 2));
  out.setIndex(idx);
  return out;
}

/** Disposal helper shared by the outdoor arenas. */
export function disposeGroup(group: THREE.Group, extra: { dispose(): void }[]) {
  for (const d of extra) d.dispose();
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Points).isPoints) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture && !v.userData.persistent) v.dispose();
      mat.dispose();
    }
    (m.userData.disposeExtra as THREE.Material | undefined)?.dispose();
    if (m.customDepthMaterial) m.customDepthMaterial.dispose();
  });
}
