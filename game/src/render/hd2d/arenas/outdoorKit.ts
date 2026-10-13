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
import { CELL, LEVEL, TEXEL, VoxelBatch, type Heightmap } from '../arena';
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
    t.idx[y * size + x] = ditherIndex(1.8 + f[y * size + x]! * 2.6 + band, x, y, ramp.length);
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
  t.field(fbm(size, rng, [[2, 0.5], [4, 0.3], [16, 0.2]]), o.lo ?? 1.6, o.hi ?? 4.4, 1.4);
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
      this.rng.push(o.range ?? 0);
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
      sh.vertexShader = FOLIAGE_VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', FOLIAGE_VERT_BODY);
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
  /** Darken toward the bottom of each block side. */
  aoBottom?: number;
  /** Tint multiplier for top faces (catching the sky). */
  topK?: number;
  /** Per-block brightness jitter. */
  jitter?: number;
  /** Fringe sprites hung on exposed top edges (null = none). */
  fringe?: { foliage: Foliage; sprite: string; rng: Rng; chance?: number } | null;
}

/**
 * Stacked blocks on every heightmap column (like rockColumns), but the top face of each column
 * goes into `tops` (grass, moss, sand) and the sides into `sides` (earth, rock); exposed top
 * edges can get a hanging fringe (grass lip, moss) from the foliage atlas.
 */
export function terraces(hm: Heightmap, sides: VoxelBatch, tops: VoxelBatch, rng: Rng, o: TerraceOpts = {}) {
  const jit = o.jitter ?? 0.24;
  for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
    const levels = hm.get(i, j);
    if (levels <= 0) continue;
    const full = Math.ceil(levels);
    let topY = 0;
    const jx = (rng.next() - 0.5) * 0.04, jz = (rng.next() - 0.5) * 0.04;
    for (let l = 0; l < full; l++) {
      const y0 = l * LEVEL;
      const isTop = l === full - 1;
      const y1 = Math.min(levels, l + 1) * LEVEL + (isTop ? (rng.next() - 0.5) * 0.08 : 0);
      const ins = 0.006 + rng.next() * 0.02;
      const sx = (l % 2 ? 0.025 : -0.025);
      const x0 = hm.cx(i) - CELL / 2 + ins + jx + sx, x1 = hm.cx(i) + CELL / 2 - ins + jx + sx;
      const z0 = hm.cz(j) - CELL / 2 + ins + jz, z1 = hm.cz(j) + CELL / 2 - ins + jz;
      let shade = 0.82 + Math.min(1, (l + 1) / 6) * 0.2 + (rng.next() - 0.5) * jit;
      if (rng.chance(0.07)) shade *= 0.8;
      const tint = new THREE.Color(1, 1, 1).multiplyScalar(shade);
      const cover = (a: number, b: number) => hm.get(a, b) >= l + 1;
      sides.box([x0, y0, z0], [x1, y1, z1], tint, rng, {
        skip: [cover(i + 1, j), cover(i - 1, j), true, true, cover(i, j + 1), cover(i, j - 1)],
        aoBottom: l === 0 ? 0.5 : 0.72,
      });
      if (isTop) topY = y1;
    }
    // Top face (its own material), slightly overhanging like turf.
    // Tops share one grid (no jitter) so a plateau reads as one continuous turf surface.
    const x0 = hm.cx(i) - CELL / 2 - 0.035, x1 = hm.cx(i) + CELL / 2 + 0.035;
    const z0 = hm.cz(j) - CELL / 2 - 0.035, z1 = hm.cz(j) + CELL / 2 + 0.035;
    const topAo = (a: number, b: number) => (hm.get(i + a, j) > levels + 0.2 ? 0.74 : 1) * (hm.get(i, j + b) > levels + 0.2 ? 0.74 : 1);
    const tk = (o.topK ?? 1) * (0.97 + rng.next() * 0.06);
    const ty = Math.round(levels) * LEVEL;
    void topY;
    tops.box([x0, ty - 0.09, z0], [x1, ty + 0.012, z1], new THREE.Color(tk, tk, tk), rng, {
      skip: [hm.get(i + 1, j) >= levels, hm.get(i - 1, j) >= levels, false, true, hm.get(i, j + 1) >= levels, hm.get(i, j - 1) >= levels],
      aoBottom: 0.8,
      aoTop: [topAo(-1, 1), topAo(1, 1), topAo(1, -1), topAo(-1, -1)],
    });
    // Fringe on exposed edges (front +z, sides ±x) where the drop is at least half a level.
    const f = o.fringe;
    if (f) {
      const fr = f.foliage;
      const drop = (a: number, b: number) => levels - Math.max(0, Math.min(levels, hm.get(a, b) > 90 ? levels : hm.get(a, b)));
      const ch = f.chance ?? 0.8;
      const y = ty + 0.012;
      const tint = new THREE.Color(1, 1, 1).multiplyScalar(0.9 + rng.next() * 0.15);
      const spr = () => fr.atlas.get(f.sprite, f.rng);
      const hang = (s: SpriteRect) => s.h * TEXEL;
      if (drop(i, j + 1) >= 0.5 && f.rng.chance(ch)) { const s = spr(); fr.quad(s, [x0, y - hang(s), z1 + 0.012], [x1, y - hang(s), z1 + 0.012], [x1, y, z1 + 0.012], [x0, y, z1 + 0.012], [0, 0, 1], tint); }
      if (drop(i + 1, j) >= 0.5 && f.rng.chance(ch)) { const s = spr(); fr.quad(s, [x1 + 0.012, y - hang(s), z1], [x1 + 0.012, y - hang(s), z0], [x1 + 0.012, y, z0], [x1 + 0.012, y, z1], [1, 0, 0], tint); }
      if (drop(i - 1, j) >= 0.5 && f.rng.chance(ch)) { const s = spr(); fr.quad(s, [x0 - 0.012, y - hang(s), z0], [x0 - 0.012, y - hang(s), z1], [x0 - 0.012, y, z1], [x0 - 0.012, y, z0], [-1, 0, 0], tint); }
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
export function backdrop(paint: (t: RgbaTile) => void, w: number, h: number, size: [number, number], at: V3, o: { haze?: number; yaw?: number } = {}): { mesh: THREE.Mesh; update(t: number): void } {
  const t = new RgbaTile(w, h);
  paint(t);
  const tex = crispTexture(t.toCanvas());
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uTime: { value: 0 }, uHaze: { value: o.haze ?? 0 }, uRows: { value: h } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform float uTime, uHaze, uRows; varying vec2 vUv;
      void main(){
        vec2 uv = vUv;
        float row = floor(uv.y * uRows);
        float k = uHaze * smoothstep(0.55, 0.15, uv.y);
        uv.x += floor(sin(row * 0.9 + uTime * 3.0) * k * 2.0 + 0.5) / ${w.toFixed(1)};
        vec4 c = texture2D(map, uv);
        if (c.a < 0.5) discard;
        gl_FragColor = vec4(c.rgb, 1.0);
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

/** Vertical banded sky gradient with Bayer dither between ramp shades (top → bottom). */
export function paintSky(t: RgbaTile, ramp: Ramp, y0: number, y1: number) {
  for (let y = y0; y < y1; y++) {
    const v = ((y - y0) / Math.max(1, y1 - y0)) * (ramp.length - 1);
    for (let x = 0; x < t.w; x++) t.set(x, y, ramp[ditherIndex(v, x, y, ramp.length)]!);
  }
}

/** A row of rounded silhouettes (distant tree tops / hills / mesas) filled down to `bottom`. */
export function paintSilhouette(t: RgbaTile, rng: Rng, ramp: Ramp, base: number, amp: number, bump: number, bottom: number, o: { flatTop?: boolean; lightLeft?: boolean } = {}) {
  let x = 0;
  const heights = new Float32Array(t.w);
  while (x < t.w) {
    const r = bump * (0.6 + rng.next() * 0.8);
    const hh = amp * (0.4 + rng.next() * 0.6);
    for (let i = Math.floor(x - r); i <= x + r; i++) {
      if (i < 0 || i >= t.w) continue;
      const d = (i - x) / r;
      const v = o.flatTop ? (Math.abs(d) < 0.7 ? hh : hh * (1 - (Math.abs(d) - 0.7) / 0.3)) : hh * Math.sqrt(Math.max(0, 1 - d * d));
      heights[i] = Math.max(heights[i]!, v);
    }
    x += r * (o.flatTop ? 2.2 : 1.1);
  }
  for (let i = 0; i < t.w; i++) {
    const top = Math.round(base - heights[i]!);
    for (let y = top; y < bottom; y++) {
      const depth = (y - top) / Math.max(1, bottom - top);
      const edge = y - top < 2 ? 1.2 : 0;
      const side = o.lightLeft && heights[i]! > (heights[i + 1] ?? 0) + 0.3 ? 0.6 : 0;
      t.set(i, y, ramp[ditherIndex(Math.min(ramp.length - 1, ramp.length - 2 - depth * 2.2 + edge + side), i, y, ramp.length)]!);
    }
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
}

/** A far SpotLight acting as the sun (cookie + soft shadows), hemisphere and a front fill. */
export function sunRig(group: THREE.Group, s: SunSpec): { key: THREE.SpotLight; spriteLight: SpriteLight } {
  const flags = new Set((new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('post') ?? '').split(','));
  const dist = s.distance ?? 32;
  const key = new THREE.SpotLight(new THREE.Color(s.color), s.intensity, 0, s.angle ?? 0.36, 0.35, 0);
  key.position.copy(s.target).addScaledVector(s.from.clone().normalize(), dist);
  key.target.position.copy(s.target);
  if (s.cookie) key.map = s.cookie;
  key.castShadow = !flags.has('noshadow');
  const ms = s.quality === 'high' ? 2048 : 1024;
  key.shadow.mapSize.set(ms, ms);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 3;
  key.shadow.camera.near = dist - 16;
  key.shadow.camera.far = dist + 16;
  group.add(key, key.target);
  group.add(new THREE.HemisphereLight(new THREE.Color(s.sky), new THREE.Color(s.ground), s.hemi));
  const fill = new THREE.DirectionalLight(new THREE.Color(s.fill), s.fillIntensity);
  fill.position.set(2, 6, 10);
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
    let lit = v > holes + ring * 0.35 ? 1 : 0.18;
    lit *= 1 - Math.min(1, Math.max(0, (r - 0.82) / 0.18));
    const k = Math.round(lit * 255);
    img.data.set([k, k, k * 0.96, 255], (y * S + x) * 4);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft additive light-pool decals on the floor (one mesh per call). */
export function lightPools(pools: [x: number, z: number, sx: number, sz: number][], color: THREE.ColorRepresentation): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const gr = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 32, 32);
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
