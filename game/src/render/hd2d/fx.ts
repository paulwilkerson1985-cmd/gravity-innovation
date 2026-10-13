// HD-2D pixel FX: hand-pixeled flipbook effects for attacks (render/movefx.ts uses them on the
// `?gfx=hd2d` path; the default renderer's FX are untouched).
//
//  * Every effect element is a FLIPBOOK of 6–8 frames painted procedurally into one small
//    atlas with the textures.ts painters (PixelTile + ordered dither + tileable fbm), from a
//    4–5 colour ramp per element (index 0 = transparent): flame tongues with a dark-red outer
//    band, orange mid and a yellow-white core; a water splash with a deep-blue base, cyan body
//    and white foam clusters; leaves, vines, sparks, rock chips/spikes, dust, wind and an
//    impact star. Frames play at 12 fps.
//  * Flipbook quads face the camera and are SNAPPED TO THE INTERNAL PIXEL GRID in the vertex
//    shader (1 texel = k whole internal px), so they are as crisp as the sprites; fade in/out
//    is an ordered-dither dissolve (no soft alpha).
//  * Droplets and embers are 1–2 px squares (GL points, no size attenuation, pixel-snapped).
//  * FX light: an additive, dithered ground-glow disc and a camera-facing wall glow behind the
//    target, instead of runtime PointLights (adding a light recompiles every program). They draw
//    at renderOrder 4, before the FX and the sprites, so they light the set but not the target.
//  * Render order contract with the sprites (renderOrder 7, alpha-tested): normal-blend FX are
//    drawn at ≤ 6 so the target sprite stays on top of them; additive glows/sparks at ≥ 8.
//
// One mesh (one draw call) per batch; all materials are persistent and pre-compiled by
// warmPixelFx (registered with the Renderer), so no program links mid-battle.
import * as THREE from 'three';
import { Rng } from '../../engine/rng';
import { PixelTile, ditherIndex, fbm, type Ramp } from './textures';
import { markPersistent } from '../materials';
import { animate } from '../particles';

// ------------------------------------------------------------------ palettes

/** Per-element ramps, index 0 = transparent (never drawn), then dark → light. 3–5 colours. */
export const FX_RAMPS = {
  flame: ['#000000', '#6a1208', '#c42a10', '#f87418', '#ffc23a', '#fff4c0'],
  water: ['#000000', '#16378a', '#2378d2', '#48c6f0', '#c4f2ff', '#ffffff'],
  leaf: ['#000000', '#173f1c', '#2f7a2c', '#6cc23a', '#d2f27a', '#ff7ab0'],
  spark: ['#000000', '#c0500c', '#ffa21e', '#ffe85a', '#ffffff'],
  rock: ['#000000', '#33221a', '#5e4330', '#8e6c4c', '#bf9b72'],
  dust: ['#000000', '#7d6a58', '#a99178', '#cfbb9e', '#ebe0ca'],
  smoke: ['#000000', '#251c22', '#3e3238', '#5c4e50', '#7a6c68'],
  /** Sea foam: blue-grey shadow, pale cyan, white body, white crest. */
  foam: ['#000000', '#4f7fa8', '#9fd2ec', '#e6f7ff', '#ffffff'],
  wind: ['#000000', '#4fa6cc', '#a6e2f4', '#ffffff'],
  /** Neutral greys, tinted per element by the quad colour. */
  star: ['#000000', '#8c8c8c', '#d0d0d0', '#ffffff'],
} as const satisfies Record<string, Ramp>;

// ------------------------------------------------------------------ painting helpers

const TAU = Math.PI * 2;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)]!;

/** Bounds-checked texel write (PixelTile.set wraps, which a sprite must not). */
function put(t: PixelTile, x: number, y: number, i: number) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && y >= 0 && x < t.w && y < t.h) t.idx[y * t.w + x] = Math.max(0, Math.min(t.ramp.length - 1, i));
}
function at(t: PixelTile, x: number, y: number): number {
  return x >= 0 && y >= 0 && x < t.w && y < t.h ? t.idx[y * t.w + x]! : 0;
}
/**
 * Filled texels touching transparency (4-neighbour) become `band` (unless brighter than `keep`).
 * `grounded`: the row under the tile counts as filled (bottom-anchored effects stand on the
 * floor, they get no outline along it).
 */
function edgeBand(t: PixelTile, band: number, keep = 99, grounded = false) {
  const edge: number[] = [];
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const v = at(t, x, y);
    if (!v || v >= keep) continue;
    const below = grounded && y === t.h - 1 ? 1 : at(t, x, y + 1);
    if (!at(t, x - 1, y) || !at(t, x + 1, y) || !at(t, x, y - 1) || !below) edge.push(y * t.w + x);
  }
  for (const i of edge) t.idx[i] = band;
}
/** Remove lone texels (no 4-neighbour): noise speckle reads as dirt, not as a hand-placed pixel. */
function despeckle(t: PixelTile) {
  const kill: number[] = [];
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    if (at(t, x, y) && !at(t, x - 1, y) && !at(t, x + 1, y) && !at(t, x, y - 1) && !at(t, x, y + 1)) kill.push(y * t.w + x);
  }
  for (const i of kill) t.idx[i] = 0;
}
function disc(t: PixelTile, cx: number, cy: number, r: number, i: number) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) put(t, x, y, i);
  }
}
/** A 1-px line (Bresenham-ish by sampling). */
function line(t: PixelTile, x0: number, y0: number, x1: number, y1: number, i: number) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let k = 0; k <= n; k++) put(t, Math.floor(x0 + ((x1 - x0) * k) / n), Math.floor(y0 + ((y1 - y0) * k) / n), i);
}
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

/** Tileable 32×32 fbm fields, cached by seed. */
const noiseCache = new Map<number, Float32Array>();
function noise32(seed: number): Float32Array {
  let n = noiseCache.get(seed);
  if (!n) { n = fbm(32, new Rng(seed), [[4, 0.5], [8, 0.33], [16, 0.17]]); noiseCache.set(seed, n); }
  return n;
}
const nz = (n: Float32Array, x: number, y: number) => n[(((Math.floor(y) % 32) + 32) % 32) * 32 + (((Math.floor(x) % 32) + 32) % 32)]!;

/**
 * Map a 0..1 "heat" to a flame ramp index: solid bands (hand-pixeled), with ordered dither only
 * in a thin zone just under each band edge.
 */
function heatIndex(h: number, x: number, y: number): number {
  const edges = [0.16, 0.32, 0.52, 0.74, 0.93];
  let b = 0;
  while (b < edges.length && h > edges[b]!) b++;
  if (b === 0 || b === edges.length) return b;
  const lo = edges[b - 1]!, hi = edges[b]!;
  const frac = (h - lo) / (hi - lo);
  return ditherIndex(b + Math.max(0, (frac - 0.72) / 0.28) * 0.5, x, y, 6);
}

// ------------------------------------------------------------------ painters (frame f of n)

/**
 * Flame tongue (bottom-anchored, default 16×32): a full rounded body that narrows into a wavy
 * tip, ragged by upward-scrolling fbm (detached licks above the tip), solid heat bands.
 */
function paintFlame(f: number, n: number, w = 16, h = 32): PixelTile {
  const t = new PixelTile(w, h, FX_RAMPS.flame);
  const N = noise32(71), M = noise32(13);
  const ph = (f / n) * TAU;
  const shift = f * (32 / n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const up = h - 1 - y, v = up / (h - 1);
    const sway = Math.sin(v * 4.6 - ph) * v * v * (w * 0.2) + Math.sin(v * 9 - ph * 2) * v * (w * 0.04);
    const cx = w / 2 - 0.5 + sway;
    const body = v < 0.22 ? 0.8 + v * 0.9 : Math.pow(Math.max(0, 1 - (v - 0.22) / 0.78), 0.75);
    const half = (w / 2 - 0.4) * body * (0.94 + 0.08 * Math.sin(ph * 2 + v * 6)) + 0.35;
    const dx = Math.abs(x - cx) / half;
    const sx = (x / w) * 32;
    const nn = nz(N, sx * 0.8 + 5, up * (32 / h) * 0.9 - shift) - 0.5;
    const mm = nz(M, sx * 1.3 + 11, up * (32 / h) * 1.6 - shift * 2) - 0.5;
    const heat = 1.08 - dx * dx * 0.92 - v * 0.6 + nn * (0.75 + v * 0.7) + mm * 0.35;
    const i = heatIndex(heat, x, y);
    if (i) put(t, x, y, i);
  }
  despeckle(t);
  edgeBand(t, 1, 5);
  return t;
}

/** Fireball 16×16: a flickering ball with licks. */
function paintFireball(f: number, n: number): PixelTile {
  const t = new PixelTile(16, 16, FX_RAMPS.flame);
  const N = noise32(23);
  const ph = (f / n) * TAU;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x - 7.5, dy = y - 7.5;
    const r = Math.hypot(dx, dy) / (6.6 + 0.5 * Math.sin(ph));
    const a = Math.atan2(dy, dx);
    const nn = nz(N, (a / TAU) * 32 + f * (32 / n), r * 9 - f * 3) - 0.5;
    const heat = 1.05 - r * r * 0.95 + nn * 0.9;
    const i = heatIndex(heat, x, y);
    if (i) put(t, x, y, i);
  }
  despeckle(t);
  edgeBand(t, 1, 5);
  return t;
}

/**
 * Water splash 32×32 (bottom-anchored): jets of water blobs on ballistic arcs (a little
 * particle simulation sampled at this frame), a puddle base; deep-blue edges and base, cyan
 * body, light rims and white foam clusters on the crests.
 */
function paintSplash(f: number, n: number): PixelTile {
  const W = 32, H = 32;
  const t = new PixelTile(W, H, FX_RAMPS.water);
  const tau = (f + 0.7) / n;
  const G = 150;
  const jets: [number, number, number][] = [[-1.5, -17, 70], [-0.8, -9, 92], [0, -2, 104], [0.8, 8, 96], [1.6, 16, 72], [-0.2, -27, 52], [0.4, 26, 50]];
  const foam: [number, number][] = [];
  for (const [x0, vx, vy] of jets) {
    for (let k = 0; k < 7; k++) {
      const a = tau - k * 0.05;
      if (a < 0) continue;
      const x = W / 2 + x0 + vx * a, up = vy * a - 0.5 * G * a * a;
      if (up < -1) continue;
      const r = Math.max(0.6, (2.6 - k * 0.22) * (1 - Math.max(0, a - 0.45) * 0.9));
      disc(t, x, H - 1 - up, r, 3);
      if (k === 0 && a > 0.12) foam.push([x, H - 1 - up]);
    }
  }
  // Puddle base: grows, then thins and breaks up as the water drains away.
  const bw = 5 + 6.5 * easeOut(Math.min(1, tau * 1.6)), bh = 2.2 - tau * 0.9;
  const drain = Math.max(0, (tau - 0.4) / 0.6);
  for (let y = H - 5; y < H; y++) for (let x = 0; x < W; x++) {
    const e = ((x + 0.5 - W / 2) / bw) ** 2 + ((y + 0.5 - (H - 1)) / bh) ** 2;
    if (e <= 1 && bayer(x, y) >= drain * 0.95) put(t, x, y, at(t, x, y) ? 3 : 2);
  }
  // Shading: rims light on the upper-left, deep blue toward the bottom and the lower-right edge.
  const src = Int8Array.from(t.idx);
  const s = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? src[y * W + x]! : 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!s(x, y)) continue;
    const up = H - 1 - y;
    if (!s(x - 1, y - 1) || !s(x, y - 1)) put(t, x, y, 4);
    else if (!s(x + 1, y + 1) || !s(x + 1, y)) put(t, x, y, 2);
    if (up === 0) put(t, x, y, 2);
  }
  edgeBand(t, 1, 4, true);
  // Foam clusters on the crests and along the puddle rim.
  for (const [x, y] of foam) { put(t, x, y, 5); put(t, x + 1, y, 5); put(t, x, y - 1, 5); put(t, x - 1, y, 4); put(t, x + 1, y - 1, 4); }
  if (tau > 0.25 && drain < 0.6) for (let i = -2; i <= 2; i++) { const x = W / 2 + i * bw * 0.42; put(t, x, H - 3, 5); put(t, x + 1, H - 3, 5); put(t, x, H - 4, 4); }
  return t;
}

/** Water orb 16×16: wobbling ball, spec highlight, a swirl inside. */
function paintOrb(f: number, n: number): PixelTile {
  const t = new PixelTile(16, 16, FX_RAMPS.water);
  const ph = (f / n) * TAU;
  const rx = 6.4 + 0.6 * Math.sin(ph), ry = 6.4 - 0.6 * Math.sin(ph);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = (x + 0.5 - 8) / rx, dy = (y + 0.5 - 8) / ry;
    const r = dx * dx + dy * dy;
    if (r > 1) continue;
    const lit = -dx * 0.7 - dy * 0.7;
    put(t, x, y, r > 0.72 ? 2 : lit > 0.45 ? 4 : lit > -0.2 ? 3 : 2);
  }
  // Swirl: a short arc that turns with the frames.
  for (let k = 0; k < 6; k++) {
    const a = ph + k * 0.35;
    put(t, 8 + Math.cos(a) * 3.2, 8 + Math.sin(a) * 3.2 * 0.8, 4);
  }
  put(t, 5, 4, 5); put(t, 6, 4, 5); put(t, 5, 5, 5);
  edgeBand(t, 1);
  return t;
}

/** Leaf 10×10, tumbling (rotation + foreshortening). */
function paintLeaf(f: number, n: number): PixelTile {
  const t = new PixelTile(10, 10, FX_RAMPS.leaf);
  const a = (f / n) * Math.PI;
  const ws = 0.35 + 0.65 * Math.abs(Math.cos((f / n) * TAU));
  const ca = Math.cos(a), sa = Math.sin(a);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const px = x + 0.5 - 5, py = y + 0.5 - 5;
    const u = px * ca + py * sa, v = (-px * sa + py * ca) / ws;
    const L = 4.4, Wd = 2.1;
    if (Math.abs(u) > L || Math.abs(v) > Wd * (1 - (u / L) ** 2)) continue;
    put(t, x, y, Math.abs(v) < 0.5 && u > -3 && u < 3.2 ? 4 : v < 0 ? 3 : 2);
  }
  edgeBand(t, 1, 4);
  return t;
}

/** Thorn vine 12×32 (bottom-anchored), growing over the frames; leaves, thorns, a pink bud. */
function paintVine(f: number, n: number): PixelTile {
  const W = 12, H = 32;
  const t = new PixelTile(W, H, FX_RAMPS.leaf);
  const g = easeOut((f + 1) / n);
  const top = Math.max(3, Math.round((H - 3) * g));
  const xs = (up: number) => W / 2 - 0.5 + 2.2 * Math.sin(up * 0.19 + 0.6) * (up / H + 0.3);
  for (let up = 0; up < top; up++) {
    const x = xs(up), y = H - 1 - up;
    const th = up < top * 0.6 ? 2 : 1;
    for (let k = 0; k < th; k++) put(t, x + k, y, k === 0 ? 3 : 2);
  }
  for (const [lu, side] of [[7, 1], [13, -1], [19, 1], [24, -1]] as const) {
    if (lu > top - 3) continue;
    const x = xs(lu), y = H - 1 - lu;
    for (let k = 1; k <= 3; k++) { put(t, x + side * k, y - (k > 1 ? 1 : 0), 3); put(t, x + side * k, y - 1 - (k > 2 ? 1 : 0), k === 2 ? 4 : 2); }
  }
  for (const [lu, side] of [[10, -1], [16, 1], [22, -1]] as const) if (lu < top - 2) put(t, xs(lu) + (side > 0 ? 2 : -1), H - 1 - lu, 4);
  edgeBand(t, 1, 4);
  if (g > 0.55) { const x = xs(top - 1), y = H - top; disc(t, x + 0.5, y - 0.5, 1.6, 5); put(t, x, y - 1, 4); }
  return t;
}

/** Electric crackle 16×16: jagged rays from the centre, new each frame, shrinking. */
function paintSpark(f: number, n: number): PixelTile {
  const t = new PixelTile(16, 16, FX_RAMPS.spark);
  const rng = new Rng(311 + f * 17);
  const reach = 7.5 * (1 - (f / n) * 0.45);
  for (let r = 0; r < 4; r++) {
    let a = rng.next() * TAU, x = 7.5, y = 7.5;
    const len = reach * (0.6 + rng.next() * 0.4);
    for (let s = 0; s < len; s++) {
      a += (rng.next() - 0.5) * 1.3;
      x += Math.cos(a); y += Math.sin(a);
      put(t, x, y, 4);
      if (rng.chance(0.5)) put(t, x + (rng.chance(0.5) ? 1 : -1), y, 3);
      if (rng.chance(0.25)) put(t, x, y + (rng.chance(0.5) ? 1 : -1), 2);
    }
  }
  for (let k = 0; k < 6; k++) put(t, 7.5 + (rng.next() - 0.5) * reach * 1.8, 7.5 + (rng.next() - 0.5) * reach * 1.8, 1);
  disc(t, 8, 8, f < n / 2 ? 1.7 : 1.1, 4);
  return t;
}

/** Rock chip 8×8 or boulder 16×16, tumbling: an irregular polygon lit from the top-left. */
function paintChunk(f: number, n: number, size: number, verts: number, seed: number): PixelTile {
  const t = new PixelTile(size, size, FX_RAMPS.rock);
  const rng = new Rng(seed);
  const radii = Array.from({ length: verts }, () => 0.72 + rng.next() * 0.28);
  const rot = (f / n) * TAU;
  const c = size / 2, R = size / 2 - 0.8;
  const inside = (px: number, py: number) => {
    const a = Math.atan2(py, px) - rot;
    const k = ((a / TAU) * verts % verts + verts) % verts;
    const i = Math.floor(k), fr = k - i;
    const r = (radii[i]! * (1 - fr) + radii[(i + 1) % verts]! * fr) * R;
    return Math.hypot(px, py) <= r;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = x + 0.5 - c, py = y + 0.5 - c;
    if (!inside(px, py)) continue;
    const lit = (-px - py) / R;
    put(t, x, y, lit > 0.45 ? 4 : lit > -0.3 ? 3 : 2);
  }
  if (size >= 16) for (let k = 0; k < 3; k++) { const a = rot + k * 2.1; put(t, c + Math.cos(a) * 3, c + Math.sin(a) * 3, 2); put(t, c + Math.cos(a) * 3 + 1, c + Math.sin(a) * 3, 2); }
  edgeBand(t, 1, 4);
  return t;
}

/** Rock spike 16×32 (bottom-anchored) bursting out of the ground: lit left face, dark right. */
function paintSpike(f: number, n: number): PixelTile {
  const W = 16, H = 32;
  const t = new PixelTile(W, H, FX_RAMPS.rock);
  const g = easeOut(Math.min(1, (f + 1) / (n - 1)));
  const top = Math.round((H - 2) * g);
  const tipX = W / 2 + 1;
  for (let up = 0; up < top; up++) {
    const k = up / Math.max(1, top);
    const half = (W / 2 - 1.5) * (1 - k) + 0.6;
    const cx = tipX * k + (W / 2 - 0.5) * (1 - k);
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const d = x + 0.5 - cx;
      if (Math.abs(d) > half) continue;
      put(t, x, H - 1 - up, d < -half * 0.25 ? 4 : d < half * 0.35 ? 3 : 2);
    }
  }
  for (const [u, dx] of [[6, -1], [12, 1], [17, 0]] as const) if (u < top - 2) { put(t, W / 2 + dx, H - 1 - u, 1); put(t, W / 2 + dx + 1, H - 2 - u, 1); }
  edgeBand(t, 1, 4);
  // Rubble at the foot.
  for (const x of [2, 4, 11, 13]) { put(t, x, H - 1, 2); put(t, x + 1, H - 1, 3); }
  return t;
}

/** Puff 16×16 (dust or smoke): three blobs that swell and break up into dither. */
function paintPuff(f: number, n: number, ramp: Ramp): PixelTile {
  const t = new PixelTile(16, 16, ramp);
  const k = (f + 1) / n;
  const blobs: [number, number, number][] = [[6.5, 9, 3.4], [10, 8.5, 2.9], [8, 6, 3.1]];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let best = -1;
    let lit = 0;
    for (const [bx, by, br] of blobs) {
      const r = br * (0.7 + k * 0.75);
      const dx = x + 0.5 - bx, dy = y + 0.5 - (by - k * 2.2);
      const e = 1 - (dx * dx + dy * dy) / (r * r);
      if (e > best) { best = e; lit = (-dx - dy) / r; }
    }
    if (best < 0) continue;
    if (bayer(x, y) < Math.pow(k, 1.6) * 0.9 - best * 0.4) continue; // breaks apart as it ages
    put(t, x, y, lit > 0.55 ? 4 : lit > -0.1 ? 3 : 2);
  }
  edgeBand(t, 1, 4);
  return t;
}

/** Wind slash 24×12: a crescent that sweeps in, then thins away. */
function paintSlash(f: number, n: number): PixelTile {
  const t = new PixelTile(24, 12, FX_RAMPS.wind);
  const sweep = Math.min(1, (f + 1) / 3);
  const thin = f < 3 ? 1 : 1 - (f - 2) / (n - 1);
  const a0 = Math.PI * 1.12, a1 = a0 + Math.PI * 0.76 * sweep;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 24; x++) {
    const dx = x + 0.5 - 12, dy = y + 0.5 - 13.5;
    let a = Math.atan2(dy, dx); if (a < 0) a += TAU;
    if (a < a0 || a > a1) continue;
    const k = (a - a0) / (a1 - a0 || 1);
    const w = (0.6 + 2.6 * Math.sin(Math.PI * k)) * thin;
    const r = Math.hypot(dx, dy);
    const d = 11 - r;
    if (d < 0 || d > w) continue;
    put(t, x, y, d < w * 0.45 ? 3 : d < w * 0.8 ? 2 : 1);
  }
  return t;
}

/**
 * Whirlwind funnel 32×40 (bottom-anchored): stacked squashed rings that widen with height and
 * climb one spacing per loop; bright near halves, dashed dim far halves, a few gust dashes.
 */
function paintSwirl(f: number, n: number): PixelTile {
  const W = 32, H = 40;
  const t = new PixelTile(W, H, FX_RAMPS.wind);
  const ph = (f / n) * TAU;
  const gap = 5;
  for (let j = -1; j < H / gap + 1; j++) {
    const yb = j * gap + (f / n) * gap;
    if (yb < 0 || yb > H - 3) continue;
    const R = 2.5 + yb * 0.34;
    const cx = W / 2 - 0.5 + Math.sin(yb * 0.13 + ph) * 1.6;
    const steps = Math.ceil(R * 8);
    for (let k = 0; k < steps; k++) {
      const th = (k / steps) * TAU;
      const near = Math.sin(th) < 0;
      if (!near && (k + j) % 3 === 0) continue; // dashed far half
      const x = cx + Math.cos(th) * R, y = H - 1 - (yb + Math.sin(th) * R * 0.24);
      const side = Math.abs(Math.cos(th)) > 0.8;
      put(t, x, y, near ? (side ? 2 : 3) : 1);
      if (near && !side) put(t, x, y + 1, 2);
    }
  }
  const rng = new Rng(57 + f);
  for (let k = 0; k < 4; k++) {
    const yb = 4 + rng.next() * (H - 10), R = 2.5 + yb * 0.34 + 2;
    const x0 = W / 2 + (rng.chance(0.5) ? R : -R - 3);
    line(t, x0, H - 1 - yb, x0 + 3, H - 1 - yb, 2);
  }
  return t;
}

/**
 * Impact star 32×32 (greyscale, tinted per element): a pop, then 8 chunky wedge rays (long
 * on the axes, short on the diagonals) that open up, detach from the centre and break apart.
 */
function paintStar(f: number, n: number): PixelTile {
  const t = new PixelTile(32, 32, FX_RAMPS.star);
  const c = 15.5;
  if (f === 0) {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.abs(x - c) + Math.abs(y - c); if (d <= 6) put(t, x, y, d <= 3.5 ? 3 : 2); }
    edgeBand(t, 1);
    return t;
  }
  const k = f / (n - 1);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x - c, dy = y - c;
    const r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    // Angular distance to the nearest ray, and whether it is a long (axis) ray.
    const seg = (a / (Math.PI / 4) + 8) % 8;
    const ri = Math.round(seg) % 8;
    const da = Math.abs(seg - Math.round(seg)) * (Math.PI / 4);
    const long = ri % 2 === 0;
    const len = (long ? 15.5 : 9.5) * Math.min(1, 0.62 + k * 0.6);
    const inner = f >= 3 ? len * (0.25 + (f - 3) * 0.22) : 0;
    if (r > len || r < inner) continue;
    const half = (long ? 2.6 : 1.9) * (1 - r / (len + 0.5)) * (f >= 4 ? 0.7 : 1) + 0.35;
    const across = Math.sin(da) * r;
    const core = r < (f <= 2 ? 4.2 - f * 0.8 : -1);
    if (!core && across > half) continue;
    put(t, x, y, core || across < half * 0.45 ? 3 : 2);
  }
  edgeBand(t, 1, 3);
  if (f >= 4) for (let i = 0; i < 32 * 32; i++) if (t.idx[i] && bayer(i % 32, Math.floor(i / 32)) < (f - 3) * 0.26) t.idx[i] = 0;
  return t;
}

// ------------------------------------------------------------------ flipbook atlas

export type BookId = 'flame' | 'flameS' | 'fireball' | 'splash' | 'orb' | 'leaf' | 'vine' | 'spark' | 'chip' | 'boulder' | 'spike' | 'dust' | 'smoke' | 'foam' | 'slash' | 'swirl' | 'star';

interface BookSpec { w: number; h: number; frames: number; paint: (f: number, n: number) => PixelTile }
const BOOKS: Record<BookId, BookSpec> = {
  flame: { w: 16, h: 32, frames: 8, paint: (f, n) => paintFlame(f, n) },
  flameS: { w: 10, h: 18, frames: 8, paint: (f, n) => paintFlame(f, n, 10, 18) },
  fireball: { w: 16, h: 16, frames: 6, paint: paintFireball },
  splash: { w: 32, h: 32, frames: 8, paint: paintSplash },
  orb: { w: 16, h: 16, frames: 6, paint: paintOrb },
  leaf: { w: 10, h: 10, frames: 8, paint: paintLeaf },
  vine: { w: 12, h: 32, frames: 8, paint: paintVine },
  spark: { w: 16, h: 16, frames: 6, paint: paintSpark },
  chip: { w: 8, h: 8, frames: 6, paint: (f, n) => paintChunk(f, n, 8, 5, 41) },
  boulder: { w: 16, h: 16, frames: 6, paint: (f, n) => paintChunk(f, n, 16, 7, 97) },
  spike: { w: 16, h: 32, frames: 6, paint: paintSpike },
  dust: { w: 16, h: 16, frames: 6, paint: (f, n) => paintPuff(f, n, FX_RAMPS.dust) },
  smoke: { w: 16, h: 16, frames: 6, paint: (f, n) => paintPuff(f, n, FX_RAMPS.smoke) },
  foam: { w: 16, h: 16, frames: 6, paint: (f, n) => paintPuff(f, n, FX_RAMPS.foam) },
  slash: { w: 24, h: 12, frames: 6, paint: paintSlash },
  swirl: { w: 32, h: 40, frames: 8, paint: paintSwirl },
  star: { w: 32, h: 32, frames: 6, paint: paintStar },
};

/** Paint every frame of a flipbook (pure; used by the atlas and by preview tools). */
export function paintBook(id: BookId): PixelTile[] {
  const b = BOOKS[id];
  return Array.from({ length: b.frames }, (_, f) => b.paint(f, b.frames));
}

export interface Book { id: BookId; w: number; h: number; frames: number; /** atlas texel origin of frame 0 */ x: number; y: number }

/** Shelf-pack every flipbook (frames side by side) into a 256-wide atlas layout. */
export function atlasLayout(): { W: number; H: number; books: Record<BookId, Book> } {
  const W = 256;
  let x = 0, y = 0, row = 0;
  const books = {} as Record<BookId, Book>;
  const ids = (Object.keys(BOOKS) as BookId[]).sort((a, b) => BOOKS[b].h - BOOKS[a].h);
  for (const id of ids) {
    const b = BOOKS[id];
    const bw = b.w * b.frames;
    if (x + bw > W) { x = 0; y += row; row = 0; }
    books[id] = { id, w: b.w, h: b.h, frames: b.frames, x, y };
    x += bw;
    row = Math.max(row, b.h);
  }
  let H = 1;
  while (H < y + row) H *= 2;
  return { W, H, books };
}

/** RGBA pixels of the whole atlas (index 0 transparent). */
export function atlasPixels(): { W: number; H: number; data: Uint8ClampedArray; books: Record<BookId, Book> } {
  const { W, H, books } = atlasLayout();
  const data = new Uint8ClampedArray(W * H * 4);
  for (const id of Object.keys(books) as BookId[]) {
    const b = books[id];
    paintBook(id).forEach((tile, f) => {
      const rgb = tile.ramp.map((hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const);
      for (let y = 0; y < tile.h; y++) for (let x = 0; x < tile.w; x++) {
        const i = tile.idx[y * tile.w + x]!;
        if (!i) continue;
        const o = ((b.y + y) * W + b.x + f * b.w + x) * 4;
        const [r, g, bl] = rgb[i]!;
        data[o] = r; data[o + 1] = g; data[o + 2] = bl; data[o + 3] = 255;
      }
    });
  }
  return { W, H, data, books };
}

let atlas: { tex: THREE.Texture; W: number; H: number; books: Record<BookId, Book> } | null = null;
function getAtlas() {
  if (atlas) return atlas;
  const px = atlasPixels();
  const tex = new THREE.DataTexture(px.data, px.W, px.H, THREE.RGBAFormat);
  tex.flipY = false;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  atlas = { tex: markPersistent(tex), W: px.W, H: px.H, books: px.books };
  return atlas;
}

// ------------------------------------------------------------------ materials

const BAYER_GLSL = /* glsl */ `
  float bayer4(vec2 p) {
    ivec2 i = ivec2(mod(p, 4.0));
    int idx = i.y * 4 + i.x;
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[idx]) + 0.5) / 16.0;
  }`;

const FLIP_VERT = /* glsl */ `
  attribute vec2 aCorner;
  attribute vec2 aUv;
  attribute float aFade;
  attribute vec3 aTint;
  attribute float aGlow;
  uniform vec2 uRes;
  varying vec2 vUv;
  varying float vFade;
  varying vec3 vTint;
  varying float vGlow;
  void main() {
    vec4 clip = projectionMatrix * viewMatrix * vec4(position, 1.0);
    vec2 ndc = clip.xy / clip.w;
    // Anchor on a pixel corner, then whole-pixel corner offsets: texels land on the grid.
    vec2 px = floor((ndc * 0.5 + 0.5) * uRes + 0.5) + aCorner;
    gl_Position = vec4((px / uRes * 2.0 - 1.0) * clip.w, clip.z, clip.w);
    vUv = aUv; vFade = aFade; vTint = aTint; vGlow = aGlow;
  }`;
const FLIP_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying float vFade;
  varying vec3 vTint;
  varying float vGlow;
  ${BAYER_GLSL}
  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.5 || bayer4(gl_FragCoord.xy) > vFade) discard;
    // Glow lifts only the bright ramp entries (cores, crests) into HDR so they bloom; the dark
    // bands keep their exact palette colour.
    float l = dot(t.rgb, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor = vec4(t.rgb * vTint * (1.0 + vGlow * smoothstep(0.6, 0.92, l)), 1.0);
  }`;

const PTS_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  uniform vec2 uRes;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    if (aSize < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 1.0; return; }
    vec4 clip = projectionMatrix * viewMatrix * vec4(position, 1.0);
    vec2 px = (clip.xy / clip.w * 0.5 + 0.5) * uRes;
    px = mod(aSize, 2.0) > 0.5 ? floor(px) + 0.5 : floor(px + 0.5);
    gl_Position = vec4((px / uRes * 2.0 - 1.0) * clip.w, clip.z, clip.w);
    gl_PointSize = aSize;
  }`;
const PTS_FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() { gl_FragColor = vec4(vColor, 1.0); }`;

const GLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GLOW_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAmt;
  varying vec2 vUv;
  ${BAYER_GLSL}
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float f = clamp(1.0 - r, 0.0, 1.0);
    f *= f;
    // Four dithered steps instead of a smooth gradient: a pixel-art light pool.
    float q = floor(f * 4.0 + bayer4(gl_FragCoord.xy)) / 4.0;
    if (q <= 0.0) discard;
    gl_FragColor = vec4(uColor * q * uAmt, 1.0);
  }`;

export type PixelBlend = 'normal' | 'add';
const blendOf = (b: PixelBlend) => (b === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending);

function newFlipMat(blend: PixelBlend): THREE.ShaderMaterial {
  return markPersistent(new THREE.ShaderMaterial({
    vertexShader: FLIP_VERT, fragmentShader: FLIP_FRAG,
    uniforms: { uMap: { value: getAtlas().tex }, uRes: { value: new THREE.Vector2(640, 360) } },
    transparent: true, depthWrite: false, depthTest: true, blending: blendOf(blend), fog: false,
  }));
}
function newPtsMat(blend: PixelBlend): THREE.ShaderMaterial {
  return markPersistent(new THREE.ShaderMaterial({
    vertexShader: PTS_VERT, fragmentShader: PTS_FRAG,
    uniforms: { uRes: { value: new THREE.Vector2(640, 360) } },
    transparent: true, depthWrite: false, depthTest: true, blending: blendOf(blend), fog: false,
  }));
}
function newGlowMat(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
    uniforms: { uColor: { value: new THREE.Color() }, uAmt: { value: 0 } },
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
  });
}

/** Pools of material instances (one per live batch, so per-batch uniforms never clash). */
const flipPool: Record<PixelBlend, THREE.ShaderMaterial[]> = { normal: [], add: [] };
const ptsPool: Record<PixelBlend, THREE.ShaderMaterial[]> = { normal: [], add: [] };
const glowPool: THREE.ShaderMaterial[] = [];
const takeGlow = () => glowPool.pop() ?? markPersistent(newGlowMat());

const resV = new THREE.Vector2();
/** Keep a batch material's uRes in sync with the drawing buffer. */
function trackRes(mesh: THREE.Object3D, mat: THREE.ShaderMaterial) {
  mesh.onBeforeRender = (r) => { r.getDrawingBufferSize(resV); (mat.uniforms.uRes!.value as THREE.Vector2).copy(resV); };
}

// ------------------------------------------------------------------ flipbook batch

export interface FlipOpts {
  /** Velocity (world units/s), gravity (units/s² on Y), drag (fraction of velocity lost per s). */
  vel?: THREE.Vector3; gravity?: number; drag?: number;
  /** Frames per second (12) and looping (else plays once, holding the last frame). */
  fps?: number; loop?: boolean; frame0?: number;
  /** Seconds alive; default = one play-through (looping: 0.6 s). */
  life?: number;
  /** Dither dissolve in/out (seconds). */
  fadeIn?: number; fadeOut?: number;
  /** Whole internal px per texel. */
  scale?: number;
  /** 'bottom' = the frame's bottom edge sits on the position (flames, splashes, vines). */
  anchor?: 'centre' | 'bottom';
  /** Colour multiplier, and glow (1 = none; 1.5 lifts the bright ramp entries ~2.25× into HDR, they bloom). */
  tint?: THREE.ColorRepresentation; glow?: number;
  flip?: boolean;
  /** Delay before appearing (seconds). */
  delay?: number;
}

interface FlipSprite { book: Book; p: THREE.Vector3; v: THREE.Vector3; g: number; drag: number; age: number; life: number; fps: number; loop: boolean; frame0: number; scale: number; bottom: boolean; fadeIn: number; fadeOut: number; tint: THREE.Color; glow: number; flip: boolean; delay: number; alive: boolean }

/**
 * Camera-facing, pixel-snapped flipbook quads in one mesh (one draw call). Positions are world
 * space; sizes are whole internal pixels. `step(dt)` advances and rewrites the buffers.
 */
export class FlipBatch {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  private sprites: FlipSprite[] = [];
  private pos: Float32Array; private corner: Float32Array; private uv: Float32Array; private fade: Float32Array; private tint: Float32Array; private glow: Float32Array;

  constructor(readonly scene: THREE.Scene, readonly capacity: number, readonly blend: PixelBlend = 'normal', renderOrder = blend === 'add' ? 8 : 5) {
    const n = capacity * 4;
    this.pos = new Float32Array(n * 3); this.corner = new Float32Array(n * 2); this.uv = new Float32Array(n * 2); this.fade = new Float32Array(n); this.tint = new Float32Array(n * 3); this.glow = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    const dyn = (a: Float32Array, k: number) => new THREE.BufferAttribute(a, k).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', dyn(this.pos, 3)); g.setAttribute('aCorner', dyn(this.corner, 2)); g.setAttribute('aUv', dyn(this.uv, 2)); g.setAttribute('aFade', dyn(this.fade, 1)); g.setAttribute('aTint', dyn(this.tint, 3)); g.setAttribute('aGlow', dyn(this.glow, 1));
    const idx: number[] = [];
    for (let i = 0; i < capacity; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    g.setIndex(idx);
    this.mat = flipPool[blend].pop() ?? newFlipMat(blend);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.userData.fx = true;
    trackRes(this.mesh, this.mat);
    scene.add(this.mesh);
  }

  add(id: BookId, at: THREE.Vector3, o: FlipOpts = {}): number {
    const book = getAtlas().books[id];
    const fps = o.fps ?? 12;
    const s: FlipSprite = {
      book, p: at.clone(), v: o.vel?.clone() ?? new THREE.Vector3(), g: o.gravity ?? 0, drag: o.drag ?? 0, age: 0,
      life: o.life ?? (o.loop ? 0.6 : book.frames / fps), fps, loop: !!o.loop, frame0: o.frame0 ?? 0, scale: Math.max(1, Math.round(o.scale ?? 1)),
      bottom: o.anchor === 'bottom', fadeIn: o.fadeIn ?? 0, fadeOut: o.fadeOut ?? 0,
      tint: new THREE.Color(o.tint ?? '#ffffff'), glow: Math.max(0, (o.glow ?? 1) - 1) * 2.5, flip: !!o.flip, delay: o.delay ?? 0, alive: true,
    };
    let i = this.sprites.findIndex((x) => !x.alive);
    if (i < 0) { if (this.sprites.length >= this.capacity) i = 0; else i = this.sprites.length; }
    this.sprites[i] = s;
    this.write(i);
    const a = this.mesh.geometry.attributes;
    a.position!.needsUpdate = a.aCorner!.needsUpdate = a.aUv!.needsUpdate = a.aFade!.needsUpdate = a.aTint!.needsUpdate = a.aGlow!.needsUpdate = true;
    return i;
  }

  /** Move a sprite directly (scripted motion). */
  place(i: number, p: THREE.Vector3) { const s = this.sprites[i]; if (s) s.p.copy(p); }
  /** Live sprites. */
  alive(): number { return this.sprites.filter((s) => s.alive).length; }

  step(dt: number) {
    for (const s of this.sprites) {
      if (!s.alive) continue;
      if (s.delay > 0) { s.delay -= dt; continue; }
      s.age += dt;
      if (s.age >= s.life) { s.alive = false; continue; }
      const damp = Math.max(0, 1 - s.drag * dt);
      s.v.x *= damp; s.v.y = s.v.y * damp + s.g * dt; s.v.z *= damp;
      s.p.addScaledVector(s.v, dt);
    }
    for (let i = 0; i < this.capacity; i++) this.write(i);
    const a = this.mesh.geometry.attributes;
    a.position!.needsUpdate = a.aCorner!.needsUpdate = a.aUv!.needsUpdate = a.aFade!.needsUpdate = a.aTint!.needsUpdate = a.aGlow!.needsUpdate = true;
  }

  private write(i: number) {
    const s = this.sprites[i];
    const v = i * 4;
    if (!s || !s.alive || s.delay > 0) { this.fade.fill(0, v, v + 4); this.corner.fill(0, v * 2, v * 2 + 8); return; }
    const atlasW = getAtlas().W, atlasH = getAtlas().H;
    const b = s.book;
    const fi = s.loop ? (s.frame0 + Math.floor(s.age * s.fps)) % b.frames : Math.min(b.frames - 1, s.frame0 + Math.floor(s.age * s.fps));
    const u0 = (b.x + fi * b.w) / atlasW, u1 = (b.x + (fi + 1) * b.w) / atlasW;
    const vTop = b.y / atlasH, vBot = (b.y + b.h) / atlasH;
    const W = b.w * s.scale, H = b.h * s.scale;
    const x0 = -W / 2, x1 = W / 2;
    const y0 = s.bottom ? 0 : -H / 2, y1 = s.bottom ? H : H / 2;
    const ua = s.flip ? u1 : u0, ub = s.flip ? u0 : u1;
    const corners = [[x0, y0, ua, vBot], [x1, y0, ub, vBot], [x1, y1, ub, vTop], [x0, y1, ua, vTop]] as const;
    const fin = s.fadeIn > 0 ? Math.min(1, s.age / s.fadeIn) : 1;
    const fout = s.fadeOut > 0 ? Math.min(1, (s.life - s.age) / s.fadeOut) : 1;
    const fade = Math.max(0, Math.min(fin, fout));
    for (let k = 0; k < 4; k++) {
      const c = corners[k]!;
      this.pos[(v + k) * 3] = s.p.x; this.pos[(v + k) * 3 + 1] = s.p.y; this.pos[(v + k) * 3 + 2] = s.p.z;
      this.corner[(v + k) * 2] = Math.round(c[0]); this.corner[(v + k) * 2 + 1] = Math.round(c[1]);
      this.uv[(v + k) * 2] = c[2]; this.uv[(v + k) * 2 + 1] = c[3];
      this.fade[v + k] = fade;
      this.tint[(v + k) * 3] = s.tint.r; this.tint[(v + k) * 3 + 1] = s.tint.g; this.tint[(v + k) * 3 + 2] = s.tint.b;
      this.glow[v + k] = s.glow;
    }
  }

  /** Step until every sprite is done (or `maxMs`), then remove. */
  async run(maxMs: number) {
    let done = false;
    await animate(maxMs, (_k, dt) => { if (done) return; this.step(dt); if (!this.alive()) done = true; });
    this.dispose();
  }

  dispose() {
    if (!this.mesh.parent) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    flipPool[this.blend].push(this.mat);
  }
}

// ------------------------------------------------------------------ 1–2 px points

export interface PointOpts { color: THREE.ColorRepresentation; size?: 1 | 2; life: number; gravity?: number; drag?: number; glow?: number }
interface Pt { p: THREE.Vector3; v: THREE.Vector3; g: number; drag: number; age: number; life: number; size: number; alive: boolean }

/** Droplets / embers / grit: pixel-snapped 1–2 px squares in one THREE.Points (one draw call). */
export class PixelPoints {
  readonly points: THREE.Points;
  readonly mat: THREE.ShaderMaterial;
  private pts: Pt[] = [];
  private pos: Float32Array; private size: Float32Array; private col: Float32Array;
  private next = 0;

  constructor(readonly scene: THREE.Scene, readonly capacity: number, readonly blend: PixelBlend = 'add', renderOrder = blend === 'add' ? 8 : 6) {
    this.pos = new Float32Array(capacity * 3); this.size = new Float32Array(capacity); this.col = new Float32Array(capacity * 3);
    const g = new THREE.BufferGeometry();
    const dyn = (a: Float32Array, k: number) => new THREE.BufferAttribute(a, k).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', dyn(this.pos, 3)); g.setAttribute('aSize', dyn(this.size, 1)); g.setAttribute('aColor', dyn(this.col, 3));
    this.mat = ptsPool[blend].pop() ?? newPtsMat(blend);
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    this.points.userData.fx = true;
    trackRes(this.points, this.mat);
    scene.add(this.points);
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, o: PointOpts) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.pts[i] = { p: p.clone(), v: v.clone(), g: o.gravity ?? 0, drag: o.drag ?? 0, age: 0, life: o.life, size: o.size ?? 1, alive: true };
    const c = new THREE.Color(o.color).multiplyScalar(o.glow ?? 1);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.points.geometry.attributes.aColor!.needsUpdate = true;
  }

  alive(): number { return this.pts.filter((p) => p?.alive).length; }

  step(dt: number) {
    for (let i = 0; i < this.capacity; i++) {
      const p = this.pts[i];
      if (!p || !p.alive) { this.size[i] = 0; continue; }
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; this.size[i] = 0; continue; }
      const damp = Math.max(0, 1 - p.drag * dt);
      p.v.x *= damp; p.v.y = p.v.y * damp + p.g * dt; p.v.z *= damp;
      p.p.addScaledVector(p.v, dt);
      this.pos[i * 3] = p.p.x; this.pos[i * 3 + 1] = p.p.y; this.pos[i * 3 + 2] = p.p.z;
      // The last third of its life a 2 px point shrinks to 1 px.
      this.size[i] = p.size > 1 && p.age > p.life * 0.66 ? 1 : p.size;
    }
    const a = this.points.geometry.attributes;
    a.position!.needsUpdate = a.aSize!.needsUpdate = true;
  }

  async run(maxMs: number) {
    let done = false;
    await animate(maxMs, (_k, dt) => { if (done) return; this.step(dt); if (!this.alive()) done = true; });
    this.dispose();
  }

  /** Move a live point directly (scripted orbits). */
  place(i: number, p: THREE.Vector3) { const q = this.pts[i]; if (q) { q.p.copy(p); q.v.set(0, 0, 0); } }

  dispose() {
    if (!this.points.parent) return;
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    ptsPool[this.blend].push(this.mat);
  }
}

// ------------------------------------------------------------------ FX light (glow pools)

const discGeo = markPersistent(new THREE.PlaneGeometry(1, 1));

/**
 * The light an impact throws, without a runtime light: an additive dithered disc on the floor
 * under the target and a fainter camera-facing glow quad behind it (spill on the wall/backdrop).
 * Two meshes; `set(k)` scales the brightness (0..1), `dispose()` removes them.
 */
export function impactGlow(scene: THREE.Scene, ground: THREE.Vector3, color: THREE.ColorRepresentation, radius: number, camera?: THREE.Camera) {
  const col = new THREE.Color(color);
  const mk = (amt: number) => {
    const m = takeGlow();
    (m.uniforms.uColor!.value as THREE.Color).copy(col);
    m.uniforms.uAmt!.value = 0;
    const mesh = new THREE.Mesh(discGeo, m);
    // Light on the floor/wall: drawn before the FX (5–6) and the sprites (7), which stay unlit by it.
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    mesh.userData.fx = true;
    scene.add(mesh);
    return { mesh, m, amt };
  };
  const floor = mk(1);
  floor.mesh.position.copy(ground).add(new THREE.Vector3(0, 0.03, 0));
  floor.mesh.rotation.x = -Math.PI / 2;
  floor.mesh.scale.setScalar(radius * 2);
  const wall = mk(0.45);
  const back = new THREE.Vector3(0, 0, -1);
  if (camera) { camera.getWorldDirection(back); back.y = 0; if (back.lengthSq() < 1e-4) back.set(0, 0, -1); back.normalize(); }
  wall.mesh.position.copy(ground).addScaledVector(back, radius * 0.9).add(new THREE.Vector3(0, radius * 0.75, 0));
  wall.mesh.rotation.set(0, Math.atan2(-back.x, -back.z), 0);
  wall.mesh.scale.set(radius * 2.6, radius * 2, 1);
  const parts = [floor, wall];
  return {
    set(k: number) { for (const p of parts) p.m.uniforms.uAmt!.value = Math.max(0, k) * p.amt; },
    dispose() { for (const p of parts) { if (!p.mesh.parent) continue; scene.remove(p.mesh); glowPool.push(p.m); } },
  };
}

/**
 * A dithered decal ON the floor in normal blend (it darkens / tints what is under it): the wet
 * ring a wave leaves, a scorch. `ring` > 0 makes an annulus peaking at that fraction of the
 * radius; `set(k)` scales its opacity (0..1), `dispose()` removes it. renderOrder 4 (under FX
 * and sprites, over the floor and the sprite contact shadows).
 */
const DECAL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAmt;
  uniform float uRing;
  varying vec2 vUv;
  ${BAYER_GLSL}
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    float f = uRing > 0.0 ? 1.0 - abs(r - uRing) / max(1e-3, 1.0 - uRing) : 1.0 - r * r;
    f = clamp(f, 0.0, 1.0);
    float q = floor(f * uAmt * 3.0 + bayer4(gl_FragCoord.xy)) / 3.0;
    if (q <= 0.0) discard;
    gl_FragColor = vec4(uColor, min(0.85, q));
  }`;
const decalPool: THREE.ShaderMaterial[] = [];
function takeDecal(): THREE.ShaderMaterial {
  return decalPool.pop() ?? markPersistent(new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT, fragmentShader: DECAL_FRAG,
    uniforms: { uColor: { value: new THREE.Color() }, uAmt: { value: 0 }, uRing: { value: 0 } },
    transparent: true, depthWrite: false, depthTest: true, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  }));
}
export function groundDecal(scene: THREE.Scene, ground: THREE.Vector3, color: THREE.ColorRepresentation, radius: number, o: { ring?: number } = {}) {
  const m = takeDecal();
  (m.uniforms.uColor!.value as THREE.Color).set(color);
  m.uniforms.uAmt!.value = 0;
  m.uniforms.uRing!.value = o.ring ?? 0;
  const mesh = new THREE.Mesh(discGeo, m);
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  mesh.userData.fx = true;
  mesh.position.copy(ground).add(new THREE.Vector3(0, 0.025, 0));
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.setScalar(radius * 2);
  scene.add(mesh);
  return {
    mesh,
    set(k: number) { m.uniforms.uAmt!.value = Math.max(0, k); },
    /** Grow/shrink the decal (world radius). */
    radius(r: number) { mesh.scale.setScalar(r * 2); },
    dispose() { if (!mesh.parent) return; scene.remove(mesh); decalPool.push(m); },
  };
}

// ------------------------------------------------------------------ warm-up

let holder: THREE.Scene | null = null;
/**
 * Compile the pixel-FX programs against `target`'s lights (the Renderer calls this with the
 * other warm-ups on a scene's first frames), so the first attack links nothing.
 */
export function warmPixelFx(gl: THREE.WebGLRenderer, target: THREE.Scene, camera: THREE.Camera) {
  if (!holder) {
    holder = new THREE.Scene();
    for (const blend of ['normal', 'add'] as const) {
      const b = new FlipBatch(holder, 1, blend); b.add('star', new THREE.Vector3());
      const p = new PixelPoints(holder, 1, blend); p.emit(new THREE.Vector3(), new THREE.Vector3(), { color: '#fff', life: 1 });
    }
    const g = impactGlow(holder, new THREE.Vector3(), '#fff', 1);
    g.set(1);
    groundDecal(holder, new THREE.Vector3(), '#000', 1).set(1);
  }
  gl.compile(holder, camera, target);
}
