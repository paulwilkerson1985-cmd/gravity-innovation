// The Arena stadium (HD-2D, `?gfx=hd2d`): a night PvP bowl. Painted turf with crisp field
// markings, seat-coloured rings at both kin spots, a padded barrier with glowing seat boards,
// tiered concrete stands packed with tiny pixel spectators (ONE instanced-style billboard mesh
// with a sprite sheet: idle sway, cheering arms + hops on demand), flag poles in seat colours,
// and four floodlight towers whose beams cross over the field (the key light is the back-left
// tower: cold-white spot with shadows). Dusk sky behind. ~16 draw calls for the set.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../../engine/rng';
import { lightBeams, dustMotes, surfaceMaterial, type ArenaRig, type BeamSpec } from '../arena';
import { cachedTexture, pixelTexture } from '../textures';
import type { Grade } from '../pipeline';
import type { SpriteLight } from '../sprite';
import {
  NIGHT, Pieces, bannerGeometry, billboards, lightPools, litMesh, paintBanner, paintBlock, paintIron, paintSky, radialTexture,
  shade, skyPlane, swayMaterial, TEXEL, type Billboards,
} from './nightKit';
import type { ArenaDef, CameraPreset, LayoutName } from './index';
import { bandIndex } from './outdoorKit';

/** Stadium grade: neutral-cool floodlight whites, violet dusk shadows, a touch of saturation. */
export function stadiumGrade(): Grade {
  return {
    lift: new THREE.Vector3(0.008, 0.004, 0.02), gamma: new THREE.Vector3(1.0, 1.0, 1.0), gain: new THREE.Vector3(1.02, 1.0, 0.98),
    saturation: 0.8, contrast: 1.05,
    shadowTint: new THREE.Color('#2c2350'), highTint: new THREE.Color('#fff0d8'), splitAmount: 0.12,
    vignette: 0.2, vignetteSoft: 0.7,
    tiltTop: 1.0, tiltBottom: 0.6, focusTop: 0.8, focusBottom: 0.08,
    dither: 2.0,
    exposure: 1.22,
  };
}

export interface StadiumOptions {
  seed?: number;
  quality?: 'high' | 'low';
  /** Seat colours [near, far] (sRGB hex); default coral vs blue. */
  colors?: [string, string];
}

export interface StadiumRig extends ArenaRig {
  /** Seat-coloured rings (+ trainer boxes) under the near and far kin: recolour on a swap. */
  pads: [THREE.Mesh, THREE.Mesh];
  /** Recolour the near/far pads and the seat flags. */
  setColors(near: string, far: string): void;
  /** The crowd jumps for a while. */
  cheer(seconds?: number): void;
  /**
   * Ceremony lighting: the court cones go out, ONE tight spotlight (real light + shaft + bright
   * pool) falls on `at`, the crowd sinks darker into the bowl (`crowd` = brightness, default 0.6).
   */
  focus(at: THREE.Vector3, crowd?: number): void;
}

/** Field rectangle (centred near the battle midpoint) and the stand ring outside it. */
const FIELD = { x0: -7.4, x1: 7.6, z0: -5.2, z1: 5.5 };
const STAND = { x: 8.25, z: -6.0, cell: 0.75, rise: 0.5, base: 1.15, rows: 9 };
/** Club banners draped down the back stand (x ranges), over rows 1–7. */
const DRAPES = [{ x0: -5.4, x1: -3.9 }, { x0: 4.1, x1: 5.6 }];
/** Overhead floodlight cones over the court: where each lands (x, z). */
const CONES: [number, number][] = [[-3.4, 1.2], [0.4, -0.3], [4.0, -1.3]];

/** Court ramps: honey hardwood boards (dark → light), the kerb stone, worn cream line paint. */
const WOOD: readonly string[] = ['#3c2820', '#563828', '#724a30', '#8e5e3a', '#a87446', '#bf8c56', '#d4a66a'];
const KERB: readonly string[] = ['#3a3644', '#4e4a58', '#66616c', '#7e7982', '#98939a', '#b2adb0'];
const PAINT: readonly string[] = ['#b8ab8c', '#d8ccae', '#efe6cc'];
const SCUFF = '#2a1c16';

/**
 * An original hardwood court, texel-matched (16 texels per unit): boards running across the
 * screen in 6-texel rows with dark seams, staggered butt joints, grain streaks and knots, each
 * board its own tone; a stone kerb round the edge; worn cream paint lines (border, halfway line,
 * centre circle, corner marks at the trainer posts) chipped where feet go; polished, lighter
 * lanes where kin and trainers stand and between them, and dark rubber scuffs in the action.
 */
function paintCourt(): THREE.CanvasTexture {
  const W = Math.round((FIELD.x1 - FIELD.x0) / TEXEL), H = Math.round((FIELD.z1 - FIELD.z0) / TEXEL);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const;
  const wood = WOOD.map(hex), kerb = KERB.map(hex), paint = PAINT.map(hex), scuff = hex(SCUFF);
  const put = (x: number, y: number, p: readonly [number, number, number]) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; img.data[i] = p[0]; img.data[i + 1] = p[1]; img.data[i + 2] = p[2]; img.data[i + 3] = 255; };
  const h2 = (x: number, y: number, s: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
  const wx = (px: number) => FIELD.x0 + (px + 0.5) * TEXEL, wz = (py: number) => FIELD.z0 + (py + 0.5) * TEXEL;
  const wear = (X: number, Z: number) => {
    let k = 0;
    for (const [sx, sz, r] of [[-1.3, 1.0, 1.25], [1.5, -1.0, 1.25], [-2.6, 2.0, 0.9], [2.85, -2.0, 0.9]] as const) k = Math.max(k, 1 - Math.hypot(X - sx, (Z - sz) * 1.2) / r);
    // The lane between the kin.
    const t = Math.max(0, Math.min(1, ((X + 1.3) * 2.8 + (Z - 1.0) * -2.0) / (2.8 * 2.8 + 2.0 * 2.0)));
    k = Math.max(k, 0.6 * (1 - Math.hypot(X - (-1.3 + 2.8 * t), Z - (1.0 - 2.0 * t)) / 0.9));
    return Math.max(0, k);
  };
  const cx = (0.1 - FIELD.x0) / TEXEL, cz = (0 - FIELD.z0) / TEXEL;
  const ROW = 6, PLANK = 52;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (e < 9) {
      // Kerb: cut stone slabs (18–26 texels long) with dark joints and a lit inner lip.
      const along = e === x || e === W - 1 - x ? y : x;
      const slab = Math.floor((along + (e === y ? 0 : 7)) / 22);
      const joint = (along + (e === y ? 0 : 7)) % 22 === 0 || e === 0;
      let v = 2.6 + (h2(slab, e === y || e === H - 1 - y ? 1 : 2, 3) - 0.5) * 1.2 + (h2(x >> 1, y >> 1, 4) - 0.5) * 0.7;
      if (e === 8) v += 1.4; else if (e === 7) v += 0.6; else if (e <= 1) v -= 0.8;
      put(x, y, kerb[joint ? 0 : bandIndex(v, x, y, KERB.length, 0.18)]!);
      continue;
    }
    const X = wx(x), Z = wz(y);
    const row = Math.floor((y - 9) / ROW), ly = (y - 9) % ROW;
    const off = Math.floor(h2(row, 0, 1) * PLANK);
    const seg = Math.floor((x + off) / PLANK), lx = (x + off) % PLANK;
    const w = wear(X, Z);
    // Board tone, grain streaks along the board, a knot now and then.
    let v = 3.1 + (h2(row, seg, 2) - 0.5) * 1.5;
    v += Math.sin(lx * 0.31 + h2(row, seg, 3) * 9 + ly * 1.9) * 0.32 + (h2(x >> 2, y, 4) - 0.5) * 0.35;
    const kx = h2(row, seg, 5) * PLANK, kn = Math.hypot((lx - kx) * 0.6, ly - 2.5);
    if (h2(row, seg, 6) > 0.6 && kn < 1.6) v -= kn < 0.8 ? 1.6 : 0.8;
    if (ly === 0) v += 0.5; else if (ly === ROW - 2) v -= 0.35;
    // Polished where feet go; the boards darken toward the kerb (the floodlights miss the edge).
    v += w * 0.75;
    if (e < 14) v -= (14 - e) * 0.22;
    let col = wood[bandIndex(v, x, y, WOOD.length)]!;
    if (ly === ROW - 1 || lx === 0) col = wood[lx === 0 && ly !== ROW - 1 ? 1 : 0]!; // seams + butt joints
    // Paint: border, halfway line, centre circle — 2 texels, chipped (more where it is trodden).
    const r = Math.hypot(x - cx, y - cz);
    const line = (e >= 16 && e < 18) || (Math.abs(x - cx) < 1 && e >= 18) || Math.abs(r - 30) < 1;
    if (line && h2(x, y, 7) > 0.12 + w * 0.55) col = paint[h2(x >> 1, y, 8) > 0.8 ? 1 : ly === 0 ? 2 : 1]!;
    // Corner marks at the trainer posts (painted L's).
    for (const [px, pz] of [[-2.6, 2.0], [2.85, -2.0]] as const) {
      const bx = (px - FIELD.x0) / TEXEL, by = (pz - FIELD.z0) / TEXEL;
      const dx = Math.abs(x - bx), dy = Math.abs(y - by);
      if (((Math.abs(dx - 13) < 1 && dy > 6 && dy <= 10) || (Math.abs(dy - 10) < 1 && dx > 9 && dx <= 13)) && h2(x, y, 9) > 0.15) col = paint[1]!;
    }
    put(x, y, col);
  }
  // Rubber scuffs: short dark streaks where kin skid and trainers turn (around the spots and lane).
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 46; i++) {
    const t = rnd();
    const X = -1.3 + 2.8 * t + (rnd() - 0.5) * 3.2, Z = 1.0 - 2.0 * t + (rnd() - 0.5) * 2.4;
    let x = (X - FIELD.x0) / TEXEL, y = (Z - FIELD.z0) / TEXEL;
    const a = rnd() * Math.PI, len = 3 + Math.floor(rnd() * 7), bend = (rnd() - 0.5) * 0.3;
    for (let k = 0; k < len; k++) {
      if (rnd() > 0.25) put(Math.round(x), Math.round(y), scuff);
      x += Math.cos(a + bend * k); y += Math.sin(a + bend * k) * 0.6;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = pixelTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Worn chalk ring for a kin spot (white, tinted by the material): a 2–3 texel painted ring with
 * ragged edges, scuffed gaps where the kin's feet go, a little chalk dust inside — no fill.
 */
function paintRing(size = 44): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const m = (size - 1) / 2;
  const h2 = (x: number, y: number, s: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot(x - m, y - m), a = Math.atan2(y - m, x - m);
    // Ring thickness wobbles 2–3 texels; two scuffed arcs where the paint is worn through.
    const outer = m - 0.3 - (h2(Math.floor(a * 6), 0, 1) > 0.6 ? 0.7 : 0);
    const worn = Math.abs(Math.sin(a * 1.5 + 0.7)) > 0.95 ? 0.5 : 0.06;
    let v = -1;
    if (r <= outer && r > m - 3.6 && h2(x, y, 2) > worn) v = h2(x, y, 3) > 0.25 ? 255 : 210;
    else if (r < m - 3.1 && r > m - 7 && h2(x, y, 4) > 0.9) v = 170; // chalk dust
    if (v < 0) continue;
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = pixelTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Spectator sprite sheet: 4 frames (idle, clap | arms up, hop) × 8 looks, 12 × 16 texels each,
 * with a 1-texel dark outline. Shirts are key magenta (tinted per spectator in the shader).
 * Looks vary skin, hair, hats, trousers and the idle pose (arms down, crossed, chin on hand, waving).
 */
const CROWD_ROWS = 8;
function paintCrowdSheet(): THREE.CanvasTexture {
  const FW = 12, FH = 16, frames = 4, rows = CROWD_ROWS;
  const c = document.createElement('canvas');
  c.width = FW * frames; c.height = FH * rows;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(c.width, c.height);
  const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const;
  const SKIN = ['#ffd9b3', '#e8b48a', '#c98c5a', '#8a5a3a', '#f2c6a0', '#a8714a', '#d8a074', '#6e4630'].map(hex);
  const HAIR = ['#3a2418', '#1d1830', '#c8822e', '#6b3f22', '#e8d8b0', '#2a1d48', '#9a3a22', '#1a1414'].map(hex);
  const HAT = [null, '#ffd23f', null, '#43d36b', null, '#ffffff', '#e04a3a', null] as const;
  const PANTSV = ['#2b2d45', '#3a3028', '#2b2d45', '#4a4a58', '#26324a', '#2b2d45', '#5a4a3a', '#30283a'].map(hex);
  const KEY = [255, 0, 255] as const, KEYD = [180, 0, 180] as const, SHOE = hex('#15131f'), DARK = hex('#15111f');
  for (let row = 0; row < rows; row++) for (let f = 0; f < frames; f++) {
    const grid: (readonly [number, number, number] | null)[][] = Array.from({ length: FH }, () => Array<null>(FW).fill(null));
    const s = (x: number, y: number, p: readonly [number, number, number]) => { if (x >= 1 && y >= 1 && x < FW - 1 && y < FH - 1) grid[y]![x] = p; };
    const up = f === 3 ? -1 : 0; // the hop frame lifts the whole body
    const skin = SKIN[row]!, hair = HAIR[row]!, PANTS = PANTSV[row]!;
    const ox = 1, oy = 1 + up;
    // Legs (seated: knees forward) and shoes.
    for (let x = 3; x <= 6; x++) { s(ox + x, oy + 11, PANTS); s(ox + x, oy + 12, PANTS); }
    s(ox + 3, oy + 13, SHOE); s(ox + 4, oy + 13, SHOE); s(ox + 5, oy + 13, SHOE); s(ox + 6, oy + 13, SHOE);
    // Torso.
    for (let y = 6; y <= 10; y++) for (let x = 2; x <= 7; x++) s(ox + x, oy + y, x === 7 || y === 10 ? KEYD : KEY);
    // Head.
    for (let y = 2; y <= 5; y++) for (let x = 3; x <= 6; x++) s(ox + x, oy + y, skin);
    for (let x = 3; x <= 6; x++) s(ox + x, oy + 1, hair);
    s(ox + 2, oy + 2, hair); s(ox + 7, oy + 2, hair); s(ox + 2, oy + 3, hair);
    if (row % 2) { s(ox + 7, oy + 3, hair); s(ox + 7, oy + 4, hair); } // longer hair
    const hat = HAT[row];
    if (hat) { const hc = hex(hat); for (let x = 2; x <= 7; x++) s(ox + x, oy + 1, hc); for (let x = 3; x <= 6; x++) s(ox + x, oy, hc); }
    s(ox + 4, oy + 3, DARK); s(ox + 6, oy + 3, DARK); // eyes
    if (f >= 2) { s(ox + 5, oy + 5, DARK); } // cheering: open mouth
    // Arms (the idle pose varies by look: arms down, crossed, chin on a hand, one arm waving).
    const pose = row % 4;
    if (f === 0 && pose === 1 && row >= 4) { for (let x = 2; x <= 7; x++) s(ox + x, oy + 8, KEYD); s(ox + 2, oy + 8, skin); s(ox + 7, oy + 8, skin); }
    else if (f === 0 && pose === 2 && row >= 4) { for (let y = 7; y <= 9; y++) s(ox + 1, oy + y, KEYD); s(ox + 1, oy + 10, skin); s(ox + 7, oy + 6, KEYD); s(ox + 7, oy + 5, skin); }
    else if (f === 0 && pose === 3 && row >= 4) { for (let y = 7; y <= 9; y++) s(ox + 1, oy + y, KEYD); s(ox + 1, oy + 10, skin); for (let y = 3; y <= 6; y++) s(ox + 8 + (y < 5 ? 1 : 0), oy + y, KEYD); s(ox + 9, oy + 2, skin); }
    else if (f === 0) { for (let y = 7; y <= 9; y++) { s(ox + 1, oy + y, KEYD); s(ox + 8, oy + y, KEYD); } s(ox + 1, oy + 10, skin); s(ox + 8, oy + 10, skin); }
    else if (f === 1) { s(ox + 1, oy + 7, KEYD); s(ox + 8, oy + 7, KEYD); s(ox + 4, oy + 8, skin); s(ox + 5, oy + 8, skin); s(ox + 1, oy + 8, KEYD); s(ox + 8, oy + 8, KEYD); }
    else if (f === 2) { for (let y = 2; y <= 6; y++) { s(ox + 1, oy + y, KEYD); s(ox + 8, oy + y, KEYD); } s(ox + 1, oy + 1, skin); s(ox + 8, oy + 1, skin); }
    else { for (let y = 1; y <= 6; y++) { s(ox + 1 - (y < 3 ? 1 : 0), oy + y, KEYD); s(ox + 8 + (y < 3 ? 1 : 0), oy + y, KEYD); } s(ox, oy, skin); s(ox + 9, oy, skin); }
    // A foam finger / scarf for some looks.
    if (row === 2 && f >= 2) { s(ox + 8, oy - 1 >= 1 ? oy - 1 : 1, hex('#ffd23f')); }
    if (row === 4) for (let x = 3; x <= 6; x++) s(ox + x, oy + 6, hex('#ffffff'));
    // 1-texel outline around the silhouette.
    const out = grid.map((r) => r.slice());
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      if (grid[y]![x]) continue;
      const n = (a: number, b: number) => !!grid[b]?.[a];
      if (n(x + 1, y) || n(x - 1, y) || n(x, y + 1) || n(x, y - 1)) out[y]![x] = DARK;
    }
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const p = out[y]![x];
      if (!p) continue;
      const i = (((rows - 1 - row) * FH + y) * c.width + f * FW + x) * 4;
      img.data[i] = p[0]; img.data[i + 1] = p[1]; img.data[i + 2] = p[2]; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = pixelTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Seat colour as chalk paint: lighter and a little chalky (desaturated toward white). */
const chalk = (hex: string) => new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.3);

/** The stadium. Spots/people match the cave convention: near kin bottom-left, far upper-right. */
export function buildStadiumArena(opts: StadiumOptions = {}): StadiumRig {
  const flags = new Set((new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('post') ?? '').split(','));
  const rng = new Rng(opts.seed ?? 23);
  const q = opts.quality ?? 'high';
  const [nearColor, farColor] = opts.colors ?? ['#ff5d73', '#3d9bff'];
  const group = new THREE.Group();
  group.name = 'hd2d-stadium';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const updates: ((t: number) => void)[] = [];

  const texConcrete = cachedTexture('stadium-concrete', () => paintBlock(71, NIGHT.concrete, 32));
  const texPaint = cachedTexture('stadium-paint', () => paintIron(73, NIGHT.neutral, 16));
  const texSteel = cachedTexture('stadium-steel', () => paintIron(79, NIGHT.steel, 16));

  // ---- field + apron (track)
  {
    const tex = track(paintCourt());
    const g = new THREE.PlaneGeometry(FIELD.x1 - FIELD.x0, FIELD.z1 - FIELD.z0);
    g.rotateX(-Math.PI / 2);
    g.translate((FIELD.x0 + FIELD.x1) / 2, 0, (FIELD.z0 + FIELD.z1) / 2);
    group.add(litMesh(g, track(new THREE.MeshLambertMaterial({ map: tex })), false, true));
  }
  const concrete = new Pieces(32);
  const paint = new Pieces(16);   // seats, barrier, flag poles (vertex-tinted neutral paint)
  const steel = new Pieces(16);   // floodlight towers
  const glow = new Pieces(16);    // lamps, LED boards (emissive)
  // Apron: a concrete ring between the field and the stands (slightly below the turf edge).
  const ax0 = -STAND.x, ax1 = STAND.x, az0 = STAND.z, az1 = 14; // runs on under the portrait camera
  concrete.aabb([ax0, -0.1, az0], [FIELD.x0, 0, az1], shade(0.78), rng, { skip: [false, false, false, true, false, false] });
  concrete.aabb([FIELD.x1, -0.1, az0], [ax1, 0, az1], shade(0.78), rng, { skip: [false, false, false, true, false, false] });
  concrete.aabb([FIELD.x0, -0.1, az0], [FIELD.x1, 0, FIELD.z0], shade(0.78), rng, { skip: [false, false, false, true, false, false] });
  concrete.aabb([FIELD.x0, -0.1, FIELD.z1], [FIELD.x1, 0, az1], shade(0.78), rng, { skip: [false, false, false, true, false, false] });

  // ---- stands: a stepped bowl on a grid (back + both sides + corners), crowd on every seat
  const C = STAND.cell;
  const rowOf = (x: number, z: number): number => {
    const dx = Math.abs(x) - STAND.x, dz = STAND.z - z;
    if (dx < 0 && dz < 0) return -1;
    if (z > 6.0 && dx < 0) return -1;
    return Math.floor(Math.max(dx, dz) / C);
  };
  const crowd: Parameters<typeof billboards>[4] = [];
  const shirtPool = [nearColor, farColor, nearColor, farColor, '#ffcf3f', '#ffffff', '#43d36b', '#b98cff', '#ff9a3d', '#7ee0ff'];
  const nx = Math.ceil((STAND.x + STAND.rows * C) / C);
  for (let j = -Math.ceil((STAND.rows * C - STAND.z + 10) / C); j * C < 9.0; j++) {
    for (let i = -nx; i < nx; i++) {
      const x0 = i * C, z0 = j * C, x = x0 + C / 2, z = z0 + C / 2;
      const row = rowOf(x, z);
      if (row < 0 || row >= STAND.rows) continue;
      const top = STAND.base + row * STAND.rise;
      const nb = (a: number, b: number) => { const r = rowOf(x + a * C, z + b * C); return r < 0 || r >= STAND.rows ? -1 : r; };
      // Hide faces against neighbours that are at least as tall.
      const cover = (a: number, b: number) => nb(a, b) >= row;
      const side = Math.abs(x) - STAND.x > STAND.z - z; // side stand (faces ±x) vs back stand (faces +z)
      const aisle = side ? Math.abs(Math.floor(z / C)) % 7 === 3 : Math.abs(Math.floor(x / C)) % 8 === 4;
      // Dark stands that fall off with height (out of the floodlights): bright treads over dark
      // risers, so every tier reads as a step with its own shadow.
      const fall = Math.max(0.38, 0.74 - row * 0.045);
      concrete.aabb([x0, 0, z0], [x0 + C, top, z0 + C], shade(aisle ? fall + 0.14 : fall + (row % 2) * 0.04), rng, {
        skip: [cover(1, 0), cover(-1, 0), false, true, cover(0, 1), cover(0, -1)], aoBottom: 0.35, topK: 1.45,
      });
      if (aisle) {
        // Aisle stairs: a half step on every tier with a painted nosing.
        const hs = STAND.rise / 2;
        const back = side ? (x < 0 ? [x0, top, z0 + 0.06, x0 + C / 2, top + hs, z0 + C - 0.06] : [x0 + C / 2, top, z0 + 0.06, x0 + C, top + hs, z0 + C - 0.06]) : [x0 + 0.06, top, z0, x0 + C - 0.06, top + hs, z0 + C / 2];
        if (row < STAND.rows - 1) concrete.aabb([back[0]!, back[1]!, back[2]!], [back[3]!, back[4]!, back[5]!], shade(fall + 0.2), rng, { aoBottom: 0.4, topK: 1.4 });
        const nose = side ? (x < 0 ? [x0 + C - 0.06, top, z0 + 0.08, x0 + C, top + 0.02, z0 + C - 0.08] : [x0, top, z0 + 0.08, x0 + 0.06, top + 0.02, z0 + C - 0.08]) : [x0 + 0.08, top, z0 + C - 0.06, x0 + C - 0.08, top + 0.02, z0 + C];
        paint.aabb([nose[0]!, nose[1]!, nose[2]!], [nose[3]!, nose[4]!, nose[5]!], new THREE.Color('#c8a24a'), rng);
        continue;
      }
      // Draped club banners lie over the back stand's seats: no fans under them.
      if (!side && row >= 1 && row <= 7 && DRAPES.some((d) => x > d.x0 && x < d.x1)) {
        paint.aabb([x0 + 0.06, top, z0], [x0 + C - 0.06, top + 0.2, z0 + 0.28], new THREE.Color('#2a2440'), rng);
        continue;
      }
      // Seat strip at the back of the step, in section colours.
      const sec = Math.floor((side ? z : x) / (C * 8) + 100) % 3;
      const seatHex = sec === 0 ? (x < 0 ? nearColor : farColor) : sec === 1 ? '#5b4aa0' : (x < 0 ? farColor : nearColor);
      const tint = new THREE.Color(seatHex).multiplyScalar(0.82 * fall);
      const [sx0, sx1, sz0, sz1] = side
        ? (x < 0 ? [x0, x0 + 0.28, z0 + 0.06, z0 + C - 0.06] : [x0 + C - 0.28, x0 + C, z0 + 0.06, z0 + C - 0.06])
        : [x0 + 0.06, x0 + C - 0.06, z0, z0 + 0.28];
      paint.aabb([sx0, top, sz0], [sx1, top + 0.2, sz1], tint, rng);
      // Empty seats: patchy, more of them high up in the neutral sections.
      const occ = (q === 'high' ? 0.84 : 0.6) * (sec === 1 && row > 4 ? 0.55 : 1) * (0.85 + 0.3 * Math.abs(Math.sin(x * 1.7 + z * 0.9)));
      if (rng.chance(Math.min(0.95, occ))) {
        const back = side ? [x < 0 ? x0 + 0.22 : x0 + C - 0.22, z] : [x, z0 + 0.22];
        crowd.push({
          at: new THREE.Vector3(back[0]!, top + 0.06, back[1]!), row: rng.int(CROWD_ROWS), seed: rng.next(), scale: 0.68 + rng.next() * 0.12,
          jump: 0.12 + rng.next() * 0.1, tint: new THREE.Color(rng.pick(shirtPool)).multiplyScalar(0.8 + rng.next() * 0.3),
          // Rows darken toward the back of the bowl (out of the floodlights): the front two rows
          // in colour with a floodlit rim on their heads, everything behind them a dim silhouette
          // with only a faint cool rim.
          shade: 1.05 - row * 0.09,
          sil: row === 0 ? 0 : row === 1 ? 0.5 : row === 2 ? 0.9 : 0.96,
          rim: row === 0 ? 0.6 : row === 1 ? 0.4 : 0.1,
        });
      }
    }
  }
  const sheet = track(paintCrowdSheet());
  const fans: Billboards = billboards(sheet, 4, CROWD_ROWS, [12 * TEXEL, 16 * TEXEL], crowd, { fps: 5, gain: 0.85, split: true, silColor: '#0c0a1a', rimColor: '#dcd6ff' });
  track(fans.mesh.geometry); track(fans.material);
  group.add(fans.mesh);
  let cheerUntil = 0, now = 0, hype = 0.1;
  updates.push((t) => {
    now = t;
    fans.update(t);
    const target = t < cheerUntil ? 0.95 : 0.1;
    hype += (target - hype) * Math.min(1, 0.08);
    fans.setHype(hype);
  });

  // ---- barrier with glowing seat boards (LED panels) around the field
  const boards = new Pieces(16);
  const barrier = (x0: number, z0: number, x1: number, z1: number, faceZ: boolean) => {
    concrete.aabb([x0, 0, z0], [x1, 1.25, z1], shade(0.7), rng, { aoBottom: 0.5 });
    paint.aabb([x0 - 0.02, 1.25, z0 - 0.02], [x1 + 0.02, 1.33, z1 + 0.02], shade(1.0), rng);
    const len = faceZ ? x1 - x0 : z1 - z0;
    const n = Math.max(1, Math.round(len / 2.2));
    for (let k = 0; k < n; k++) {
      const a = (faceZ ? x0 : z0) + (len * k) / n + 0.08, b = (faceZ ? x0 : z0) + (len * (k + 1)) / n - 0.08;
      const near = (k + (faceZ ? 0 : 1)) % 2 === 0;
      const tint = new THREE.Color(near ? nearColor : farColor).multiplyScalar(1.25);
      if (faceZ) boards.aabb([a, 0.3, z1], [b, 1.0, z1 + 0.04], tint, rng, { texOff: [0, 0] });
      else if (x0 < 0) boards.aabb([x1, 0.3, a], [x1 + 0.04, 1.0, b], tint, rng, { texOff: [0, 0] });
      else boards.aabb([x0 - 0.04, 0.3, a], [x0, 1.0, b], tint, rng, { texOff: [0, 0] });
    }
  };
  barrier(-STAND.x, STAND.z - 0.25, STAND.x, STAND.z, true);
  barrier(-STAND.x - 0.25, STAND.z, -STAND.x, 6.0, false);
  barrier(STAND.x, STAND.z, STAND.x + 0.25, 6.0, false);

  // ---- flag poles in seat colours along the barrier
  const flagList: Parameters<typeof bannerGeometry>[0] = [];
  const poles: [number, number, [number, number, number]][] = [];
  for (const x of [-6.6, -3.3, 3.5, 6.8]) poles.push([x, STAND.z - 0.12, [0, 0, 1]]);
  for (const z of [-3.0, 1.4]) { poles.push([-STAND.x - 0.12, z, [1, 0, 0]]); poles.push([STAND.x + 0.12, z, [-1, 0, 0]]); }
  poles.forEach(([x, z, n], k) => {
    paint.aabb([x - 0.05, 1.3, z - 0.05], [x + 0.05, 4.4, z + 0.05], shade(1.1), rng);
    paint.aabb([x - 0.09, 4.4, z - 0.09], [x + 0.09, 4.55, z + 0.09], new THREE.Color('#ffcf3f'), rng);
    const near = x < 0;
    void k;
    flagList.push({ top: [x + n[0] * 0.02 + (n[2] ? 0.45 : 0), 4.3, z + n[2] * 0.02 + (n[0] ? -0.45 * n[0] : 0)], normal: n, w: 0.8, h: 1.7, tint: new THREE.Color(near ? nearColor : farColor) });
  });
  const flagTex = track(paintBanner(NIGHT.neutral, NIGHT.neutral, 'orb', 16, 32));
  const flags2 = swayMaterial(flagTex);
  track(flags2.material);
  const flagMesh = litMesh(bannerGeometry(flagList), flags2.material, false, false);
  group.add(flagMesh);
  updates.push(flags2.update);

  // ---- club banners draped down the back stand, lying on the step nosings (one draw call)
  {
    const C2 = STAND.cell;
    const parts = DRAPES.map((d, k) => {
      const y0 = STAND.base + 1 * STAND.rise + 0.03, z0 = STAND.z - 1 * C2 + 0.02;
      const y1 = STAND.base + 8 * STAND.rise + 0.03, z1 = STAND.z - 8 * C2 + 0.02;
      const g = new THREE.BufferGeometry();
      const pos = [d.x0, y0, z0, d.x1, y0, z0, d.x0, y1, z1, d.x1, y1, z1];
      const tint = new THREE.Color(k === 0 ? nearColor : farColor).multiplyScalar(0.62);
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute([...tint.toArray(), ...tint.toArray(), ...tint.toArray(), ...tint.toArray()], 3));
      g.setIndex([0, 1, 2, 2, 1, 3]);
      g.computeVertexNormals();
      return g;
    });
    const merged = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    const dtex = track(paintBanner(NIGHT.neutral, NIGHT.gold, 'orb', 24, 100));
    group.add(litMesh(merged, track(new THREE.MeshLambertMaterial({ map: dtex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide })), false, true));
  }

  // ---- floodlight towers: lattice masts with tilted lamp heads, aimed at the field
  const towers = [new THREE.Vector3(-11.6, 0, -9.6), new THREE.Vector3(11.6, 0, -9.6), new THREE.Vector3(-12.8, 0, 3.4), new THREE.Vector3(12.8, 0, 3.4)];
  const headY = 12.5;
  const heads: THREE.Vector3[] = [];
  const beams: BeamSpec[] = [];
  const aim = new THREE.Vector3(0.1, 0, 0);
  for (const t of towers) {
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) steel.aabb([t.x + a * 0.4 - 0.08, 0, t.z + b * 0.4 - 0.08], [t.x + a * 0.4 + 0.08, headY, t.z + b * 0.4 + 0.08], shade(1), rng);
    for (let y = 0.6; y < headY - 0.5; y += 1.3) {
      steel.box([t.x, y + 0.65, t.z + 0.4], [0.07, 1.55, 0.07], shade(0.9), rng, [0, 0, 0.55]);
      steel.box([t.x, y + 0.65, t.z - 0.4], [0.07, 1.55, 0.07], shade(0.9), rng, [0, 0, -0.55]);
      steel.box([t.x + 0.4, y + 0.65, t.z], [0.07, 1.55, 0.07], shade(0.9), rng, [0.55, 0, 0]);
      steel.box([t.x - 0.4, y + 0.65, t.z], [0.07, 1.55, 0.07], shade(0.9), rng, [-0.55, 0, 0]);
    }
    const head = new THREE.Vector3(t.x, headY + 0.9, t.z);
    heads.push(head);
    const to = aim.clone().sub(head);
    const eu = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().lookAt(head, aim, new THREE.Vector3(0, 1, 0)), 'XYZ');
    const rot: [number, number, number] = [eu.x, eu.y, eu.z];
    const fwd = to.clone().normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(fwd).normalize();
    const up = fwd.clone().cross(right).normalize();
    steel.box([head.x, head.y, head.z], [3.0, 1.9, 0.3], shade(0.85), rng, rot);
    // 3 × 3 lamps on the face toward the field.
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const p = head.clone().addScaledVector(right, a * 0.9).addScaledVector(up, b * 0.55).addScaledVector(fwd, 0.2);
      glow.box([p.x, p.y, p.z], [0.7, 0.42, 0.12], new THREE.Color('#fffbe8').multiplyScalar(3.4), rng, rot);
    }
    // Two broad shafts per tower, crossing over the field.
    for (const s of [-0.8, 0.8]) {
      const start = head.clone().addScaledVector(right, s).addScaledVector(fwd, 0.4);
      const land = aim.clone().lerp(new THREE.Vector3(t.x, 0, t.z), 0.3).addScaledVector(right, s * 2.6 + (rng.next() - 0.5));
      beams.push({ start, end: start.clone().lerp(land, 0.93), width: [0.5, 2.2] });
    }
  }

  // ---- overhead floodlight rig: a truss across the bowl with three lamp clusters whose cones
  // fall on the court (volumetric shafts + warm pools on the boards)
  const coneSpecs: BeamSpec[] = [];
  const rigY = 10.4;
  steel.aabb([-12.5, rigY + 0.25, -1.65], [12.5, rigY + 0.45, -1.45], shade(0.7), rng);
  steel.aabb([-12.5, rigY + 0.25, -0.75], [12.5, rigY + 0.45, -0.55], shade(0.7), rng);
  for (const [cx, cz] of CONES) {
    const lamp = new THREE.Vector3(cx * 0.92, rigY, -1.1);
    steel.aabb([lamp.x - 0.5, rigY - 0.1, -1.6], [lamp.x + 0.5, rigY + 0.25, -0.6], shade(0.8), rng);
    glow.aabb([lamp.x - 0.4, rigY - 0.16, -1.5], [lamp.x + 0.4, rigY - 0.1, -0.7], new THREE.Color('#fff2d8').multiplyScalar(3.0), rng);
    coneSpecs.push({ start: lamp.clone().add(new THREE.Vector3(0, -0.2, 0)), end: new THREE.Vector3(cx, 0.05, cz), width: [0.7, 3.4] });
  }

  group.add(litMesh(concrete.build(), track(surfaceMaterial(texConcrete, undefined, true))));
  group.add(litMesh(paint.build(), track(surfaceMaterial(texPaint, undefined, true))));
  group.add(litMesh(steel.build(), track(surfaceMaterial(texSteel, undefined, true))));
  group.add(litMesh(glow.build(), track(new THREE.MeshBasicMaterial({ vertexColors: true })), false, false));
  const boardMat = track(new THREE.MeshBasicMaterial({ map: track(paintBanner(NIGHT.neutral, NIGHT.neutral, 'stripe', 32, 16)), vertexColors: true, alphaTest: 0.5 }));
  boardMat.map!.wrapS = boardMat.map!.wrapT = THREE.RepeatWrapping;
  const boardMesh = litMesh(boards.build(), boardMat, false, false);
  group.add(boardMesh);

  // ---- seat-coloured rings under the kin (and a coloured glow), near + far
  const spots: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-1.3, 0, 1.0), new THREE.Vector3(1.5, 0, -1.0)];
  const ringTex = track(paintRing(44));
  const pads = spots.map((p, i) => {
    const g = new THREE.PlaneGeometry(44 * TEXEL, 44 * TEXEL);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshLambertMaterial({ map: ringTex, alphaTest: 0.5, color: chalk(i === 0 ? nearColor : farColor), emissive: chalk(i === 0 ? nearColor : farColor).multiplyScalar(0.12), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    track(m);
    const mesh = litMesh(g, m, false, true);
    mesh.position.set(p.x, 0.006, p.z);
    mesh.renderOrder = 1;
    group.add(mesh);
    return mesh;
  }) as [THREE.Mesh, THREE.Mesh];
  // Seat-coloured glows under the rings (the first two pools: setColors() recolours them), then
  // the warm floodlight pools on the boards under the overhead cones.
  const glowPools = lightPools([
    ...spots.map((p, i) => ({ x: p.x, z: p.z, sx: 3.0, sz: 3.0, y: 0.015, color: new THREE.Color(i === 0 ? nearColor : farColor).multiplyScalar(0.3) })),
    ...CONES.map(([x, z]) => ({ x, z, sx: 5.8, sz: 4.4, y: 0.012, color: new THREE.Color('#ffe2b0').multiplyScalar(1.5) })),
  ], radialTexture('255,255,255'));
  track(glowPools.mesh.geometry); track(glowPools.material);
  group.add(glowPools.mesh);

  // ---- sky (dusk) behind the bowl
  const skyTex = track(paintSky({
    w: 320, h: 110, seed: 14,
    sky: ['#0c0a22', '#120e2e', '#19123a', '#221646', '#2e1a50', '#3d1e58', '#4f225c', '#65285e', '#7e305e', '#9a3c5c', '#b64e58'],
    horizon: 0.8, stars: 140,
    ridges: [{ y: 0.86, amp: 0.08, color: '#1c1433', lit: '#2a1c45', jag: 0.6 }],
  }));
  group.add(skyPlane(skyTex, 90, 31, new THREE.Vector3(0, 6, -28), 1.0));
  group.add(skyPlane(skyTex, 90, 31, new THREE.Vector3(28, 6, -4), 1.0, -Math.PI / 2));
  group.add(skyPlane(skyTex, 90, 31, new THREE.Vector3(-28, 6, -4), 1.0, Math.PI / 2));

  // ---- lights: back-left floodlight = shadowed key; the rest is fill and beams
  // The key (back-left tower) is kept moderate: the overhead cones' pools carry the court.
  const key = new THREE.SpotLight(new THREE.Color('#f3f1ff'), 190, 0, 0.36, 0.5, 1.5);
  key.position.copy(heads[0]!);
  key.target.position.set(0.2, 0, 0.2);
  key.castShadow = !flags.has('noshadow');
  key.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  key.shadow.camera.near = 8;
  key.shadow.camera.far = 40;
  group.add(key, key.target);
  // Low fill: the court falls off to dark outside the floodlight pools, the stands sink into the night.
  const hemi = new THREE.HemisphereLight(new THREE.Color('#b0a8e0'), new THREE.Color('#4a4050'), 1.45);
  group.add(hemi);
  const fill = new THREE.DirectionalLight(new THREE.Color('#ffe2cc'), 0.55);
  fill.position.copy(heads[1]!).add(new THREE.Vector3(0, 0, 6));
  group.add(fill, fill.target);
  if (q === 'high' && !flags.has('nopoints')) {
    const front = new THREE.SpotLight(new THREE.Color('#e8ecff'), 160, 0, 0.42, 0.6, 1.5);
    front.position.copy(heads[3]!);
    front.target.position.set(-0.4, 0, 0.4);
    group.add(front, front.target);
  }
  // The tower shafts cross high over the bowl (cool, faint); the overhead cones are the warm,
  // strong ones that land on the court — both in ONE beam mesh would share a colour, so two.
  const rays = lightBeams(beams, new THREE.Color('#e4e6ff'), 0.055);
  track(rays.mesh.geometry); track(rays.mesh.material as THREE.Material);
  if (!flags.has('norays')) group.add(rays.mesh);
  updates.push(rays.update);
  const cones = lightBeams(coneSpecs, new THREE.Color('#fff0d4'), 0.3);
  track(cones.mesh.geometry); track(cones.mesh.material as THREE.Material);
  if (!flags.has('norays')) group.add(cones.mesh);
  updates.push(cones.update);
  const motes = dustMotes(coneSpecs, q === 'high' ? 40 : 18, rng, '#fff4e0');
  track(motes.points.geometry); track(motes.points.material as THREE.Material);
  group.add(motes.points);
  updates.push(motes.update);
  const spriteLight: SpriteLight = {
    keyDir: heads[0]!.clone().sub(key.target.position).normalize(),
    keyColor: new THREE.Color('#f3f1ff').multiplyScalar(0.6),
    sky: new THREE.Color('#d8d2f4').multiplyScalar(0.62),
    ground: new THREE.Color('#4a3d5a').multiplyScalar(0.62),
    rim: new THREE.Color('#ffffff').multiplyScalar(0.55),
    // Floodlit whites are hot: a little less sprite gain keeps the sprites' ramps off the shoulder.
    spriteGain: 0.88,
  };

  const setColors = (near: string, far: string) => {
    (pads[0].material as THREE.MeshLambertMaterial).color.copy(chalk(near));
    (pads[0].material as THREE.MeshLambertMaterial).emissive.copy(chalk(near)).multiplyScalar(0.12);
    (pads[1].material as THREE.MeshLambertMaterial).color.copy(chalk(far));
    (pads[1].material as THREE.MeshLambertMaterial).emissive.copy(chalk(far)).multiplyScalar(0.12);
    const col = glowPools.mesh.geometry.attributes.color!;
    const per = 4; // vertices per pool quad; the first two pools are the seat glows
    [near, far].forEach((hex, i) => { const c = new THREE.Color(hex).multiplyScalar(0.3); for (let k = 0; k < per; k++) col.setXYZ(i * per + k, c.r, c.g, c.b); });
    col.needsUpdate = true;
  };

  return {
    group,
    spots,
    people: [new THREE.Vector3(-2.6, 0, 2.0), new THREE.Vector3(2.85, 0, -2.0)],
    trainerExit: new THREE.Vector3(2.85, 0, -4.6),
    spriteLight,
    key,
    pads,
    setColors,
    cheer(seconds = 2.2) { cheerUntil = now + seconds; },
    focus(at, crowdK = 0.6) {
      cones.mesh.visible = false;
      // Hide the court-cone pools (vertices after the two seat glows) by zeroing their colour.
      const col = glowPools.mesh.geometry.attributes.color!;
      for (let k = 8; k < col.count; k++) col.setXYZ(k, 0, 0, 0);
      col.needsUpdate = true;
      fans.material.uniforms.uGain!.value = 0.85 * crowdK;
      const from = new THREE.Vector3(at.x + 0.6, rigY, at.z - 1.2);
      const sp = new THREE.SpotLight(new THREE.Color('#fff0d8'), 190, 0, 0.32, 0.55, 1.5);
      sp.position.copy(from);
      sp.target.position.copy(at);
      group.add(sp, sp.target);
      const beam = lightBeams([{ start: from, end: at.clone().setY(0.05), width: [0.9, 4.4] }], new THREE.Color('#fff3dc'), 0.2);
      track(beam.mesh.geometry); track(beam.mesh.material as THREE.Material);
      group.add(beam.mesh);
      updates.push(beam.update);
      const pool = lightPools([{ x: at.x, z: at.z + 0.3, sx: 7.0, sz: 5.0, y: 0.014, color: new THREE.Color('#ffe6c0').multiplyScalar(0.6) }], radialTexture('255,255,255'));
      track(pool.mesh.geometry); track(pool.material);
      group.add(pool.mesh);
    },
    update(t) { for (const u of updates) u(t); },
    setPixelSize(px) { motes.setPixelSize(px); },
    dispose() { for (const d of disposables) d.dispose(); group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh || (o as THREE.Points).isPoints) m.geometry.dispose(); }); },
  };
}

/** Stadium framing over the shared battle camera: a little lower and closer (the court fills the frame). */
export const STADIUM_CAMERA: Partial<Record<LayoutName, Partial<CameraPreset>>> = { wide: { elev: 0.5, person: 0.2 }, land: { elev: 0.58 } };

export const ARENA: ArenaDef = {
  id: 'stadium',
  label: 'Arena stadium',
  match: [{ mode: 'pvp' }],
  build: (o) => buildStadiumArena({ seed: o.seed, quality: o.quality }),
  grade: stadiumGrade,
  background: '#0c0a22',
  fog: '#241a40',
  fogRange: [12, 45],
  camera: STADIUM_CAMERA,
};

/**
 * The victory podium for the stadium: three cut-stone steps (centre highest) with gilt rims and
 * the winner's colour on the risers. Two meshes (stone, paint). Returns the step tops.
 */
export function stadiumPodium(color: string, seed = 5): { group: THREE.Group; tops: [THREE.Vector3, THREE.Vector3, THREE.Vector3]; dispose(): void } {
  const rng = new Rng(seed);
  const stone = new Pieces(32), paint = new Pieces(16);
  const steps: [number, number][] = [[0, 1.05], [-1.75, 0.7], [1.75, 0.48]];
  const tops: THREE.Vector3[] = [];
  for (const [x, h] of steps) {
    stone.aabb([x - 0.82, 0, -0.75], [x + 0.82, h, 0.75], shade(x === 0 ? 1.15 : 1.0), rng, { aoBottom: 0.55, topK: 1.2 });
    paint.aabb([x - 0.86, h, -0.79], [x + 0.86, h + 0.07, 0.79], new THREE.Color('#ffcf3f'), rng);
    paint.aabb([x - 0.6, h * 0.2, 0.75], [x + 0.6, h * 0.8, 0.79], new THREE.Color(color).multiplyScalar(1.1), rng);
    tops.push(new THREE.Vector3(x, h + 0.07, 0));
  }
  // Rank pips on the risers: 1 / 2 / 3 gold studs.
  steps.forEach(([x, h], i) => { for (let k = 0; k <= i; k++) paint.aabb([x - 0.1 * i + k * 0.2 - 0.06, h * 0.5 - 0.06, 0.79], [x - 0.1 * i + k * 0.2 + 0.06, h * 0.5 + 0.06, 0.82], new THREE.Color('#fff6e0'), rng); });
  paint.aabb([-2.8, 0, -1.0], [2.8, 0.04, 1.05], new THREE.Color('#2a2250'), rng);
  const group = new THREE.Group();
  const mats = [surfaceMaterial(cachedTexture('stadium-marble', () => paintBlock(83, NIGHT.marble, 32)), undefined, true), surfaceMaterial(cachedTexture('stadium-paint', () => paintIron(73, NIGHT.neutral, 16)), undefined, true)];
  group.add(litMesh(stone.build(), mats[0]!), litMesh(paint.build(), mats[1]!));
  return { group, tops: tops as [THREE.Vector3, THREE.Vector3, THREE.Vector3], dispose: () => mats.forEach((m) => m.dispose()) };
}
