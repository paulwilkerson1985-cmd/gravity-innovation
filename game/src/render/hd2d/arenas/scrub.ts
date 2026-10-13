// Ember Ridge outdoors ("Dry scrub", and Ridge Hiker Brann's trail duel): a sunset-lit shelf of
// cracked red earth on the ridge, ringed by terraced sandstone boulders (kit/rock.ts) with dry
// scrub bushes and a dead tree, open at the back onto a hazy canyon with distant red mesas and
// a low sun. Warm sunset key from the back-left (long shadows toward the camera), plum fill,
// drifting ember motes and a heat-haze wobble on the far mesas. All original and procedural.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { Heightmap, LEVEL, TEXEL, VoxelBatch, dustMotes, surfaceMaterial, type ArenaRig, type BeamSpec } from '../arena';
import { boulder, boulderColumns, organicTerraces, rubblePile } from '../kit/rock';
import { cachedTexture, ditherIndex, paintBoulder, type Ramp } from '../textures';
import type { Grade } from '../pipeline';
import type { ArenaBuildOptions, ArenaDef } from './index';
import { nearStage, paintChalkRing } from './meadow';
import {
  Foliage, SpriteAtlas, backdrop, disposeGroup, glints, groundMesh, hash2, macro, mkMesh, noiseField,
  paintBark, paintTuft, paintTwigs, paintSilhouette, sunRig, type RgbaTile, type V3,
} from './outdoorKit';

export const SCRUB_RAMPS = {
  sandstone: ['#3a1a16', '#5a2a1e', '#7a3c26', '#9a5230', '#b86a3c', '#d0864e', '#e4a666'],
  earth: ['#3e2219', '#583224', '#744430', '#8e583c', '#a66e4c', '#bc865e', '#d2a074'],
  crack: ['#22110e', '#3a1d15'],
  dry: ['#3a2a14', '#5a4220', '#7a5c2a', '#9a7834', '#b89440', '#d2b058', '#e8cc7a'],
  sage: ['#24281c', '#343c24', '#48522c', '#5e6a36', '#788442', '#959e54', '#b4b86e'],
  bark: ['#1e1210', '#2e1c16', '#42281e', '#583628', '#6e4634', '#865842', '#9e6c52'],
  sky: ['#3a2a5a', '#5a3a6e', '#8a4a72', '#b85a6a', '#e07a5a', '#f6a05a', '#ffc86e', '#ffe2a0'],
  mesaFar: ['#7a3e52', '#8a4a5a', '#9a5660', '#ab6466', '#c47a6c'],
  mesaNear: ['#3a1a28', '#4a2230', '#5e2c34', '#743a3a', '#8e4c40'],
} as const satisfies Record<string, Ramp>;

export function sunsetGrade(): Grade {
  return {
    lift: new THREE.Vector3(0.018, 0.006, 0.016), gamma: new THREE.Vector3(1.0, 1.0, 1.0), gain: new THREE.Vector3(1.06, 0.99, 0.9),
    saturation: 1.0, contrast: 1.08,
    shadowTint: new THREE.Color('#3a1f44'), highTint: new THREE.Color('#ffd08e'), splitAmount: 0.16,
    vignette: 0.42, vignetteSoft: 0.55,
    tiltTop: 1.0, tiltBottom: 0.6, focusTop: 0.8, focusBottom: 0.08,
    dither: 2.0, exposure: 1.04,
  };
}

const SPOTS: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-1.3, 0, 1.0), new THREE.Vector3(1.5, 0, -1.0)];
const PEOPLE: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-2.5, 0, 1.9), new THREE.Vector3(2.75, 0, -1.95)];
/** The shelf ends here; beyond is the canyon (backdrop). */
const EDGE_Z = -6.6;

export function buildScrubArena(opts: ArenaBuildOptions): ArenaRig {
  const S = SCRUB_RAMPS;
  const q = opts.quality;
  const rng = new Rng(opts.seed ?? 73);
  const group = new THREE.Group();
  group.name = 'hd2d-ridge-scrub';
  const extra: { dispose(): void }[] = [];
  const updates: ((t: number) => void)[] = [];

  // ---- heightmap: sandstone tiers on the sides (higher on the right), a low lip at the back
  // edge, the shelf open toward the canyon in the middle-back.
  const X0 = -15.3, Z0 = EDGE_Z - 0.9;
  const hm = new Heightmap(34, 16, X0, Z0);
  organicTerraces(hm, (x, z) => {
    const side = Math.abs(x) - (x > 0 ? 6.0 : 6.6);
    const front = (z - 4.0) * 1.6;
    return Math.max(side + Math.max(0, -z - 3) * 0.6, front);
  }, rng, { step: 1.5, max: 6, wobble: 0.5, clusters: 0.14 });
  for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
    const x = hm.cx(i), z = hm.cz(j);
    let lv = hm.get(i, j);
    if (Math.hypot(x / 6.2, (z - 0.2) / 4.0) < 1) lv = 0; // keep the shelf clear
    if (x > 0 && lv > 0) lv += 1; // right side rises higher
    if (z > 4.0) lv = Math.min(lv, z > 6 ? 2 : 1); // low front ledge
    if (z < EDGE_Z + 0.6 && Math.abs(x) < 8) lv = Math.max(lv, (hash2(i, j, 2) < 0.55 ? 1 : 0)); // broken lip at the drop
    hm.set(i, j, Math.min(lv, 7));
  }
  const topAt = (x: number, z: number) => { const [i, j] = hm.cell(x, z); const v = hm.get(i, j); return v > 90 ? 0 : v * LEVEL; };

  // ---- sandstone boulders (one mesh): tiers, rubble piles, a hiker's cairn
  const rock = new VoxelBatch(32);
  boulderColumns(hm, rock, rng, { shade: [0.72, 1.1], tints: ['#ffffff', '#ffe6d0', '#f0d8d0'], core: 0.28 });
  rubblePile(rock, [5.6, 0, 1.8], rng, { radius: 1.0 });
  rubblePile(rock, [-5.8, 0, -2.6], rng, { radius: 0.9 });
  rubblePile(rock, [-6.0, 0, 2.4], rng, { radius: 0.6 });
  // Cairn: a stack of flat stones by the trail (a hiker's marker).
  {
    const cx = 4.6, cz = -3.8;
    let y = 0;
    for (let k = 0; k < 5; k++) {
      const s = 0.62 - k * 0.1, hgt = 0.2 + rng.next() * 0.06;
      boulder(rock, [cx + (rng.next() - 0.5) * 0.06, y + hgt / 2, cz], [s, hgt, s * 0.9], new THREE.Color(1, 1, 1).multiplyScalar(0.95 + rng.next() * 0.2), rng, { ry: rng.next() * 3, chamfer: 0.06, topK: 1.3 });
      y += hgt * 0.95;
    }
  }
  const rockMat = surfaceMaterial(cachedTexture('od-sandstone', () => paintBoulder(81, 32, S.sandstone)), undefined, true);
  extra.push(rockMat);
  group.add(mkMesh(rock.build(), rockMat));

  // ---- cracked earth floor (one painted texture), worn trail and chalk for trainer duels
  const ground = groundMesh({
    x0: X0, x1: X0 + hm.nx * 0.9, z0: EDGE_Z - 0.6, z1: Z0 + hm.nz * 0.9, hm, aoK: 0.1,
    paint: (t, wx, wz) => paintScrubFloor(t, wx, wz, opts.trainerBattle),
  });
  extra.push(ground.texture);
  group.add(ground.mesh);

  // ---- dead tree on the left tier (bark boxes) + twig crown sprites
  const bark = new VoxelBatch(32);
  const tx = -7.6, tz = -3.2, ty = topAt(tx, tz) - 0.05;
  const branch = (x: number, y: number, z: number, len: number, ang: number, tilt: number, th: number) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    bark.rotBox([x + c * len / 2 * Math.cos(tilt), y + Math.sin(tilt) * len / 2, z + s * len / 2 * Math.cos(tilt) * 0.3], [len, th, th], -ang * 0.3, new THREE.Color(1, 1, 1).multiplyScalar(0.9 + rng.next() * 0.2), rng, 0);
  };
  bark.box([tx - 0.24, ty, tz - 0.24], [tx + 0.24, ty + 2.8, tz + 0.24], new THREE.Color(1, 1, 1), rng, { aoBottom: 0.5 });
  bark.box([tx - 0.16, ty + 2.8, tz - 0.16], [tx + 0.16, ty + 3.7, tz + 0.16], new THREE.Color(0.95, 0.95, 0.95), rng);
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, 1]] as const) bark.box([tx + dx * 0.3 - 0.13, ty, tz + dz * 0.3 - 0.13], [tx + dx * 0.3 + 0.13, ty + 0.25, tz + dz * 0.3 + 0.13], new THREE.Color(0.85, 0.85, 0.85), rng);
  // Two crooked limbs (stacked short boxes stepping outward).
  for (const [side, y0] of [[1, 2.2], [-1, 2.9]] as const) {
    let x = tx, y = ty + y0;
    for (let k = 0; k < 4; k++) {
      bark.box([x + (side > 0 ? 0 : -0.42), y, tz - 0.1], [x + (side > 0 ? 0.42 : 0), y + 0.2, tz + 0.1], new THREE.Color(0.9, 0.9, 0.9), rng);
      x += side * 0.38; y += 0.22 + k * 0.06;
    }
  }
  void branch;
  const barkMat = surfaceMaterial(cachedTexture('od-bark-ridge', () => paintBark(82, S.bark)), undefined, true);
  extra.push(barkMat);
  group.add(mkMesh(bark.build(), barkMat));

  // ---- sprites: twig crowns, dry scrub, sage bushes, dry grass
  const atlas = new SpriteAtlas(256);
  for (let k = 0; k < 2; k++) atlas.add('crown', 56, 44, (p) => paintTwigs(p, new Rng(700 + k), S.bark, 4, 1.3));
  for (let k = 0; k < 4; k++) atlas.add('scrub', 30, 20, (p) => {
    const r = new Rng(720 + k);
    paintTwigs(p, r, S.bark, 4, 1.6);
    // Sparse dusty leaves on the twigs.
    for (let i = 0; i < 70; i++) { const x = r.int(30), y = r.int(14); if (p.has(x, y + 1) || p.has(x - 1, y)) p.shade(x, y, S.sage, 2 + r.next() * 3); }
  });
  for (let k = 0; k < 3; k++) atlas.add('dry', 16, 13, (p) => paintTuft(p, new Rng(740 + k), S.dry, 10, 1.2));
  for (let k = 0; k < 3; k++) atlas.add('tallDry', 20, 22, (p) => paintTuft(p, new Rng(750 + k), S.dry, 14, 1.4));
  const atlasTex = atlas.texture();
  extra.push(atlasTex);
  const fol = new Foliage(atlas);
  fol.add(atlas.get('crown', rng), [tx, ty + 2.6, tz + 0.05], 'billboard', { scale: TEXEL * 1.2, sway: 0.015 });
  fol.add(atlas.get('crown', rng), [tx + 0.9, ty + 2.2, tz - 0.1], 'billboard', { scale: TEXEL * 0.9, sway: 0.02, flip: true });
  for (let k = 0; k < 120; k++) {
    const a = rng.next() * Math.PI * 2, r = 0.85 + Math.pow(rng.next(), 1.4) * 0.6;
    const x = Math.cos(a) * 6.6 * r, z = 0.2 + Math.sin(a) * 4.3 * r;
    if (nearStage(x, z, 1.9) || z < EDGE_Z + 0.3 || z > 6.5) continue;
    const kind = rng.next();
    const sprite = kind < 0.28 ? 'scrub' : kind < 0.7 ? 'dry' : 'tallDry';
    fol.add(atlas.get(sprite, rng), [x, topAt(x, z), z], 'billboard', { sway: sprite === 'scrub' ? 0.02 : 0.06, flip: rng.chance(0.5), tint: new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rng.next() * 0.25) });
  }
  // A few dry tufts along the drop edge (silhouetted against the sky).
  for (let x = -7; x < 7; x += 0.7 + rng.next() * 0.8) fol.add(atlas.get('dry', rng), [x, topAt(x, EDGE_Z + 0.3), EDGE_Z + 0.3], 'billboard', { sway: 0.07, flip: rng.chance(0.5) });
  const folMesh = fol.build(atlasTex, { upNormal: 0.4 });
  group.add(folMesh);
  updates.push((t) => { fol.uTime.value = t; });

  // ---- the canyon: sunset sky, low sun, distant mesas (heat haze), near ridge silhouettes
  // The canyon is seen BELOW the shelf edge line (the camera looks down), so the painted
  // horizon sits low: plane PW×PH centred at y = PY on z = PZ (visible band ≈ y −9…−1).
  const BW = 640, BH = 180, PW = 52, PH = 15, PY = -5.2, PZ = -26;
  const sunPx = [262, 64] as const;
  const back = backdrop((t) => {
    for (let y = 0; y < t.h; y++) {
      const v = Math.min(1, Math.pow(y / (t.h * 0.66), 1.1)) * (S.sky.length - 1);
      for (let x = 0; x < t.w; x++) {
        const d = Math.hypot(x - sunPx[0], (y - sunPx[1]) * 1.3);
        // Coarse 2×2 dither so the bands read at this distance.
        t.set(x, y, S.sky[ditherIndex(Math.min(S.sky.length - 1, v + Math.max(0, 1 - d / 90) * 1.6), x >> 1, y >> 1, S.sky.length)]!);
      }
    }
    // Sun disc and thin cloud streaks.
    for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) if (x * x + y * y <= 121) t.set(sunPx[0] + x, sunPx[1] + y, x * x + y * y > 90 ? '#ffe8b0' : '#fff8e0');
    const r = new Rng(91);
    for (let k = 0; k < 14; k++) {
      const cy = 10 + r.int(70), cx = r.int(t.w), len = 40 + r.int(100);
      for (let i = 0; i < len; i++) { t.set(cx + i, cy, S.sky[3 + (cy > 45 ? 2 : 0)]!); t.set(cx + i + 1, cy + 1, S.sky[3 + (cy > 45 ? 2 : 0)]!); if (i > 6 && i < len - 8) { t.set(cx + i + 4, cy + 2, S.sky[2]!); t.set(cx + i + 4, cy + 3, S.sky[2]!); } }
    }
    paintSilhouette(t, r, S.mesaFar, t.h * 0.6, 42, 46, t.h, { flatTop: true, lightLeft: true });
    paintSilhouette(t, r, S.mesaNear, t.h * 0.76, 30, 30, t.h, { flatTop: true });
    paintSilhouette(t, r, S.mesaNear.slice(0, 3) as unknown as Ramp, t.h * 0.9, 14, 16, t.h);
  }, BW, BH, [PW, PH], [0, PY, PZ], { haze: 1 });
  extra.push(back.mesh.material as THREE.Material);
  group.add(back.mesh);
  updates.push(back.update);
  // HDR glint on the sun disc so it blooms.
  const sunWorld: V3 = [-PW / 2 + (sunPx[0] / BW) * PW, PY + PH / 2 - (sunPx[1] / BH) * PH, PZ + 0.2];
  const sunGlow = glints([sunWorld], 2.2, '#ffd890', 2.4);
  extra.push(sunGlow.points.geometry, sunGlow.points.material as THREE.Material);
  group.add(sunGlow.points);

  // ---- sunset light: low warm key from the back-left (toward the sun), plum sky fill
  const sunFrom = new THREE.Vector3(-0.55, 0.5, -0.8);
  const { key, spriteLight } = sunRig(group, {
    target: new THREE.Vector3(0, 0, 0), from: sunFrom, distance: 34, angle: 0.42,
    color: '#ffb070', intensity: 7.0, cookie: null,
    sky: '#d898a8', ground: '#5a2e24', hemi: 1.55,
    fill: '#a890d0', fillIntensity: 0.5, quality: q,
  });

  // ---- ember motes and dust drifting across the shelf
  const drift: BeamSpec[] = [
    { start: new THREE.Vector3(-8, 0.6, -4), end: new THREE.Vector3(8, 2.6, -2), width: [4, 4] },
    { start: new THREE.Vector3(8, 0.8, 3), end: new THREE.Vector3(-8, 2.2, 1), width: [3.5, 3.5] },
    { start: new THREE.Vector3(-6, 0.4, 0.5), end: new THREE.Vector3(6, 3.0, -5), width: [3, 3] },
  ];
  const embers = dustMotes(drift, q === 'high' ? 40 : 24, rng, '#ff9a4a');
  extra.push(embers.points.geometry, embers.points.material as THREE.Material);
  group.add(embers.points);
  updates.push(embers.update);

  return {
    group,
    spots: [SPOTS[0].clone(), SPOTS[1].clone()],
    people: [PEOPLE[0].clone(), PEOPLE[1].clone()],
    trainerExit: new THREE.Vector3(7, 0, -5),
    spriteLight,
    key,
    update(t) { for (const u of updates) u(t); },
    setPixelSize(px) { embers.setPixelSize(px); },
    dispose() { disposeGroup(group, extra); },
  };
}

/** Cracked red earth: blotchy ramp with a polygonal crack network, dry grass flecks, a worn trail. */
function paintScrubFloor(t: RgbaTile, wx: (x: number) => number, wz: (y: number) => number, trainer: boolean) {
  const S = SCRUB_RAMPS;
  const rng = new Rng(99);
  const nA = noiseField(64, 64, rng, [[4, 0.5], [8, 0.3], [32, 0.2]]);
  const mac = macro(29);
  // Voronoi cells (~0.9 units) for the crack network.
  const cell = 1.25;
  const seed = (i: number, j: number): [number, number] => [(i + 0.2 + hash2(i, j, 11) * 0.6) * cell, (j + 0.2 + hash2(i, j, 12) * 0.6) * cell];
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const X = wx(x), Z = wz(y);
    const n = nA(x, y), m = mac(X, Z);
    const ci = Math.floor(X / cell), cj = Math.floor(Z / cell);
    let d1 = 99, d2 = 99, owner = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const [sx, sz] = seed(ci + a, cj + b);
      const d = Math.hypot(X - sx, Z - sz);
      if (d < d1) { d2 = d1; d1 = d; owner = hash2(ci + a, cj + b, 13); } else if (d < d2) d2 = d;
    }
    const e = Math.hypot(X / 5.6, (Z - 0.1) / 3.6);
    let v = 2.6 + (n - 0.5) * 2.0 + (m - 0.5) * 0.9 + (owner - 0.5) * 0.35 + Math.max(0, 1 - e) * 0.7;
    // Plates curl up a little: lit near-edge on the upper side of each plate.
    const crack = d2 - d1 < TEXEL * 0.7 && e > 0.25 && nA(x * 2, y * 2) > 0.38;
    if (crack) { t.set(x, y, S.crack[hash2(x, y, 7) < 0.6 ? 0 : 1]!); continue; }
    if (d2 - d1 < TEXEL * 1.8) v += 0.6;
    // Dry grass creeping in toward the tiers.
    if (e > 1.0 && hash2(x, y, 5) < Math.min(0.6, (e - 1.0) * 1.2) * (0.6 + n)) {
      t.set(x, y, S.dry[ditherIndex(2.5 + (n - 0.5) * 3 + (hash2(x, y, 6) < 0.15 ? 1.5 : 0), x, y, S.dry.length)]!);
      continue;
    }
    if (hash2(x, y, 3) < 0.05) v += hash2(x, y, 4) < 0.5 ? -1 : 1;
    t.set(x, y, S.earth[ditherIndex(v, x, y, S.earth.length)]!);
  }
  // Pebbles.
  for (let k = 0; k < 300; k++) {
    const x = rng.int(t.w), y = rng.int(t.h);
    t.set(x, y, S.sandstone[5]!); t.set(x + 1, y, S.sandstone[4]!); t.set(x, y + 1, S.sandstone[2]!); t.set(x + 1, y + 1, S.sandstone[1]!);
  }
  if (trainer) paintChalkRing(t, wx, wz, ['#8a6a58', '#a88a72', '#c6aa8e', '#dcc4a6']);
}

export const ARENA: ArenaDef = {
  id: 'scrub',
  label: 'Ridge scrub at sunset',
  match: [{ route: 'ridge', hotspot: 'scrub' }, { trainer: 'hiker-brann' }],
  build: buildScrubArena,
  grade: sunsetGrade,
  background: '#e07a5a',
  fog: '#c87a6a',
  fogRange: [12, 50],
  // Flatter on phones so the sunset canyon stays in view above the shelf.
  camera: { portrait: { elev: 0.6 }, land: { elev: 0.6 } },
};
