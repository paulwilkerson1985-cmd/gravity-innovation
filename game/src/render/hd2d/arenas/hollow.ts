// Mossy Meadow "Rocky hollow" (cave-kind hotspot): a sunken grotto of mossy grey-green rock
// that opens at the back-left onto the bright meadow. Sunlight pours in through the opening
// under a rock arch (cookie spot + shafts + motes), lands on the floor and on a still pool;
// vines hang from the arch and the ledges, ferns and moss tufts sit in the corners, and a few
// glowing cave mushrooms give small bloom accents in the shade. All original and procedural.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { CELL, Heightmap, LEVEL, TEXEL, VoxelBatch, dustMotes, lightBeams, surfaceMaterial, type ArenaRig, type BeamSpec } from '../arena';
import { cachedTexture, paintBoulder, type Ramp } from '../textures';
import { boulder, boulderColumns } from '../kit/rock';
import type { Grade } from '../pipeline';
import type { ArenaBuildOptions, ArenaDef } from './index';
import { MEADOW_RAMPS, nearStage, paintTrodden } from './meadow';
import {
  Foliage, SpriteAtlas, backdrop, dappleCookie, disposeGroup, glints, groundMesh, hash2, lightPools, macro, mkMesh, noiseField,
  paintCanopy, paintEarth, paintSilhouette, paintSky, paintTuft, paintTurf, paintVine, sunRig, terraces, type RgbaTile, type V3,
} from './outdoorKit';

export const HOLLOW_RAMPS = {
  rock: ['#2c2e2a', '#3e423b', '#52574d', '#686e60', '#7f8573', '#989c86', '#b2b49c'],
  moss: ['#182b1c', '#213d22', '#2e5229', '#3e6830', '#517f37', '#6a9840', '#88b04c'],
  floor: ['#3a3730', '#4d493f', '#625d50', '#787262', '#8e8774', '#a59e88', '#bdb59d'],
  water: ['#0d1f26', '#123039', '#17434c', '#1e5960', '#2b7273', '#4c9590', '#8ac3b4', '#d6f0dc'],
  shroom: ['#1a2c3a', '#2a5a6a', '#46a2a8', '#8ee8de', '#e6fff6'],
} as const satisfies Record<string, Ramp>;

export function hollowGrade(): Grade {
  return {
    lift: new THREE.Vector3(0.006, 0.012, 0.012), gamma: new THREE.Vector3(1.1, 1.1, 1.1), gain: new THREE.Vector3(1.03, 1.02, 0.95),
    saturation: 0.8, contrast: 1.05,
    shadowTint: new THREE.Color('#1a2c34'), highTint: new THREE.Color('#fff0bc'), splitAmount: 0.12,
    vignette: 0.22, vignetteSoft: 0.7,
    tiltTop: 1.0, tiltBottom: 0.6, focusTop: 0.8, focusBottom: 0.08,
    dither: 2.0, exposure: 1.5,
  };
}

const SPOTS: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-1.3, 0, 1.0), new THREE.Vector3(1.5, 0, -1.0)];
const PEOPLE: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-2.5, 0, 1.9), new THREE.Vector3(2.75, 0, -1.95)];
const POOL = { x: -4.9, z: -1.6, rx: 1.75, rz: 1.15 };
const GAP = { x0: -6.6, x1: -2.4, z: -4.6 };
const ARCH_Y = 5 * LEVEL;

export function buildHollowArena(opts: ArenaBuildOptions): ArenaRig {
  const H = HOLLOW_RAMPS;
  const q = opts.quality;
  const rng = new Rng(opts.seed ?? 57);
  const group = new THREE.Group();
  group.name = 'hd2d-meadow-hollow';
  const extra: { dispose(): void }[] = [];
  const updates: ((t: number) => void)[] = [];

  // ---- heightmap: a bowl of tall mossy rock; a passage out at the back-left rising to the meadow
  const X0 = -14.4, Z0 = -14.4;
  // 35 rows: the low front ledge runs on under the portrait (phone) camera, past its bottom edge.
  const hm = new Heightmap(32, 35, X0, Z0);
  for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
    const x = hm.cx(i), z = hm.cz(j);
    const wob = Math.sin(x * 1.3 + z * 0.7) * 0.35 + Math.sin(z * 2.1 - x * 0.4) * 0.25 + Math.sin(x * 0.45 - z * 0.8 + 1.7) * 0.3;
    // Organic clearing: an ellipse SDF with a wobbling rim (no rectangle), rising in half and
    // full steps; the front stays low so the camera sees in.
    const e = Math.hypot(x / 6.3, (z - 0.2) / 4.0);
    const d = (e - 1) * 5.2 + wob;
    let lv = 0;
    if (d > 0) lv = 1 + 0.5 * Math.floor(d / 0.7) + (d > 2.6 ? Math.floor((d - 2.6) / 0.9) : 0);
    if (z > 3.4) lv = Math.min(lv, z > 5.6 ? 2 : 1);
    // The passage: low ground climbing gently out toward the meadow behind the arch.
    if (x > GAP.x0 && x < GAP.x1 && z < -2.6) lv = Math.min(lv, z > GAP.z - 1.4 ? 0 : 1 + Math.floor((GAP.z - 1.4 - z) / 2.4));
    if (lv > 0 && lv < 8) {
      const cl = Math.sin(Math.floor(i / 2) * 12.9898 + Math.floor(j / 2) * 78.233) * 43758.5453;
      const n = cl - Math.floor(cl);
      lv = Math.max(1, lv + (n > 0.8 ? 0.5 : n < 0.1 ? -0.5 : 0));
    }
    hm.set(i, j, Math.min(lv, 9));
  }
  const topAt = (x: number, z: number) => { const [i, j] = hm.cell(x, z); const v = hm.get(i, j); return v > 90 ? 0 : v * LEVEL; };

  // ---- atlas: vines, moss fringe, ferns, tufts, bushes for the meadow outside
  const atlas = new SpriteAtlas(256);
  for (let k = 0; k < 4; k++) atlas.add('vine', 7, 28 + k * 8, (p) => paintVine(p, new Rng(600 + k), H.moss), [3.5, 0]);
  for (let k = 0; k < 4; k++) atlas.add('fringe', 15, 14, (p) => {
    const r = new Rng(620 + k);
    for (let x = 0; x < 15; x++) {
      const len = 3 + r.int(4) + (r.chance(0.35) ? 3 + r.int(5) : 0);
      for (let y = 0; y < len; y++) p.band(x, y, H.moss, 5.0 - y * 0.55 - (y === len - 1 ? 0.7 : 0));
    }
  }, [7.5, 0]);
  for (let k = 0; k < 3; k++) atlas.add('fern', 22, 16, (p) => paintTuft(p, new Rng(640 + k), H.moss, 10, 2.2));
  for (let k = 0; k < 3; k++) atlas.add('tuft', 14, 11, (p) => paintTuft(p, new Rng(650 + k), MEADOW_RAMPS.grass, 8));
  for (let k = 0; k < 2; k++) atlas.add('bush', 46, 32, (p) => paintCanopy(p, new Rng(660 + k), MEADOW_RAMPS.leaf, { clumps: 6 }));
  for (let k = 0; k < 2; k++) atlas.add('canopy', 88, 74, (p) => paintCanopy(p, new Rng(670 + k), MEADOW_RAMPS.leaf, { clumps: 8 }));
  const atlasTex = atlas.texture();
  extra.push(atlasTex);
  const fol = new Foliage(atlas);

  // ---- rock walls (stone sides, moss tops, moss drips)
  const texRock = cachedTexture('od-boulder-hollow', () => paintBoulder(71, 32, H.rock));
  const texMoss = cachedTexture('od-moss-hollow', () => paintTurf(72, H.moss, 32, { lo: 1.8, hi: 4.6, flecks: 0.1 }));
  // Rocky grotto walls: chunky rounded boulders (rock kit) under rounded moss caps with long
  // hanging moss — no flat earth slabs. The moss tops come from the organic terraces (lips,
  // diagonal corners), sitting just over the boulder tops.
  const rock = new VoxelBatch(32);
  boulderColumns(hm, rock, rng, { tints: ['#ffffff', '#eef4ea', '#f4f2e6'], shade: [0.82, 1.2], core: 0.22, lite: q === 'low' });
  const tops = new VoxelBatch(32);
  terraces(hm, new VoxelBatch(32), tops, rng, { topK: 1.0, jitter: 0.2, lip: 0.15, baseY: 0.03, sides: false, fringe: { foliage: fol, sprite: 'fringe', rng: new Rng(9), chance: 1, long: 1.1 } });
  // The arch over the passage: a lintel of boulders spanning the wall, with a ragged underside.
  for (let x = GAP.x0 - 0.45; x < GAP.x1 + 0.45; x += CELL * 0.85) {
    const sag = (hash2(Math.round(x * 3), 1, 3) < 0.5 ? 1 : 0) * 0.3;
    for (let z = GAP.z - 2.0; z < GAP.z - 0.2; z += CELL) {
      const h = 2 * LEVEL + sag;
      boulder(rock, [x + CELL / 2, ARCH_Y - sag + h / 2, z + CELL / 2], [CELL * 0.95, h, CELL * 0.95], new THREE.Color(1, 1, 1).multiplyScalar(0.9 + rng.next() * 0.25), rng, { ry: (rng.next() - 0.5) * 0.3, topK: 1.2 });
    }
    tops.box([x - 0.03, ARCH_Y + 2 * LEVEL - 0.05, GAP.z - 2.05], [x + CELL * 0.85 + 0.01, ARCH_Y + 2 * LEVEL + 0.05, GAP.z - 0.2], new THREE.Color(1, 1, 1), rng);
  }
  const nearShade = (x: number, y: number, z: number) => 1 - 0.12 * THREE.MathUtils.smoothstep(z, 3.4, 7.0);
  tops.shade(nearShade); rock.shade(nearShade);
  // Upper walls catch the sky from the open meadow above: lighter toward the rim.
  rock.shade((x, y) => 1 + 0.22 * Math.min(1, Math.max(0, y) / 4));
  tops.shade((x, y) => 1 + 0.12 * Math.min(1, Math.max(0, y) / 4));
  const rockMat = surfaceMaterial(texRock, undefined, true);
  const mossMat = surfaceMaterial(texMoss);
  extra.push(rockMat, mossMat);
  group.add(mkMesh(rock.build(), rockMat));
  group.add(mkMesh(tops.build(), mossMat));
  const stone = new VoxelBatch(32);

  // ---- floor (damp packed earth, moss toward the walls, wet rim by the pool)
  const ground = groundMesh({
    x0: X0, x1: X0 + hm.nx * CELL, z0: Z0, z1: Z0 + hm.nz * CELL, hm, aoK: 0.22,
    paint: (t, wx, wz) => paintHollowFloor(t, wx, wz, opts.trainerBattle),
  });
  extra.push(ground.texture);
  group.add(ground.mesh);

  // ---- pool: pixel-quantised animated water (unlit shader, fake sun sparkle)
  const water = waterMesh(POOL, H.water);
  extra.push(water.mesh.geometry, water.mesh.material as THREE.Material);
  group.add(water.mesh);
  updates.push(water.update);

  // ---- stones: pool rim, rubble at the wall feet
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2 + rng.next() * 0.2;
    const x = POOL.x + Math.cos(a) * (POOL.rx + 0.1), z = POOL.z + Math.sin(a) * (POOL.rz + 0.08);
    if (nearStage(x, z, 1.3)) continue;
    const s = 0.2 + rng.next() * 0.22;
    stone.rotBox([x, s * 0.3, z], [s * 1.4, s * 0.75, s], a + rng.next(), new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rng.next() * 0.3), rng);
  }
  const rubble = (cx: number, cz: number, r: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next()) * r;
      const s = 0.2 + rng.next() * 0.38 * (1 - (d / r) * 0.6);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d * 0.8;
      stone.rotBox([x, s * 0.4, z], [s * (0.9 + rng.next() * 0.5), s * 0.85, s], rng.next() * Math.PI, new THREE.Color(1, 1, 1).multiplyScalar(0.95 + rng.next() * 0.3), rng, (rng.next() - 0.5) * 0.4);
    }
  };
  rubble(5.2, -2.4, 1.0, 18);
  rubble(5.4, 2.2, 0.9, 14);
  rubble(-5.6, 2.6, 0.7, 9);
  rubble(1.2, 3.6, 0.6, 7);
  const stoneMat = surfaceMaterial(cachedTexture('od-stone', () => paintEarth(53, MEADOW_RAMPS.stone, 32, { roots: 2, pebbles: 2, strata: 0.2 })), undefined, true);
  extra.push(stoneMat);
  group.add(mkMesh(stone.build(), stoneMat));

  // ---- glowing cave mushrooms (bloom accents in the shade)
  const glow = new VoxelBatch(16);
  for (const [x, z] of [[6.0, 0.6], [-6.0, 0.9], [4.4, -3.4], [6.2, 3.1], [-1.8, -3.8]] as const) {
    const y = topAt(x, z);
    for (let k = 0; k < 4; k++) {
      const ox = x + (rng.next() - 0.5) * 0.5, oz = z + (rng.next() - 0.5) * 0.4, hgt = 0.12 + rng.next() * 0.16;
      glow.box([ox - 0.025, y, oz - 0.025], [ox + 0.025, y + hgt, oz + 0.025], new THREE.Color('#9fd8c8').multiplyScalar(0.9), rng);
      glow.box([ox - 0.09, y + hgt, oz - 0.09], [ox + 0.09, y + hgt + 0.07, oz + 0.09], new THREE.Color(H.shroom[3]).multiplyScalar(2.3), rng);
    }
  }
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  extra.push(glowMat);
  group.add(mkMesh(glow.build(), glowMat, false, false));

  // ---- vines from the arch and the ledges, ferns and tufts in corners, the meadow outside
  for (let x = GAP.x0 - 0.2; x < GAP.x1 + 0.3; x += 0.32 + rng.next() * 0.3) {
    fol.add(atlas.get('vine', rng), [x, ARCH_Y - 0.1, GAP.z - 0.25 - rng.next() * 0.3], 'billboard', { sway: 0.05, flip: rng.chance(0.5) });
  }
  for (let k = 0; k < 40; k++) {
    const i = rng.int(hm.nx), j = rng.int(hm.nz);
    const v = hm.get(i, j);
    if (v < 2 || v > 7) continue;
    const x = hm.cx(i), z = hm.cz(j) + CELL / 2;
    if (hm.get(i, j + 1) >= v || z < -9 || Math.abs(x) > 12) continue;
    fol.add(atlas.get('vine', rng), [x + (rng.next() - 0.5) * 0.6, v * LEVEL, z + 0.03], 'billboard', { sway: 0.03, flip: rng.chance(0.5), tint: new THREE.Color(0.85, 0.9, 0.85) });
  }
  for (let k = 0; k < 70; k++) {
    const a = rng.next() * Math.PI * 2, r = 0.82 + rng.next() * 0.3;
    const x = Math.cos(a) * 6.2 * r, z = 0.1 + Math.sin(a) * 4.0 * r;
    if (nearStage(x, z, 1.8) || Math.hypot((x - POOL.x) / POOL.rx, (z - POOL.z) / POOL.rz) < 1.1) continue;
    fol.add(atlas.get(rng.chance(0.55) ? 'fern' : 'tuft', rng), [x, topAt(x, z), z], 'billboard', { sway: 0.04, flip: rng.chance(0.5), tint: new THREE.Color(1, 1, 1).multiplyScalar(0.8 + rng.next() * 0.25) });
  }
  // Outside: bright meadow beyond the arch (bushes, a tree, grass) — sunlit, so it glows.
  for (let k = 0; k < 10; k++) {
    const x = GAP.x0 - 1 + rng.next() * (GAP.x1 - GAP.x0 + 2), z = -8 - rng.next() * 4;
    fol.add(atlas.get(rng.chance(0.7) ? 'bush' : 'tuft', rng), [x, topAt(x, z), z], 'billboard', { sway: 0.03, flip: rng.chance(0.5) });
  }
  fol.add(atlas.get('canopy', rng), [-4.4, topAt(-4.4, -11) + 1.2, -11], 'billboard', { scale: TEXEL * 1.4, sway: 0.02 });
  const folMesh = fol.build(atlasTex, { upNormal: 0.5 });
  group.add(folMesh);
  updates.push((t) => { fol.uTime.value = t; });

  // Far backdrop: sky and meadow tree line seen through the passage.
  const back = backdrop((t) => {
    paintSky(t, MEADOW_RAMPS.sky, 0, Math.round(t.h * 0.75));
    const r = new Rng(81);
    paintSilhouette(t, r, MEADOW_RAMPS.far, t.h * 0.7, 16, 9, t.h, { haze: 0.5 });
    paintSilhouette(t, r, MEADOW_RAMPS.leaf.slice(2) as unknown as Ramp, t.h * 0.88, 18, 8, t.h, { haze: 0.15 });
  }, 200, 90, [40, 18], [-4, 6, -18]);
  extra.push(back.mesh.material as THREE.Material);
  group.add(back.mesh);

  // ---- light: ONE dominant key — a high sun from the back left falling through the canopy at the
  // rim (leaf-dapple gobo) onto the kin, with a lit focal pool where they stand; a dim cool fill.
  const stage = new THREE.Vector3(0.1, 0, 0.1);
  const sunFrom = new THREE.Vector3(-0.42, 1.0, -0.5);
  const cookie = dappleCookie(57, { holes: 0.5, edge: 0.5 });
  extra.push(cookie);
  const { key, spriteLight } = sunRig(group, {
    target: stage, from: sunFrom, distance: 30, angle: 0.15,
    color: '#ffeec4', intensity: 7.5, cookie,
    sky: '#b8d0c4', ground: '#3e3a2c', hemi: 1.75,
    fill: '#c8d8d0', fillIntensity: 0.45, quality: q,
  });
  if (q === 'high') {
    const bounce = new THREE.PointLight(new THREE.Color('#9fe0c8'), 2.0, 5, 1.6);
    bounce.position.set(5.8, 1.0, 0.6);
    group.add(bounce);
  }
  const dir = sunFrom.clone().normalize().negate();
  const beams: BeamSpec[] = [];
  // Three shafts of unequal width and spacing down through the canopy gap onto the stage.
  for (const [ox, oz, w0, w1] of [[-1.3, 0.5, 0.45, 1.5], [-0.2, -0.3, 0.2, 0.7], [1.0, 0.4, 0.35, 1.15]] as const) {
    const end = new THREE.Vector3(stage.x + ox, 0, stage.z + oz);
    const len = 7.2 / -dir.y;
    beams.push({ start: end.clone().addScaledVector(dir, -len), end, width: [w0, w1], fade: 0.35 });
  }
  const rays = lightBeams(beams, '#fff0c4', 0.22);
  extra.push(rays.mesh.geometry, rays.mesh.material as THREE.Material);
  group.add(rays.mesh);
  updates.push(rays.update);
  const motes = dustMotes(beams, q === 'high' ? 40 : 22, rng, '#fff3c8');
  extra.push(motes.points.geometry, motes.points.material as THREE.Material);
  group.add(motes.points);
  updates.push(motes.update);
  const sparkle = glints([[-4.6, 0.05, -1.9], [-5.3, 0.05, -1.3], [-4.2, 0.05, -1.2]] as V3[], 0.35, '#fffbe0', 1.6);
  extra.push(sparkle.points.geometry, sparkle.points.material as THREE.Material);
  group.add(sparkle.points);
  updates.push(sparkle.update);
  // The focal pool where the kin stand (soft, warm), plus a smaller patch at each shaft's foot.
  const pools = lightPools([[stage.x, stage.z, 6.4, 4.6], ...beams.map((b) => [b.end.x, b.end.z, 0.8 + b.width[1], 0.7 + b.width[1] * 0.6] as [number, number, number, number])], '#5a5234', 1.1);
  group.add(pools);

  return {
    group,
    spots: [SPOTS[0].clone(), SPOTS[1].clone()],
    people: [PEOPLE[0].clone(), PEOPLE[1].clone()],
    trainerExit: new THREE.Vector3((GAP.x0 + GAP.x1) / 2, 0, GAP.z - 2),
    spriteLight,
    key,
    update(t) { for (const u of updates) u(t); },
    setPixelSize(px) { motes.setPixelSize(px); },
    dispose() { disposeGroup(group, extra); },
  };
}

function paintHollowFloor(t: RgbaTile, wx: (x: number) => number, wz: (y: number) => number, trainer: boolean) {
  const H = HOLLOW_RAMPS;
  const rng = new Rng(97);
  const nA = noiseField(64, 64, rng, [[4, 0.5], [8, 0.3], [32, 0.2]]);
  const nB = noiseField(64, 64, rng, [[16, 0.6], [32, 0.4]]);
  const mac = macro(17);
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const X = wx(x), Z = wz(y);
    const n = nA(x, y), m = mac(X, Z), fine = nB(x + 17, y + 5);
    const e = Math.hypot(X / 5.6, (Z - 0.2) / 3.6);
    const pd = Math.hypot((X - POOL.x) / POOL.rx, (Z - POOL.z) / POOL.rz);
    // Moss creeps in from the walls in clumps (dithered edge); wet dark rim around the pool;
    // worn, lighter packed earth in the middle; darker toward the walls (AO).
    const moss = (e - 0.9) * 3 + (n - 0.5) * 1.8 + (m - 0.5) * 1.1;
    if (moss > 0.35 && hash2(x >> 1, y >> 1, 6) < Math.min(1, moss - 0.15)) {
      t.band(x, y, H.moss, 2.4 + (n - 0.5) * 2.4 + (fine - 0.5) * 1.6 - Math.max(0, e - 1.1) * 1.2);
      continue;
    }
    let v = 2.4 + (n - 0.5) * 2.6 + (m - 0.5) * 0.9 + (fine - 0.5) * 1.2 + Math.max(0, 0.9 - e) * 0.8 - Math.max(0, e - 0.95) * 1.6;
    if (pd < 1.45) v -= (1.45 - pd) * 3.2;
    if (hash2(x, y, 3) < 0.06) v += hash2(x, y, 4) < 0.55 ? -1 : 1; // grit
    t.band(x, y, H.floor, v, 0.2);
  }
  const inClearing = (cx: number, cy: number, k = 1.05) => Math.hypot(wx(cx) / 6, wz(cy) / 4) < k;
  // Flat stones set into the floor (lit top-left rim, dark lower rim).
  for (let k = 0; k < 70; k++) {
    const cx = rng.int(t.w), cy = rng.int(t.h), r = 2 + rng.int(4);
    if (!inClearing(cx, cy, 1.1)) continue;
    for (let j = -r; j <= r; j++) for (let i = -r - 1; i <= r + 1; i++) {
      if (Math.abs(i) + Math.abs(j) * 1.3 > r + 0.5) continue;
      const edge = Math.abs(i) + Math.abs(j) * 1.3 > r - 0.6;
      t.set(cx + i, cy + j, H.floor[edge ? (j > 0 || i > 0 ? 1 : 5) : 4]!);
    }
  }
  // Scuffs and drag marks (dark streak, lit lip), most in the worn middle.
  for (let k = 0; k < 160; k++) {
    const cx = rng.int(t.w), cy = rng.int(t.h);
    if (!inClearing(cx, cy, 0.85)) continue;
    const len = 3 + rng.int(6), slope = rng.chance(0.5) ? 0 : rng.chance(0.5) ? 0.5 : -0.5;
    for (let i = 0; i < len; i++) { const yy = cy + Math.round(i * slope); t.set(cx + i, yy, H.floor[1]!); if (rng.chance(0.7)) t.set(cx + i, yy - 1, H.floor[5]!); }
  }
  // Pebbles: a lit texel with a dark cast shadow down-right (light from the back left).
  for (let k = 0; k < 900; k++) {
    const cx = rng.int(t.w), cy = rng.int(t.h);
    if (!inClearing(cx, cy, 1.15)) continue;
    const big = rng.chance(0.3);
    t.set(cx + 1, cy + 1, H.floor[0]!); if (big) { t.set(cx + 2, cy + 1, H.floor[0]!); t.set(cx + 1, cy + 2, H.floor[1]!); }
    t.set(cx, cy, H.floor[5]!); if (big) { t.set(cx + 1, cy, H.floor[4]!); t.set(cx, cy + 1, H.floor[4]!); }
  }
  // Moss tufts dotted into the earth near the walls.
  for (let k = 0; k < 500; k++) {
    const cx = rng.int(t.w), cy = rng.int(t.h);
    const e = Math.hypot(wx(cx) / 5.6, (wz(cy) - 0.2) / 3.6);
    if (e < 0.8 || e > 1.2) continue;
    t.set(cx, cy, H.moss[4]!); t.set(cx + 1, cy, H.moss[3]!); t.set(cx, cy + 1, H.moss[2]!);
  }
  if (trainer) paintTrodden(t, wx, wz, [HOLLOW_RAMPS.floor[6], HOLLOW_RAMPS.floor[4], HOLLOW_RAMPS.floor[1]]);
}

/** Pixel water: a flat ellipse whose colour comes from quantised moving ripples (unlit). */
function waterMesh(p: { x: number; z: number; rx: number; rz: number }, ramp: Ramp): { mesh: THREE.Mesh; update(t: number): void } {
  const g = new THREE.CircleGeometry(1, 28);
  g.rotateX(-Math.PI / 2);
  g.scale(p.rx, 1, p.rz);
  g.translate(p.x, 0.03, p.z);
  const cols = ramp.map((h) => new THREE.Color(h));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uRamp: { value: cols }, uC: { value: new THREE.Vector2(p.x, p.z) }, uR: { value: new THREE.Vector2(p.rx, p.rz) } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime; uniform vec3 uRamp[${cols.length}]; uniform vec2 uC, uR; varying vec3 vW;
      float bayer(vec2 p){ ivec2 i = ivec2(mod(p, 4.0)); int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return (float(m[i.y*4+i.x]) + 0.5) / 16.0; }
      void main(){
        vec2 tx = floor(vW.xz / ${TEXEL.toFixed(5)});
        vec2 q = tx * ${TEXEL.toFixed(5)};
        float d = length((q - uC) / uR);
        float w = sin(q.x * 5.0 + uTime * 1.2) * 0.5 + sin(q.y * 7.0 - uTime * 0.9 + q.x * 2.0) * 0.5;
        float v = 2.2 + (1.0 - d) * 1.6 + w * 0.9;
        // Sun glints where the passage light lands (the left half of the pool).
        float sun = smoothstep(0.6, 0.0, length(q - (uC + vec2(0.3, -0.2))));
        v += sun * 2.2 * step(0.55, fract(w * 3.0 + uTime * 0.3));
        if (d > 0.88) v = 1.2 + w * 0.4; // dark shoreline band
        float f = v + bayer(tx) - 0.5;
        int i = int(clamp(floor(f + 0.5), 0.0, ${(cols.length - 1).toFixed(1)}));
        vec3 c = uRamp[0];
        for (int k = 0; k < ${cols.length}; k++) if (k == i) c = uRamp[k];
        gl_FragColor = vec4(c * (1.0 + sun * 0.6), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = false;
  return { mesh, update: (t) => { m.uniforms.uTime!.value = t; } };
}

export const ARENA: ArenaDef = {
  id: 'hollow',
  label: 'Mossy hollow',
  match: [{ route: 'meadow', hotspot: 'hollow' }, { route: 'meadow', kind: 'cave' }],
  build: buildHollowArena,
  grade: hollowGrade,
  background: '#101614',
  fog: '#1c2a26',
  fogRange: [8, 30],
};
