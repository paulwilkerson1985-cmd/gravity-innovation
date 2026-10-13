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
import { PixelTile, ditherIndex, fbm, pixelTexture, type Ramp } from '../textures';
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

/**
 * Crisp texture from a tile, through `textures.ts` `pixelTexture` (nearest magnification, sRGB,
 * palette-preserving mip chain so minified floors and far planes keep flat ramp tones instead
 * of speckle). `repeat` false clamps (unique painted floors, backdrops); `mips: false` for
 * sprite atlases and alpha cards.
 */
export function crispTexture(c: HTMLCanvasElement, repeat = false, o: { mips?: boolean } = {}): THREE.CanvasTexture {
  const t = pixelTexture(c, { mips: o.mips !== false });
  if (!repeat) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
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
  texture(): THREE.CanvasTexture { return crispTexture(this.tile.toCanvas(), false, { mips: false }); }
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
  const n = Math.max(2, o.clumps ?? 9);
  const flat = o.flat ?? 1;
  // Light comes FROM the sky, a little from one side (screen coords, y down).
  const L0 = o.light ?? [-0.42, -0.9];
  const ll = Math.hypot(L0[0], L0[1]);
  const L: [number, number] = [L0[0] / ll, L0[1] / ll];
  // ---- 1. Leaf masses as a dome of rounded clumps: a back/top row, a middle row and a front/
  // bottom row (painted in that order, so each lower mass overlaps the one above it with its
  // lit, scalloped top edge — the way hand-pixelled crowns are built).
  const rows = n >= 6 ? 3 : 2;
  const share = rows === 3 ? [0.25, 0.35, 0.4] : [0.4, 0.6];
  const clumps: { x: number; y: number; r: number; m: number; ph: number }[] = [];
  let left = n;
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const count = r === rows - 1 ? left : Math.max(1, Math.round(n * share[r]!));
    left -= count;
    const span = 0.16 + t * 0.2;
    for (let i = 0; i < count; i++) {
      const rad = Math.min(w * 0.3, h * 0.36) * (0.78 + rng.next() * 0.3) * (1 - t * 0.12) * flat;
      const u = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
      let cx = w / 2 + u * span * w + (rng.next() - 0.5) * w * 0.06;
      let cy = h * (0.3 + t * 0.36) * (rows === 2 ? 1.12 : 1) + (rng.next() - 0.5) * h * 0.06;
      cx = Math.max(rad + 1.5, Math.min(w - rad - 1.5, cx));
      cy = Math.max(rad * 0.9 + 1.5, Math.min(h - rad - 1.5, cy));
      // Scallops: one round leaf bump every ~4–5 texels of rim.
      clumps.push({ x: cx, y: cy, r: rad, m: Math.max(5, Math.round((Math.PI * 2 * rad) / 4.6)), ph: rng.next() * Math.PI * 2 });
    }
  }
  const inside = (c: typeof clumps[0], x: number, y: number) => {
    const dx = x + 0.5 - c.x, dy = (y + 0.5 - c.y) / (flat < 1 ? flat : 1);
    const d = Math.hypot(dx, dy);
    const s = Math.abs(Math.sin((Math.atan2(dy, dx) * c.m + c.ph) / 2));
    return d < c.r * (0.86 + 0.14 * Math.sqrt(s));
  };
  // Owner = the front-most (last) clump covering each texel.
  const owner = new Int16Array(w * h).fill(-1);
  clumps.forEach((c, ci) => {
    for (let y = Math.max(0, Math.floor(c.y - c.r - 1)); y <= Math.min(h - 1, c.y + c.r + 1); y++) for (let x = Math.max(0, Math.floor(c.x - c.r - 1)); x <= Math.min(w - 1, c.x + c.r + 1); x++) if (inside(c, x, y)) owner[y * w + x] = ci;
  });
  // ---- 2. Leaf clusters inside the masses (3–4 texels): each catches the light on its top-left
  // edge and shades its underside, so the mass reads as leaves, not a smooth ball.
  const leaves = clusterMap(w, h, w > 60 ? 4.2 : 3.4, Math.floor(rng.next() * 1e6), { aspect: 0.8 });
  const top = ramp.length - 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ci = owner[y * w + x]!;
    if (ci < 0) continue;
    const c = clumps[ci]!;
    const dx = (x + 0.5 - c.x) / c.r, dy = (y + 0.5 - c.y) / c.r;
    const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, dx * dx + dy * dy)));
    // Sky-facing top lit, underside dark (sphere lit from above-side), whole crown darker low.
    const lit = (dx * L[0] + dy * L[1]) * 0.75 + nz * 0.3;
    let v = 2.9 + lit * 2.4 - Math.max(0, y / h - 0.5) * 1.7;
    const k = y * w + x;
    // Sparse leaf marks: only some clusters catch a lit top edge (lighter ones, on the lit side)
    // or show a shaded underside (darker ones) — a full outline on every cluster reads as scales.
    const lv = leaves.v[k]!;
    if (leaves.hi[k] && lit > 0.05 && lv > 0.45) v += 0.8;
    else if (leaves.lo[k] && lv < 0.45) v -= lit > 0 ? 0.6 : 0.45;
    v += (lv - 0.5) * 0.6;
    // A dark gap where this mass meets a mass in front of it (just below/beside this texel).
    for (const [ax, ay] of [[0, 1], [0, 2], [1, 1], [-1, 1]] as const) {
      const o2 = x + ax >= 0 && x + ax < w && y + ay < h ? owner[(y + ay) * w + x + ax]! : -1;
      if (o2 > ci) { v -= ay === 1 ? 1.5 : 0.8; break; }
    }
    // Highlights: three lit tones, the top one only on the brightest leaf tips.
    const cap = lit > 0.55 && leaves.hi[k] ? top : top - 1;
    p.set(x, y, ramp[Math.max(1, Math.min(cap, Math.round(v)))]!);
  }
  // ---- 3. Outline below and on the sides only (the lit top edge meets the sky directly).
  p.outline(ramp[0]!, true);
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

/**
 * Texel CLUSTERS: a jittered-grid Voronoi over a w×h tile with cells of ~`cell` texels
 * (`aspect` > 1 makes them taller than wide, like grass clumps). Every texel gets the id of its
 * cluster, the cluster's value `v` (0..1) and an edge code: `lo` = the texel below/right is in
 * another cluster (the clump's shaded underside), `hi` = the texel above/left is (its lit top).
 * Painting tones per cluster (3–4 flat shades, a lit top row, a dark bottom row) gives floors
 * that read as clean clumps at mid-distance instead of per-texel static. `wrap` makes the
 * pattern tile seamlessly (repeat textures).
 */
export function clusterMap(w: number, h: number, cell: number, seed: number, o: { wrap?: boolean; aspect?: number } = {}): { id: Int32Array; v: Float32Array; lo: Uint8Array; hi: Uint8Array } {
  const asp = o.aspect ?? 1;
  const nx = Math.max(1, Math.round(w / cell)), ny = Math.max(1, Math.round(h / (cell * asp)));
  const cw = w / nx, ch = h / ny;
  const fx = new Float32Array(nx * ny), fy = new Float32Array(nx * ny), fv = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    fx[k] = (i + 0.2 + 0.6 * hash2(i, j, seed)) * cw;
    fy[k] = (j + 0.2 + 0.6 * hash2(i, j, seed + 1)) * ch;
    fv[k] = hash2(i, j, seed + 2);
  }
  const id = new Int32Array(w * h), v = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ci = Math.floor((x + 0.5) / cw), cj = Math.floor((y + 0.5) / ch);
    let best = -1, bd = Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      let ii = ci + di, jj = cj + dj, ox = 0, oy = 0;
      if (o.wrap) {
        if (ii < 0) { ii += nx; ox = -w; } else if (ii >= nx) { ii -= nx; ox = w; }
        if (jj < 0) { jj += ny; oy = -h; } else if (jj >= ny) { jj -= ny; oy = h; }
      } else if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const k = jj * nx + ii;
      const dx = x + 0.5 - (fx[k]! + ox), dy = (y + 0.5 - (fy[k]! + oy)) / asp;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = k; }
    }
    id[y * w + x] = best;
    v[y * w + x] = fv[best]!;
  }
  const lo = new Uint8Array(w * h), hi = new Uint8Array(w * h);
  const at = (x: number, y: number) => {
    if (o.wrap) return id[(((y % h) + h) % h) * w + (((x % w) + w) % w)]!;
    return x < 0 || y < 0 || x >= w || y >= h ? -1 : id[y * w + x]!;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = id[y * w + x]!;
    const b = at(x, y + 1), r = at(x + 1, y), t = at(x, y - 1), l = at(x - 1, y);
    lo[y * w + x] = (b >= 0 && b !== c) || (r >= 0 && r !== c) ? 1 : 0;
    hi[y * w + x] = !lo[y * w + x] && ((t >= 0 && t !== c) || (l >= 0 && l !== c)) ? 1 : 0;
  }
  return { id, v, lo, hi };
}

// ------------------------------------------------------------------ tile painters (single ramp)

export interface ClusterFill {
  /** Cluster size (texels, ~2–4) and height/width ratio (> 1 = taller clumps, < 1 = flat clods). */
  cell?: number; aspect?: number;
  /** Centre shade (ramp index) and how many consecutive shades the tile may use (3–4). */
  base: number; tones?: number;
  /** Shade swing from the low-frequency macro field and from the per-cluster value. */
  macro?: number; spread?: number;
  /** Shades added on a clump's lit top edge / removed on its shaded underside (0 = none). */
  rimHi?: number; rimLo?: number;
  /**
   * Share of the clumps that get a rim (default 0.5): the darker clumps get the shaded underside,
   * the lighter ones the lit top — every clump outlined would read as paving, not soil or grass.
   */
  rimShare?: number;
  /** Extra per-texel shade offset (strata, paths…), added before quantising. */
  add?: (x: number, y: number) => number;
}

/**
 * Fill a square tile with flat-shaded CLUSTERS (`clusterMap`, tiling): a low-frequency macro
 * field plus one value per 2–4-texel clump, quantised (no dither) into `tones` consecutive
 * shades, with a lit top edge and a shaded underside per clump. Reads as clean clumps of grass,
 * soil or sand at mid-distance (and survives the palette-preserving mips), never as static.
 */
export function clusterFill(t: PixelTile, seed: number, o: ClusterFill): { macro: Float32Array; clusters: ReturnType<typeof clusterMap> } {
  const size = t.w;
  const rng = new Rng(seed);
  const macro = fbm(size, rng, [[2, 0.55], [4, 0.45]]);
  const cl = clusterMap(t.w, t.h, o.cell ?? 3, seed * 13 + 5, { wrap: true, aspect: o.aspect ?? 1 });
  const tones = o.tones ?? 4;
  const lo = Math.round(o.base - (tones - 1) / 2), hi = lo + tones - 1;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const k = y * t.w + x;
    const cv = cl.v[k]!, share = o.rimShare ?? 0.5;
    let v = o.base + (macro[k]! - 0.5) * (o.macro ?? 2.2) + (cv - 0.5) * (o.spread ?? 1.4) + (o.add?.(x, y) ?? 0);
    if (cl.lo[k] && cv < share) v -= o.rimLo ?? 0.8;
    else if (cl.hi[k] && cv > 1 - share) v += o.rimHi ?? 0.6;
    t.idx[k] = Math.max(lo, Math.min(hi, Math.round(v)));
  }
  return { macro, clusters: cl };
}

/** Earth bank side: clods in strata bands, embedded pebbles, dark root threads. */
export function paintEarth(seed: number, ramp: Ramp, size = 32, o: { roots?: number; pebbles?: number; strata?: number } = {}): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  const top = ramp.length - 1;
  // Flat clods (wider than tall) stacked in strata: 4 shades, a lit top and dark underside each.
  // Strata frequencies snap to whole cycles per tile so the repeat has no seam.
  const per = (f: number) => (Math.max(1, Math.round((size * f) / (Math.PI * 2))) * Math.PI * 2) / size;
  const ks = per(o.strata ?? 0.55), kw = per(0.3);
  clusterFill(t, seed, {
    cell: 3, aspect: 0.75, base: 3, tones: 4, macro: 1.6, spread: 1.2, rimHi: 0.7, rimLo: 0.8,
    add: (x, y) => Math.sin((y + Math.sin(x * kw) * 1.5) * ks) * 0.5,
  });
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

/**
 * Turf / moss top: grass CLUMPS (2–4 texels, a little taller than wide) in 4 flat shades between
 * `lo` and `hi` — a lit tip row, a shaded underside — plus a few blade tips (light texel over a
 * dark root) on the clumps' tops. Clean clusters at mid-distance, not per-texel static.
 */
export function paintTurf(seed: number, ramp: Ramp, size = 32, o: { lo?: number; hi?: number; flecks?: number } = {}): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  const lo = o.lo ?? 1.6, hi = o.hi ?? 4.4;
  // Clumps taller than wide in texture space: tops are seen foreshortened, so they read round.
  const { clusters: cl } = clusterFill(t, seed, { cell: 3, aspect: 1.9, base: (lo + hi) / 2, tones: 4, macro: 1.8, spread: 1.5, rimHi: 0.9, rimLo: 0.9, rimShare: 0.45 });
  // Blade tips on some clump tops (a light texel over its dark root), never isolated texels.
  for (let i = 0; i < size * size * (o.flecks ?? 0.12) * 0.5; i++) {
    const x = rng.int(size), y = rng.int(size);
    if (!cl.hi[y * size + x]) continue;
    t.set(x, y, Math.min(ramp.length - 1, Math.round(hi) + 1)); t.set(x, y + 1, Math.round(lo));
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

// ------------------------------------------------------------------ tree trunks

export interface TrunkOpts {
  /** Horizontal drift of the top (world x, z) — a slight lean / bend. */
  lean?: [number, number];
  /** Root flare: how much wider the foot is (0 = none, default 0.9) and root buttresses (default 4). */
  flare?: number; roots?: number;
  /** Radius at the top as a share of the base radius (default 0.62). */
  taper?: number;
  /** Faces around (default 9) and rings up (default 6). */
  sides?: number; rings?: number;
  tint?: THREE.Color;
  /** Branch stubs forking off the upper trunk into the crown (default 2). */
  branches?: number;
}

/**
 * A round, TAPERING tree trunk (a lathe, not a box): flared at the foot into root buttresses
 * that spread over the ground, narrowing and bending slightly as it rises, with a couple of
 * tapering branch stubs forking into the crown. Bark UVs wrap around (u = girth, v = height) at
 * the batch's texel density, so the bark texture's vertical plates follow the trunk; the foot is
 * darkened (baked AO). Seamless facets (no bevel seams). Returns the trunk top.
 */
export function trunk(batch: VoxelBatch, base: V3, height: number, r0: number, rng: Rng, o: TrunkOpts = {}): V3 {
  const S = o.sides ?? 9, R = o.rings ?? 6;
  const flare = o.flare ?? 0.9, taper = o.taper ?? 0.62;
  const lean = o.lean ?? [(rng.next() - 0.5) * 0.3, (rng.next() - 0.5) * 0.2];
  const nRoots = o.roots ?? 4;
  const rootPh = rng.next() * Math.PI * 2;
  const tint = o.tint ?? new THREE.Color(1, 1, 1);
  const tt = 1 / (TEXEL * batch.tileTexels);
  const ou = rng.int(batch.tileTexels) / batch.tileTexels;
  const ring = (k: number) => {
    const t = k / R;
    const y = base[1] + t * height;
    const cx = base[0] + lean[0] * t * t, cz = base[2] + lean[1] * t * t;
    // Flare concentrated in the bottom ~20%: roots spread out and sink into the ground.
    const fl = flare * Math.exp(-t * 9);
    const pts: V3[] = [];
    for (let s = 0; s <= S; s++) {
      const a = (s / S) * Math.PI * 2;
      const root = Math.pow(Math.max(0, Math.cos(a * nRoots / 2 + rootPh)), 6) * fl * 1.4;
      const r = r0 * (1 - (1 - taper) * t) * (1 + fl * 0.35 + root) * (0.95 + 0.1 * hash2(s % S, k, 41));
      pts.push([cx + Math.cos(a) * r, y - (k === 0 ? 0.04 : 0), cz + Math.sin(a) * r]);
    }
    return { pts, y, t };
  };
  const rings = Array.from({ length: R + 1 }, (_, k) => ring(k));
  const flatF: Face4 = [0, 0, -1, 1];
  const girth = Math.PI * 2 * r0;
  for (let k = 0; k < R; k++) {
    const A = rings[k]!, B = rings[k + 1]!;
    const aoA = 0.55 + 0.45 * Math.min(1, A.t * 3), aoB = 0.55 + 0.45 * Math.min(1, B.t * 3);
    const cA = tint.clone().multiplyScalar(aoA), cB = tint.clone().multiplyScalar(aoB);
    for (let s = 0; s < S; s++) {
      const a0 = A.pts[s]!, a1 = A.pts[s + 1]!, b0 = B.pts[s]!, b1 = B.pts[s + 1]!;
      const e1 = new THREE.Vector3(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]);
      const e2 = new THREE.Vector3(b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]);
      const nn = e2.clone().cross(e1).normalize();
      const mid = new THREE.Vector3((a0[0] + a1[0]) / 2 - (base[0] + lean[0] * A.t * A.t), 0, (a0[2] + a1[2]) / 2 - (base[2] + lean[1] * A.t * A.t));
      if (nn.dot(mid) < 0) nn.negate();
      const n3: V3 = [nn.x, nn.y, nn.z];
      const u0 = ou + (s / S) * girth * tt, u1 = ou + ((s + 1) / S) * girth * tt;
      const v0 = (A.y - base[1]) * tt, v1 = (B.y - base[1]) * tt;
      batch.tri([a0, a1, b1], n3, [[u0, v0], [u1, v0], [u1, v1]], [cA, cA, cB], [flatF, flatF, flatF]);
      batch.tri([a0, b1, b0], n3, [[u0, v0], [u1, v1], [u0, v1]], [cA, cB, cB], [flatF, flatF, flatF]);
    }
  }
  const top: V3 = [base[0] + lean[0], base[1] + height, base[2] + lean[1]];
  // Branch stubs: short tapering boxes forking upward-outward from the upper trunk.
  for (let b = 0; b < (o.branches ?? 2); b++) {
    const t = 0.62 + b * 0.16 + rng.next() * 0.08;
    const a = rootPh + b * 2.4 + rng.next() * 0.8;
    const len = height * (0.22 + rng.next() * 0.12);
    const y = base[1] + height * t;
    const r = r0 * (1 - (1 - taper) * t) * 0.42;
    const dir = new THREE.Vector3(Math.cos(a) * 0.8, 0.6, Math.sin(a) * 0.5).normalize();
    const c: V3 = [base[0] + lean[0] * t * t + dir.x * len * 0.5, y + dir.y * len * 0.5, base[2] + lean[1] * t * t + dir.z * len * 0.5];
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    batch.rotBox(c, [r * 2, len, r * 2], e.y, tint.clone().multiplyScalar(0.9), rng, e.x, e.z);
  }
  return top;
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

export interface ForegroundSpec {
  /** Sprite names to draw from, picked per PATCH (each patch is one kind: a drift, not confetti). */
  sprites: string[];
  /** Near-ground rectangle [x0, z0, x1, z1] (the band a portrait camera sees under the stage). */
  area: [number, number, number, number];
  y: (x: number, z: number) => number;
  patches: number; perPatch: [number, number];
  rng: Rng;
  keep?: (x: number, z: number) => boolean;
  /** Darken toward the camera: full tint at z0, × `k` at z1 (a shaded foreground lip). */
  k?: number;
  sway?: number;
  scale?: [number, number];
}

/**
 * Dress the near ground under a portrait (phone) camera: patches of one sprite kind each (tall
 * grass, ferns, flower drifts, bushes) at the floor's texel density, shading toward the camera
 * so the foreground reads as a darker, designed lip rather than an empty magnified floor. Goes
 * into the arena's one Foliage mesh (no extra draw call); below the desktop frame it costs nothing.
 */
export function foreground(fol: Foliage, s: ForegroundSpec) {
  const [x0, z0, x1, z1] = s.area;
  for (let p = 0; p < s.patches; p++) {
    const cx = x0 + s.rng.next() * (x1 - x0), cz = z0 + s.rng.next() * (z1 - z0);
    const name = s.sprites[s.rng.int(s.sprites.length)]!;
    const n = s.perPatch[0] + s.rng.int(s.perPatch[1] - s.perPatch[0] + 1);
    const rad = 0.5 + s.rng.next() * 0.9;
    for (let i = 0; i < n; i++) {
      const a = s.rng.next() * Math.PI * 2, r = Math.sqrt(s.rng.next()) * rad;
      const x = cx + Math.cos(a) * r * 1.3, z = cz + Math.sin(a) * r;
      if (s.keep && !s.keep(x, z)) continue;
      const t = Math.max(0, Math.min(1, (z - z0) / Math.max(0.01, z1 - z0)));
      const k = (1 - t * (1 - (s.k ?? 0.6))) * (0.88 + s.rng.next() * 0.2);
      const sc = s.scale ? s.scale[0] + s.rng.next() * (s.scale[1] - s.scale[0]) : 1;
      fol.add(fol.atlas.get(name, s.rng), [x, s.y(x, z), z], 'billboard', { scale: TEXEL * sc, sway: s.sway ?? 0.05, flip: s.rng.chance(0.5), tint: new THREE.Color(k, k, k * 1.02) });
    }
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

/** sRGB lerp along a ramp at a continuous position (0 … ramp.length − 1). */
export function rampRgb(ramp: Ramp, v: number): [number, number, number] {
  const n = ramp.length;
  const p = Math.max(0, Math.min(n - 1, v)), i = Math.min(n - 2, Math.floor(p)), f = p - i;
  const a = rgb(ramp[i]!), b = rgb(ramp[Math.min(n - 1, i + 1)]!);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Write an RGB colour with a fine 4×4 ordered dither (± `amp` / 2 levels): smooth, never banded. */
export function putRgb(t: RgbaTile, x: number, y: number, c: readonly [number, number, number], amp = 6) {
  if (!t.inside(x, y)) return;
  const d = ((BAYER4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16 - 0.5) * amp;
  const i = (y * t.w + x) * 4;
  t.data[i] = c[0] + d; t.data[i + 1] = c[1] + d; t.data[i + 2] = c[2] + d; t.data[i + 3] = 255;
}

/** Read a texel's RGB (alpha ignored). */
export function getRgb(t: RgbaTile, x: number, y: number): [number, number, number] {
  const i = (Math.max(0, Math.min(t.h - 1, y)) * t.w + Math.max(0, Math.min(t.w - 1, x))) * 4;
  return [t.data[i]!, t.data[i + 1]!, t.data[i + 2]!];
}

/**
 * Sky: a SMOOTH gradient through the ramp (top → bottom, eased toward the horizon), finely
 * ordered-dithered so it never steps into bands; optionally a few hand-shaped clouds
 * (`paintClouds`). `glow` adds a warm halo round a sun at (x, y) texels.
 */
export function paintSky(t: RgbaTile, ramp: Ramp, y0: number, y1: number, o: { clouds?: CloudSpec; glow?: { x: number; y: number; r: number; color: string; k?: number } } = {}) {
  const n = ramp.length;
  const g = o.glow ? rgb(o.glow.color) : null;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(t.h, y1); y++) {
    const f = Math.max(0, Math.min(1, (y - y0) / Math.max(1, y1 - y0)));
    const base = rampRgb(ramp, Math.pow(f, 1.25) * (n - 1));
    for (let x = 0; x < t.w; x++) {
      let c = base;
      if (o.glow && g) {
        const d = Math.hypot(x - o.glow.x, (y - o.glow.y) * 1.4) / o.glow.r;
        const k = Math.max(0, 1 - d) ** 2 * (o.glow.k ?? 0.85);
        if (k > 0) c = [c[0] + (g[0] - c[0]) * k, c[1] + (g[1] - c[1]) * k, c[2] + (g[2] - c[2]) * k];
      }
      putRgb(t, x, y, c, 5);
    }
  }
  if (o.clouds) paintClouds(t, o.clouds);
}

export interface CloudSpec {
  seed: number;
  /** How many clouds, and their size range (texels, half-width). */
  count: number; size: [number, number];
  /** Band of rows the clouds float in, [top, bottom]. */
  rows: [number, number];
  /** Cloud ramp, dark (shaded base) → light (sunlit top): 4–5 shades. */
  ramp: Ramp;
  /** Screen direction the light comes FROM (x, y; y down), default from above-left. */
  light?: [number, number];
  /** Flatness: height / width of a cloud (default 0.42). */
  flat?: number;
  /** Keep clouds off these columns (e.g. the sun). */
  avoid?: (x: number) => boolean;
  /** Shading toward the flat base (default 1.3 shades darker; negative = an underlit base, sunset). */
  baseShade?: number;
  /** Horizontal stretch of every puff (default 1; 2.5+ = long stratus streaks). */
  stretch?: number;
}

/**
 * A few HAND-SHAPED pixel clouds: each a cumulus of overlapping round puffs on a flat base (a
 * big crown puff, smaller shoulders), shaded per puff (sunlit tops, cool shaded bases, 4–5
 * flat tones), with a soft 1–2-texel edge that dithers into the sky behind it. Not bands.
 */
export function paintClouds(t: RgbaTile, s: CloudSpec) {
  const rng = new Rng(s.seed);
  const n = s.ramp.length;
  const L0 = s.light ?? [-0.5, -0.85];
  const ll = Math.hypot(L0[0], L0[1]);
  const L: [number, number] = [L0[0] / ll, L0[1] / ll];
  const placed: [number, number, number][] = [];
  for (let c = 0, tries = 0; c < s.count && tries < s.count * 20; tries++) {
    const hw = s.size[0] + rng.next() * (s.size[1] - s.size[0]);
    const cx = rng.next() * t.w;
    const base = s.rows[0] + rng.next() * (s.rows[1] - s.rows[0]);
    if (s.avoid?.(cx) || placed.some(([px, pb, ph]) => Math.abs(px - cx) < (ph + hw) * 0.9 && Math.abs(pb - base) < 14)) continue;
    placed.push([cx, base, hw]);
    c++;
    const flat = s.flat ?? 0.42;
    // Puffs: an off-centre crown with side masses, a CAULIFLOWER top (many small bumps along the
    // upper contour) and fillers along the flat base — an irregular cumulus, not a row of balls.
    const puffs: { x: number; y: number; r: number }[] = [];
    const st = s.stretch ?? 1;
    const H = (hw / st) * flat * 2;
    const crown = { x: cx + (rng.next() - 0.5) * hw * 0.4, y: base - H * 0.55, r: H * (0.52 + rng.next() * 0.1) };
    puffs.push(crown);
    const masses = [crown];
    for (const sgn of [-1, 1]) {
      if (rng.chance(0.15)) continue;
      const r = H * (0.32 + rng.next() * 0.14);
      const m = { x: cx + sgn * hw * (0.42 + rng.next() * 0.18), y: base - r * (0.9 + rng.next() * 0.2), r };
      puffs.push(m); masses.push(m);
    }
    // Bumps on the top arcs of the masses (each a smaller dome breaking the outline).
    for (const m of masses) {
      const k = m === crown ? 4 + rng.int(3) : 2 + rng.int(2);
      for (let i = 0; i < k; i++) {
        const ang = -Math.PI * (0.18 + 0.64 * ((i + 0.5 + (rng.next() - 0.5) * 0.6) / k));
        const r = m.r * (0.3 + rng.next() * 0.16);
        puffs.push({ x: m.x + Math.cos(ang) * m.r * 0.8 * st, y: m.y + Math.sin(ang) * m.r * 0.8, r });
      }
    }
    for (let k = 0; k < 3; k++) {
      const r = H * (0.2 + rng.next() * 0.12);
      puffs.push({ x: cx + (k - 1) * hw * 0.62 + (rng.next() - 0.5) * hw * 0.2, y: base - r * 0.55, r });
    }
    const x0 = Math.floor(cx - hw - H * st), x1 = Math.ceil(cx + hw + H * st);
    const yTop = Math.floor(base - H * 1.35);
    const nearest = (x: number, y: number): [number, number] => {
      let best = -1, bp = -1;
      puffs.forEach((p, i) => {
        const d = Math.hypot((x + 0.5 - p.x) / st, (y + 0.5 - p.y) * 1.1) / p.r;
        if (1 - d > best) { best = 1 - d; bp = i; }
      });
      return [best, bp];
    };
    for (let y = yTop; y <= Math.ceil(base) + 1; y++) for (let x = x0; x <= x1; x++) {
      if (!t.inside(x, y)) continue;
      const [best, bp] = nearest(x, y);
      // Flat base: cut the puffs below the base line (a 1-row soft fringe under it).
      const below = y + 0.5 - base;
      if (best < -0.08 || below > 1) continue;
      const p = puffs[bp]!;
      const dx = (x + 0.5 - p.x) / (p.r * st), dy = (y + 0.5 - p.y) / p.r;
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, dx * dx + dy * dy)));
      // One light for the whole cloud (height above the base + the sun side), the puffs only
      // modulate it a little — a volume, not separate balls.
      const up = Math.max(0, Math.min(1, (base - y) / (H * 1.25)));
      const side = ((x - cx) / hw) * L[0];
      const local = (dx * L[0] + dy * L[1]) * 0.7 + nz * 0.3;
      let v = (n - 1) * Math.max(0, Math.min(1, 0.2 + (L[1] < 0 ? up : 1 - up) * 0.55 + local * 0.14 + side * 0.18));
      v -= Math.max(0, 1 - (base - y) / (H * 0.3)) * Math.max(0, s.baseShade ?? 1.3) * 0.6;
      // Billows: where a lower (front) puff starts under a higher one, its top edge catches the
      // light and the back puff just above it falls into a thin shadow — inner contours.
      // Only the bigger masses get contours (small bumps and base fillers stay smooth).
      if (p.r > H * 0.26 && base - y > H * 0.3) {
        const [, above] = nearest(x, y - 1), [, under] = nearest(x, y + 1);
        if (above >= 0 && above !== bp && puffs[above]!.y < p.y - 0.5 && puffs[above]!.r > H * 0.26) v += 0.7;
        else if (under >= 0 && under !== bp && puffs[under]!.y > p.y + 0.5 && puffs[under]!.r > H * 0.26) v -= 0.7;
      }
      v = Math.max(0, Math.min(n - 1, Math.round(v)));
      const c = rgb(s.ramp[v]!);
      // Soft edge: the outer rim (and the fringe under the base) mixes into the sky behind it,
      // ordered so it reads as a 1–2-texel feathered edge.
      const edge = best < 0.06 || below > 0;
      if (edge) {
        const keep = BAYER4[(y & 3) * 4 + (x & 3)]! / 16 < (best < 0 || below > 0 ? 0.3 : 0.6);
        if (!keep) continue;
        const bg = getRgb(t, x, y);
        putRgb(t, x, y, [(c[0] + bg[0]) / 2, (c[1] + bg[1]) / 2, (c[2] + bg[2]) / 2], 0);
      } else putRgb(t, x, y, c, 0);
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
export function paintSilhouette(t: RgbaTile, rng: Rng, ramp: Ramp, base: number, amp: number, bump: number, bottom: number, o: { flatTop?: boolean; lightLeft?: boolean; haze?: number; hazeCol?: string } = {}) {
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
  // Two or three flat VALUES per layer (body, sunlit face/rim, shadow face) — a silhouette, not
  // a texture — then a smooth aerial fade toward `hazeCol` (more at the foot: rising haze).
  const haze = o.haze ?? 0;
  const hz = rgb(o.hazeCol ?? ramp[n - 1]!);
  const body = Math.max(1, Math.round(n * 0.45));
  const leftLit = o.lightLeft ?? true;
  for (let i = 0; i < t.w; i++) {
    const top = Math.round(base - heights[i]!);
    const face = lit[i] === 0 ? 0 : (lit[i] === 1) === leftLit ? 1 : -1;
    for (let y = Math.max(0, top); y < bottom; y++) {
      const depth = (y - top) / Math.max(1, bottom - top);
      let v = body + (face === 1 ? 1 : face === -1 ? -1 : 0);
      if (y - top < (face === -1 ? 1 : 2)) v = Math.min(n - 1, body + (face === -1 ? 1 : 2)); // lit rim
      if (o.flatTop && y - top > 3 && ((y + (i >> 4)) % 6 === 0)) v -= 1;                     // strata
      const c = rgb(ramp[Math.max(0, Math.min(n - 1, v))]!);
      const k = Math.min(1, haze + (1 - haze) * depth * depth * 0.55);
      putRgb(t, i, y, [c[0] + (hz[0] - c[0]) * k, c[1] + (hz[1] - c[1]) * k, c[2] + (hz[2] - c[2]) * k], 4);
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
      const c = rgb(ramp[Math.round(v)]!);
      // Aerial perspective: a smooth fade toward the haze colour, stronger toward the foot.
      const k = Math.min(1, haze + Math.max(0, (y - o.base) / Math.max(4, bottom - o.base)) * 0.35);
      putRgb(t, xx, y, [c[0] + (hz[0] - c[0]) * k, c[1] + (hz[1] - c[1]) * k, c[2] + (hz[2] - c[2]) * k], 3);
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
  /** Rounded (domed) caps falling off toward the cliff edges: grassy headlands, not flat mesas. */
  dome?: number;
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
  const mesas: { cx: number; w: number; h: number; corner: number }[] = [];
  let x = rng.next() * o.w[1];
  while (x < W + o.w[1]) {
    const w = o.w[0] + rng.next() * (o.w[1] - o.w[0]);
    // Heights vary a lot: low buttes between a few tall mesas.
    const h = o.ridge ? o.h[0] + rng.next() * (o.h[1] - o.h[0]) : o.h[0] * (0.55 + rng.next() * 0.3) + (rng.chance(0.55) ? rng.next() * (o.h[1] - o.h[0] * 0.6) : 0);
    // The corner where the lit face turns into the shadow face (seen at an angle).
    if (!o.allow || o.allow(x)) mesas.push({ cx: x, w, h, corner: x + (rng.next() - 0.5) * w * 0.5 });
    // Open sky between the buttes (their talus skirts may touch, their caps not).
    x += w * (1.3 + rng.next() * (o.ridge ? 1.2 : 2.2)) + (o.ridge ? 0 : o.w[0] + h * 0.9);
  }
  void o.count;
  mesas.forEach((m, mi) => {
    const reach = m.w + m.h * 2.8;
    for (let i = Math.floor(m.cx - reach); i <= m.cx + reach; i++) {
      if (i < 0 || i >= W) continue;
      const d = Math.abs(i - m.cx);
      // Ragged cap: a slow wander of 1–2 texels (value noise over ~8 columns), the odd notch.
      const f = i / 8 + mi * 3.7, f0 = Math.floor(f), ft = f - f0;
      const wander = hash2(f0, mi, 3) * (1 - ft) + hash2(f0 + 1, mi, 3) * ft;
      const rag = Math.round((wander - 0.5) * 3.2) - (hash2(i >> 2, mi, 4) < 0.05 ? 1 + Math.round(hash2(i, mi, 5) * 2) : 0);
      const cliff = (o.cliff ?? (o.ridge ? 1.4 : 5.5)) + hash2(i >> 1, mi, 6) * 2;
      const tdir = hash2(mi, 7, 15) < 0.5 ? -1 : 1;
      const th = o.tilt ? m.h * o.tilt * (0.5 + 0.5 * tdir * Math.max(-1, Math.min(1, (i - m.cx) / m.w))) : 0;
      // Caprock: a steep cliff band from the cap down to ~half height…
      const dome = o.dome ? m.h * o.dome * Math.min(1, d / m.w) ** 2 : 0;
      const cap = d <= m.w ? m.h - th - dome + rag : m.h - th - dome - (d - m.w) * cliff + rag;
      const sw = m.w * (o.ridge ? 1.1 : 1.3 + hash2(mi, i < m.cx ? 1 : 2, 11) * 0.5);
      const sh = m.h * (0.55 + hash2(mi, i < m.cx ? 3 : 4, 12) * 0.12);
      const shoulder = d <= sw ? sh + rag * 0.5 : sh - (d - sw) * cliff * 0.8 + rag;
      // …then a long CONCAVE talus skirt fanning out to the canyon floor (the mesa silhouette).
      const talusTop = m.h * (o.ridge ? 0.75 : 0.5);
      const td = Math.max(0, d - sw * 0.8) / (m.h * (o.ridge ? 1.4 : 1.25));
      const talus = talusTop * Math.max(0, 1 - td) ** 1.6 + (hash2(i >> 2, mi, 7) - 0.5) * 1.5;
      const v = Math.max(cap, shoulder, talus);
      if (v > H[i]!) { H[i] = v; own[i] = mi; kind[i] = d <= m.w ? 0 : Math.max(cap, shoulder) >= talus ? (d <= sw && cap < shoulder ? 3 : 1) : 2; }
    }
  });
  const hz = rgb(o.hazeCol);
  for (let i = 0; i < W; i++) {
    if (H[i]! <= 0) {
      // Between the buttes: the hazy canyon floor from the foot line down (no see-through slits).
      const c = rgb(o.ramp[1]!);
      for (let y = Math.max(0, Math.round(o.foot)); y < t.h; y++) {
        const k = Math.min(1, o.haze + 0.55 + (y - o.foot) * 0.02);
        putRgb(t, i, y, [c[0] + (hz[0] - c[0]) * k, c[1] + (hz[1] - c[1]) * k, c[2] + (hz[2] - c[2]) * k], 4);
      }
      continue;
    }
    const m = mesas[own[i]!]!;
    const top = Math.round(o.foot - H[i]!);
    // Two faces meet at the mesa's corner: the face toward the sun LIT, the other in SHADOW.
    const sunLeft = o.sunX < m.cx;
    const leftOfCorner = i < m.corner;
    const litFace = leftOfCorner === sunLeft;
    const flank = kind[i] === 1;
    const gully = hash2(i, own[i]!, 8) < 0.07 * o.gullies ? 6 + hash2(i, own[i]!, 9) * m.h * 0.7 : 0;
    const glow = Math.max(0, 1 - Math.abs(i - o.sunX) / (W * 0.35));
    const capTop = o.foot - m.h;
    const ridge = Math.abs(i - m.corner) < 1;
    for (let y = Math.max(0, top); y < t.h; y++) {
      const depth = y - top;
      const sy = y - capTop + Math.sin(i * 0.05 + own[i]!) * 1.4;
      const band = Math.floor(sy / 3);
      const strata = [0, -0.6, 0.35, -0.25, -0.85, 0.2, 0.5, -0.4][((band % 8) + 8) % 8]!;
      // Three clear values: LIT face (+ the sun-side flank), MID, SHADOW face; horizontal strata
      // (alternating bands and thin dark ledges) across the faces, vertical gullies, a lit rim
      // on every cap edge, scree on the talus. Flat tones, no dither.
      const mid = 2.2;
      let v = litFace ? mid + 1.3 + glow * 0.7 : mid - 1.0;
      if (flank) v += litFace ? 0.5 : -0.3;
      if (kind[i] === 2) v = mid - 0.2 + (litFace ? 0.6 : -0.4) + (hash2(i >> 1, y >> 1, 10) - 0.5) * 1.0;   // talus scree
      else {
        v += strata * 0.8 + (((Math.floor(sy) % 6) + 6) % 6 === 0 ? -0.8 : 0);
        v += (hash2(i >> 2, own[i]!, 16) - 0.5) * 0.45;                                        // vertical striations
        if (gully && depth > 2 && depth < gully) v -= 0.9;                                     // erosion gully
        if (ridge && depth > 1) v += litFace ? 0.6 : 0.9;                                      // lit corner edge
      }
      if ((kind[i] === 0 || kind[i] === 3) && depth < 3) v += 0.9;                             // caprock lip
      if (depth === 0) v = n - 1 - (glow > 0.3 || litFace ? 0 : 0.8);                          // hot rim on every top edge
      else if (depth === 1 && (litFace || kind[i] === 0)) v += 1.2 + glow * 0.8;
      v = Math.max(0, Math.min(n - 1, Math.round(v)));
      let c = rgb(o.ramp[v]!);
      const capRows = o.capRows ?? 3;
      if (o.capRamp && depth < capRows + (hash2(i, 1, 13) < 0.4 ? 1 : 0) && kind[i] !== 2) {
        // Turf cap: lit on top, a dark fringe row hanging over the cliff.
        const cn = o.capRamp.length;
        const cv = depth === 0 ? cn - 1.2 + glow : depth >= capRows ? 0.8 : cn - 2.4 - depth * 0.6 + (litFace ? 0.8 : 0);
        c = rgb(o.capRamp[Math.round(Math.max(0, Math.min(cn - 1, cv)))]!);
      }
      if (o.foam && y >= o.foot - 1 && y <= o.foot && hash2(i >> 1, y, 14) < 0.55) c = rgb(o.foam);
      // Haze: more toward the canyon floor (rising haze) — a SMOOTH, finely dithered fade, so
      // the feet dissolve into the air instead of stepping through bands.
      const below = Math.max(0, Math.min(1, (y - top) / Math.max(8, o.foot - top + 6)));
      const k = Math.min(1, o.haze + below * below * 0.4 + (y > o.foot ? 0.15 + (y - o.foot) * 0.02 : 0));
      putRgb(t, i, y, [c[0] + (hz[0] - c[0]) * k, c[1] + (hz[1] - c[1]) * k, c[2] + (hz[2] - c[2]) * k], 4);
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
  const tex = crispTexture(c, false, { mips: false });
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
