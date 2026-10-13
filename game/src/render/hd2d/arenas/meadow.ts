// Mossy Meadow outdoor arenas: the forest CLEARING (tall grass, default meadow, Scout Pim) and,
// from the same set with a different dressing, the FLOWER FIELD (flowers.ts).
//
// Composition (camera from +z, elevated 3/4): a trodden dirt clearing ringed by grassy earth
// terraces that rise toward the back; trees stand on the terraces with big painted leaf
// canopies closing the top of the frame; the sun comes from the back-left through a gap in the
// leaves — a dapple-cookie spot with soft shadows, light shafts with pollen motes — and pools on
// the clearing. Tall grass tufts sway at the edges; a stump, a log, a fence and a signpost dress
// the corners. Everything original and procedural.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { CELL, Heightmap, LEVEL, TEXEL, VoxelBatch, dustMotes, lightBeams, surfaceMaterial, type ArenaRig, type BeamSpec } from '../arena';
import { cachedTexture, type Ramp } from '../textures';
import type { Grade } from '../pipeline';
import type { ArenaBuildOptions, ArenaDef } from './index';
import { particleSystem } from '../kit/particles';
import { boulder } from '../kit/rock';
import {
  Foliage, SpriteAtlas, apron, backdrop, clusterMap, disposeGroup, foreground, gobo, groundMesh, hash2, lightPools, macro, mkMesh, noiseField,
  paintBark, paintButterfly, paintCanopy, paintEarth, paintFlower, paintSky, paintTreeLine, paintTuft, paintTurf, rampColor, sunRig, terraces, trunk,
  type RgbaTile,
} from './outdoorKit';

/** Meadow ramps (dark → light, hue-shifted: shadows toward blue/teal, lights toward yellow). */
export const MEADOW_RAMPS = {
  turf: ['#1c3527', '#26502e', '#356a33', '#4c8538', '#6a9e3e', '#8fb84c', '#b7d062', '#dbe58a'],
  grass: ['#173027', '#20452b', '#2d5d31', '#3f7535', '#5a903c', '#7aaa45', '#a3c459', '#cddd78'],
  leaf: ['#10261f', '#173826', '#1f4c2b', '#2c6331', '#3f7a35', '#5a943b', '#7fae46', '#acc95c'],
  leafWarm: ['#1b2a1a', '#29401f', '#3a5724', '#517029', '#6c892f', '#8ea33a', '#b5bd50', '#d9d67a'],
  dirt: ['#3f3024', '#5a4433', '#785c43', '#957554', '#ae8e68', '#c4a77f', '#d8c39d'],
  earth: ['#24170f', '#352217', '#4a301f', '#5f3f28', '#755234', '#8b6643', '#a27d55'],
  bark: ['#1f140e', '#2e1e14', '#41291b', '#553723', '#6b472d', '#82593a', '#9a6e4b'],
  wood: ['#2c1a10', '#432817', '#5c3820', '#764b2b', '#8f6037', '#a87645', '#c08f58'],
  stone: ['#2a2c31', '#3e4148', '#555960', '#6e7279', '#888c91', '#a3a6a8', '#c0c1bf'],
  chalk: ['#8f8a7a', '#aaa492', '#c4bea9', '#d8d2bd'],
  sky: ['#6fa7d8', '#86b8e0', '#9dc8e6', '#b5d6e9', '#cde3ea', '#e2eee6'],
  far: ['#4f7a73', '#5d8a7c', '#6d9984', '#7fa78d', '#93b598', '#a9c3a6'],
} as const satisfies Record<string, Ramp>;

export const PETALS = {
  red: ['#5a1424', '#8c1f2e', '#c2343a', '#e5584c', '#f78a6a'],
  pink: ['#6a2448', '#9a3a6a', '#c95a8e', '#e889b0', '#fbb8cf'],
  yellow: ['#6a4a10', '#a07418', '#d4a822', '#f2cf3e', '#fdec7a'],
  white: ['#6d6a78', '#a3a2ad', '#cfd0d6', '#ececef', '#ffffff'],
  violet: ['#2e1e5a', '#46308a', '#6a4cb8', '#8f74d8', '#b9a6ef'],
  orange: ['#6a2a10', '#a8451a', '#dc6a24', '#f6973a', '#ffc46a'],
  blue: ['#1c2c6a', '#2a4296', '#3f63c4', '#6a92e2', '#a6c4f6'],
} as const satisfies Record<string, Ramp>;

export type MeadowVariant = 'clearing' | 'flowers';

export function meadowGrade(warm = false): Grade {
  return {
    lift: new THREE.Vector3(0.006, 0.012, 0.02), gamma: new THREE.Vector3(1.0, 1.0, 1.0),
    gain: warm ? new THREE.Vector3(1.07, 1.0, 0.86) : new THREE.Vector3(1.05, 1.01, 0.9),
    saturation: 0.84, contrast: 1.1,
    // Warm sunlit highs against cool blue-green shade (the reference's light/shade split).
    shadowTint: new THREE.Color(warm ? '#2c2a4e' : '#173448'), highTint: new THREE.Color(warm ? '#ffd28a' : '#ffe2a0'), splitAmount: 0.2,
    // A deeper vignette pulls the eye to the lit pool on the battle floor.
    vignette: 0.32, vignetteSoft: 0.62,
    tiltTop: 1.0, tiltBottom: 0.6, focusTop: 0.8, focusBottom: 0.08,
    dither: 2.0,
    exposure: warm ? 1.5 : 1.42,
    shadowDesat: 0.2,
  };
}

/** Kin and people spots (shared convention, docs/HD2D.md). */
const SPOTS: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-1.3, 0, 1.0), new THREE.Vector3(1.5, 0, -1.0)];
const PEOPLE: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-2.5, 0, 1.9), new THREE.Vector3(2.75, 0, -1.95)];
/** Level of the front bank where the set meets its apron. */
const FRONT_LV = 2;
/** The battle floor's lit pool / calm zone: an ellipse along the kin line (world). */
export const BATTLE_POOL = { x: 0.1, z: 0.0, ru: 3.7, rv: 2.5, angle: Math.atan2(-2.0, 2.8) };
/** 0 at the battle centre → 1 at the rim of the calm zone (and beyond). */
export function poolR(x: number, z: number, k = 1): number {
  const p = BATTLE_POOL, ca = Math.cos(p.angle), sa = Math.sin(p.angle);
  const X = x - p.x, Z = z - p.z;
  return Math.hypot((X * ca + Z * sa) / (p.ru * k), (-X * sa + Z * ca) / (p.rv * k));
}

/** Keep props off the battle floor: true when (x, z) is within `r` of a kin/person spot or the line between the kin. */
export function nearStage(x: number, z: number, r = 1.6): boolean {
  for (const p of [...SPOTS, ...PEOPLE]) if (Math.hypot(x - p.x, z - p.z) < r) return true;
  // Segment between the kin (FX fly along it).
  const a = SPOTS[0], b = SPOTS[1];
  const abx = b.x - a.x, abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)) < r * 0.8;
}

/**
 * The battle ground of a trainer duel, worn into the floor instead of chalked on it: a trodden
 * oval of compacted earth (slightly darker, smoother clumps in a band where feet circle, a
 * polished lighter middle), scuffs dug in around both kin spots, and pebbles kicked out to the
 * rim. Natural, subtle, original — it only modulates the floor already painted in `t`.
 */
export function paintTrodden(t: RgbaTile, wx: (x: number) => number, wz: (y: number) => number, pebble: readonly [string, string, string] = ['#c0c1bf', '#888c91', '#555960'], k = 1) {
  const cx = (SPOTS[0].x + SPOTS[1].x) / 2, cz = (SPOTS[0].z + SPOTS[1].z) / 2;
  const ang = Math.atan2(SPOTS[1].z - SPOTS[0].z, SPOTS[1].x - SPOTS[0].x);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const RU = 3.2, RV = 2.0;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const X = wx(x) - cx, Z = wz(y) - cz;
    const u = X * ca + Z * sa, v = -X * sa + Z * ca;
    const wob = Math.sin(u * 2.1 + v * 1.3) * 0.05 + (hash2(x >> 2, y >> 2, 31) - 0.5) * 0.08;
    const r = Math.hypot(u / RU, v / RV) + wob;
    if (r > 1.12) continue;
    const clump = hash2(x >> 1, y >> 1, 33);
    // Compacted band where the feet circle (0.62..1.05): darker, in clumps; polished middle.
    const band = Math.max(0, 1 - Math.abs(r - 0.84) / 0.24);
    if (band > 0 && clump < band * 0.7) t.scale(x, y, 1 - 0.1 * k * (0.6 + band * 0.4));
    else if (r < 0.6 && clump < 0.45) t.scale(x, y, 1 + 0.05 * k);
  }
  // Scuffs dug in around each kin spot: short dark arcs with a lit lip on the far side.
  const rng = new Rng(611);
  const tx = (X: number) => Math.round((X - wx(0)) / TEXEL), tz = (Z: number) => Math.round((Z - wz(0)) / TEXEL);
  for (const s of SPOTS) for (let n = 0; n < 9; n++) {
    const a = rng.next() * Math.PI * 2, d = 0.35 + rng.next() * 0.55;
    const len = 4 + rng.int(6), dir = ang + (rng.next() - 0.5) * 1.2;
    let px = tx(s.x + Math.cos(a) * d), py = tz(s.z + Math.sin(a) * d * 0.8);
    for (let i = 0; i < len; i++) {
      t.scale(px, py, 1 - 0.2 * k); t.scale(px, py - 1, 1 + 0.08 * k);
      px += Math.cos(dir); py += Math.sin(dir) * 0.6 + (rng.next() - 0.5) * 0.6;
    }
  }
  // Pebbles kicked out to the rim of the oval.
  for (let n = 0; n < 34; n++) {
    const a = rng.next() * Math.PI * 2, r = 0.95 + rng.next() * 0.3;
    const u = Math.cos(a) * RU * r, v = Math.sin(a) * RV * r;
    const px = tx(cx + u * ca - v * sa), py = tz(cz + u * sa + v * ca);
    if (!t.inside(px, py)) continue;
    t.set(px, py, pebble[0]); if (rng.chance(0.6)) t.set(px + 1, py, pebble[1]);
    t.set(px, py + 1, pebble[2]); if (rng.chance(0.3)) t.set(px + 1, py + 1, pebble[2]);
  }
}

/** Build the meadow set (clearing or flower field). */
export function buildMeadowSet(opts: ArenaBuildOptions, variant: MeadowVariant): ArenaRig {
  const R = MEADOW_RAMPS;
  const flowers = variant === 'flowers';
  const q = opts.quality;
  const rng = new Rng(opts.seed ?? (flowers ? 41 : 23));
  const group = new THREE.Group();
  group.name = `hd2d-meadow-${variant}`;
  const extra: { dispose(): void }[] = [];
  const updates: ((t: number) => void)[] = [];

  // ---- heightmap: clearing (0) ringed by grassy terraces that rise toward the back
  const X0 = -15.3, Z0 = -14.4;
  const hm = new Heightmap(34, 24, X0, Z0);
  const frontGap = { x0: -6.2, x1: -3.6 }; // a path out of the clearing toward the camera
  for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
    const x = hm.cx(i), z = hm.cz(j);
    const wob = Math.sin(x * 1.1 + z * 0.7) * 0.35 + Math.sin(z * 1.9 - x * 0.5) * 0.25;
    const e = Math.hypot(x / 7.0, (z - 0.2) / 4.5);
    const d = (e - 1) * 5.2 + wob;
    // Half-LEVEL steps (a full bank at the clearing, then half and full ledges by noise): the
    // banks read as organic rounded terraces rather than a lattice of equal cubes.
    let lv = 0;
    if (d > 0) lv = 1 + 0.5 * Math.floor(d / 0.85);
    if (z < -4.5) lv += 0.5 * Math.floor((-4.5 - z) / 1.7); // the back rises gently
    if (z > 3.8) {
      lv = Math.min(lv, z > 6 ? 2 : 1); // low front ledge lets the camera in
      if (x > frontGap.x0 && x < frontGap.x1) lv = 0;
    }
    if (flowers && z < -4.6 && x > 1.5 && x < 9) lv = Math.min(lv, 2); // a low shelf for the gazebo
    const cl = Math.sin(Math.floor(i / 2) * 12.9898 + Math.floor(j / 2) * 78.233) * 43758.5453;
    const n = cl - Math.floor(cl);
    if (lv > 0) lv = Math.max(1, lv + (n > 0.86 ? 0.5 : n < 0.1 ? -0.5 : 0));
    // The last rows meet the apron (phones see far past the stage): one flat bank at FRONT_LV.
    if (z > hm.z0 + (hm.nz - 2) * CELL) lv = FRONT_LV;
    hm.set(i, j, Math.min(lv, 4));
  }
  const topAt = (x: number, z: number) => { const [i, j] = hm.cell(x, z); const v = hm.get(i, j); return v > 90 ? 0 : v * LEVEL; };

  // ---- sprite atlas
  const atlas = new SpriteAtlas(512);
  const leafRamp = flowers ? R.leafWarm : R.leaf;
  for (let k = 0; k < 3; k++) atlas.add('canopy', 88, 74, (p) => paintCanopy(p, new Rng(100 + k), leafRamp, { clumps: 8 }));
  for (let k = 0; k < 2; k++) atlas.add('canopyWide', 104, 60, (p) => paintCanopy(p, new Rng(140 + k), leafRamp, { clumps: 9, flat: 0.95 }));
  for (let k = 0; k < 3; k++) atlas.add('bush', 46, 32, (p) => paintCanopy(p, new Rng(200 + k), R.leaf, { clumps: 6 }));
  // The far forest wall: crowns painted from the cool, light haze ramp (aerial perspective).
  for (let k = 0; k < 2; k++) atlas.add('canopyFar', 88, 64, (p) => paintCanopy(p, new Rng(160 + k), R.far, { clumps: 8 }));
  for (let k = 0; k < 4; k++) atlas.add('tuft', 16, 13, (p) => paintTuft(p, new Rng(300 + k), R.grass, 9));
  for (let k = 0; k < 3; k++) atlas.add('tall', 20, 26, (p) => paintTuft(p, new Rng(320 + k), R.grass, 14, 1.3));
  // Grass lip hanging over terrace edges.
  // Long grass hanging over the rounded terrace lips (ragged tips, a few long strands).
  for (let k = 0; k < 4; k++) atlas.add('fringe', 15, 14, (p) => {
    const r = new Rng(400 + k);
    for (let x = 0; x < 15; x++) {
      const len = 3 + r.int(4) + (r.chance(0.35) ? 3 + r.int(5) : 0);
      for (let y = 0; y < len; y++) p.band(x, y, R.grass, 5.0 - y * 0.55 - (y === len - 1 ? 0.8 : 0));
    }
  }, [7.5, 0]);
  // Flowers: clumps in several colours (more and bigger in the flower field).
  const petalKeys = Object.keys(PETALS) as (keyof typeof PETALS)[];
  for (const key of petalKeys) {
    atlas.add(`flowers-${key}`, 22, 18, (p) => {
      const r = new Rng(500 + key.length * 7 + key.charCodeAt(0));
      paintTuft(p, r, R.grass, 5, 0.8);
      for (let f = 0; f < 4; f++) paintFlower(p, r, R.grass, PETALS[key], key === 'yellow' ? '#7a4a12' : '#f6d64a', 3 + r.int(16), 17, 6 + r.int(9), r.chance(0.6) ? 2 : 1);
    });
  }
  for (const key of ['yellow', 'white', 'blue', 'orange'] as const) atlas.add(`fly-${key}`, 7, 5, (p) => paintButterfly(p, PETALS[key], 1));
  for (const key of ['pink', 'white', 'yellow'] as const) atlas.add(`petal-${key}`, 3, 3, (p) => { p.set(1, 0, PETALS[key][4]); p.set(0, 1, PETALS[key][3]); p.set(1, 1, PETALS[key][4]); p.set(2, 1, PETALS[key][2]); p.set(1, 2, PETALS[key][2]); }, [1.5, 1.5]);
  const atlasTex = atlas.texture();
  extra.push(atlasTex);
  const fol = new Foliage(atlas);

  // ---- terraces: earth sides + turf tops + grass lip
  const texEarth = cachedTexture('od-earth-meadow', () => paintEarth(31, R.earth));
  const texTurf = cachedTexture('od-turf-meadow', () => paintTurf(32, R.turf, 32, { lo: 2.2, hi: 4.6, flecks: 0.06 }));
  const sides = new VoxelBatch(32);
  const tops = new VoxelBatch(32);
  const stone = new VoxelBatch(32);
  terraces(hm, sides, tops, rng, { topK: 1.0, lip: 0.15, fringe: { foliage: fol, sprite: 'fringe', rng: new Rng(7), chance: 1, long: 1.1 }, rocks: { batch: stone, chance: 0.12 } });
  // Foreground occluders (the near ledges) sit a little darker: depth from local shade, not vignette.
  const nearShade = (x: number, y: number, z: number) => 1 - 0.16 * THREE.MathUtils.smoothstep(z, 3.6, 7.5);
  tops.shade(nearShade); sides.shade(nearShade);
  group.add(mkMesh(sides.build(), extra[extra.push(surfaceMaterial(texEarth, undefined, true)) - 1] as THREE.Material));
  group.add(mkMesh(tops.build(), extra[extra.push(surfaceMaterial(texTurf, undefined, false)) - 1] as THREE.Material));
  // Apron: the front bank's turf runs on far past the near frustum (portrait phones look down
  // past the stage); same texture and UVs as the terrace tops, darkening toward the camera.
  {
    const zf = hm.z0 + hm.nz * CELL;
    const mott = macro(flowers ? 17 : 16);
    const ap = apron({
      x0: -40, x1: 40, z0: zf - 0.02, z1: zf + 34, y: FRONT_LV * LEVEL, map: texTurf, tileTexels: 32,
      // A darkening lip toward the camera (no big mottled blotches: the turf clusters carry it).
      shade: (x, z) => (0.8 - 0.36 * THREE.MathUtils.smoothstep(z, zf, zf + 7)) * (0.95 + 0.1 * mott(x * 0.6, z * 0.6)),
    });
    extra.push(ap.material as THREE.Material);
    group.add(ap);
  }

  // ---- ground: one painted texture (clearing dirt, grass, path, flowers, chalk ring)
  const ground = groundMesh({
    x0: X0, x1: X0 + hm.nx * CELL, z0: Z0, z1: Z0 + hm.nz * CELL, hm, aoK: 0.09,
    paint: (t, wx, wz) => paintMeadowFloor(t, wx, wz, variant, opts.trainerBattle),
  });
  extra.push(ground.texture);
  group.add(ground.mesh);

  // ---- wood: tree trunks, stump, log, fence, signpost (one bark mesh, one plank mesh)
  const bark = new VoxelBatch(32);
  const wood = new VoxelBatch(32);
  const trunkAt = (x: number, z: number, h: number, r: number) => {
    const y = topAt(x, z) - 0.05;
    const tint = new THREE.Color(1, 1, 1).multiplyScalar(0.9 + rng.next() * 0.2);
    // A round, tapering trunk with a root flare spreading over the turf and branch stubs.
    return trunk(bark, [x, y, z], h, r, rng, { flare: 1.0, roots: 4 + rng.int(2), taper: 0.6, tint })[1];
  };
  /**
   * A tree: trunk + 2–3 canopy billboards. `scale` grows the whole tree. The canopies cast no
   * shadow-map shadow (the key's leaf gobo paints their dapple instead, so the low sun still
   * reaches the battle floor); the trunks throw the long shadow streaks.
   */
  const tree = (x: number, z: number, scale = 1, wide = false) => {
    const top = trunkAt(x, z, 1.8 * scale, 0.24 + 0.08 * scale);
    const sprite = wide ? 'canopyWide' : 'canopy';
    const k = TEXEL * scale;
    fol.add(atlas.get(sprite, rng), [x + (rng.next() - 0.5) * 0.4, top - 1.15 * scale, z + 0.2], 'billboard', { scale: k, sway: 0.03, flip: rng.chance(0.5), shadow: false });
    fol.add(atlas.get('canopy', rng), [x + (rng.chance(0.5) ? 1 : -1) * 1.1 * scale, top - 0.2 * scale, z - 0.3], 'billboard', { scale: k * 0.8, sway: 0.035, flip: rng.chance(0.5), tint: new THREE.Color(0.88, 0.9, 0.9), shadow: false });
    if (scale > 1.05) fol.add(atlas.get('canopy', rng), [x, top + 1.2 * scale, z - 0.6], 'billboard', { scale: k * 0.75, sway: 0.04, flip: rng.chance(0.5), tint: new THREE.Color(0.94, 0.96, 0.94), shadow: false });
  };
  // Back row on the high terraces, sides, and two framing trees at the front corners.
  const backTrees: [number, number, number, boolean][] = flowers
    ? [[-10.8, -5.6, 1.2, false], [-6.8, -6.8, 1.3, true], [-2.8, -7.2, 1.1, false], [10.8, -5.0, 1.25, true], [-11.8, -0.8, 1.15, false], [12.0, -0.6, 1.1, false]]
    : [[-10.8, -5.4, 1.2, false], [-7.0, -6.6, 1.3, true], [-2.6, -6.9, 1.15, false], [1.6, -7.2, 1.25, true], [5.6, -6.6, 1.15, false], [9.6, -5.6, 1.3, true], [-11.8, -1.0, 1.2, false], [11.8, -1.6, 1.25, true]];
  for (const [x, z, s, w] of backTrees) tree(x, z, s, w);
  // A continuous canopy wall behind the trees closes the top of the frame (and reads as the forest).
  // (Continuous in both variants: no flat patch of sky at the top of the frame. Over the flower
  // field the far canopy is lower and sunnier, so the gazebo still reads against it.)
  for (let x = -16; x <= 16; x += 2.6) {
    const open = flowers && x > -1 && x < 9.5;
    fol.add(atlas.get('canopyFar', rng), [x + rng.next(), 4.2 + rng.next() * 1.4, -12.8 + rng.next() * 0.6], 'billboard', { scale: TEXEL * 1.6, sway: 0.02, flip: rng.chance(0.5), tint: open ? new THREE.Color(0.9, 0.94, 0.9) : new THREE.Color(0.8, 0.88, 0.92), shadow: false });
  }
  // Bushes on the terraces, tall grass and tufts around the clearing edge.
  for (let i = 0; i < 10; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = 1.08 + rng.next() * 0.5;
    const x = Math.cos(a) * 7.0 * r, z = 0.2 + Math.sin(a) * 4.5 * r;
    if (z > 3.2 || Math.abs(x) > 14) continue;
    fol.add(atlas.get('bush', rng), [x, topAt(x, z), z], 'billboard', { scale: TEXEL * (0.8 + rng.next() * 0.35), sway: 0.02, flip: rng.chance(0.5) });
  }
  for (let i = 0; i < (q === 'high' ? 150 : 110); i++) {
    const a = rng.next() * Math.PI * 2;
    const r = 0.8 + Math.pow(rng.next(), 1.6) * 0.55;
    const x = Math.cos(a) * 7.0 * r, z = 0.2 + Math.sin(a) * 4.5 * r;
    if (nearStage(x, z, 2.3) || poolR(x, z) < 1.05 || z > 6.5) continue;
    if (topAt(x, z) > LEVEL * 1.5 && rng.chance(0.6)) continue; // keep the bank faces readable
    const tall = rng.chance(flowers ? 0.25 : 0.45);
    fol.add(atlas.get(tall ? 'tall' : 'tuft', rng), [x, topAt(x, z), z], 'billboard', { sway: tall ? 0.09 : 0.05, flip: rng.chance(0.5), tint: new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rng.next() * 0.25) });
  }
  // Flower clumps: a few in the clearing's grass ring, dense beds in the flower field.
  const flowerCount = flowers ? (q === 'high' ? 260 : 190) : 26;
  for (let i = 0; i < flowerCount; i++) {
    let x: number, z: number;
    if (flowers) {
      // Beds: rows of one colour fanning around the clearing (like planted strips).
      const bed = rng.int(7);
      const a = -Math.PI * 1.05 + (bed / 7) * Math.PI * 1.1 + (rng.next() - 0.5) * 0.4;
      const r = 1.0 + rng.next() * 0.55;
      x = Math.cos(a) * 6.6 * r; z = 0.2 + Math.sin(a) * 4.4 * r;
      let drift = bed;
      // The front bank: drifts in bands along x (each a few metres of one colour).
      if (rng.chance(0.35)) { x = (rng.next() - 0.5) * 22; z = 3.8 + rng.next() * 2.6; drift = Math.floor((x + 11) / 3.1); }
      if (nearStage(x, z, 2.3) || poolR(x, z) < 1.1) continue;
      const key = petalKeys[(drift + (rng.chance(0.08) ? 1 : 0)) % petalKeys.length]!;
      fol.add(atlas.get(`flowers-${key}`), [x, topAt(x, z), z], 'billboard', { sway: 0.05, flip: rng.chance(0.5), scale: TEXEL * (0.85 + rng.next() * 0.3) });
    } else {
      const a = rng.next() * Math.PI * 2, r = 0.95 + rng.next() * 0.5;
      x = Math.cos(a) * 7.0 * r; z = 0.2 + Math.sin(a) * 4.5 * r;
      if (nearStage(x, z, 2.3) || poolR(x, z) < 1.1 || z > 6) continue;
      fol.add(atlas.get(`flowers-${rng.pick(['white', 'yellow', 'violet'] as const)}`), [x, topAt(x, z), z], 'billboard', { sway: 0.05, flip: rng.chance(0.5) });
    }
  }
  // Butterflies (and in the flower field, drifting petals).
  const flies = flowers ? 6 : 3;
  for (let i = 0; i < flies; i++) {
    const a = (i / flies) * Math.PI * 2 + 0.4;
    fol.add(atlas.get(`fly-${(['yellow', 'white', 'blue', 'orange'] as const)[i % 4]}`), [Math.cos(a) * 6.2, 1.0 + rng.next() * 0.8, 0.2 + Math.sin(a) * 3.9], 'flutter', { range: 1.4 + rng.next() * 0.8 });
  }
  if (flowers) for (let i = 0; i < (q === 'high' ? 40 : 24); i++) {
    fol.add(atlas.get(`petal-${(['pink', 'white', 'yellow'] as const)[i % 3]}`), [-9 + rng.next() * 16, 5.5 + rng.next() * 2, -6 + rng.next() * 9], 'fall', { range: 6 });
  }

  // Props: stump, log, fence, signpost (bark/wood) and a few stones.
  const sx = flowers ? 5.6 : -5.9, sz = flowers ? 2.6 : -1.9;
  bark.box([sx - 0.42, 0, sz - 0.42], [sx + 0.42, 0.55, sz + 0.42], new THREE.Color(1, 1, 1), rng, { aoBottom: 0.5 });
  wood.box([sx - 0.36, 0.55, sz - 0.36], [sx + 0.36, 0.58, sz + 0.36], new THREE.Color(1.15, 1.1, 1.0), rng); // cut face
  if (!flowers) {
    // Fallen log at the right, with a stub branch.
    bark.rotBox([5.4, 0.3, 2.6], [2.6, 0.56, 0.56], -0.35, new THREE.Color(0.95, 0.95, 0.95), rng);
    bark.rotBox([5.0, 0.62, 2.85], [0.18, 0.5, 0.18], -0.35, new THREE.Color(0.9, 0.9, 0.9), rng, 0.4);
  }
  // Fence along the front-right ledge and a signpost by the front path.
  const fenceZ = flowers ? 4.9 : 4.7;
  for (let x = 1.5; x <= 7.5; x += 1.2) {
    const y = topAt(x, fenceZ) - 0.02;
    wood.box([x - 0.08, y, fenceZ - 0.08], [x + 0.08, y + 0.95, fenceZ + 0.08], new THREE.Color(1, 1, 1).multiplyScalar(0.9 + rng.next() * 0.2), rng);
    wood.box([x - 0.12, y + 0.95, fenceZ - 0.1], [x + 0.12, y + 1.02, fenceZ + 0.1], new THREE.Color(1.05, 1.05, 1.05), rng);
  }
  for (const yy of [0.42, 0.78]) {
    const y = topAt(4.5, fenceZ) + yy;
    wood.box([1.45, y, fenceZ - 0.05], [7.6, y + 0.12, fenceZ + 0.05], new THREE.Color(1.05, 1.05, 1.05), rng);
  }
  const signX = flowers ? -4.6 : -6.6, signZ = flowers ? 4.4 : 3.6;
  const signY = topAt(signX, signZ);
  wood.box([signX - 0.07, signY, signZ - 0.07], [signX + 0.07, signY + 1.35, signZ + 0.07], new THREE.Color(0.9, 0.9, 0.9), rng);
  wood.rotBox([signX + 0.15, signY + 1.15, signZ], [0.95, 0.32, 0.06], -0.25, new THREE.Color(1.1, 1.08, 1.0), rng);
  wood.rotBox([signX - 0.05, signY + 0.75, signZ + 0.05], [0.7, 0.24, 0.06], 0.35, new THREE.Color(1.0, 0.98, 0.95), rng);
  // Mossy rock clumps (rounded, irregular kit boulders, not boxes) round the clearing's rim.
  const clump = (x: number, z: number, s: number, n = 3) => {
    const y = topAt(x, z);
    for (let k = 0; k < n; k++) {
      const a = rng.next() * Math.PI * 2, d = k === 0 ? 0 : s * (0.7 + rng.next() * 0.5);
      const r = s * (k === 0 ? 1 : 0.45 + rng.next() * 0.35);
      boulder(stone, [x + Math.cos(a) * d, y + r * 0.32, z + Math.sin(a) * d * 0.8], [r * 1.5, r * 0.95, r * 1.2], new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rng.next() * 0.25), rng, {
        ry: rng.next() * 3, rx: (rng.next() - 0.5) * 0.25, rz: (rng.next() - 0.5) * 0.25, aoBottom: 0.45, topK: 1.4,
      });
    }
  };
  for (const [x, z, sz] of [[-6.4, 1.2, 0.36], [6.6, -1.6, 0.42], [-4.6, -3.4, 0.3], [7.1, 0.6, 0.26]] as const) clump(x, z, sz);
  // Framing at the bottom corners of the desktop view: a rock clump and a bush on each side.
  clump(flowers ? -6.6 : -5.9, 4.9, 0.5, 4);
  clump(7.6, 4.4, 0.44, 3);
  fol.add(atlas.get('bush', rng), [flowers ? -7.6 : -7.1, topAt(-7.3, 5.2), 5.2], 'billboard', { scale: TEXEL * 1.25, sway: 0.02 });
  fol.add(atlas.get('bush', rng), [8.4, topAt(8.4, 4.9), 4.9], 'billboard', { scale: TEXEL * 1.15, sway: 0.02, flip: true });

  // Flower field: a white gazebo with a red roof on the low back shelf.
  if (flowers) {
    const gx = 5.6, gz = -5.6, gy = topAt(gx, gz);
    const white = new THREE.Color('#f2ead8'), red = rampColor(PETALS.red, 2).multiplyScalar(1.7);
    const H = 1.9, S = 1.15;
    wood.box([gx - S - 0.1, gy, gz - S - 0.1], [gx + S + 0.1, gy + 0.16, gz + S + 0.1], white.clone().multiplyScalar(0.85), rng, { aoBottom: 0.7 });
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      wood.box([gx + dx * S - 0.09, gy + 0.16, gz + dz * S - 0.09], [gx + dx * S + 0.09, gy + 0.16 + H, gz + dz * S + 0.09], white, rng, { aoBottom: 0.75 });
    }
    // Low railings on three sides (open toward the clearing), a bench inside.
    for (const [ax, az, bx, bz] of [[-S, -S, S, -S], [-S, -S, -S, S], [S, -S, S, S]] as const) {
      wood.box([gx + Math.min(ax, bx) - 0.04, gy + 0.62, gz + Math.min(az, bz) - 0.04], [gx + Math.max(ax, bx) + 0.04, gy + 0.7, gz + Math.max(az, bz) + 0.04], white, rng);
    }
    wood.box([gx - 0.7, gy + 0.16, gz - 0.9], [gx + 0.7, gy + 0.5, gz - 0.55], new THREE.Color(0.75, 0.62, 0.5), rng);
    // Roof: eave beam ring + stepped pyramid + finial.
    wood.box([gx - S - 0.2, gy + 0.16 + H, gz - S - 0.2], [gx + S + 0.2, gy + 0.3 + H, gz + S + 0.2], white, rng);
    for (let k = 0; k < 5; k++) {
      const w = S + 0.3 - k * 0.3;
      wood.box([gx - w, gy + 0.3 + H + k * 0.2, gz - w], [gx + w, gy + 0.5 + H + k * 0.2, gz + w], red.clone().multiplyScalar(1 - k * 0.04), rng, { aoBottom: 0.6 });
    }
    wood.box([gx - 0.06, gy + 1.3 + H, gz - 0.06], [gx + 0.06, gy + 1.65 + H, gz + 0.06], new THREE.Color('#e0b040').multiplyScalar(1.3), rng);
  }

  const texBark = cachedTexture('od-bark', () => paintBark(51, R.bark));
  const texWood = cachedTexture('od-wood', () => paintEarth(52, R.wood, 32, { roots: 0, pebbles: 0, strata: 2.2 }));
  const texStone = cachedTexture('od-stone', () => paintEarth(53, R.stone, 32, { roots: 2, pebbles: 2, strata: 0.2 }));
  for (const [b, tex] of [[bark, texBark], [wood, texWood], [stone, texStone]] as const) {
    const m = surfaceMaterial(tex, undefined, true);
    extra.push(m);
    group.add(mkMesh(b.build(), m));
  }

  // Phone foreground: the front bank and the apron under a portrait camera get patches of tall
  // grass, bushes and flower drifts, shading off toward the camera (a dressed, darker lip).
  {
    const zf = hm.z0 + hm.nz * CELL;
    const keys = flowers ? ['flowers-yellow', 'flowers-white', 'flowers-violet', 'flowers-pink', 'tall'] : ['tall', 'tall', 'tuft', 'flowers-white', 'flowers-yellow'];
    foreground(fol, {
      sprites: keys, area: [-15, 5.6, 6, zf + 7], patches: q === 'high' ? 34 : 24, perPatch: [3, 7], rng,
      y: (x, z) => (z >= zf - 0.05 ? FRONT_LV * LEVEL : topAt(x, z)), keep: (x, z) => !nearStage(x, z, 2.4) && poolR(x, z) > 1.1, k: 0.55, scale: [0.95, 1.25],
    });
  }
  // Foliage (all sprites): one mesh.
  const folMesh = fol.build(atlasTex, { upNormal: 0.55 });
  group.add(folMesh);
  updates.push((t) => { fol.uTime.value = t; });

  // ---- far backdrop: sky and the distant forest — three rows of textured leaf crowns (lit
  // from the sun's side, leaf-cell rims, dark gaps), hazier with distance; only a sliver of
  // sky shows between them.
  const back = backdrop((t) => {
    paintSky(t, R.sky, 0, Math.round(t.h * 0.5));
    const r = new Rng(77);
    const light: [number, number] = flowers ? [0.6, -0.7] : [-0.6, -0.7];
    paintTreeLine(t, r, R.far, { base: t.h * 0.36, amp: 18, size: [7, 12], haze: 0.45, hazeCol: '#b8d0c0', light });
    paintTreeLine(t, r, R.leafWarm, { base: t.h * 0.56, amp: 22, size: [8, 14], haze: 0.28, hazeCol: '#a8c4a8', light });
    paintTreeLine(t, r, R.leaf, { base: t.h * 0.8, amp: 18, size: [8, 13], haze: 0.08, hazeCol: '#90b090', light });
  }, 320, 120, [80, 30], [0, 8, -24], { gain: 0.85 });
  extra.push(back.mesh.material as THREE.Material);
  group.add(back.mesh);

  // ---- sun: ONE strong warm key, low (≈ 32°) from the back-left (flower field: back-right)
  // through the leaves, so trees and props throw long shadows toward the camera; a world-space
  // gobo puts a lit pool on the battle floor and leaf dapple everywhere else (darker toward the
  // set's edges). Cool, weak sky fill: warm highlights against blue-green shade.
  const target = new THREE.Vector3(0.1, 0, 0.0);
  const sunFrom = flowers ? new THREE.Vector3(0.8, 0.62, -0.45) : new THREE.Vector3(-0.8, 0.62, -0.45);
  const { key, spriteLight } = sunRig(group, {
    target, from: sunFrom, distance: 34, angle: 0.44, penumbra: 0.25, shadowRadius: 2,
    color: flowers ? '#ffcf8a' : '#ffe2a8', intensity: flowers ? 12.5 : 12, cookie: null,
    sky: flowers ? '#a8b8e0' : '#9cc0e8', ground: flowers ? '#4a4228' : '#2c4224', hemi: flowers ? 1.35 : 1.3,
    fill: flowers ? '#c8c8ff' : '#b8dcff', fillIntensity: 0.5, quality: q,
  });
  const gob = gobo(key, { kind: 'leaves', seed: flowers ? 9 : 4, pool: { ...BATTLE_POOL, soft: 0.3 }, outside: 0.42, shade: 0.16, cover: flowers ? 0.38 : 0.46, scale: 3.4 });
  extra.push(gob);

  // ---- light shafts through the canopy gaps + pollen motes
  const dir = sunFrom.clone().normalize().negate();
  const beams: BeamSpec[] = [];
  // Three shafts of UNEQUAL width (a broad main shaft, a thin one, a medium one) from canopy
  // gaps, landing in and around the lit pool — never a comb of identical beams.
  const lands: [number, number, number, number, number][] = flowers
    ? [[0.7, 0.3, 5.0, 0.5, 1.9], [-1.1, -0.9, 5.3, 0.2, 0.7], [3.3, -1.7, 5.0, 0.35, 1.2]]
    : [[-0.5, 0.5, 5.0, 0.5, 1.9], [1.3, -0.7, 5.3, 0.2, 0.7], [-3.1, -1.5, 5.0, 0.35, 1.2]];
  for (const [x, z, h, w0, w1] of lands) {
    const end = new THREE.Vector3(x, 0, z);
    beams.push({ start: end.clone().addScaledVector(dir, -h / -dir.y), end, width: [w0, w1] });
  }
  const rays = lightBeams(beams, flowers ? '#ffd090' : '#ffe8b0', flowers ? 0.26 : 0.28);
  extra.push(rays.mesh.geometry, rays.mesh.material as THREE.Material);
  group.add(rays.mesh);
  updates.push(rays.update);
  // Motes inside the shafts, and a sparse pollen drift (kit preset) across the clearing.
  const motes = dustMotes(beams, q === 'high' ? 26 : 14, rng, flowers ? '#ffe2a8' : '#fff4b0');
  extra.push(motes.points.geometry, motes.points.material as THREE.Material);
  group.add(motes.points);
  updates.push(motes.update);
  const pollen = particleSystem('pollen', { min: [-7, 0.4, -3.5], max: [7, 2.6, 3.5], count: q === 'high' ? 25 : 16 }, rng);
  extra.push(pollen);
  group.add(pollen.points);
  updates.push(pollen.update);
  // A faint warm glow over the lit pool (the key carries it; this only lifts it), plus small
  // soft patches where the shafts land.
  const pools = lightPools([
    [BATTLE_POOL.x, BATTLE_POOL.z, BATTLE_POOL.ru * 2.1, BATTLE_POOL.rv * 2.1],
    ...beams.map((b) => [b.end.x, b.end.z, 0.9 + b.width[1] * 0.9, 0.7 + b.width[1] * 0.6] as [number, number, number, number]),
  ], flowers ? '#5a4024' : '#4a4424', 1.4);
  group.add(pools);

  return {
    group,
    spots: [SPOTS[0].clone(), SPOTS[1].clone()],
    people: [PEOPLE[0].clone(), PEOPLE[1].clone()],
    trainerExit: new THREE.Vector3(6, 0, -6),
    spriteLight,
    key,
    update(t) { for (const u of updates) u(t); },
    setPixelSize(px) { motes.setPixelSize(px); pollen.setPixelSize(px); },
    dispose() { disposeGroup(group, extra); },
  };
}

/** The meadow floor: trodden dirt clearing, grass ring with blade flecks, a path, litter, flowers, chalk. */
function paintMeadowFloor(t: RgbaTile, wx: (x: number) => number, wz: (y: number) => number, variant: MeadowVariant, trainer: boolean) {
  const R = MEADOW_RAMPS;
  const rng = new Rng(variant === 'flowers' ? 91 : 90);
  const nA = noiseField(64, 64, rng, [[4, 0.5], [8, 0.3], [32, 0.2]]);
  const nB = noiseField(64, 64, rng, [[2, 0.6], [16, 0.4]]);
  const mac = macro(variant === 'flowers' ? 13 : 12);
  const flowers = variant === 'flowers';
  // Dirt clearing ellipse (smaller in the flower field: more grass), and a path toward the camera.
  const rx = flowers ? 4.6 : 5.4, rz = flowers ? 3.0 : 3.4;
  const pathD = (x: number, z: number) => {
    const segs: [number, number, number, number][] = [[-3.4, 2.4, -4.9, 6.6], [3.6, -2.2, 6.2, -6.0]];
    let d = 99;
    for (const [ax, az, bx, bz] of segs) {
      const abx = bx - ax, abz = bz - az;
      const tt = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz)));
      d = Math.min(d, Math.hypot(x - ax - abx * tt, z - az - abz * tt));
    }
    return d;
  };
  // Clods of dirt and clumps of grass: one flat shade per 2–4-texel cluster (lit top edge,
  // shaded underside), 4 shades each — clean clusters at mid-distance, never per-texel static.
  // Texture rows run along world z, which the camera foreshortens ~2×: clusters twice as tall in
  // texels read as round clumps on screen (not horizontal bricks).
  const clod = clusterMap(t.w, t.h, 3, 501, { aspect: 1.8 });
  const clump = clusterMap(t.w, t.h, 3, 502, { aspect: 2.2 });
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const X = wx(x), Z = wz(y);
    const k = y * t.w + x;
    const n = nA(x, y), m = mac(X, Z);
    const e = Math.hypot(X / rx, (Z - 0.1) / rz) + (m - 0.5) * 0.35 + (nB(x, y) - 0.5) * 0.22;
    const p = pathD(X, Z) / 0.75 + (n - 0.5) * 0.5;
    const dirtK = Math.max(1.12 - e, 1.0 - p) * 4; // >0 inside
    // The dirt/grass border follows whole grass clumps (a ragged, clumpy edge, no texel dither).
    const isDirt = dirtK + (clump.v[k]! - 0.5) * 1.1 > 0;
    if (isDirt) {
      // Trodden dirt: lighter in the worn centre, clods with a lit top and a dark underside —
      // calmer on the battle floor itself (softer clods, fewer rims) so the kin read against it.
      const calm = 1 - THREE.MathUtils.smoothstep(poolR(X, Z), 0.7, 1.15);
      const cv = clod.v[k]!;
      let v = 2.9 + (n - 0.5) * 1.2 + Math.min(1, dirtK * 0.25) * 0.8 + (m - 0.5) * (0.7 + calm * 0.4) + (cv - 0.5) * (1.3 - calm * 0.6);
      // Only the darker clods show a shaded underside, only the lighter ones a lit lip.
      if (clod.lo[k] && cv < 0.35 - calm * 0.15) v -= 0.85;
      else if (clod.hi[k] && cv > 0.72 + calm * 0.15) v += 0.6;
      t.set(x, y, R.dirt[Math.max(1, Math.min(5, Math.round(v)))]!);
    } else {
      // Grass: clumps in 4 shades, darker toward the dirt edge.
      const edge = dirtK > -0.9 ? 0.5 : 0;
      const gv = clump.v[k]!;
      let v = 2.7 + (n - 0.5) * 1.6 + (m - 0.5) * 1.4 - edge + (gv - 0.5) * 1.5;
      if (clump.lo[k] && gv < 0.55) v -= 0.9;
      else if (clump.hi[k] && gv > 0.5) v += 0.8;
      t.set(x, y, R.grass[Math.max(1, Math.min(5, Math.round(v)))]!);
    }
  }
  // Pebbles round the rim of the battle floor (2×2 with a lit corner and a dark one).
  for (let i = 0; i < 300; i++) {
    const x = rng.int(t.w), y = rng.int(t.h);
    const X = wx(x), Z = wz(y);
    if (Math.hypot(X / rx, (Z - 0.1) / rz) > 1.0 || poolR(X, Z) < 1.05) continue;
    const s = R.stone;
    t.set(x, y, s[5]!); t.set(x + 1, y, s[4]!); t.set(x, y + 1, s[3]!); t.set(x + 1, y + 1, s[2]!);
    t.set(x + 1, y + 2, R.dirt[1]!); t.set(x + 2, y + 1, R.dirt[1]!);
  }
  // Flowers in DRIFTS: patches of one colour (a few in the clearing's grass, many in the field),
  // each a loose cluster of 5-texel heads — colour fields, not confetti.
  const keys = (flowers ? ['yellow', 'white', 'pink', 'violet', 'orange', 'blue', 'red'] : ['white', 'yellow', 'violet']) as (keyof typeof PETALS)[];
  const drifts = flowers ? 46 : 14;
  for (let d = 0; d < drifts; d++) {
    const cx = rng.int(t.w), cy = rng.int(t.h);
    const X = wx(cx), Z = wz(cy);
    if (Math.hypot(X / rx, (Z - 0.1) / rz) < 1.05 || poolR(X, Z) < 1.2) continue;
    const pet = PETALS[keys[d % keys.length]!];
    const r = (flowers ? 10 : 7) + rng.int(flowers ? 12 : 6);
    for (let f = 0; f < r * (flowers ? 1.6 : 1.0); f++) {
      const a = rng.next() * Math.PI * 2, rr = Math.sqrt(rng.next()) * r;
      const x = Math.round(cx + Math.cos(a) * rr * 1.4), y = Math.round(cy + Math.sin(a) * rr);
      if (!t.inside(x, y) || Math.hypot(wx(x) / rx, (wz(y) - 0.1) / rz) < 1.0) continue;
      t.set(x - 1, y, pet[3]!); t.set(x + 1, y, pet[3]!); t.set(x, y - 1, pet[4]!); t.set(x, y + 1, pet[1]!);
      t.set(x, y, flowers && f % 3 === 0 ? '#f6d64a' : pet[4]!);
    }
  }
  if (trainer) paintTrodden(t, wx, wz);
}

export const ARENA: ArenaDef = {
  id: 'meadow',
  label: 'Meadow clearing',
  match: [{ route: 'meadow' }, { route: 'meadow', hotspot: 'tall-grass' }, { route: 'meadow', kind: 'trainer' }],
  build: (o) => buildMeadowSet(o, 'clearing'),
  grade: () => meadowGrade(false),
  background: '#9dc8e6',
  fog: '#a9c8b8',
  fogRange: [10, 40],
};
