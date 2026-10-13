// Shared building blocks for the volcanic and coast arenas (volcanic.ts, coast.ts,
// shallows.ts, cliff.ts): extra pixel painters and ramps, a floor grid with baked AO and
// height, animated pixel water with rolling foam, a GPU particle system (embers, steam,
// spray, mist, gulls), swaying alpha-tested foliage and small decals. Everything is one draw
// call per system and stays on the texel grid (TEXEL) so it matches the cave kit.
//
// These are local helpers until the shared kit (src/render/hd2d/kit/*) grows equivalents.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { CELL, TEXEL, type Heightmap, type VoxelBatch } from '../arena';
import { PixelTile, cachedTexture, ditherIndex, fbm, pixelTexture, type Ramp } from '../textures';
import type { Grade } from '../pipeline';
import { bandIndex } from './outdoorKit';

// ------------------------------------------------------------------ grade & small helpers

export function makeGrade(o: Partial<Grade> & Pick<Grade, 'gain' | 'shadowTint' | 'highTint'>): Grade {
  return {
    lift: new THREE.Vector3(0, 0, 0), gamma: new THREE.Vector3(1, 1, 1),
    // Dusty and open (HD-2D daylight): a light vignette, moderate saturation, bright highs.
    // Depth comes from local darkening (foreground occluders, wall-foot AO), not the frame edge.
    saturation: 0.8, contrast: 1.05, splitAmount: 0.12,
    vignette: 0.18, vignetteSoft: 0.7,
    tiltTop: 1.0, tiltBottom: 0.6, focusTop: 0.8, focusBottom: 0.08,
    dither: 2.0, exposure: 1.15,
    ...o,
  };
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const grey = (k: number) => new THREE.Color(k, k, k);

/** Linear colour from an sRGB hex, scaled (HDR > 1 blooms). */
export function hdr(hex: string, k = 1): THREE.Color { return new THREE.Color(hex).multiplyScalar(k); }

export { bandIndex, clumpNoise } from './outdoorKit';

/** `PixelTile.field` with band posterisation (local, so this kit owns its look). */
export function bandField(t: PixelTile, f: Float32Array, lo: number, hi: number, contrast = 1, edge = 0.14) {
  const n = t.ramp.length;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const v = Math.max(0, Math.min(1, 0.5 + (f[y * t.w + x]! - 0.5) * contrast));
    t.idx[y * t.w + x] = bandIndex(lo + v * (hi - lo), x, y, n, edge);
  }
}

// ------------------------------------------------------------------ extra ramps & painters

/** Ramps for the volcanic and coast terrains (dark → light, hue-shifted). */
export const RAMPS2 = {
  // Volcanic: warm grey-brown basalt (violet only in the darkest shades, i.e. far shadow), a
  // light dusty ash floor so the cave reads lava-lit rather than black, warm slag.
  basalt: ['#2c2128', '#403034', '#56433f', '#6d584e', '#877060', '#a28a76', '#bca48c'],
  ash: ['#3a2e2b', '#4e403a', '#63534a', '#7a6758', '#927d6a', '#a9927c', '#bfa78f'],
  slag: ['#2a1e1e', '#3d2b26', '#54392e', '#6c4a36', '#865c40'],
  lava: ['#3a0806', '#7a1408', '#c22a0a', '#f05a12', '#ff9a2a', '#ffd25a', '#fff4b0'],
  sand: ['#9a7c5a', '#b5966c', '#c9ab7e', '#d9bd8e', '#e6cc9f', '#f0dbb2', '#f8eacb'],
  wetSand: ['#5e4a38', '#73594a', '#876a54', '#9a7c60', '#ac8f6c', '#bea27c'],
  sandstone: ['#5a4234', '#73563f', '#8c6c4f', '#a48360', '#b99a73', '#cdb189', '#dfc8a2'],
  wetRock: ['#232a33', '#323c46', '#435058', '#56646a', '#6b7a7c', '#849390', '#a0ada5'],
  /** Salt-bleached sea stacks (shallows): lighter grey-green tops, cool shadows. */
  seaRock: ['#2e363c', '#3e4a50', '#53606a', '#6a7880', '#838f94', '#9eaaa8', '#bcc6be'],
  slate: ['#2a2d35', '#383c46', '#4a4e58', '#5c616a', '#71767e', '#888d92', '#a2a6a8'],
  turf: ['#2e4230', '#3b5539', '#4a6541', '#5d784a', '#728b55', '#889e63', '#a2b276'],
  drift: ['#3a3430', '#544b44', '#6e645a', '#887d70', '#a39886', '#bdb39e', '#d6cdb8'],
  whitewash: ['#4c5258', '#6a7178', '#8a9096', '#a8adb0', '#c4c7c6', '#dddcd6', '#f1efe6'],
  brick: ['#3c1412', '#5a1d17', '#7a281d', '#9a3524', '#b6472d', '#cc5c3a'],
} as const satisfies Record<string, Ramp>;

/** Columnar basalt: vertical joints, chipped facets, a few lit speckles. */
export function paintBasalt(seed: number, size = 32): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, RAMPS2.basalt);
  t.field(fbm(size, rng, [[2, 0.45], [4, 0.35], [16, 0.2]]), 1.8, 4.8, 1.6);
  // Column joints every 6–9 texels, slightly wandering; lit on the right edge.
  let x = rng.int(4);
  while (x < size) {
    let xx = x;
    for (let y = 0; y < size; y++) {
      if (rng.chance(0.12)) xx += rng.chance(0.5) ? 1 : -1;
      t.set(xx, y, 0);
      t.nudge(xx + 1, y, 1);
    }
    x += 6 + rng.int(4);
  }
  // Horizontal breaks.
  for (let i = 0; i < 5; i++) { const y = rng.int(size), x0 = rng.int(size); for (let k = 0; k < 4 + rng.int(4); k++) { t.set(x0 + k, y, 0); t.nudge(x0 + k, y - 1, 1); } }
  for (let i = 0; i < size / 2; i++) t.nudge(rng.int(size), rng.int(size), 1);
  return t;
}

/** Ash/cooled-lava floor: dark blotches, ropey pahoehoe swirls, grit. Lighter than the walls. */
export function paintAsh(seed: number, size = 64): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, RAMPS2.ash);
  bandField(t, fbm(size, rng, [[4, 0.5], [8, 0.3], [32, 0.2]]), 1.6, 5.0, 1.7);
  // Ropey ridges: short arcs, lit then dark.
  for (let i = 0; i < 10; i++) {
    const cx = rng.int(size), cy = rng.int(size), r = 3 + rng.int(4);
    for (let a = 0; a < 7; a++) {
      const ang = (a / 7) * Math.PI * 0.9 + rng.next() * 0.2;
      const px = Math.round(cx + Math.cos(ang) * r), py = Math.round(cy + Math.sin(ang) * r * 0.6);
      t.nudge(px, py, 1); t.nudge(px, py + 1, -1);
    }
  }
  for (let i = 0; i < size; i++) t.nudge(rng.int(size), rng.int(size), rng.chance(0.5) ? -1 : 1);
  return t;
}

/** Beach sand: soft dunes of dither, ripple lines, shell and pebble specks. */
export function paintSand(seed: number, size = 64, ramp: Ramp = RAMPS2.sand): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  bandField(t, fbm(size, rng, [[4, 0.55], [8, 0.3], [32, 0.15]]), 2.2, 4.6, 1.3);
  // Wind ripples: wavy dark/lit pairs.
  for (let r = 0; r < 7; r++) {
    const y0 = rng.int(size), x0 = rng.int(size), len = 8 + rng.int(12);
    for (let k = 0; k < len; k++) {
      const y = y0 + Math.round(Math.sin((k + r) * 0.5) * 1.2);
      t.nudge(x0 + k, y, -1); t.nudge(x0 + k, y - 1, 1);
    }
  }
  for (let i = 0; i < size * 0.7; i++) t.nudge(rng.int(size), rng.int(size), rng.chance(0.5) ? -1 : 1);
  for (let i = 0; i < 6; i++) { const x = rng.int(size), y = rng.int(size); t.set(x, y, ramp.length - 1); t.set(x + 1, y, ramp.length - 2); t.set(x, y + 1, 1); }
  return t;
}

/** Generic chunky rock tile on any ramp (sandstone, wet rock, slate). */
export function paintRockOn(seed: number, ramp: Ramp, size = 32, strata = false): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  t.field(fbm(size, rng, [[2, 0.4], [4, 0.4], [16, 0.2]]), 1.9, 5.0, 1.6);
  for (let i = 0; i < 5; i++) {
    const cx = rng.int(size), cy = rng.int(size), r = 3 + rng.int(4), d = rng.chance(0.5) ? 1 : -1;
    for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) if (Math.abs(j) + Math.abs(k) < r - 1) t.nudge(cx + k, cy + j, d);
  }
  if (strata) for (let y = rng.int(5); y < size; y += 5 + rng.int(4)) for (let x = 0; x < size; x++) { if (rng.chance(0.85)) { t.nudge(x, y, -1); t.nudge(x, y - 1, 1); } }
  for (let i = 0; i < 3; i++) {
    let x = rng.int(size), y = rng.int(size);
    for (let k = 0; k < 6 + rng.int(6); k++) { t.set(x, y, 0); t.nudge(x + 1, y + 1, 1); x += rng.chance(0.5) ? 1 : 0; y += 1; }
  }
  for (let i = 0; i < size / 2; i++) t.nudge(rng.int(size), rng.int(size), 1);
  return t;
}

/** Short grass turf (cliff top): blades as dark/lit vertical pairs on mottled green. */
export function paintTurf(seed: number, size = 64): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, RAMPS2.turf);
  bandField(t, fbm(size, rng, [[4, 0.5], [8, 0.3], [32, 0.2]]), 1.8, 4.6, 1.4);
  for (let i = 0; i < size * 3; i++) { const x = rng.int(size), y = rng.int(size); t.nudge(x, y, 1); t.nudge(x, y + 1, -1); }
  return t;
}

/** Weathered planks / driftwood along the tile (u = grain). */
export function paintDrift(seed: number, size = 32): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, RAMPS2.drift);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const g = Math.sin(y * 0.9 + Math.sin(x * 0.12 + y) * 1.5) * 0.6 + Math.sin(y * 2.3) * 0.25;
    t.idx[y * size + x] = ditherIndex(3 + g, x, y, RAMPS2.drift.length);
  }
  for (let i = 0; i < 6; i++) { const x = rng.int(size), y = rng.int(size); t.set(x, y, 0); t.set(x + 1, y, 1); }
  for (let y = 0; y < size; y += 8) for (let x = 0; x < size; x++) t.set(x, y, 1);
  return t;
}

/** A sprite-sheet painter with transparency: `fn` returns a ramp index or -1. */
export function paintAlpha(w: number, h: number, ramp: Ramp, fn: (x: number, y: number) => number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const rgb = ramp.map((hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = fn(x, y);
    if (i < 0) continue;
    const [r, g, b] = rgb[Math.max(0, Math.min(ramp.length - 1, Math.round(i)))]!;
    const o = (y * w + x) * 4;
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const persistentCanvas = new Map<string, THREE.CanvasTexture>();
/** Like cachedTexture, for alpha canvases. */
export function cachedCanvas(key: string, paint: () => HTMLCanvasElement): THREE.CanvasTexture {
  let tex = persistentCanvas.get(key);
  if (!tex) {
    tex = pixelTexture(paint());
    tex.userData.persistent = true;
    tex.dispose = () => {};
    persistentCanvas.set(key, tex);
  }
  return tex;
}
export { cachedTexture };

// ------------------------------------------------------------------ floor grid

/**
 * A floor plane covering the heightmap rect, `res` vertices per cell, with per-vertex height
 * (`heightAt`) and baked AO toward the walls (plus `tintAt` for wet/dry or scorch colour).
 */
export function floorGrid(hm: Heightmap, map: THREE.Texture, tileTexels: number, o: { res?: number; heightAt?: (x: number, z: number) => number; tintAt?: (x: number, z: number) => [number, number, number]; aoK?: number } = {}): THREE.BufferGeometry {
  const res = o.res ?? 1;
  const g = new THREE.PlaneGeometry(hm.nx * CELL, hm.nz * CELL, hm.nx * res, hm.nz * res);
  g.rotateX(-Math.PI / 2);
  g.translate(hm.x0 + (hm.nx * CELL) / 2, 0, hm.z0 + (hm.nz * CELL) / 2);
  const pos = g.attributes.position!;
  const uv = g.attributes.uv!;
  const col = new Float32Array(pos.count * 3);
  const tile = TEXEL * tileTexels;
  const aoK = o.aoK ?? 1;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k);
    uv.setXY(k, x / tile, -z / tile);
    if (o.heightAt) pos.setY(k, o.heightAt(x, z));
    const [i, j] = hm.cell(x - 0.01, z - 0.01);
    let near = 0;
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const v = hm.get(i + a, j + b);
      if (v < 90 && v > 0) near = Math.max(near, Math.min(v, 3) * (a === 0 && b === 0 ? 1 : 0.8));
    }
    const wide = Math.min(4, hm.maxNear(i, j, 2));
    const ao = 1 - aoK * (0.11 * near + 0.05 * wide);
    const tint = o.tintAt?.(x, z) ?? [1, 1, 1];
    col.set([ao * tint[0], ao * tint[1], ao * tint[2]], k * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ signed distance field

/**
 * Signed distance (world units) to the boundary of `land` over a rect, as a linear-filtered
 * byte texture: + over water, − over land, saturating at ±range. Two-pass chamfer on a grid.
 */
export function distanceField(rect: { x0: number; z0: number; w: number; d: number }, n: number, land: (x: number, z: number) => boolean, range: number): THREE.DataTexture {
  const m = n * n;
  const isLand = new Uint8Array(m);
  const cell = rect.w / n, cellZ = rect.d / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) isLand[j * n + i] = land(rect.x0 + (i + 0.5) * cell, rect.z0 + (j + 0.5) * cellZ) ? 1 : 0;
  const dist = (want: number) => {
    const d = new Float32Array(m).fill(1e9);
    for (let k = 0; k < m; k++) if (isLand[k] === want) d[k] = 0;
    const s = Math.min(cell, cellZ), dg = s * Math.SQRT2;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (i > 0) d[k] = Math.min(d[k]!, d[k - 1]! + s);
      if (j > 0) d[k] = Math.min(d[k]!, d[k - n]! + s);
      if (i > 0 && j > 0) d[k] = Math.min(d[k]!, d[k - n - 1]! + dg);
      if (i < n - 1 && j > 0) d[k] = Math.min(d[k]!, d[k - n + 1]! + dg);
    }
    for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
      const k = j * n + i;
      if (i < n - 1) d[k] = Math.min(d[k]!, d[k + 1]! + s);
      if (j < n - 1) d[k] = Math.min(d[k]!, d[k + n]! + s);
      if (i < n - 1 && j < n - 1) d[k] = Math.min(d[k]!, d[k + n + 1]! + dg);
      if (i > 0 && j < n - 1) d[k] = Math.min(d[k]!, d[k + n - 1]! + dg);
    }
    return d;
  };
  const toLand = dist(1), toWater = dist(0);
  const data = new Uint8Array(m * 4);
  for (let k = 0; k < m; k++) {
    const sd = isLand[k] ? -toWater[k]! : toLand[k]!;
    const v = Math.round(127.5 + Math.max(-1, Math.min(1, sd / range)) * 127.5);
    data[k * 4] = v; data[k * 4 + 1] = v; data[k * 4 + 2] = v; data[k * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------ pixel water

const WATER_VERT = /* glsl */ `
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform float uTexel;
uniform vec3 uRamp[6];
uniform vec3 uFoam;
uniform vec3 uWet;
uniform vec3 uGlint;
uniform sampler2D uShore;
uniform vec4 uRect;     // x0, z0, w, d
uniform float uRange;   // distance field range (world units)
uniform float uSwash;   // how far the swash runs up the sand (0 = none)
uniform float uDeep;    // distance at which the water reaches its darkest shade
uniform float uWaveK;   // wave band frequency (per unit of shore distance)
uniform float uWaveSpeed;
uniform float uCaps;    // open-sea whitecap density 0..1
uniform float uGlints;  // 0/1
uniform float uFar;     // world z where the horizon gradient (fake reflection) starts
varying vec3 vWorld;
#include <fog_pars_fragment>
float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.y * 4 + i.x;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[idx]) + 0.5) / 16.0;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 cell = floor(vWorld.xz / uTexel);
  vec2 p = (cell + 0.5) * uTexel;
  vec2 uv = (p - uRect.xy) / uRect.zw;
  float d = (texture2D(uShore, uv).r * 2.0 - 1.0) * uRange;
  // Swash: the water edge runs up the sand and back.
  float swPhase = uTime * 0.7 + p.x * 0.11;
  float sw = uSwash * (0.55 + 0.45 * sin(swPhase));
  float edge = d + sw;
  if (edge < -0.55 * uSwash - 0.02) discard;
  float b = bayer4(cell);
  if (edge < 0.0) {
    // Wet sand band left by the retreating swash: dithered darkening, no water.
    float a = 1.0 - clamp(-edge / (0.55 * uSwash + 0.02), 0.0, 1.0);
    if (a * 0.85 < b) discard;
    gl_FragColor = vec4(uWet, 1.0);
    #include <fog_fragment>
    return;
  }
  // Depth tone + rolling wave bands travelling toward the shore + small ripples.
  float depth = clamp(d / uDeep, 0.0, 1.0);
  float bend = sin(p.x * 0.31 + uTime * 0.21) * 0.9 + sin(p.y * 0.23 - p.x * 0.17) * 0.7;
  float wv = sin(d * uWaveK + uTime * uWaveSpeed + bend);
  float rip = sin(p.x * 2.7 + uTime * 1.4 + sin(p.y * 2.1 + uTime * 0.6)) * sin(p.y * 3.3 - uTime * 1.1 + p.x * 0.7);
  float v = 4.6 - depth * 3.4 + wv * 0.55 + rip * 0.45;
  // Fake reflection: water toward the horizon picks up the sky.
  float far = clamp((uFar - p.y) / 14.0, 0.0, 1.0);
  v += far * 1.2;
  int i0 = int(clamp(floor(v + b - 0.5), 0.0, 5.0));
  vec3 c = uRamp[0];
  for (int k = 1; k < 6; k++) if (k == i0) c = uRamp[k];
  // Foam: a ragged line on the moving edge, crests near the shore, whitecaps offshore.
  float n = hash(floor(cell / 2.0));
  float edgeFoam = 1.0 - smoothstep(0.05, 0.28 + 0.1 * n, edge);
  float crest = smoothstep(0.82, 0.97, wv) * (1.0 - smoothstep(1.0, 3.2, d)) * (0.6 + 0.4 * n);
  float caps = 0.0;
  if (uCaps > 0.0) {
    // Whitecaps cluster ALONG the travelling wave crests (not a field of specks), in clumps that
    // drift with the swell, and fade out with distance toward the horizon.
    float n3 = hash(floor((cell + vec2(floor(uTime * 0.6), 0.0)) / 3.0));
    float along = smoothstep(0.9 - uCaps * 0.06, 0.99, wv) * step(0.62 - uCaps * 0.25, n3);
    caps = along * smoothstep(1.5, 4.0, d) * (1.0 - far * 0.9);
  }
  float foam = max(edgeFoam, max(crest, caps));
  if (foam > b * 0.9 + 0.08) c = mix(uFoam, c, 0.12 * step(0.5, b));
  // Sun glints: sparse pixels that blink (they bloom).
  if (uGlints > 0.5) {
    float g = hash(cell + floor(uTime * 3.0 + n * 7.0));
    if (g > 0.9965 - far * 0.006 && d > 0.6) c = uGlint;
  }
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
}`;

export interface WaterOptions {
  /** Rect the plane (and the distance field) cover. */
  rect: { x0: number; z0: number; w: number; d: number };
  y: number;
  land: (x: number, z: number) => boolean;
  /** Ramp of 6 sRGB colours, deep → light. */
  ramp: readonly string[];
  foam?: string; wet?: string; glint?: string;
  /** Brightness multiplier for the ramp (HDR). */
  gain?: number;
  swash?: number; deep?: number; waveK?: number; waveSpeed?: number; caps?: number; glints?: boolean;
  /** z where the horizon reflection gradient starts (water further back gets lighter). */
  far?: number;
  fieldRes?: number; range?: number;
}

/** Animated pixel water: one plane, quantised to the texel grid, with foam where it meets `land`. */
export function pixelWater(o: WaterOptions): { mesh: THREE.Mesh; update(t: number): void; dispose(): void } {
  const range = o.range ?? 6;
  const field = distanceField(o.rect, o.fieldRes ?? 128, o.land, range);
  const gain = o.gain ?? 1;
  const mat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uTexel: { value: TEXEL },
      uRamp: { value: o.ramp.map((h) => new THREE.Color(h).multiplyScalar(gain)) },
      uFoam: { value: hdr(o.foam ?? '#f4fbff', 1.15 * gain) }, uWet: { value: new THREE.Color(o.wet ?? '#7d6450') },
      uGlint: { value: hdr(o.glint ?? '#fffbe8', 2.6) },
      uShore: { value: null }, uRect: { value: new THREE.Vector4(o.rect.x0, o.rect.z0, o.rect.w, o.rect.d) }, uRange: { value: range },
      uSwash: { value: o.swash ?? 0 }, uDeep: { value: o.deep ?? 5 }, uWaveK: { value: o.waveK ?? 1.6 }, uWaveSpeed: { value: o.waveSpeed ?? 1.5 },
      uCaps: { value: o.caps ?? 0 }, uGlints: { value: o.glints === false ? 0 : 1 }, uFar: { value: o.far ?? -8 },
    }]),
  });
  mat.uniforms.uShore!.value = field;
  const g = new THREE.PlaneGeometry(o.rect.w, o.rect.d, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(o.rect.x0 + o.rect.w / 2, o.y, o.rect.z0 + o.rect.d / 2);
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  return { mesh, update: (t) => { mat.uniforms.uTime!.value = t; }, dispose: () => { field.dispose(); mat.dispose(); g.dispose(); } };
}

// ------------------------------------------------------------------ particles

export type ParticleKind = 'ember' | 'steam' | 'spray' | 'mist' | 'gull' | 'rain';

const PART_VERT = /* glsl */ `
attribute vec3 aOrigin;
attribute vec3 aVel;
attribute vec4 aP;      // phase 0..1, life (s), size (world), seed
uniform float uTime;
uniform vec3 uAccel;
uniform float uWiggle;
uniform float uScale;   // px per world unit at distance 1
uniform vec2 uGrow;
varying float vK;
varying float vSeed;
varying float vSize;
#include <fog_pars_vertex>
void main() {
  float life = aP.y;
  float age = mod(uTime + aP.x * life, life);
  float k = age / life;
#ifdef GULL
  // Circling: origin = centre, vel.x = radius, vel.y = angular speed, vel.z = bob.
  float ang = uTime * aVel.y + aP.x * 6.2831;
  vec3 p = aOrigin + vec3(cos(ang) * aVel.x, sin(uTime * 0.7 + aP.w * 9.0) * aVel.z, sin(ang) * aVel.x * 0.55);
  k = 0.5;
#else
  vec3 p = aOrigin + aVel * age + 0.5 * uAccel * age * age;
  p.x += sin(uTime * 1.7 + aP.w * 30.0) * uWiggle * k;
  p.z += cos(uTime * 1.3 + aP.w * 17.0) * uWiggle * k;
#endif
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float s = aP.z * uScale * mix(uGrow.x, uGrow.y, k) / -mvPosition.z;
  gl_PointSize = max(1.0, floor(s + 0.5));
  vSize = gl_PointSize;
  vK = k; vSeed = aP.w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const PART_FRAG = /* glsl */ `
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uOpacity;
uniform float uTime;
varying float vK;
varying float vSeed;
varying float vSize;
#include <fog_pars_fragment>
float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.y * 4 + i.x;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[idx]) + 0.5) / 16.0;
}
void main() {
  float fade = smoothstep(0.0, 0.12, vK) * (1.0 - smoothstep(0.6, 1.0, vK));
  vec2 q = floor(gl_PointCoord * vSize) + 0.5;   // texel inside the point
  vec2 c = q / vSize - 0.5;
#if defined(EMBER)
  float fl = 0.6 + 0.4 * sin(uTime * 13.0 + vSeed * 50.0);
  vec3 col = mix(uColB, uColA, fl * (1.0 - vK));
  gl_FragColor = vec4(col * fade * uOpacity, 1.0);
#elif defined(GULL)
  // 7x7 gull: a flapping 'w'. Body row 3; wing tips up or level by frame.
  vec2 g = floor(gl_PointCoord * 7.0);
  float up = step(0.0, sin(uTime * 7.0 + vSeed * 40.0));
  float x = g.x, y = g.y;
  float dx = abs(x - 3.0);
  float wingY = up > 0.5 ? 3.0 - dx * 0.67 : 3.0 - min(dx, 1.0) * 0.5 + max(dx - 2.0, 0.0) * 0.7;
  bool on = abs(y - floor(wingY + 0.5)) < 0.5 || (x == 3.0 && y == 4.0);
  if (!on) discard;
  gl_FragColor = vec4(x == 3.0 ? uColB : uColA, 1.0);
#elif defined(STEAM) || defined(MIST)
  // Steam: a round soft puff, radial alpha quantised to 3 flat steps (pixel-art translucency),
  // lit warm from below (the lava) and cool on top; it grows and fades as it rises.
  float r = length(c) * 2.0;
  float lump = 0.1 * sin(atan(c.y, c.x) * 3.0 + vSeed * 20.0);
  float a = (1.0 - smoothstep(0.25, 1.0 + lump, r)) * fade * uOpacity;
  float lv = floor(a * 3.0 + 0.35) / 3.0 * 0.62;
  if (lv <= 0.0) discard;
  float below = clamp(0.45 + c.y * 1.5, 0.0, 1.0) * (1.0 - 0.6 * vK);
  gl_FragColor = vec4(mix(uColA, uColB, below), lv);
#elif defined(RAIN)
  if (abs(c.x + c.y * 0.35) > 0.5 / vSize + 0.02) discard;
  if (fade * uOpacity < bayer4(gl_FragCoord.xy)) discard;
  gl_FragColor = vec4(uColA, 1.0);
#else
  // Puffs (steam, spray, mist): a disc whose coverage is ordered-dithered (pixel-art translucency).
  float r = length(c) * 2.0;
  float lump = 0.12 * sin(atan(c.y, c.x) * 3.0 + vSeed * 20.0);
  float a = (1.0 - smoothstep(0.2, 1.0 + lump, r)) * fade * uOpacity;
  // Posterised translucency: 4 alpha steps, ordered-dithered between steps (pixel-art soft).
  float lv = floor(a * 4.0 + bayer4(gl_FragCoord.xy + vSeed * 4.0)) / 4.0;
  if (lv <= 0.0) discard;
  float lit = clamp(0.5 - c.y * 1.2 - c.x * 0.4, 0.0, 1.0);
  gl_FragColor = vec4(mix(uColB, uColA, lit), lv);
#endif
  #include <fog_fragment>
}`;

export interface EmitterSpec {
  /** Spawn box min/max. */
  min: THREE.Vector3; max: THREE.Vector3;
  /** Velocity min/max (per axis). */
  vmin: THREE.Vector3; vmax: THREE.Vector3;
  count: number;
  life: [number, number];
  size: [number, number];
}

export interface ParticleOptions {
  kind: ParticleKind;
  emitters: EmitterSpec[];
  colorA: THREE.Color; colorB: THREE.Color;
  accel?: THREE.Vector3; wiggle?: number; grow?: [number, number]; opacity?: number;
}

/** A GPU particle system (one Points draw call): positions are a pure function of time. */
export function particles(o: ParticleOptions, rng: Rng): { points: THREE.Points; update(t: number): void; setPixelSize(px: number): void; dispose(): void } {
  const origin: number[] = [], vel: number[] = [], p: number[] = [], pos: number[] = [];
  const lerp = (a: number, b: number) => a + (b - a) * rng.next();
  for (const e of o.emitters) for (let i = 0; i < e.count; i++) {
    origin.push(lerp(e.min.x, e.max.x), lerp(e.min.y, e.max.y), lerp(e.min.z, e.max.z));
    vel.push(lerp(e.vmin.x, e.vmax.x), lerp(e.vmin.y, e.vmax.y), lerp(e.vmin.z, e.vmax.z));
    p.push(rng.next(), lerp(e.life[0], e.life[1]), lerp(e.size[0], e.size[1]), rng.next());
    pos.push(0, 0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aOrigin', new THREE.Float32BufferAttribute(origin, 3));
  g.setAttribute('aVel', new THREE.Float32BufferAttribute(vel, 3));
  g.setAttribute('aP', new THREE.Float32BufferAttribute(p, 4));
  const additive = o.kind === 'ember';
  const blended = o.kind === 'steam' || o.kind === 'spray' || o.kind === 'mist';
  const m = new THREE.ShaderMaterial({
    vertexShader: PART_VERT, fragmentShader: PART_FRAG, fog: o.kind !== 'ember',
    defines: { [o.kind.toUpperCase()]: 1 },
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uAccel: { value: o.accel ?? new THREE.Vector3() }, uWiggle: { value: o.wiggle ?? 0 },
      uScale: { value: 200 }, uGrow: { value: new THREE.Vector2(...(o.grow ?? [1, 1])) },
      uColA: { value: o.colorA }, uColB: { value: o.colorB }, uOpacity: { value: o.opacity ?? 1 },
    }]),
    transparent: additive || blended, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = additive ? 6 : 4;
  return {
    points,
    update: (t) => { m.uniforms.uTime!.value = t; },
    // Internal px per world unit at distance 1 ≈ buffer height / (2 tan(fov/2)); the stage
    // calls setPixelSize with ~1.5–2, so scale relative to the 480 px high tier.
    setPixelSize: (px) => { m.uniforms.uScale!.value = 840 * (px / 2); },
    dispose: () => { g.dispose(); m.dispose(); },
  };
}

// ------------------------------------------------------------------ foliage (swaying cards)

/**
 * Alpha-tested foliage cards (grass tufts, dune grass, palm fronds, kelp) on one atlas, lit
 * with Lambert, swaying in the vertex shader by an `aSway` weight (0 at the root, 1 at the
 * tip). Cast shadows through a matching alpha-tested depth material.
 */
export class FoliageBatch {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private sway: number[] = [];

  /** A card from `a` (root left) … with `up` and `right` edge vectors; uv rect [u0,v0,u1,v1] in the atlas. */
  card(root: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, rect: [number, number, number, number], tint: THREE.Color, swayRoot = 0, swayTip = 1, normal?: THREE.Vector3) {
    const a = root.clone().addScaledVector(right, -0.5), b = root.clone().addScaledVector(right, 0.5);
    const c = b.clone().add(up), d = a.clone().add(up);
    const n = normal ?? new THREE.Vector3(0, 1, 0).lerp(right.clone().cross(up).normalize(), 0.35).normalize();
    const [u0, v0, u1, v1] = rect;
    const corners: [THREE.Vector3, number, number, number][] = [[a, u0, v0, swayRoot], [b, u1, v0, swayRoot], [c, u1, v1, swayTip], [d, u0, v1, swayTip]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const [p, u, v, s] = corners[i]!;
      this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(u, v); this.sway.push(s);
      this.col.push(tint.r, tint.g, tint.b);
    }
  }

  /** A tuft: 2–3 crossed upright cards. */
  tuft(at: THREE.Vector3, w: number, h: number, rect: [number, number, number, number], tint: THREE.Color, rng: Rng, n = 2) {
    const r0 = rng.next() * Math.PI;
    for (let k = 0; k < n; k++) {
      const a = r0 + (k * Math.PI) / n;
      this.card(at, new THREE.Vector3(Math.cos(a) * w, 0, Math.sin(a) * w), new THREE.Vector3((rng.next() - 0.5) * 0.15 * h, h, (rng.next() - 0.5) * 0.15 * h), rect, tint, 0, 1);
    }
  }

  /** A free quad a-b-c-d with per-corner uv and sway. */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, uv: [number, number][], n: THREE.Vector3, tint: THREE.Color, sway: [number, number, number, number]) {
    const cs = [a, b, c, d];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = cs[i]!;
      this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(uv[i]![0], uv[i]![1]); this.sway.push(sway[i]!);
      this.col.push(tint.r, tint.g, tint.b);
    }
  }

  get empty() { return this.pos.length === 0; }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** Material for FoliageBatch geometry: Lambert, alpha-tested, double-sided, wind sway. */
export function foliageMaterial(map: THREE.Texture, wind: { strength: number; speed: number; dir?: THREE.Vector2 }): { material: THREE.MeshLambertMaterial; depth: THREE.MeshDepthMaterial; update(t: number): void } {
  const uTime = { value: 0 };
  const dir = wind.dir ?? new THREE.Vector2(1, 0.3).normalize();
  const swayChunk = /* glsl */ `
    #include <begin_vertex>
    {
      float ph = position.x * 0.9 + position.z * 0.7;
      float s = aSway * aSway * ${wind.strength.toFixed(3)};
      float w = sin(uTime * ${wind.speed.toFixed(3)} + ph) * 0.6 + sin(uTime * ${(wind.speed * 2.3).toFixed(3)} + ph * 1.7) * 0.25 + 0.35;
      transformed.x += ${dir.x.toFixed(3)} * w * s;
      transformed.z += ${dir.y.toFixed(3)} * w * s;
      transformed.y -= abs(w) * s * 0.15;
    }`;
  const patch = (sh: THREE.WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'attribute float aSway;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', swayChunk);
  };
  const material = new THREE.MeshLambertMaterial({ map, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  material.onBeforeCompile = patch;
  material.customProgramCacheKey = () => `hd2d-foliage-${wind.strength}-${wind.speed}`;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 });
  depth.onBeforeCompile = patch;
  depth.customProgramCacheKey = () => `hd2d-foliage-depth-${wind.strength}-${wind.speed}`;
  return { material, depth, update: (t) => { uTime.value = t; } };
}

/**
 * Foliage atlas (64×64): [0] grass tuft (0..16 × 0..16), [1] dune grass (16..32 × 0..32),
 * [2] palm frond (32..64 × 0..16), [3] kelp ribbon (0..8 × 16..48), [4] fern/shrub (32..64 × 16..40),
 * [5] flowers/sea-pinks (8..16 × 16..32). Returned rects are in UV space.
 */
export const ATLAS = {
  grass: [0, 0, 16, 16], dune: [16, 0, 32, 32], frond: [32, 0, 64, 16], kelp: [0, 16, 8, 48], shrub: [32, 16, 64, 40], pinks: [8, 16, 16, 32],
} as const;
export function atlasRect(r: readonly [number, number, number, number]): [number, number, number, number] {
  // Canvas y grows downward; UV v grows upward: paint rows top→bottom means v1 = 1 - y0/64.
  return [r[0] / 64, 1 - r[3] / 64, r[2] / 64, 1 - r[1] / 64];
}

export const FOLIAGE_RAMP: Ramp = ['#1a2a1a', '#24401f', '#335a26', '#4a742e', '#66903a', '#8aac4a', '#b3c866', '#d9d48a', '#7a4a2a', '#a06a3a', '#4a2a4a', '#d35a8a', '#f0a0c0', '#5a5a24', '#8a7a34'];

export function foliageAtlas(): THREE.CanvasTexture {
  return cachedCanvas('foliage-atlas', () => {
    const rng = new Rng(77);
    // Precompute blades for tufts and dune grass.
    const blades = (x0: number, w: number, h: number, n: number, lean: number) => Array.from({ length: n }, () => ({ x: x0 + 1 + rng.next() * (w - 2), h: h * (0.55 + rng.next() * 0.45), lean: (rng.next() - 0.5) * lean }));
    const tuft = blades(0, 16, 15, 9, 6);
    const dune = blades(16, 16, 31, 11, 10);
    const kelpPh = rng.next() * 6;
    const shrubBlobs = Array.from({ length: 9 }, () => ({ x: 34 + rng.next() * 28, y: 18 + rng.next() * 18, r: 3 + rng.next() * 4 }));
    return paintAlpha(64, 64, FOLIAGE_RAMP, (x, y) => {
      // Grass tuft: blades from the bottom (y = 15) upward.
      if (x < 16 && y < 16) {
        const yy = 15 - y;
        for (const b of tuft) { const bx = b.x + (b.lean * yy) / 15; if (yy <= b.h && Math.abs(x - bx) < (yy < b.h - 2 ? 0.9 : 0.5)) return 2 + Math.min(4, Math.floor((yy / b.h) * 4) + (x > bx ? 1 : 0)); }
        return -1;
      }
      // Dune grass: tall thin blades, sandy-green tips.
      if (x >= 16 && x < 32 && y < 32) {
        const yy = 31 - y;
        for (const b of dune) { const bx = b.x + (b.lean * yy * yy) / (31 * 31); if (yy <= b.h && Math.abs(x - bx) < (yy < b.h * 0.6 ? 0.8 : 0.5)) return yy > b.h * 0.75 ? 7 : 3 + Math.floor((yy / b.h) * 3); }
        return -1;
      }
      // Palm frond: a midrib along x with leaflets hanging (drawn root at x = 32, tip at 63).
      if (x >= 32 && y < 16) {
        const u = (x - 32) / 31; // 0 root → 1 tip
        const rib = 4 + u * u * 6;
        const half = (1 - u * 0.85) * 6;
        const dy = y - rib;
        if (Math.abs(dy) < 0.7) return 8;
        if (dy > 0 && dy < half + 1.5 && ((x + Math.floor(dy * 0.6)) % 3 !== 0)) return 3 + (dy < half * 0.5 ? 2 : 1) + (u > 0.7 ? -1 : 0);
        if (dy < 0 && -dy < half * 0.45 && x % 3 !== 1) return 5;
        return -1;
      }
      // Kelp ribbon (0..8 × 16..48), wavy.
      if (x < 8 && y >= 16 && y < 48) {
        const yy = y - 16;
        const cx = 4 + Math.sin(yy * 0.35 + kelpPh) * 1.6;
        const w = 1.4 + Math.sin(yy * 0.9) * 0.6;
        if (Math.abs(x - cx) < w) return x < cx ? 13 : 14;
        return -1;
      }
      // Sea pinks: tiny pink flower heads on stalks.
      if (x >= 8 && x < 16 && y >= 16 && y < 32) {
        const yy = 31 - y, xx = x - 8;
        if ((xx === 2 && yy < 9) || (xx === 5 && yy < 11)) return 3;
        if ((Math.abs(xx - 2) + Math.abs(yy - 10) < 2) || (Math.abs(xx - 5) + Math.abs(yy - 12) < 2)) return yy > 10 ? 12 : 11;
        return -1;
      }
      // Shrub: clustered blobs with a lit top-left.
      if (x >= 32 && y >= 16 && y < 40) {
        let best = -1;
        for (const b of shrubBlobs) {
          const dx = x - b.x, dy = y - b.y, d = Math.hypot(dx, dy);
          if (d < b.r) best = Math.max(best, d < b.r - 1 ? (dx + dy < -b.r * 0.4 ? 5 : dx + dy > b.r * 0.5 ? 2 : 3) : 1);
        }
        return best;
      }
      return -1;
    });
  });
}

// ------------------------------------------------------------------ decals

/** A flat decal on the floor (y), from a canvas texture; optionally additive. */
export function decal(tex: THREE.Texture, cx: number, y: number, cz: number, w: number, d: number, o: { additive?: boolean; color?: THREE.Color; opacity?: number; rot?: number } = {}): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  if (o.rot) g.rotateY(o.rot);
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: o.opacity ?? 1, color: o.color ?? new THREE.Color(1, 1, 1), blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(cx, y, cz);
  mesh.renderOrder = 2;
  return mesh;
}

/** A soft radial glow texture (for additive light pools). */
export function glowTexture(rgba: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const gr = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, rgba); gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/**
 * Battle-ground marking (trainer battles): a pixel ring with a centre line and two start
 * boxes, painted into an alpha texture (lighter raked/chalked texels with a dark edge).
 * `light`/`dark` are sRGB hexes. 128×128 texels over `size` world units.
 */
export function battleMarking(light: string, dark: string): THREE.CanvasTexture {
  return cachedCanvas(`marking-${light}-${dark}`, () => {
    const n = 128;
    return paintAlpha(n, n, [dark, light], (x, y) => {
      const cx = x - n / 2 + 0.5, cy = y - n / 2 + 0.5;
      // Ellipse ring (wider than deep), centre line and centre circle; texels dropped for wear.
      const r = Math.hypot(cx / 1.0, cy / 0.62);
      const wear = ((x * 7 + y * 13) % 11) === 0;
      if (wear) return -1;
      const ring = Math.abs(r - 58) < 1.4;
      const ringShadow = Math.abs(r - 59.6) < 0.6;
      const mid = Math.abs(cx + cy * 0.0) < 1.0 && Math.abs(cy) < 36;
      const centre = Math.abs(Math.hypot(cx, cy) - 9) < 1.1;
      if (ring || mid || centre) return 1;
      if (ringShadow) return 0;
      return -1;
    });
  });
}

/**
 * Battle ground worn into the floor (trainer duels on natural ground), as an alpha decal: a
 * trodden oval of compacted earth (dark clumps in a band where feet circle, a few polished light
 * clumps in the middle), scuffs dug in at both kin spots and pebbles kicked out to the rim. Lay it
 * along the kin line: `decal(tex, 0.1, y, 0, TRODDEN_SIZE, TRODDEN_SIZE, { rot: Math.atan2(2.0, 2.8) })`.
 * Colours are sRGB hexes: compacted shade, polished shade, and pebble [lit, mid, dark].
 */
export const TRODDEN_SIZE = 120 * TEXEL;
export function troddenMarking(dark: string, light: string, pebble: readonly [string, string, string], strength = 1): THREE.CanvasTexture {
  return cachedCanvas(`trodden-${dark}-${light}-${pebble.join('')}-${strength}`, () => {
    const n = 120, m = n / 2;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(n, n);
    const put = (x: number, y: number, hex: string, a: number) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= n || y >= n) return;
      const i = (y * n + x) * 4;
      img.data[i] = parseInt(hex.slice(1, 3), 16); img.data[i + 1] = parseInt(hex.slice(3, 5), 16); img.data[i + 2] = parseInt(hex.slice(5, 7), 16);
      img.data[i + 3] = Math.max(img.data[i + 3]!, Math.round(Math.min(255, a * strength)));
    };
    const h2 = (x: number, y: number, s: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
    const RU = 3.2 / TEXEL, RV = 2.0 / TEXEL;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x + 0.5 - m, v = y + 0.5 - m;
      const r = Math.hypot(u / RU, v / RV) + Math.sin(u * 0.13 + v * 0.08) * 0.05 + (h2(x >> 2, y >> 2, 3) - 0.5) * 0.08;
      if (r > 1.12) continue;
      const clump = h2(x >> 1, y >> 1, 5);
      const band = Math.max(0, 1 - Math.abs(r - 0.84) / 0.24);
      if (band > 0 && clump < band * 0.7) put(x, y, dark, 60 + band * 40);
      else if (r < 0.6 && clump < 0.4) put(x, y, light, 46);
    }
    const rng = new Rng(611);
    const spot = 1.72 / TEXEL;
    for (const sx of [-spot, spot]) for (let k = 0; k < 9; k++) {
      const a = rng.next() * Math.PI * 2, d = (0.35 + rng.next() * 0.55) / TEXEL;
      let px = m + sx + Math.cos(a) * d, py = m + Math.sin(a) * d * 0.8;
      const dir = (rng.next() - 0.5) * 1.2;
      for (let i = 0, len = 4 + rng.int(6); i < len; i++) {
        put(px, py, dark, 150); put(px, py - 1, light, 90);
        px += Math.cos(dir); py += Math.sin(dir) * 0.6 + (rng.next() - 0.5) * 0.6;
      }
    }
    for (let k = 0; k < 34; k++) {
      const a = rng.next() * Math.PI * 2, r = 0.95 + rng.next() * 0.3;
      const px = m + Math.cos(a) * RU * r, py = m + Math.sin(a) * RV * r;
      put(px, py, pebble[0], 255); if (rng.chance(0.6)) put(px + 1, py, pebble[1], 255);
      put(px, py + 1, pebble[2], 255); if (rng.chance(0.3)) put(px + 1, py + 1, pebble[2], 255);
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

/** Dispose helper: geometry of every mesh under a group + extra disposables. */
export function disposeGroup(group: THREE.Group, extra: { dispose(): void }[]) {
  for (const d of extra) d.dispose();
  group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh || (o as THREE.Points).isPoints) m.geometry.dispose(); });
}

// ------------------------------------------------------------------ more painters

/** Worn flagstones: irregular slabs with dark joints, lit edges, moss in some joints. */
export function paintFlags(seed: number, size = 64, ramp: Ramp = RAMPS2.whitewash): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  bandField(t, fbm(size, rng, [[4, 0.5], [16, 0.5]]), 2.4, 4.4, 1.2);
  // Rows of slabs with staggered joints.
  const rowH = 16;
  for (let r = 0; r < size / rowH; r++) {
    const y0 = r * rowH;
    for (let x = 0; x < size; x++) { t.set(x, y0, 0); t.nudge(x, y0 + 1, 1); }
    let x = rng.int(8) + r * 7;
    while (x < size + r * 7) {
      for (let y = y0; y < y0 + rowH; y++) { t.set(x, y, 0); t.nudge(x + 1, y, 1); }
      // Per-slab tone shift.
      const w = 12 + rng.int(10), d = rng.chance(0.4) ? (rng.chance(0.5) ? 1 : -1) : 0;
      if (d) for (let y = y0 + 1; y < y0 + rowH; y++) for (let k = 2; k < w; k++) t.nudge(x + k, y, d);
      x += w;
    }
  }
  for (let i = 0; i < 4; i++) {
    let x = rng.int(size), y = rng.int(size);
    for (let k = 0; k < 5 + rng.int(5); k++) { t.set(x, y, 1); x += rng.chance(0.5) ? 1 : 0; y += rng.chance(0.6) ? 1 : 0; }
  }
  return t;
}

/** Palm bark: stacked rings (u around, v up). */
export function paintBark(seed: number, size = 16, ramp: Ramp = RAMPS2.sandstone): PixelTile {
  const rng = new Rng(seed);
  const t = new PixelTile(size, size, ramp);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const ring = (y % 4) / 3;
    t.idx[y * size + x] = ditherIndex(2.2 + ring * 2.2 + (rng.next() - 0.5) * 0.6, x, y, ramp.length);
  }
  for (let y = 0; y < size; y += 4) for (let x = 0; x < size; x++) t.set(x, y, 1);
  return t;
}

// ------------------------------------------------------------------ props: palms, trees, caps

/**
 * A palm: a curved trunk of tapering ringed segments (into `trunk`), a crown of drooping
 * fronds (two cards each, into `leaves`). `lean` is the trunk's horizontal drift at the top.
 */
export function palmTree(trunk: VoxelBatch, leaves: FoliageBatch, base: THREE.Vector3, height: number, lean: THREE.Vector2, rng: Rng, tint = new THREE.Color(1, 1, 1)) {
  const segs = 7;
  let prev = base.clone();
  for (let s = 1; s <= segs; s++) {
    const k = s / segs;
    const bend = k * k * (1.2 - 0.2 * k);
    const p = base.clone().add(new THREE.Vector3(lean.x * bend, height * k, lean.y * bend));
    const mid = prev.clone().add(p).multiplyScalar(0.5);
    const len = p.distanceTo(prev);
    const w = 0.32 - k * 0.15;
    orientedBox(trunk, mid, new THREE.Vector3(w, len + 0.05, w), p.clone().sub(prev), tint.clone().multiplyScalar(0.92 + (s % 2) * 0.1), rng);
    prev = p;
  }
  const top = prev;
  // Coconuts.
  for (let i = 0; i < 3; i++) { const a = rng.next() * Math.PI * 2; trunk.rotBox([top.x + Math.cos(a) * 0.14, top.y - 0.12, top.z + Math.sin(a) * 0.14], [0.16, 0.16, 0.16], a, new THREE.Color('#6a4a2a'), rng); }
  // 6–8 long fronds that arch up out of the crown and droop (three cards each: rise, arch, droop).
  const n = 6 + rng.int(3);
  const frond = atlasRect(ATLAS.frond);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.next() * 0.35;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const len = 1.6 + rng.next() * 0.5;
    const side = new THREE.Vector3(-out.z, 0, out.x);
    const p1 = top.clone().addScaledVector(out, len * 0.3).add(new THREE.Vector3(0, 0.22, 0));
    const p2 = top.clone().addScaledVector(out, len * 0.65).add(new THREE.Vector3(0, 0.05, 0));
    const tip = top.clone().addScaledVector(out, len).add(new THREE.Vector3(0, -0.75 - rng.next() * 0.35, 0));
    const tintL = new THREE.Color(1, 1, 1).multiplyScalar(0.88 + rng.next() * 0.22);
    // The atlas frond is drawn root (u0) → tip (u1) along x; its width runs along v.
    const [u0, v0, u1, v1] = frond;
    const ua = u0 + (u1 - u0) * 0.3, ub = u0 + (u1 - u0) * 0.65;
    frondCard(leaves, top, p1, side, 0.6, [u0, v0, ua, v1], tintL, 0.25, 0.5);
    frondCard(leaves, p1, p2, side, 0.66, [ua, v0, ub, v1], tintL, 0.5, 0.8);
    frondCard(leaves, p2, tip, side, 0.56, [ub, v0, u1, v1], tintL.clone().multiplyScalar(0.92), 0.8, 1.0);
  }
}

/** A frond segment as a card spanning a → b, `w` wide across `side`; atlas u runs a → b. */
function frondCard(leaves: FoliageBatch, a: THREE.Vector3, b: THREE.Vector3, side: THREE.Vector3, w: number, rect: [number, number, number, number], tint: THREE.Color, s0: number, s1: number) {
  // FoliageBatch.card spans `right` across and `up` along; map the atlas so u follows the frond.
  const along = b.clone().sub(a);
  const n = along.clone().cross(side).normalize();
  if (n.y < 0) n.negate();
  const [u0, v0, u1, v1] = rect;
  leaves.quad(a.clone().addScaledVector(side, -w / 2), a.clone().addScaledVector(side, w / 2), b.clone().addScaledVector(side, w / 2), b.clone().addScaledVector(side, -w / 2), [[u0, v1], [u0, v0], [u1, v0], [u1, v1]], n, tint, [s0, s0, s1, s1]);
}

/**
 * A windswept tree (cliff tops): a crooked trunk bent downwind and a lopsided canopy of shrub
 * cards streaming away from the wind.
 */
export function windsweptTree(trunk: VoxelBatch, leaves: FoliageBatch, base: THREE.Vector3, height: number, wind: THREE.Vector2, rng: Rng) {
  const segs = 5;
  let prev = base.clone();
  for (let s = 1; s <= segs; s++) {
    const k = s / segs;
    const p = base.clone().add(new THREE.Vector3(wind.x * k * k * 1.4 + (rng.next() - 0.5) * 0.15, height * k, wind.y * k * k * 1.4));
    const mid = prev.clone().add(p).multiplyScalar(0.5);
    orientedBox(trunk, mid, new THREE.Vector3(0.26 - k * 0.12, p.distanceTo(prev) + 0.06, 0.26 - k * 0.12), p.clone().sub(prev), new THREE.Color(0.75, 0.68, 0.62), rng);
    prev = p;
  }
  const rect = atlasRect(ATLAS.shrub);
  const top = prev;
  for (let i = 0; i < 14; i++) {
    const t = rng.next();
    const c = top.clone().add(new THREE.Vector3(wind.x * t * 1.6 + (rng.next() - 0.5) * 0.8, (rng.next() - 0.4) * 0.6 - t * 0.2, wind.y * t * 1.6 + (rng.next() - 0.5) * 0.8));
    const s = 0.9 + rng.next() * 0.5;
    const a = rng.next() * Math.PI;
    leaves.card(c.clone().add(new THREE.Vector3(0, -s * 0.45, 0)), new THREE.Vector3(Math.cos(a) * s, 0, Math.sin(a) * s), new THREE.Vector3(0, s * 0.8, 0), rect, new THREE.Color(1, 1, 1).multiplyScalar(0.8 + rng.next() * 0.3), 0.6, 1);
  }
}

/**
 * Caps on every terrace column top (grass/sand mats): a thin slab slightly wider than the
 * column, so its lip overhangs — the classic HD-2D grass-topped rock tier.
 */
export function terraceCaps(hm: Heightmap, batch: VoxelBatch, rng: Rng, o: { thick?: number; baseY?: number; skip?: (x: number, z: number, lv: number) => boolean } = {}) {
  const th = o.thick ?? 0.1;
  for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
    const lv = hm.get(i, j);
    if (lv <= 0) continue;
    const x = hm.cx(i), z = hm.cz(j);
    if (o.skip?.(x, z, lv)) continue;
    const y = (o.baseY ?? 0) + lv * 0.7 + 0.01;
    const over = 0.03 + rng.next() * 0.03;
    const covered = (a: number, b: number) => hm.get(i + a, j + b) >= lv + 0.15;
    batch.box([x - CELL / 2 - over, y - th, z - CELL / 2 - over], [x + CELL / 2 + over, y + rng.next() * 0.03, z + CELL / 2 + over], grey(0.92 + rng.next() * 0.16), rng, {
      skip: [covered(1, 0), covered(-1, 0), false, true, covered(0, 1), covered(0, -1)], aoBottom: 0.75, topK: 1.15,
    });
  }
}

/**
 * A box of `size` centred at `center` whose local +Y points along `axis` (any direction),
 * emitted as six quads into a VoxelBatch (texel-density UVs, side AO toward the base).
 */
export function orientedBox(batch: VoxelBatch, center: THREE.Vector3, size: THREE.Vector3, axis: THREE.Vector3, tint: THREE.Color, rng: Rng, spin = 0, aoBottom = 0.72) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin));
  const h = size.clone().multiplyScalar(0.5);
  const P = (x: number, y: number, z: number): [number, number, number] => { const v = new THREE.Vector3(x * h.x, y * h.y, z * h.z).applyQuaternion(q).add(center); return [v.x, v.y, v.z]; };
  const N = (x: number, y: number, z: number): [number, number, number] => { const v = new THREE.Vector3(x, y, z).applyQuaternion(q); return [v.x, v.y, v.z]; };
  const t = 1 / (TEXEL * 32);
  const ox = rng.int(32) / 32, oy = rng.int(32) / 32;
  const uv = (w: number, hh: number): [number, number][] => [[ox, oy], [ox + w * t, oy], [ox + w * t, oy + hh * t], [ox, oy + hh * t]];
  const side: [number, number, number, number] = [aoBottom, aoBottom, 1, 1];
  batch.quad(P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), N(1, 0, 0), uv(size.z, size.y), tint, side);
  batch.quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), N(-1, 0, 0), uv(size.z, size.y), tint, side);
  batch.quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), N(0, 0, 1), uv(size.x, size.y), tint, side);
  batch.quad(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), N(0, 0, -1), uv(size.x, size.y), tint, side);
  batch.quad(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), N(0, 1, 0), uv(size.x, size.z), tint.clone().multiplyScalar(1.15));
}

/**
 * Sun cookie for a far SpotLight: mostly full light with soft drifting-cloud shade patches
 * (never below ~55%), and a soft round edge so the cone falls off gently.
 */
export function cloudCookie(seed: number, floor = 0.55): THREE.CanvasTexture {
  const s = 64;
  const rng = new Rng(seed);
  const f = fbm(s, rng, [[3, 0.6], [6, 0.4]]);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const r = Math.hypot(x - s / 2 + 0.5, y - s / 2 + 0.5) / (s / 2);
    const edge = 1 - THREE.MathUtils.smoothstep(r, 0.8, 1.0);
    const cloud = THREE.MathUtils.smoothstep(f[y * s + x]!, 0.45, 0.62);
    const v = Math.round(255 * edge * (1 - cloud * (1 - floor)));
    const o = (y * s + x) * 4;
    img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ sweeping beam (lighthouse)

const SWEEP_VERT = /* glsl */ `
attribute vec2 aSide;   // x: -1..1 across, y: 0..1 along
uniform float uLen;
uniform vec2 uWidth;
varying vec2 vSide;
#include <fog_pars_vertex>
void main() {
  // The beam runs along local +X from the lamp; its ribbon faces the camera.
  vec3 s = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 e = (modelMatrix * vec4(uLen, 0.0, 0.0, 1.0)).xyz;
  vec3 p = mix(s, e, aSide.y);
  vec3 across = normalize(cross(e - s, normalize(cameraPosition - p)));
  p += across * aSide.x * mix(uWidth.x, uWidth.y, aSide.y) * 0.5;
  vSide = aSide;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SWEEP_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vSide;
#include <fog_pars_fragment>
void main() {
  float across = 1.0 - smoothstep(0.3, 1.0, abs(vSide.x));
  float along = smoothstep(0.0, 0.04, vSide.y) * (1.0 - smoothstep(0.35, 1.0, vSide.y));
  gl_FragColor = vec4(uColor * across * along * uIntensity, 1.0);
  #include <fog_fragment>
}`;

/** A lamp beam that can be rotated as a normal object (unlike `lightBeams`): local +X, additive. */
export function sweepBeam(len: number, width: [number, number], color: THREE.Color, intensity: number): THREE.Mesh {
  const segs = 8;
  const side: number[] = [], pos: number[] = [], index: number[] = [];
  for (let s = 0; s <= segs; s++) for (const x of [-1, 1]) { side.push(x, s / segs); pos.push(0, 0, 0); }
  for (let s = 0; s < segs; s++) { const a = s * 2; index.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 2));
  g.setIndex(index);
  const m = new THREE.ShaderMaterial({
    vertexShader: SWEEP_VERT, fragmentShader: SWEEP_FRAG, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: color }, uIntensity: { value: intensity }, uLen: { value: len }, uWidth: { value: new THREE.Vector2(...width) } }]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

/** Rock level at a world point, 0 outside the grid (Heightmap.get returns 99 there). */
export function levelAt(hm: Heightmap, x: number, z: number): number {
  const [i, j] = hm.cell(x, z);
  const v = hm.get(i, j);
  return v >= 90 ? 0 : v;
}

/** Multiply a geometry's vertex colours by `f(x, y, z, ny, nx, nz)` → [r, g, b] (baked light falloff, rims). */
export function shadeVertices(g: THREE.BufferGeometry, f: (x: number, y: number, z: number, ny: number, nx: number, nz: number) => [number, number, number]): THREE.BufferGeometry {
  const pos = g.attributes.position!, col = g.attributes.color, nor = g.attributes.normal;
  if (!col) return g;
  for (let k = 0; k < pos.count; k++) {
    const [r, gg, b] = f(pos.getX(k), pos.getY(k), pos.getZ(k), nor ? nor.getY(k) : 0, nor ? nor.getX(k) : 0, nor ? nor.getZ(k) : 0);
    col.setXYZ(k, col.getX(k) * r, col.getY(k) * gg, col.getZ(k) * b);
  }
  col.needsUpdate = true;
  return g;
}
