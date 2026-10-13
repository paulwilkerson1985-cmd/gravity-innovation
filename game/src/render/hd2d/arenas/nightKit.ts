// Shared pieces for the night arenas (Crown Plateau champion hall, Arena stadium): pixel-art
// painters with their own ramps, free-rotated textured boxes merged into one mesh per material,
// camera-facing flipbook sprites (fire, crowd), falling snow, swaying cloth and a pixel night
// sky. Same conventions as the cave kit (docs/HD2D.md): TEXEL density, nearest filtering,
// ramps of 6–7 hue-shifted shades with Bayer dithering, one draw call per material.
//
// No ARENA export: this file only lends helpers to summit.ts / stadium.ts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../../engine/rng';
import { PixelTile, ditherIndex, fbm, pixelTexture, type Ramp } from '../textures';
import { TEXEL, VoxelBatch } from '../arena';

export type V3 = [number, number, number];

/** Night palette (darkest first). Cool shadows lean violet, warm highlights lean gold. */
export const NIGHT = {
  slate: ['#1b1b27', '#292a39', '#393b4d', '#4d5064', '#64687d', '#7f8398', '#9da1b4'],
  wall: ['#13121f', '#1d1b2d', '#28263d', '#36334f', '#464262', '#585377', '#6e688e'],
  marble: ['#3e3a48', '#57536a', '#747088', '#9692a6', '#b6b2c2', '#d3d0db', '#efedf2'],
  gold: ['#3f2108', '#6e3e10', '#9c6118', '#c98a22', '#eab43a', '#fbd96a', '#fff3b8'],
  royal: ['#1f0c2e', '#33144a', '#4a1f68', '#642c8a', '#7f3fae', '#9e5cc9', '#c08ae0'],
  iron: ['#0f0f15', '#1a1a23', '#272733', '#363645', '#4a4a5b', '#626275', '#80809a'],
  ember: ['#3a0a05', '#7a1a08', '#c2380c', '#f06a14', '#ffa531', '#ffd56a', '#fff6c6'],
  concrete: ['#2a2838', '#3a3849', '#4c4a5c', '#615e70', '#777486', '#8f8c9c', '#aaa7b4'],
  turf: ['#0f2a1c', '#173d26', '#215231', '#2d683c', '#3d8048', '#549a56', '#76b468'],
  neutral: ['#5e5d66', '#7a7983', '#95949e', '#b0afb8', '#cbcad2', '#e4e3ea', '#f7f6fb'],
  steel: ['#10131c', '#1a2030', '#283044', '#38435c', '#4d5a76', '#687793', '#8b99b3'],
} as const satisfies Record<string, Ramp>;

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

export type BoxOpts = Parameters<VoxelBatch['box']>[4];

/**
 * Textured boxes (VoxelBatch layout: uv, tint × AO, bevel face coords) with free rotation,
 * merged into ONE geometry → one draw call per material.
 */
export class Pieces {
  private parts: THREE.BufferGeometry[] = [];
  /** Axis-aligned boxes go straight into this batch (cheaper than one geometry each). */
  readonly flat: VoxelBatch;
  constructor(readonly tile = 32) { this.flat = new VoxelBatch(tile); }

  /** Axis-aligned box from min to max. */
  aabb(min: V3, max: V3, tint: THREE.Color, rng: Rng, o: BoxOpts = {}) { this.flat.box(min, max, tint, rng, o); }

  /** A box of `size` centred on `c`, rotated by the Euler angles `r` (XYZ). */
  box(c: V3, size: V3, tint: THREE.Color, rng: Rng, r: V3 = [0, 0, 0], o: BoxOpts = {}) {
    if (r[0] === 0 && r[1] === 0 && r[2] === 0) {
      this.flat.box([c[0] - size[0] / 2, c[1] - size[1] / 2, c[2] - size[2] / 2], [c[0] + size[0] / 2, c[1] + size[1] / 2, c[2] + size[2] / 2], tint, rng, o);
      return;
    }
    const b = new VoxelBatch(this.tile);
    b.box([-size[0] / 2, -size[1] / 2, -size[2] / 2], [size[0] / 2, size[1] / 2, size[2] / 2], tint, rng, o);
    const g = b.build();
    g.applyMatrix4(tmpM.compose(new THREE.Vector3(...c), tmpQ.setFromEuler(tmpE.set(r[0], r[1], r[2])), new THREE.Vector3(1, 1, 1)));
    this.parts.push(g);
  }

  /** An octagonal-ish column: two boxes crossed at 45° (reads round at pixel scale). */
  column(x: number, z: number, y0: number, y1: number, r: number, tint: THREE.Color, rng: Rng) {
    const h = y1 - y0;
    this.box([x, y0 + h / 2, z], [r * 2, h, r * 1.42], tint, rng, [0, 0, 0], { aoBottom: 0.6 });
    this.box([x, y0 + h / 2, z], [r * 1.42, h, r * 2], tint.clone().multiplyScalar(0.92), rng, [0, 0, 0], { aoBottom: 0.6 });
    this.box([x, y0 + h / 2, z], [r * 1.72, h, r * 1.72], tint.clone().multiplyScalar(0.97), rng, [0, Math.PI / 4, 0], { aoBottom: 0.6 });
  }

  build(): THREE.BufferGeometry {
    const all = [this.flat.build(), ...this.parts];
    const nonEmpty = all.filter((g) => g.attributes.position!.count > 0);
    const out = nonEmpty.length ? mergeGeometries(nonEmpty, false) : all[0]!;
    for (const g of all) if (g !== out) g.dispose();
    out.computeBoundingBox();
    out.computeBoundingSphere();
    return out;
  }
}

/** A lit mesh (shadows on by default). */
export function litMesh(g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true): THREE.Mesh {
  const out = new THREE.Mesh(g, m);
  out.castShadow = cast;
  out.receiveShadow = receive;
  return out;
}

export const shade = (k: number) => new THREE.Color(k, k, k);

// ------------------------------------------------------------------ painters

/** Flagstone floor: staggered 1-unit courses of slabs, grout lines, lit top-left lips, wear. */
export function paintSlabs(seed: number, ramp: Ramp, size = 64, course = 16): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  t.field(fbm(size, rng, [[4, 0.45], [8, 0.35], [32, 0.2]]), 2.3, 4.4, 1.3);
  const layouts = [[16, 24, 24], [24, 16, 24], [24, 24, 16], [32, 32], [16, 16, 32]];
  for (let row = 0; row * course < size; row++) {
    const widths = rng.pick(layouts);
    let x0 = rng.int(size);
    for (const w of widths) {
      const d = rng.int(3) - 1;
      for (let y = row * course; y < row * course + course; y++) for (let x = x0; x < x0 + w; x++) {
        const ly = y - row * course, lx = x - x0;
        if (d) t.nudge(x, y, d);
        if (ly === course - 1 || lx === w - 1) t.set(x, y, 0); // grout (bottom/right)
        else if (ly === 0 || lx === 0) t.nudge(x, y, 1); // lit lip (top/left)
        else if (ly === course - 2 || lx === w - 2) t.nudge(x, y, -1);
      }
      // A chipped corner or a hairline crack now and then.
      if (rng.chance(0.35)) {
        let cx = x0 + 2 + rng.int(w - 4), cy = row * course + 2 + rng.int(course - 4);
        for (let i = 0; i < 4 + rng.int(5); i++) { t.set(cx, cy, 1); t.nudge(cx + 1, cy + 1, 1); cx += rng.chance(0.5) ? 1 : 0; cy += rng.chance(0.6) ? 1 : -1; }
      }
      x0 += w;
    }
  }
  return t;
}

/** Cut stone block face (walls, dais): soft mottling, a few chips, speckles. */
export function paintBlock(seed: number, ramp: Ramp, size = 32): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  t.field(fbm(size, rng, [[2, 0.35], [4, 0.4], [16, 0.25]]), 2.2, 4.6, 1.5);
  for (let i = 0; i < size / 2; i++) t.nudge(rng.int(size), rng.int(size), rng.chance(0.6) ? 1 : -1);
  for (let i = 0; i < 4; i++) {
    const cx = rng.int(size), cy = rng.int(size);
    t.set(cx, cy, 1); t.set(cx + 1, cy, 1); t.nudge(cx, cy - 1, 1);
  }
  return t;
}

/** Polished marble: pale field with dark meandering veins and a few gold-ish flecks. */
export function paintMarble(seed: number, ramp: Ramp, size = 32): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  const f = fbm(size, rng, [[2, 0.5], [4, 0.3], [8, 0.2]]);
  t.field(f, 3.6, 5.6, 1.2);
  const g = fbm(size, rng, [[2, 0.6], [4, 0.4]]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = Math.sin((x + y * 0.6) * 0.32 + g[y * size + x]! * 9);
    if (Math.abs(v) < 0.09) t.set(x, y, 2);
    else if (Math.abs(v) < 0.2) t.nudge(x, y, -1);
  }
  return t;
}

/** Painted steel / iron with rivet rows (stands, braziers, floodlight towers). */
export function paintIron(seed: number, ramp: Ramp, size = 16): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  t.field(fbm(size, rng, [[2, 1]]), 2.3, 3.6, 1);
  for (let y = 0; y < size; y++) { t.set(0, y, 4); t.set(size - 1, y, 1); }
  for (const y of [3, 11]) { t.set(3, y, 5); t.set(4, y + 1, 0); t.set(size - 4, y, 5); t.set(size - 3, y + 1, 0); }
  return t;
}

/** Tile a PixelTile from several ramps: `pal[ramp][shade]` indices into one combined ramp. */
function combined(...ramps: Ramp[]): { ramp: string[]; at: (r: number, s: number) => number } {
  const ramp: string[] = [];
  const offs: number[] = [];
  for (const r of ramps) { offs.push(ramp.length); ramp.push(...r); }
  return { ramp, at: (r, s) => offs[r]! + Math.max(0, Math.min(ramps[r]!.length - 1, Math.round(s))) };
}

/** RGBA canvas from an index image (-1 = transparent). */
function indexedCanvas(w: number, h: number, ramp: readonly string[], idx: Int16Array): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const rgb = ramp.map((hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const);
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i]!;
    if (v < 0) continue;
    const [r, g, b] = rgb[v]!;
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Emboss an index image: texels whose up-left neighbour is "outside" get +1, down-right −1. */
function emboss(idx: Int16Array, w: number, h: number, inside: (v: number) => boolean, lift: (v: number) => number, sink: (v: number) => number) {
  const src = idx.slice();
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const v = src[y * w + x]!;
    if (!inside(v)) continue;
    if (!inside(src[(y - 1) * w + x]!) || !inside(src[y * w + x - 1]!)) idx[y * w + x] = lift(v);
    else if (!inside(src[(y + 1) * w + x]!) || !inside(src[y * w + x + 1]!)) idx[y * w + x] = sink(v);
  }
}

/**
 * The champion crest inlaid in the hall floor (original): a gold ring with royal-violet inlay
 * and studs, a pale marble field with an eight-point star, an orb with a three-point crown.
 * Transparent outside the ring. `size` texels across (TEXEL density → size/16 units).
 */
export function paintCrest(size = 112): THREE.CanvasTexture {
  const { ramp, at } = combined(NIGHT.gold, NIGHT.royal, NIGHT.marble);
  const GOLD = 0, ROYAL = 1, MARBLE = 2;
  const idx = new Int16Array(size * size).fill(-1);
  const c = (size - 1) / 2;
  const R = size / 2 - 1;
  const set = (x: number, y: number, v: number) => { if (x >= 0 && y >= 0 && x < size && y < size) idx[y * size + x] = v; };
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - c, dy = y - c, r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const dith = (BAY[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
    if (r > R) continue;
    if (r > R - 4) set(x, y, at(GOLD, r > R - 1.5 ? 2 : 4 + (dy < 0 ? 1 : 0)));
    else if (r > R * 0.72) {
      // Royal inlay band with 16 gold studs.
      const k = (a / (Math.PI * 2)) * 16;
      const near = Math.abs(k - Math.round(k)) * (R * 0.86) * (Math.PI * 2) / 16;
      const mid = R * 0.86;
      if (Math.hypot(near, r - mid) < 2.6) set(x, y, at(GOLD, 5));
      else set(x, y, at(ROYAL, 2 + (Math.sin(a * 3 + r * 0.4) * 0.5 + 0.5) * 1.6 + (dith > 0.5 ? 0.4 : 0)));
    } else if (r > R * 0.68) set(x, y, at(GOLD, 3));
    else {
      // Marble field, softly veined.
      const v = Math.sin(dx * 0.21 + dy * 0.13 + Math.sin(dy * 0.09) * 3);
      set(x, y, at(MARBLE, Math.abs(v) < 0.08 ? 3 : 5 + (dith > 0.6 ? 1 : 0)));
    }
  }
  // Eight-point star: long gold points N/E/S/W, short royal points on the diagonals.
  const star = (len: number, half: number, ang: number, ramp: number, s: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = x - c, dy = y - c;
      const u = dx * Math.cos(ang) + dy * Math.sin(ang), v = -dx * Math.sin(ang) + dy * Math.cos(ang);
      if (u < 0 || u > len) continue;
      if (Math.abs(v) <= half * (1 - u / len)) set(x, y, at(ramp, s + (v > 0 ? -1 : 0)));
    }
  };
  for (let i = 0; i < 4; i++) star(R * 0.5, 4.5, Math.PI / 4 + (i * Math.PI) / 2, ROYAL, 4);
  for (let i = 0; i < 4; i++) star(R * 0.66, 6.5, (i * Math.PI) / 2, GOLD, 5);
  // Orb with a rim and a highlight.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot(x - c, y - c);
    if (r <= 9.5) set(x, y, r > 8 ? at(GOLD, 3) : at(ROYAL, 3 + (x - c + (y - c) < -4 ? 2 : 0)));
  }
  set(Math.round(c - 3), Math.round(c - 4), at(MARBLE, 6)); set(Math.round(c - 4), Math.round(c - 3), at(MARBLE, 6));
  // Three-point crown sitting on the orb (toward the top of the crest = the far side).
  const cy = Math.round(c - 11);
  for (let x = -7; x <= 7; x++) for (let k = 0; k < 3; k++) set(Math.round(c) + x, cy - k, at(GOLD, 4 + (k === 0 ? 1 : 0)));
  for (const px of [-6, 0, 6]) for (let k = 0; k < (px === 0 ? 7 : 5); k++) {
    const wd = k < 2 ? 1 : 0;
    for (let x = -wd; x <= wd; x++) set(Math.round(c) + px + x, cy - 3 - k, at(GOLD, 5));
  }
  for (const px of [-6, 0, 6]) set(Math.round(c) + px, cy - (px === 0 ? 10 : 8), at(GOLD, 6));
  emboss(idx, size, size, (v) => v >= 0 && v < NIGHT.gold.length, (v) => Math.min(v + 1, NIGHT.gold.length - 1), (v) => Math.max(v - 1, 0));
  const tex = pixelTexture(indexedCanvas(size, size, ramp, idx));
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Hanging banner cloth (w × h texels): field, trim border, an emblem, a swallowtail cut.
 * `emblem`: 'crown' (champion hall) or 'orb' (stadium seat banners). Neutral ramps can be
 * tinted per banner with vertex colours.
 */
export function paintBanner(field: Ramp, trim: Ramp, emblem: 'crown' | 'orb' | 'stripe', w = 16, h = 40): THREE.CanvasTexture {
  const { ramp, at } = combined(field, trim);
  const F = 0, T = 1;
  const idx = new Int16Array(w * h).fill(-1);
  const set = (x: number, y: number, v: number) => { if (x >= 0 && y >= 0 && x < w && y < h) idx[y * w + x] = v; };
  const tail = 6;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Swallowtail: a V cut out of the bottom.
    const fromBottom = h - 1 - y;
    if (fromBottom < tail && Math.abs(x - (w - 1) / 2) < (tail - fromBottom) * ((w / 2) / tail) * 0.75) continue;
    const edge = Math.min(x, w - 1 - x);
    const fold = Math.sin((x / w) * Math.PI * 3) * 0.6; // soft vertical folds
    let v = at(F, 3 + fold + (y < 3 ? 1 : 0));
    if (edge === 0) v = at(F, 1);
    else if (edge === 1 || y === 3) v = at(T, 4);
    else if (y < 3) v = at(T, 3); // rod sleeve
    set(x, y, v);
  }
  const cx = (w - 1) / 2, cy = Math.round(h * 0.45);
  if (emblem === 'crown') {
    for (let x = -4; x <= 4; x++) { set(Math.round(cx + x), cy, at(T, 5)); set(Math.round(cx + x), cy + 1, at(T, 3)); }
    for (const px of [-4, 0, 4]) for (let k = 1; k <= (px === 0 ? 4 : 3); k++) set(Math.round(cx + px), cy - k, at(T, 5));
    for (let k = 3; k <= 7; k++) for (let x = -2; x <= 2; x++) if (x * x + (k - 5) * (k - 5) <= 5) set(Math.round(cx + x), cy + k, at(T, k < 5 ? 5 : 3));
  } else if (emblem === 'orb') {
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const r = Math.hypot(x, y);
      if (r <= 4.3) set(Math.round(cx + x), cy + y, r > 3.2 ? at(T, 5) : at(F, x + y < -2 ? 5 : 2));
    }
    for (let x = -4; x <= 4; x++) set(Math.round(cx + x), cy, at(T, 5));
  } else {
    for (let y = cy - 6; y < cy + 6; y++) for (let x = 2; x < w - 2; x++) if (((x + y) >> 1) % 3 === 0) set(x, y, at(T, 4));
  }
  emboss(idx, w, h, (v) => v >= field.length, (v) => Math.min(v + 1, ramp.length - 1), (v) => Math.max(v - 1, field.length));
  const tex = pixelTexture(indexedCanvas(w, h, ramp, idx));
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Hanging cloth quads (subdivided for sway). Each banner: top centre `top`, size w × h,
 * facing `normal` (horizontal), tinted. One geometry; `swayMaterial` makes it ripple.
 */
export function bannerGeometry(list: { top: V3; normal: V3; w: number; h: number; tint?: THREE.Color }[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], sway: number[] = [];
  const idx: number[] = [];
  const segs = 6;
  list.forEach((b, k) => {
    const n = new THREE.Vector3(...b.normal).normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(n).normalize(); // to the right, seen from the front
    const base = pos.length / 3;
    const c = b.tint ?? new THREE.Color(1, 1, 1);
    for (let j = 0; j <= segs; j++) for (const i of [0, 1]) {
      const v = j / segs;
      const p = new THREE.Vector3(...b.top).addScaledVector(side, (i - 0.5) * b.w).add(new THREE.Vector3(0, -v * b.h, 0)).addScaledVector(n, 0.03);
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(i, 1 - v); col.push(c.r, c.g, c.b);
      sway.push(v * v * 0.16, k * 1.7 + i * 0.3);
    }
    for (let j = 0; j < segs; j++) { const a = base + j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Lambert cloth that ripples along its normal (amplitude grows toward the hem). */
export function swayMaterial(map: THREE.Texture): { material: THREE.MeshLambertMaterial; update: (t: number) => void } {
  const uTime = { value: 0 };
  const m = new THREE.MeshLambertMaterial({ map, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'attribute vec2 aSway;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed += objectNormal * aSway.x * sin(uTime * 1.6 + aSway.y + position.y * 1.3);');
  };
  m.customProgramCacheKey = () => 'hd2d-night-sway';
  return { material: m, update: (t) => { uTime.value = t; } };
}

// ------------------------------------------------------------------ flipbook billboards

const BB_VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aCorner;
attribute vec4 aInfo;   // x: seed, y: row (variant), z: scale, w: jump height when excited
attribute vec3 aTint;
attribute float aShade;  // per-sprite brightness (e.g. crowd rows darken toward the back)
attribute vec2 aSil;     // x: silhouette amount (back rows fall to a dark shape), y: top rim light
uniform float uTime;
uniform float uFps;
uniform float uFrames;
uniform float uRows;
uniform float uHype;    // fraction of sprites that are excited (split sheets)
uniform float uSplit;   // 1: idle frames in the first half, excited frames in the second
uniform vec2 uSize;
varying vec2 vUv;
varying vec3 vTint;
varying float vShade;
varying vec2 vSil;
void main() {
  vShade = aShade;
  vSil = aSil;
  float span = uSplit > 0.5 ? uFrames * 0.5 : uFrames;
  float excited = (uSplit > 0.5 && fract(aInfo.x * 3.71) < uHype) ? 1.0 : 0.0;
  float speed = uFps * (uSplit > 0.5 ? mix(0.3, 1.0, excited) : 1.0) * (0.75 + 0.5 * fract(aInfo.x * 7.13));
  float f = floor(mod(uTime * speed + aInfo.x * 11.0, span)) + excited * span;
  vUv = vec2((uv.x + f) / uFrames, (uv.y + aInfo.y) / uRows);
  vTint = aTint;
  vec3 c = aCenter;
  c.y += max(0.0, sin(uTime * 9.0 + aInfo.x * 40.0)) * aInfo.w * excited;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  mv.xy += aCorner * uSize * aInfo.z;
  gl_Position = projectionMatrix * mv;
}`;

const BB_FRAG = /* glsl */ `
uniform sampler2D tMap;
uniform float uGain;
uniform vec2 uTexel;     // 1 / sheet size
uniform vec3 uSilCol;    // silhouette colour (linear)
uniform vec3 uRimCol;    // rim light colour (linear)
varying vec2 vUv;
varying vec3 vTint;
varying float vShade;
varying vec2 vSil;
void main() {
  vec4 c = texture2D(tMap, vUv);
  if (c.a < 0.5) discard;
  // Key colours in the sheet take the per-sprite tint: #ff00ff full, #b400b4 shaded
  // (values are linear here: the sheet is sRGB-decoded on sampling).
  vec3 col = c.rgb;
  float isKey = step(c.g, 0.05) * step(0.3, c.r) * step(abs(c.r - c.b), 0.05);
  col = mix(col, vTint * mix(0.55, 1.0, step(0.75, c.r)), isKey);
  col = mix(col * uGain * vShade, uSilCol, vSil.x);
  // Rim light from the floodlights above: the topmost texel of the silhouette (heads, raised arms).
  if (vSil.y > 0.0 && texture2D(tMap, vUv + vec2(0.0, uTexel.y)).a < 0.5) col = mix(col, uRimCol, vSil.y);
  gl_FragColor = vec4(col, 1.0);
}`;

export interface Billboards {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  update(t: number): void;
  setHype(k: number): void;
}

/**
 * Many camera-facing quads sharing a flipbook sheet (frames across, variants down) in one
 * draw call. Corners: x −0.5..0.5, y 0..1 (anchored at the feet). Magenta texels in the sheet
 * take the per-sprite tint (shirt colours), dark magenta a shaded tint. `split`: the first half
 * of the frames loop slowly (idle), the second half fast with a hop for the `hype` fraction.
 */
export function billboards(sheet: THREE.Texture, frames: number, rows: number, size: [number, number],
  items: { at: THREE.Vector3; row: number; scale?: number; jump?: number; tint?: THREE.Color; shade?: number; seed: number; sil?: number; rim?: number }[],
  o: { fps?: number; gain?: number; split?: boolean; silColor?: THREE.ColorRepresentation; rimColor?: THREE.ColorRepresentation } = {}): Billboards {
  const n = items.length;
  const center = new Float32Array(n * 4 * 3), corner = new Float32Array(n * 4 * 2), info = new Float32Array(n * 4 * 4), tint = new Float32Array(n * 4 * 3), uv = new Float32Array(n * 4 * 2);
  const shadeA = new Float32Array(n * 4);
  const silA = new Float32Array(n * 4 * 2);
  const index: number[] = [];
  const cs = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]] as const;
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
  items.forEach((it, i) => {
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      center.set([it.at.x, it.at.y, it.at.z], v * 3);
      corner.set(cs[k]!, v * 2);
      uv.set(uvs[k]!, v * 2);
      info.set([it.seed, it.row, it.scale ?? 1, it.jump ?? 0], v * 4);
      const c = it.tint ?? new THREE.Color(1, 1, 1);
      tint.set([c.r, c.g, c.b], v * 3);
      shadeA[v] = it.shade ?? 1;
      silA[v * 2] = it.sil ?? 0; silA[v * 2 + 1] = it.rim ?? 0;
    }
    const b = i * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(center.slice(), 3));
  g.setAttribute('aCenter', new THREE.BufferAttribute(center, 3));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  g.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  g.setAttribute('aShade', new THREE.BufferAttribute(shadeA, 1));
  g.setAttribute('aSil', new THREE.BufferAttribute(silA, 2));
  g.setIndex(index);
  const material = new THREE.ShaderMaterial({
    vertexShader: BB_VERT, fragmentShader: BB_FRAG,
    uniforms: {
      tMap: { value: sheet }, uTime: { value: 0 }, uFps: { value: o.fps ?? 6 }, uFrames: { value: frames }, uRows: { value: rows },
      uHype: { value: 0 }, uSplit: { value: o.split ? 1 : 0 }, uSize: { value: new THREE.Vector2(...size) }, uGain: { value: o.gain ?? 1 },
      uTexel: { value: new THREE.Vector2(1 / Math.max(1, (sheet.image as { width?: number } | null)?.width ?? 1), 1 / Math.max(1, (sheet.image as { height?: number } | null)?.height ?? 1)) },
      uSilCol: { value: new THREE.Color(o.silColor ?? '#0b0918') },
      uRimCol: { value: new THREE.Color(o.rimColor ?? '#e8e4ff') },
    },
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  return {
    mesh, material,
    update: (t) => { material.uniforms.uTime!.value = t; },
    setHype: (k) => { material.uniforms.uHype!.value = k; },
  };
}

/** Flame flipbook: `frames` frames of a w × h texel flame (ember ramp, transparent outside). */
export function paintFlames(frames = 4, w = 12, h = 16): THREE.CanvasTexture {
  const ramp = NIGHT.ember;
  const W = w * frames;
  const idx = new Int16Array(W * h).fill(-1);
  const rng = new Rng(77);
  for (let f = 0; f < frames; f++) {
    const ph = (f / frames) * Math.PI * 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = 1 - y / (h - 1); // 1 at the bottom
      const sway = Math.sin(ph + y * 0.55) * (1 - v) * 1.6;
      const half = (w / 2 - 0.5) * Math.pow(v, 0.55) * (0.9 + 0.12 * Math.sin(ph * 2 + y));
      const dx = Math.abs(x - (w - 1) / 2 - sway);
      if (dx > half) continue;
      const core = 1 - dx / Math.max(0.5, half);
      let s = v * 3.2 + core * 3.0 - 0.6 + (rng.next() - 0.5) * 0.8;
      if (y < 3 && core < 0.7) continue; // ragged tips
      s = Math.max(1, Math.min(ramp.length - 1, s));
      idx[y * W + f * w + x] = ditherIndex(s, x, y, ramp.length);
    }
    // Sparks above the tip.
    for (let k = 0; k < 2; k++) idx[rng.int(3) * W + f * w + 2 + rng.int(w - 4)] = 5;
  }
  const tex = pixelTexture(indexedCanvas(W, h, ramp, idx));
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ------------------------------------------------------------------ snow

const SNOW_VERT = /* glsl */ `
attribute vec4 aRnd;
uniform float uTime;
uniform float uSize;
uniform vec3 uMin;
uniform vec3 uMax;
varying float vA;
void main() {
  vec3 span = uMax - uMin;
  float fall = 0.35 + aRnd.w * 0.5;
  float y = uMax.y - mod(aRnd.y * span.y + uTime * fall, span.y);
  float x = uMin.x + aRnd.x * span.x + sin(uTime * 0.7 + aRnd.w * 30.0) * 0.25;
  float z = uMin.z + aRnd.z * span.z + cos(uTime * 0.5 + aRnd.x * 20.0) * 0.15;
  vA = 0.55 + 0.45 * aRnd.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(x, y, z, 1.0);
  gl_PointSize = uSize * (aRnd.w > 0.75 ? 2.0 : 1.0);
}`;

const SNOW_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() { gl_FragColor = vec4(uColor * vA, 1.0); }`;

/** Falling snow inside a box: square 1–2 px points, one draw call. */
export function snowfall(count: number, min: THREE.Vector3, max: THREE.Vector3, rng: Rng, color: THREE.ColorRepresentation = '#dfe8ff'): { points: THREE.Points; update: (t: number) => void; setPixelSize: (px: number) => void } {
  const rnd = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) rnd[i] = rng.next();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
  const m = new THREE.ShaderMaterial({
    vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG,
    uniforms: { uTime: { value: 0 }, uSize: { value: 1 }, uMin: { value: min.clone() }, uMax: { value: max.clone() }, uColor: { value: new THREE.Color(color) } },
  });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  return { points, update: (t) => { m.uniforms.uTime!.value = t; }, setPixelSize: (px) => { m.uniforms.uSize!.value = Math.max(1, Math.round(px * 0.75)); } };
}

// ------------------------------------------------------------------ glow decals

/** Soft radial decal texture (additive light pools, flood spots). Cached per colour. */
const decalCache = new Map<string, THREE.CanvasTexture>();
export function radialTexture(rgb = '255,214,150'): THREE.CanvasTexture {
  let tex = decalCache.get(rgb);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const gr = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, `rgba(${rgb},0.6)`); gr.addColorStop(0.5, `rgba(${rgb},0.25)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 32, 32);
  tex = new THREE.CanvasTexture(c);
  tex.userData.persistent = true;
  tex.dispose = () => {};
  decalCache.set(rgb, tex);
  return tex;
}

/** Flat additive pools on the floor, merged (one draw call). Returns the mesh and its material. */
export function lightPools(list: { x: number; z: number; sx: number; sz: number; y?: number; color: THREE.Color }[], map: THREE.Texture): { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial } {
  const parts = list.map((p) => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    g.scale(p.sx, 1, p.sz);
    g.translate(p.x, p.y ?? 0.02, p.z);
    const col = new Float32Array(g.attributes.position!.count * 3);
    for (let i = 0; i < col.length; i += 3) col.set([p.color.r, p.color.g, p.color.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  const material = new THREE.MeshBasicMaterial({ map, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(g, material);
  mesh.renderOrder = 2;
  return { mesh, material };
}

// ------------------------------------------------------------------ pixel sky

export interface SkySpec {
  w: number; h: number; seed: number;
  /** Sky ramp from the zenith (first) to the horizon glow (last), dithered. */
  sky: readonly string[];
  /** Fraction of the height where the sky ramp ends (the horizon). */
  horizon: number;
  stars: number;
  moon?: { x: number; y: number; r: number };
  /** Silhouette layers, far → near: base height (fraction), amplitude, colour, snow caps. */
  ridges: { y: number; amp: number; color: string; lit?: string; snow?: boolean; jag?: number }[];
}

/** A pixel-art backdrop (gradient sky, stars, moon, ridges) — nearest-filtered, no mips. */
export function paintSky(s: SkySpec): THREE.CanvasTexture {
  const rng = new Rng(s.seed);
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(s.w, s.h);
  const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const;
  const skyRgb = s.sky.map(hex);
  const put = (x: number, y: number, rgb: readonly [number, number, number]) => {
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return;
    const i = (y * s.w + x) * 4;
    img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
  };
  const hy = s.horizon * s.h;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const v = Math.min(1, y / hy) * (s.sky.length - 1);
    put(x, y, skyRgb[ditherIndex(v, x, y, s.sky.length)]!);
  }
  for (let i = 0; i < s.stars; i++) {
    const x = rng.int(s.w), y = rng.int(Math.floor(hy * 0.85));
    const b = rng.next();
    put(x, y, b > 0.85 ? [236, 240, 255] : b > 0.5 ? [170, 182, 230] : [118, 128, 182]);
    if (b > 0.96) { put(x + 1, y, [150, 160, 215]); put(x - 1, y, [150, 160, 215]); put(x, y + 1, [150, 160, 215]); put(x, y - 1, [150, 160, 215]); }
  }
  if (s.moon) {
    const { x: mx, y: my, r } = s.moon;
    for (let y = -r - 4; y <= r + 4; y++) for (let x = -r - 4; x <= r + 4; x++) {
      const d = Math.hypot(x, y);
      const px = Math.round(mx + x), py = Math.round(my + y);
      if (d <= r) {
        const crater = Math.sin(x * 0.9 + 1) * Math.sin(y * 0.8 + 2) > 0.55 || Math.hypot(x + r * 0.3, y - r * 0.2) < r * 0.22;
        const lit = x + y < r * 0.6;
        put(px, py, crater ? [206, 210, 232] : lit ? [255, 253, 244] : [232, 234, 248]);
      } else if (d <= r + 4 && ((px + py) & 1) === 0 && d <= r + 2 + rng.next() * 2) {
        const i = (py * s.w + px) * 4;
        if (px >= 0 && py >= 0 && px < s.w && py < s.h) { img.data[i] = Math.min(255, img.data[i]! + 40); img.data[i + 1] = Math.min(255, img.data[i + 1]! + 44); img.data[i + 2] = Math.min(255, img.data[i + 2]! + 56); }
      }
    }
  }
  for (const r of s.ridges) {
    const col = hex(r.color), lit = hex(r.lit ?? r.color);
    const ph = [rng.next() * 9, rng.next() * 9, rng.next() * 9];
    const jag = r.jag ?? 1;
    const top = (x: number) => {
      const u = x / s.w;
      const n = Math.sin(u * 7 + ph[0]!) * 0.5 + Math.sin(u * 17 + ph[1]!) * 0.3 * jag + Math.abs(Math.sin(u * 31 + ph[2]!)) * 0.25 * jag;
      return Math.round((r.y - n * r.amp) * s.h);
    };
    for (let x = 0; x < s.w; x++) {
      const t0 = top(x), slope = top(x + 1) - top(x - 1);
      for (let y = Math.max(0, t0); y < s.h; y++) {
        const depth = y - t0;
        // Moon-facing slopes (descending to the right) catch light; snow on the upper band.
        if (r.snow && depth < 1 + ((x * 7) % 3 === 0 ? 1 : 0) + (slope > 0 ? 1 : 0)) put(x, y, slope > 0 ? [176, 188, 226] : [112, 122, 168]);
        else put(x, y, slope > 0 && depth < 10 ? lit : col);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = pixelTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** A vertical backdrop quad (unlit, unfogged, never casts). `gain` > 1 lets the moon bloom. */
export function skyPlane(tex: THREE.Texture, w: number, h: number, center: THREE.Vector3, gain = 1, rotY = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, fog: false, color: new THREE.Color(gain, gain, gain) }));
  m.position.copy(center);
  m.rotation.y = rotY;
  m.renderOrder = -1;
  return m;
}

/** Deterministic flicker 0..1 (sum of incommensurate sines). */
export function flicker(t: number, seed = 0): number {
  return 0.5 + 0.22 * Math.sin(t * 11.3 + seed) + 0.16 * Math.sin(t * 17.9 + seed * 2.1) + 0.12 * Math.sin(t * 5.1 + seed * 0.7);
}

export { TEXEL };
