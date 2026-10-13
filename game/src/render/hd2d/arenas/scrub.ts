// Ember Ridge outdoors ("Dry scrub", and Ridge Hiker Brann's trail duel): a sunset-lit shelf of
// cracked red earth on the ridge, ringed by terraced sandstone boulders (kit/rock.ts) with dry
// scrub bushes and a dead tree, open at the back onto a hazy canyon: three painted layers of
// mesas (stepped, banded strata, ragged caps, sunlit rims, hazier with distance) under a low
// sun. ONE low warm key from the back-left throws long shadows toward the camera and pools on
// the battle floor; weak plum fill; branching, tapering dry cracks in the floor; drifting ember
// motes and a heat-haze wobble on the far layers. All original and procedural.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { CELL, Heightmap, LEVEL, TEXEL, VoxelBatch, dustMotes, surfaceMaterial, type ArenaRig, type BeamSpec } from '../arena';
import { boulder, boulderColumns, organicTerraces, rubblePile } from '../kit/rock';
import { cachedTexture, paintBoulder, type Ramp } from '../textures';
import type { Grade } from '../pipeline';
import type { ArenaBuildOptions, ArenaDef } from './index';
import { BATTLE_POOL, nearStage, paintTrodden, poolR } from './meadow';
import {
  Foliage, SpriteAtlas, apron, backdrop, clusterMap, disposeGroup, foreground, glints, gobo, groundMesh, hash2, lightPools, macro, mkMesh, noiseField,
  paintBark, paintClouds, paintEarth, paintMesas, paintSky, paintTuft, paintTwigs, putRgb, rgb, sunRig, trunk, type RgbaTile, type V3,
} from './outdoorKit';

export const SCRUB_RAMPS = {
  sandstone: ['#3a1a16', '#5a2a1e', '#7a3c26', '#9a5230', '#b86a3c', '#d0864e', '#e4a666'],
  earth: ['#3e2219', '#583224', '#744430', '#8e583c', '#a66e4c', '#bc865e', '#d2a074'],
  crack: ['#22110e', '#3a1d15'],
  dry: ['#3a2a14', '#5a4220', '#7a5c2a', '#9a7834', '#b89440', '#d2b058', '#e8cc7a'],
  sage: ['#24281c', '#343c24', '#48522c', '#5e6a36', '#788442', '#959e54', '#b4b86e'],
  bark: ['#1e1210', '#2e1c16', '#42281e', '#583628', '#6e4634', '#865842', '#9e6c52'],
  sky: ['#3a2a5a', '#5a3a6e', '#8a4a72', '#b85a6a', '#e07a5a', '#f6a05a', '#ffc86e', '#ffe2a0'],
  mesaFar: ['#7a3e58', '#8a4a62', '#9c5868', '#ae6870', '#c07a78', '#d49084'],
  mesaMid: ['#4a2230', '#622c36', '#7e3a3c', '#9c4c42', '#ba624a', '#d68056', '#eca468'],
  mesaNear: ['#26121a', '#36181e', '#4a2024', '#622c2a', '#7e3a30', '#9c4e38', '#c06c44'],
} as const satisfies Record<string, Ramp>;

export function sunsetGrade(): Grade {
  return {
    lift: new THREE.Vector3(0.018, 0.006, 0.016), gamma: new THREE.Vector3(1.06, 1.06, 1.06), gain: new THREE.Vector3(1.06, 0.99, 0.9),
    saturation: 0.76, contrast: 1.05,
    shadowTint: new THREE.Color('#2a2050'), highTint: new THREE.Color('#ffc880'), splitAmount: 0.2,
    vignette: 0.3, vignetteSoft: 0.62,
    tiltTop: 1.0, tiltBottom: 0.6, focusTop: 0.8, focusBottom: 0.08,
    dither: 2.0, exposure: 1.62,
    shadowDesat: 0.2,
  };
}

const SPOTS: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-1.3, 0, 1.0), new THREE.Vector3(1.5, 0, -1.0)];
const PEOPLE: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-2.5, 0, 1.9), new THREE.Vector3(2.75, 0, -1.95)];
/** The shelf ends here; beyond is the canyon (backdrop). */
const EDGE_Z = -6.6;
/** Level of the front rock ledge where the set meets its apron. */
const FRONT_LV = 2;

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
    if (z > hm.z0 + (hm.nz - 2) * CELL) lv = FRONT_LV; // one even front ledge meets the apron
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
  // Apron: dark soil and dry grass in front of the front rock ledge, far past the near frustum
  // (portrait phones look down past the stage).
  {
    const zf = hm.z0 + hm.nz * CELL;
    const mott = macro(31);
    const ap = apron({
      x0: -40, x1: 40, z0: zf - 0.3, z1: zf + 34, y: FRONT_LV * LEVEL - 0.06, tileTexels: 64,
      map: cachedTexture('od-scrub-apron', () => paintEarth(84, S.earth, 64, { roots: 4, pebbles: 26, strata: 0.15 })),
      shade: (x, z) => (0.7 - 0.3 * THREE.MathUtils.smoothstep(z, zf, zf + 7)) * (0.94 + 0.12 * mott(x * 0.5, z * 0.5)),
    });
    extra.push(ap.material as THREE.Material);
    group.add(ap);
  }

  // ---- dead tree on the left tier (bark boxes) + twig crown sprites
  const bark = new VoxelBatch(32);
  const tx = -7.6, tz = -3.2, ty = topAt(tx, tz) - 0.05;
  const branch = (x: number, y: number, z: number, len: number, ang: number, tilt: number, th: number) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    bark.rotBox([x + c * len / 2 * Math.cos(tilt), y + Math.sin(tilt) * len / 2, z + s * len / 2 * Math.cos(tilt) * 0.3], [len, th, th], -ang * 0.3, new THREE.Color(1, 1, 1).multiplyScalar(0.9 + rng.next() * 0.2), rng, 0);
  };
  // A round, tapering dead trunk with a root flare and crooked limbs (not a square post).
  const top = trunk(bark, [tx, ty, tz], 3.4, 0.24, rng, { flare: 0.9, roots: 4, taper: 0.4, lean: [0.35, 0.05], branches: 3, sides: 8 });
  void top;
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
    // Keep the camera side of the battle floor open: no tufts between the kin and the lens.
    if (z > 2.6 && Math.abs(x) < 4.6) continue;
    const kind = rng.next();
    const sprite = kind < 0.28 ? 'scrub' : kind < 0.7 || Math.abs(x) < 5 ? 'dry' : 'tallDry';
    fol.add(atlas.get(sprite, rng), [x, topAt(x, z), z], 'billboard', { sway: sprite === 'scrub' ? 0.02 : 0.06, flip: rng.chance(0.5), tint: new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rng.next() * 0.25) });
  }
  // A few dry tufts along the drop edge (silhouetted against the sky).
  for (let x = -7; x < 7; x += 0.7 + rng.next() * 0.8) fol.add(atlas.get('dry', rng), [x, topAt(x, EDGE_Z + 0.3), EDGE_Z + 0.3], 'billboard', { sway: 0.07, flip: rng.chance(0.5) });
  // Phone foreground: dry grass and scrub patches on the front ledge and the soil below it.
  {
    const zf = hm.z0 + hm.nz * CELL;
    foreground(fol, {
      sprites: ['dry', 'tallDry', 'tallDry', 'scrub'], area: [-15, 4.4, 6, zf + 7], patches: q === 'high' ? 30 : 20, perPatch: [3, 6], rng,
      y: (x, z) => (z >= zf - 0.05 ? FRONT_LV * LEVEL - 0.06 : topAt(x, z)), keep: (x, z) => !nearStage(x, z, 2.4) && !(x > -4.8 && x < 4.4 && z < 6.8), k: 0.6, sway: 0.06,
    });
  }
  // Normals bent well up: backlit tufts still catch the sky and the low key on their tips.
  const folMesh = fol.build(atlasTex, { upNormal: 0.75 });
  group.add(folMesh);
  updates.push((t) => { fol.uTime.value = t; });

  // ---- the canyon: three painted layers at increasing depth (parallax + aerial perspective):
  // a near canyon rim, mid mesas, and the sky with the low sun and the farthest mesas. The
  // camera looks DOWN, so the canyon only shows below the shelf edge line: every layer is sized
  // for that band (desk and portrait), filled down to its bottom, and hazier with distance.
  const sunWorld: V3 = [-7.5, -1.2, -39.8];
  const layers: { z: number; x: [number, number]; y: [number, number]; d: number; gain: number; paint(t: RgbaTile, r: Rng, toY: (y: number) => number): void }[] = [
    {
      // Sky + far mesas (lightest, pink-violet, lowest contrast).
      z: -40, x: [-44, 44], y: [-22, 5], d: 7, gain: 0.92,
      paint: (t, r, toY) => {
        paintSunsetSky(t, toY(sunWorld[1]), Math.round((sunWorld[0] + 44) * 7));
        paintMesas(t, r, { ramp: S.mesaFar, foot: toY(-9), count: 7, w: [10, 24], h: [24, 40], haze: 0.18, sunX: (sunWorld[0] + 44) * 7, gullies: 0.5, hazeCol: '#c88088', cliff: 3.6 });
      },
    },
    {
      // Mid mesas: stronger strata, a lit sun-side flank and rim.
      z: -25, x: [-30, 30], y: [-14, 3.5], d: 11, gain: 0.44,
      paint: (t, r, toY) => paintMesas(t, r, { ramp: S.mesaMid, foot: toY(-6.5), count: 5, w: [12, 30], h: [30, 52], haze: 0.1, sunX: (sunWorld[0] + 30) * 11 - 120, gullies: 1, hazeCol: '#c07070', cliff: 3.2 }),
    },
    {
      // Near canyon rim: a low broken ridge with a few dead snags, darkest and warmest.
      z: -15, x: [-24, 24], y: [-8, 2.6], d: 14, gain: 0.42,
      paint: (t, r, toY) => paintMesas(t, r, { ramp: S.mesaNear, foot: toY(-3.2), count: 6, w: [18, 40], h: [10, 22], haze: 0.04, sunX: (sunWorld[0] + 24) * 14 - 160, gullies: 1.4, hazeCol: '#8a4a48', ridge: true }),
    },
  ];
  layers.forEach((L, k) => {
    const W = Math.round((L.x[1] - L.x[0]) * L.d), H = Math.round((L.y[1] - L.y[0]) * L.d);
    const toY = (y: number) => Math.round((L.y[1] - y) * L.d);
    const b = backdrop((t) => L.paint(t, new Rng(91 + k * 7), toY), W, H, [L.x[1] - L.x[0], L.y[1] - L.y[0]], [(L.x[0] + L.x[1]) / 2, (L.y[0] + L.y[1]) / 2, L.z], { haze: k === 0 ? 1 : k === 1 ? 0.5 : 0, gain: L.gain });
    b.mesh.renderOrder = -10 + k;
    extra.push(b.mesh.material as THREE.Material);
    group.add(b.mesh);
    updates.push(b.update);
  });
  // HDR glint on the sun disc so it blooms.
  const sunGlow = glints([sunWorld], 3.2, '#ffd890', 2.6);
  extra.push(sunGlow.points.geometry, sunGlow.points.material as THREE.Material);
  group.add(sunGlow.points);

  // ---- sunset light: ONE low warm key from the back-left (toward the sun), long shadows
  // toward the camera, a lit pool on the battle floor; weak plum sky fill (warm vs cool).
  const sunFrom = new THREE.Vector3(-0.55, 0.42, -0.8);
  const { key, spriteLight } = sunRig(group, {
    target: new THREE.Vector3(0.1, 0, 0), from: sunFrom, distance: 34, angle: 0.46, penumbra: 0.25, shadowRadius: 2,
    color: '#ffb070', intensity: 13, cookie: null,
    sky: '#8a78b8', ground: '#6a3a2a', hemi: 1.5,
    fill: '#c098c0', fillIntensity: 0.7, quality: q,
  });
  const gob = gobo(key, { kind: 'clouds', seed: 23, pool: { ...BATTLE_POOL, ru: BATTLE_POOL.ru * 1.15, rv: BATTLE_POOL.rv * 1.15, soft: 0.4 }, outside: 0.5, shade: 0.55, cover: 0.3, scale: 11 });
  extra.push(gob);
  const pool = lightPools([[BATTLE_POOL.x, BATTLE_POOL.z, BATTLE_POOL.ru * 2.2, BATTLE_POOL.rv * 2.2]], '#5a3018', 1.3);
  group.add(pool);

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

/**
 * Sunset sky on a backdrop tile: a SMOOTH gradient (violet zenith → rose → gold horizon) with a
 * warm halo round the low sun, a few long, hand-shaped clouds lit from below on the sun side
 * (violet bodies, hot gold undersides), and the sun disc. No banding.
 */
function paintSunsetSky(t: RgbaTile, sunY: number, sunX: number) {
  const S = SCRUB_RAMPS;
  const horizon = sunY + 26;
  paintSky(t, S.sky, 0, horizon * 1.08, { glow: { x: sunX, y: sunY, r: 150, color: '#ffd890', k: 0.75 } });
  // Below the horizon line the backdrop is hidden by the mesas; continue the last colour.
  for (let y = Math.floor(horizon * 1.08); y < t.h; y++) for (let x = 0; x < t.w; x++) putRgb(t, x, y, rgb(S.sky[S.sky.length - 1]!), 4);
  paintClouds(t, {
    seed: 93, count: 5, size: [40, 90], rows: [sunY - 40, sunY + 4], flat: 0.22, stretch: 3, ramp: ['#4a3062', '#6e3c6c', '#9a4c6c', '#c8645e', '#ec9060'],
    light: [0.15, 1], baseShade: -1.2, avoid: (x) => Math.abs(x - sunX) < 40,
  });
  for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) {
    const d = x * x + y * y;
    if (d <= 81) t.set(sunX + x, sunY + y, d > 60 ? '#ffe8b0' : '#fff8e2');
  }
}

/**
 * Cracked red earth, unique over the whole floor (no tiling): blotchy bands, then DRY CRACKS as
 * branching random walks — they wander, taper from 2 texels to a hairline and mostly end open
 * (no closed polygons), a lit lip on their near wall — plus scattered pebbles with a cast
 * shadow and painted dry-grass tufts. The battle floor stays calm (hairlines only).
 */
function paintScrubFloor(t: RgbaTile, wx: (x: number) => number, wz: (y: number) => number, trainer: boolean) {
  const S = SCRUB_RAMPS;
  const rng = new Rng(99);
  const nA = noiseField(64, 64, rng, [[4, 0.5], [8, 0.3], [32, 0.2]]);
  const mac = macro(29);
  // Hard-baked earth in clods and dry grass in clumps: one flat shade per 2–4-texel cluster
  // (taller in texels: the floor is foreshortened), 4 shades — clean clusters, no static.
  const clod = clusterMap(t.w, t.h, 3, 601, { aspect: 1.8 });
  const clump = clusterMap(t.w, t.h, 3, 602, { aspect: 2.2 });
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const X = wx(x), Z = wz(y);
    const k = y * t.w + x;
    const n = nA(x, y), m = mac(X, Z);
    const e = Math.hypot(X / 5.6, (Z - 0.1) / 3.6);
    const calm = 1 - THREE.MathUtils.smoothstep(poolR(X, Z), 0.7, 1.2);
    // Dry grass creeping in toward the tiers, whole clumps at a time.
    const gv = clump.v[k]!;
    if (e > 1.0 && gv < Math.min(0.7, (e - 1.0) * 1.4) * (0.6 + n)) {
      let g = 3.0 + (n - 0.5) * 1.6 + (gv - 0.5) * 1.6;
      if (clump.lo[k]) g -= 1; else if (clump.hi[k] && gv > 0.3) g += 0.9;
      t.set(x, y, S.dry[Math.max(1, Math.min(5, Math.round(g)))]!);
      continue;
    }
    const cv = clod.v[k]!;
    let v = 2.8 + (n - 0.5) * (1.2 - calm * 0.5) + (m - 0.5) * 1.1 + Math.max(0, 1 - e) * 0.6 + (cv - 0.5) * (1.3 - calm * 0.6);
    if (clod.lo[k] && cv < 0.35 - calm * 0.15) v -= 0.85;
    else if (clod.hi[k] && cv > 0.72 + calm * 0.15) v += 0.6;
    t.set(x, y, S.earth[Math.max(1, Math.min(5, Math.round(v)))]!);
  }
  // ---- cracks: branching, tapering random walks
  const crackDark = S.crack[0], crackMid = S.crack[1];
  const walk = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    for (let s = 0; s < len; s++) {
      a += (rng.next() - 0.5) * 0.55;
      x += Math.cos(a); y += Math.sin(a) * 0.8;
      const px = Math.round(x), py = Math.round(y);
      if (!t.inside(px, py)) return;
      const k = 1 - s / len;
      if (k < 0.18 && rng.chance(0.45)) continue; // the tail breaks up into dashes
      const calm = poolR(wx(px), wz(py)) < 0.95;
      t.set(px, py, k > 0.5 && !calm ? crackDark : crackMid);
      if (w * k > 1.2 && !calm) t.set(px + (Math.abs(Math.sin(a)) > 0.7 ? 1 : 0), py + (Math.abs(Math.sin(a)) > 0.7 ? 0 : 1), crackDark);
      t.scale(px, py + (w * k > 1.2 && !calm ? 2 : 1), 1.14); // lit near wall
      if (depth < 2 && rng.chance(0.045)) walk(x, y, a + (rng.chance(0.5) ? 1 : -1) * (0.6 + rng.next() * 0.6), len * (0.3 + rng.next() * 0.3), w * 0.6, depth + 1);
    }
  };
  const area = t.w * t.h;
  for (let c = 0; c < area / 3600; c++) {
    const x = rng.int(t.w), y = rng.int(t.h);
    const inCalm = poolR(wx(x), wz(y)) < 1;
    walk(x, y, rng.next() * Math.PI * 2, inCalm ? 14 + rng.int(14) : 30 + rng.int(60), inCalm ? 1 : 2.2, inCalm ? 2 : 0);
  }
  // ---- pebbles (lit top-left, dark rim, a cast shadow down-right) and dry-grass tufts
  for (let k = 0; k < 420; k++) {
    const x = rng.int(t.w), y = rng.int(t.h);
    if (poolR(wx(x), wz(y)) < 0.9 && rng.chance(0.85)) continue;
    const big = rng.chance(0.3);
    t.scale(x + 1, y + 1, 0.72); t.scale(x + 2, y + 1, 0.8); if (big) { t.scale(x + 2, y + 2, 0.75); t.scale(x + 3, y + 2, 0.82); }
    t.set(x, y, S.sandstone[5]!); t.set(x + 1, y, S.sandstone[4]!); t.set(x, y + 1, S.sandstone[2]!);
    if (big) { t.set(x + 1, y + 1, S.sandstone[3]!); t.set(x - 1, y, S.sandstone[4]!); t.set(x + 2, y + 1, S.sandstone[1]!); }
  }
  for (let k = 0; k < 160; k++) {
    const x = rng.int(t.w), y = rng.int(t.h);
    if (poolR(wx(x), wz(y)) < 1.05) continue;
    for (let b = -2; b <= 2; b++) {
      const len = 2 + rng.int(3);
      for (let i = 0; i < len; i++) t.set(x + Math.round(b * i * 0.5), y - i, S.dry[Math.min(S.dry.length - 1, 2 + i + (b === 0 ? 1 : 0))]!);
    }
    t.scale(x, y + 1, 0.8); t.scale(x + 1, y + 1, 0.85);
  }
  if (trainer) paintTrodden(t, wx, wz, [S.sandstone[6], S.sandstone[4], S.sandstone[1]], 1.1);
}

export const ARENA: ArenaDef = {
  id: 'scrub',
  label: 'Ridge scrub at sunset',
  match: [{ route: 'ridge', hotspot: 'scrub' }, { trainer: 'hiker-brann' }],
  build: buildScrubArena,
  grade: sunsetGrade,
  background: '#3a2018',
  fog: '#c87a6a',
  fogRange: [12, 50],
  // Flatter on phones so the sunset canyon stays in view above the shelf.
  camera: { portrait: { elev: 0.6 }, land: { elev: 0.6 } },
};
