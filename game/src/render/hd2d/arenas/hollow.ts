// Mossy Meadow "Rocky hollow" (cave-kind hotspot): a sunken grotto of mossy grey-green rock
// that opens at the back-left onto the bright meadow. Sunlight pours in through the opening
// under a rock arch (cookie spot + shafts + motes), lands on the floor and on a still pool;
// vines hang from the arch and the ledges, ferns and moss tufts sit in the corners, and a few
// glowing cave mushrooms give small bloom accents in the shade. All original and procedural.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { CELL, Heightmap, LEVEL, TEXEL, VoxelBatch, dustMotes, lightBeams, surfaceMaterial, type ArenaRig, type BeamSpec } from '../arena';
import { cachedTexture, ditherIndex, type Ramp } from '../textures';
import type { Grade } from '../pipeline';
import type { ArenaBuildOptions, ArenaDef } from './index';
import { MEADOW_RAMPS, nearStage, paintChalkRing } from './meadow';
import {
  Foliage, SpriteAtlas, backdrop, disposeGroup, glints, groundMesh, hash2, lightPools, macro, mkMesh, noiseField,
  paintCanopy, paintEarth, paintSilhouette, paintSky, paintTuft, paintTurf, paintVine, sunRig, terraces, type RgbaTile, type V3,
} from './outdoorKit';

export const HOLLOW_RAMPS = {
  rock: ['#262826', '#363a35', '#484d45', '#5c6257', '#727869', '#8b907e', '#a6a893'],
  moss: ['#132519', '#1b351e', '#264a24', '#345f2a', '#467631', '#5d8e39', '#7ba746'],
  floor: ['#2e2c27', '#403d35', '#535045', '#686355', '#7d7866', '#948d79', '#aba38d'],
  water: ['#0d1f26', '#123039', '#17434c', '#1e5960', '#2b7273', '#4c9590', '#8ac3b4', '#d6f0dc'],
  shroom: ['#1a2c3a', '#2a5a6a', '#46a2a8', '#8ee8de', '#e6fff6'],
} as const satisfies Record<string, Ramp>;

export function hollowGrade(): Grade {
  return {
    lift: new THREE.Vector3(0.006, 0.012, 0.012), gamma: new THREE.Vector3(1.0, 1.0, 1.0), gain: new THREE.Vector3(1.03, 1.02, 0.95),
    saturation: 0.95, contrast: 1.08,
    shadowTint: new THREE.Color('#1a2c34'), highTint: new THREE.Color('#fff0bc'), splitAmount: 0.16,
    vignette: 0.46, vignetteSoft: 0.55,
    tiltTop: 1.0, tiltBottom: 0.6, focusTop: 0.8, focusBottom: 0.08,
    dither: 2.0, exposure: 1.06,
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
  const hm = new Heightmap(32, 24, X0, Z0);
  for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
    const x = hm.cx(i), z = hm.cz(j);
    const wob = Math.sin(x * 1.3 + z * 0.7) * 0.35 + Math.sin(z * 2.1 - x * 0.4) * 0.25;
    const dx = Math.max(0, Math.abs(x) - 5.8 - wob);
    const dzB = Math.max(0, -3.4 - z - wob * 0.6);
    const dzF = Math.max(0, z - 3.8 - wob * 0.5);
    let lv = 0;
    if (dzF > 0 && dx <= 0) lv = Math.min(2, 1 + Math.floor(dzF / 2.4));
    else {
      const d = Math.max(dx, dzB, dzF * 0.6);
      if (d > 0) lv = 1 + Math.floor(d / 1.3) + (d > 2.6 ? Math.floor((d - 2.6) / 0.9) : 0);
    }
    // The passage: low ground climbing gently out toward the meadow behind the arch.
    if (x > GAP.x0 && x < GAP.x1 && z < -2.6) lv = Math.min(lv, z > GAP.z - 1.4 ? 0 : 1 + Math.floor((GAP.z - 1.4 - z) / 2.4));
    if (lv > 0 && lv < 8) {
      const cl = Math.sin(Math.floor(i / 2) * 12.9898 + Math.floor(j / 2) * 78.233) * 43758.5453;
      const n = cl - Math.floor(cl);
      lv = Math.max(1, lv + (n > 0.8 ? 1 : n < 0.1 ? -1 : 0));
    }
    hm.set(i, j, Math.min(lv, 9));
  }
  const topAt = (x: number, z: number) => { const [i, j] = hm.cell(x, z); const v = hm.get(i, j); return v > 90 ? 0 : v * LEVEL; };

  // ---- atlas: vines, moss fringe, ferns, tufts, bushes for the meadow outside
  const atlas = new SpriteAtlas(256);
  for (let k = 0; k < 4; k++) atlas.add('vine', 7, 28 + k * 8, (p) => paintVine(p, new Rng(600 + k), H.moss), [3.5, 0]);
  for (let k = 0; k < 4; k++) atlas.add('fringe', 15, 10, (p) => {
    const r = new Rng(620 + k);
    for (let x = 0; x < 15; x++) {
      const len = 2 + r.int(3) + (r.chance(0.3) ? 3 + r.int(4) : 0);
      for (let y = 0; y < len; y++) p.shade(x, y, H.moss, 4.6 - y * 0.8 - (y === len - 1 ? 0.6 : 0));
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
  const texRock = cachedTexture('od-rock-hollow', () => paintEarth(71, H.rock, 32, { roots: 1, pebbles: 5, strata: 0.35 }));
  const texMoss = cachedTexture('od-moss-hollow', () => paintTurf(72, H.moss, 32, { lo: 1.8, hi: 4.6, flecks: 0.1 }));
  const sides = new VoxelBatch(32);
  const tops = new VoxelBatch(32);
  terraces(hm, sides, tops, rng, { topK: 1.0, jitter: 0.3, fringe: { foliage: fol, sprite: 'fringe', rng: new Rng(9), chance: 0.7 } });
  // The arch over the passage: a lintel of blocks spanning the wall, with a ragged underside.
  for (let x = GAP.x0 - 0.45; x < GAP.x1 + 0.45; x += CELL) {
    const sag = (hash2(Math.round(x * 3), 1, 3) < 0.5 ? 1 : 0) * 0.35;
    for (let z = GAP.z - 2.0; z < GAP.z - 0.2; z += CELL) {
      sides.box([x, ARCH_Y - sag, z], [x + CELL - 0.02, ARCH_Y + 2 * LEVEL, z + CELL - 0.02], new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rng.next() * 0.25), rng, { aoBottom: 0.6 });
    }
    tops.box([x - 0.03, ARCH_Y + 2 * LEVEL - 0.08, GAP.z - 2.05], [x + CELL + 0.01, ARCH_Y + 2 * LEVEL + 0.012, GAP.z - 0.2], new THREE.Color(1, 1, 1), rng);
  }
  const rockMat = surfaceMaterial(texRock, undefined, true);
  const mossMat = surfaceMaterial(texMoss);
  extra.push(rockMat, mossMat);
  group.add(mkMesh(sides.build(), rockMat));
  group.add(mkMesh(tops.build(), mossMat));

  // ---- floor (damp packed earth, moss toward the walls, wet rim by the pool)
  const ground = groundMesh({
    x0: X0, x1: X0 + hm.nx * CELL, z0: Z0, z1: Z0 + hm.nz * CELL, hm, aoK: 0.12,
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
  const stone = new VoxelBatch(32);
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
    paintSilhouette(t, r, MEADOW_RAMPS.far, t.h * 0.7, 16, 9, t.h);
    paintSilhouette(t, r, MEADOW_RAMPS.leaf.slice(2) as unknown as Ramp, t.h * 0.88, 18, 8, t.h);
  }, 200, 90, [40, 18], [-4, 6, -18]);
  extra.push(back.mesh.material as THREE.Material);
  group.add(back.mesh);

  // ---- light: the sun through the passage (soft-edged cookie), cool cave fill
  const sunFrom = new THREE.Vector3(-0.4, 0.95, -0.75);
  const cookie = archCookie();
  extra.push(cookie);
  const { key, spriteLight } = sunRig(group, {
    target: new THREE.Vector3(-1.2, 0, 0.4), from: sunFrom, distance: 30, angle: 0.26,
    color: '#fff0c8', intensity: 8.0, cookie,
    sky: '#b8d6c8', ground: '#3a3628', hemi: 2.1,
    fill: '#d8e4d8', fillIntensity: 0.7, quality: q,
  });
  if (q === 'high') {
    const bounce = new THREE.PointLight(new THREE.Color('#9fe0c8'), 2.5, 5, 1.6);
    bounce.position.set(5.8, 1.0, 0.6);
    group.add(bounce);
  }
  const dir = sunFrom.clone().normalize().negate();
  const beams: BeamSpec[] = [];
  for (const [ox, oy] of [[-0.8, 0.2], [-0.35, -0.3], [0.1, 0.25], [0.55, -0.15], [0.9, 0.3]] as const) {
    const s = new THREE.Vector3((GAP.x0 + GAP.x1) / 2 + 0.6 + ox * (GAP.x1 - GAP.x0) * 0.5, ARCH_Y + 0.6 + oy * 0.6, GAP.z - 0.4);
    const len = (s.y / -dir.y) * (0.93 + rng.next() * 0.07);
    beams.push({ start: s, end: s.clone().addScaledVector(dir, len), width: [0.45, 1.0 + rng.next() * 0.5] });
  }
  const rays = lightBeams(beams, '#fff0c4', 0.24);
  extra.push(rays.mesh.geometry, rays.mesh.material as THREE.Material);
  group.add(rays.mesh);
  updates.push(rays.update);
  const motes = dustMotes(beams, q === 'high' ? 44 : 24, rng, '#fff3c8');
  extra.push(motes.points.geometry, motes.points.material as THREE.Material);
  group.add(motes.points);
  updates.push(motes.update);
  const sparkle = glints([[-4.6, 0.05, -1.9], [-5.3, 0.05, -1.3], [-4.2, 0.05, -1.2]] as V3[], 0.35, '#fffbe0', 1.6);
  extra.push(sparkle.points.geometry, sparkle.points.material as THREE.Material);
  group.add(sparkle.points);
  updates.push(sparkle.update);
  const pools = lightPools(beams.map((b) => [b.end.x, b.end.z, 2.0, 1.6] as [number, number, number, number]), '#706a48');
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

/** Soft rounded-rectangle cookie (the passage mouth), slightly brighter at the centre. */
function archCookie(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 64, 64);
  const g = ctx.createRadialGradient(32, 34, 4, 32, 34, 30);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#e8e8e8'); g.addColorStop(1, '#000000');
  ctx.fillStyle = g; ctx.fillRect(4, 6, 56, 54);
  // Vines and leaves breaking the light.
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  for (let k = 0; k < 9; k++) ctx.fillRect(6 + k * 6.3, 6, 2, 8 + ((k * 37) % 17));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function paintHollowFloor(t: RgbaTile, wx: (x: number) => number, wz: (y: number) => number, trainer: boolean) {
  const H = HOLLOW_RAMPS;
  const rng = new Rng(97);
  const nA = noiseField(64, 64, rng, [[4, 0.5], [8, 0.3], [32, 0.2]]);
  const mac = macro(17);
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const X = wx(x), Z = wz(y);
    const n = nA(x, y), m = mac(X, Z);
    const e = Math.hypot(X / 5.6, (Z - 0.2) / 3.6);
    const pd = Math.hypot((X - POOL.x) / POOL.rx, (Z - POOL.z) / POOL.rz);
    // Moss creeps in from the walls; wet dark rim around the pool; worn light centre.
    const moss = (e - 0.95) * 3 + (n - 0.5) * 1.6 + (m - 0.5);
    if (moss > 0.4 && hash2(x, y, 6) < Math.min(1, moss - 0.2)) {
      t.set(x, y, H.moss[ditherIndex(2.4 + (n - 0.5) * 2.6, x, y, H.moss.length)]!);
      continue;
    }
    let v = 2.6 + (n - 0.5) * 2.6 + (m - 0.5) * 0.8 + Math.max(0, 0.9 - e) * 0.9;
    if (pd < 1.45) v -= (1.45 - pd) * 3.2;
    if (hash2(x, y, 3) < 0.05) v += hash2(x, y, 4) < 0.5 ? -1 : 1;
    t.set(x, y, H.floor[ditherIndex(v, x, y, H.floor.length)]!);
  }
  // Flat stones set into the floor (flagstone hints) and pebbles.
  for (let k = 0; k < 60; k++) {
    const cx = rng.int(t.w), cy = rng.int(t.h), r = 2 + rng.int(4);
    const X = wx(cx), Z = wz(cy);
    if (Math.hypot(X / 6, Z / 4) > 1.1) continue;
    for (let j = -r; j <= r; j++) for (let i = -r - 1; i <= r + 1; i++) {
      if (Math.abs(i) + Math.abs(j) * 1.3 > r + 0.5) continue;
      const edge = Math.abs(i) + Math.abs(j) * 1.3 > r - 0.6;
      t.set(cx + i, cy + j, H.floor[edge ? (j > 0 ? 1 : 5) : 4]!);
    }
  }
  if (trainer) paintChalkRing(t, wx, wz);
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
