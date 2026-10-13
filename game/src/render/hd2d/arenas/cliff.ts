// Sea cliff (Squall Coast `sea-cliff`, and Gale Rider Tavi's duel): a windswept clifftop ledge
// paved with worn flagstones in the turf, grass-capped slate tiers rising left to a lighthouse
// and right to a broken arch, the sea a long drop below — whitecaps, surf on the cliff foot and
// sea stacks seen through drifting mist and drizzle. Stormy overcast rig; the light motif is
// the lighthouse lamp and its sweeping beams cutting through the murk.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { CELL, Heightmap, LEVEL, VoxelBatch, rockColumns, surfaceMaterial, type ArenaRig } from '../arena';
import { boulderColumns } from '../kit/rock';
import { paintBoulder } from '../textures';
import type { SpriteLight } from '../sprite';
import type { Grade } from '../pipeline';
import type { ArenaDef } from './index';
import { backdrop, paintSky, terraces } from './outdoorKit';
import {
  ATLAS, FoliageBatch, RAMPS2, V, atlasRect, TRODDEN_SIZE, troddenMarking, cachedTexture, decal, disposeGroup, floorGrid, foliageAtlas, foliageMaterial,
  grey, hdr, levelAt, makeGrade, orientedBox, paintFlags, paintRockOn, paintTurf, particles, pixelWater, sweepBeam, windsweptTree,
} from './localKit';

export const ARENA: ArenaDef = {
  id: 'cliff',
  label: 'Sea cliff',
  match: [{ route: 'coast', hotspot: 'sea-cliff' }, { trainer: 'rider-tavi' }],
  build: (o) => buildCliffArena({ seed: o.seed, quality: o.quality, trainer: o.trainerBattle }),
  grade: cliffGrade,
  background: '#6d7a88',
  fog: '#7d8a96',
  fogRange: [14, 60],
};

export function cliffGrade(): Grade {
  return makeGrade({
    gain: new THREE.Vector3(0.98, 1.0, 1.04), lift: new THREE.Vector3(0.006, 0.01, 0.02), gamma: new THREE.Vector3(1.1, 1.1, 1.1),
    saturation: 0.78, contrast: 1.06,
    shadowTint: new THREE.Color('#1e2a3e'), highTint: new THREE.Color('#f4eee4'), splitAmount: 0.12,
    vignette: 0.16, exposure: 1.46,
  });
}

export interface CliffOptions { seed?: number; quality?: 'high' | 'low'; trainer?: boolean }

const SEA_Y = -13;
const DROP = 13 - 0.12; // land columns reach from the sea up to just under the turf
const LH = { x: -6.5, z: -4.7 }; // lighthouse site

export function buildCliffArena(opts: CliffOptions = {}): ArenaRig {
  const rng = new Rng(opts.seed ?? 53);
  const q = opts.quality ?? 'high';
  const group = new THREE.Group();
  group.name = 'hd2d-cliff-arena';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const updates: ((t: number) => void)[] = [];
  const pixelers: ((px: number) => void)[] = [];

  const texSlate = cachedTexture('slate-boulder', () => paintBoulder(57, 32, RAMPS2.slate));
  const texTurf = cachedTexture('turf', () => paintTurf(59, 64));
  const texFlags = cachedTexture('flags', () => paintFlags(61, 64));
  const texWhite = cachedTexture('whitewash', () => paintRockOn(63, RAMPS2.whitewash, 32));
  const texBrick = cachedTexture('brick', () => paintRockOn(65, RAMPS2.brick, 32, true));

  // ---- the headland: the edge bows back into a bay in the middle
  const edgeZ = (x: number) => -3.9 + Math.sin(x * 0.55 + 1) * 0.35 - Math.max(0, Math.abs(x) - 5.0) * 1.05;
  const X0 = -13.5, Z0 = -14.4;
  const hm = new Heightmap(30, 23, X0, Z0);   // levels above the clifftop (tiers)
  const land = new Uint8Array(hm.nx * hm.nz);
  for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
    const x = hm.cx(i), z = hm.cz(j);
    const wob = Math.sin(x * 1.4 + z * 0.9) * 0.35 + Math.sin(z * 2.2 - x * 0.5) * 0.25;
    const onLand = z > edgeZ(x) + wob * 0.4 || Math.hypot(x - LH.x, z - LH.z) < 1.4;
    land[hm.idx(i, j)] = onLand ? 1 : 0;
    if (!onLand) continue;
    let lv = 0;
    const dl = -6.0 - x + wob, dr = x - 6.6 + wob;
    if (dl > 0) lv = 1 + Math.floor(dl / 1.3) + (dl > 2.4 ? Math.floor((dl - 2.4) / 1.1) : 0);
    if (dr > 0) lv = Math.max(lv, 1 + Math.floor(dr / 1.5) + (dr > 2.8 ? 1 : 0));
    if (z > 4.3 + wob * 0.5) lv = Math.max(lv, 1 + (z > 5.6 ? 1 : 0));
    // A lower shelf for the lighthouse, so the tower stays in frame.
    if (Math.hypot(x - LH.x, z - LH.z) < 1.4) lv = Math.min(lv, 1);
    if (lv > 0) {
      const cl = Math.sin(Math.floor(i / 2) * 12.9898 + Math.floor(j / 2) * 78.233) * 43758.5453;
      const n = cl - Math.floor(cl);
      lv = Math.max(1, Math.min(7, lv + (n > 0.8 ? 1 : n < 0.12 ? -1 : 0)));
    }
    hm.set(i, j, lv);
  }
  const isLand = (x: number, z: number) => { const [i, j] = hm.cell(x, z); return i >= 0 && j >= 0 && i < hm.nx && j < hm.nz ? land[hm.idx(i, j)] === 1 : z > 0; };

  // ---- slate: every land column runs from the sea to its tier top (one mesh), sea stacks too
  // Rounded boulders for the top two levels below the turf (what the camera reads), plain
  // bevelled blocks for the long drop below (seen small and through mist: a third of the tris).
  // The tiers above the clifftop are organic terraces (outdoorKit): solid slate faces under a
  // rounded turf lip, boulders poking out — no turf slabs floating on posts at the front. The
  // boulder band only rings the cliff edge (two levels under the turf), the long drop below it.
  const UPPER = 2;
  const upper = new Heightmap(hm.nx, hm.nz, X0, Z0), lower = new Heightmap(hm.nx, hm.nz, X0, Z0);
  for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) if (land[hm.idx(i, j)]) {
    upper.set(i, j, UPPER);
    lower.set(i, j, (DROP - UPPER * LEVEL) / LEVEL);
  }
  const rock = new VoxelBatch(32);
  boulderColumns(upper, rock, rng, { baseY: -0.12 - UPPER * LEVEL, tints: ['#ffffff', '#eef2f6', '#f2f0ea'] });
  const tierSides = new VoxelBatch(32);
  const tierTops = new VoxelBatch(64);
  terraces(hm, tierSides, tierTops, rng, { baseY: -0.12, lip: 0.14, jitter: 0.16, rocks: { batch: rock, chance: 0.3, tint: '#f2f4f6' }, skip: (i, j) => !land[hm.idx(i, j)] });
  // Foreground tiers a touch darker (depth from local shade).
  const near = (x: number, y: number, z: number) => 1 - 0.08 * THREE.MathUtils.smoothstep(z, 4.0, 7.5);
  tierSides.shade(near); tierTops.shade(near);
  rockColumns(lower, rock, rng, RAMPS2.slate, { baseY: SEA_Y });
  const stacks = new Heightmap(hm.nx, hm.nz, X0, Z0);
  for (const [sx, sz, r, top] of [[-2.6, -9.6, 1.0, -7.5], [1.6, -11.6, 1.3, -6.2], [4.4, -8.8, 0.7, -9.6]] as const) {
    for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) if (Math.hypot(hm.cx(i) - sx, hm.cz(j) - sz) < r) stacks.set(i, j, (top - SEA_Y + 0.6) / LEVEL - (Math.hypot(hm.cx(i) - sx, hm.cz(j) - sz) / r) * 2);
  }
  boulderColumns(stacks, rock, rng, { baseY: SEA_Y - 0.6 });
  group.add(mk(rock.build(), track(surfaceMaterial(texSlate, undefined, true))));

  // ---- turf: the clifftop floor (clipped at the edge) + the tier tops (same material)
  const turfMat = track(surfaceMaterial(texTurf));
  {
    const g = floorGrid(hm, texTurf, 64, { res: 2, aoK: 0.8, tintAt: (x, z) => { const k = 0.9 + 0.1 * Math.sin(x * 0.7) * Math.cos(z * 0.9); return [k, k, k * 0.95]; } });
    group.add(mk(clip(g, isLand), turfMat, false, true));
  }
  group.add(mk(tierTops.build(), turfMat));
  group.add(mk(tierSides.build(), track(surfaceMaterial(cachedTexture('slate-face', () => paintRockOn(67, RAMPS2.slate, 32, true)), undefined, true))));

  // ---- the paving: worn flagstones across the battle ground (some missing, some tilted)
  const flags = new VoxelBatch(64);
  const plaza = (x: number, z: number) => Math.hypot((x - 0.1) / 5.0, (z - 0.1) / 3.3);
  for (let gz = -4; gz <= 4; gz++) for (let gx = -6; gx <= 6; gx++) {
    const x = gx * 0.9 + (gz % 2 ? 0.45 : 0), z = gz * 0.8;
    const r = plaza(x, z);
    if (r > 1.05 || !isLand(x, z - 0.6) || (r > 0.75 && rng.chance(0.45)) || rng.chance(0.06)) continue;
    const w = 0.84 - rng.next() * 0.06, d = 0.74 - rng.next() * 0.06;
    const tilt = r > 0.7 ? (rng.next() - 0.5) * 0.12 : 0;
    orientedBox(flags, V(x, 0.0, z), V(w, 0.1, d), V(tilt, 1, tilt * 0.5), grey(0.8 + rng.next() * 0.2), rng, (rng.next() - 0.5) * 0.06);
  }
  group.add(mk(flags.build(), track(surfaceMaterial(texFlags, undefined, true)), false, true));

  // ---- lighthouse (left tier, back), ruined arch (right tier), drystone wall, tree
  const white = new VoxelBatch(32);
  const brick = new VoxelBatch(32);
  const glow = new VoxelBatch(16);
  const metal = new VoxelBatch(16);
  const topAt = (x: number, z: number) => { const [i, j] = hm.cell(x, z); return -0.12 + hm.get(i, j) * LEVEL; };
  const lh = V(LH.x, 0, LH.z);
  lh.y = topAt(lh.x, lh.z) + 0.02;
  {
    const segs = 5, segH = 0.78;
    for (let k = 0; k < segs; k++) {
      const r = 0.95 - k * 0.08;
      const c = lh.clone().add(V(0, segH * (k + 0.5), 0));
      const b = k === 1 || k === 4 ? brick : white;
      for (const spin of [0, Math.PI / 4]) orientedBox(b, c, V(r * 1.45, segH + 0.01, r * 1.45), V(0, 1, 0), grey(0.95), rng, spin);
    }
    const gy = lh.y + segs * segH;
    // Gallery + rail, lamp room (glass glows), roof.
    for (const spin of [0, Math.PI / 4]) orientedBox(metal, lh.clone().setY(gy + 0.05), V(1.5, 0.1, 1.5), V(0, 1, 0), new THREE.Color('#3a4250'), rng, spin);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; orientedBox(metal, lh.clone().add(V(Math.cos(a) * 0.72, gy - lh.y + 0.3, Math.sin(a) * 0.72)), V(0.05, 0.45, 0.05), V(0, 1, 0), new THREE.Color('#3a4250'), rng); }
    for (const spin of [0, Math.PI / 4]) orientedBox(glow, lh.clone().setY(gy + 0.5), V(0.75, 0.8, 0.75), V(0, 1, 0), hdr('#ffe6a0', 2.8), rng, spin);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 8; orientedBox(metal, lh.clone().add(V(Math.cos(a) * 0.4, gy - lh.y + 0.5, Math.sin(a) * 0.4)), V(0.06, 0.8, 0.06), V(0, 1, 0), new THREE.Color('#2a303a'), rng); }
    for (let k = 0; k < 3; k++) for (const spin of [0, Math.PI / 4]) orientedBox(brick, lh.clone().setY(gy + 0.98 + k * 0.18), V(1.0 - k * 0.32, 0.2, 1.0 - k * 0.32), V(0, 1, 0), grey(1), rng, spin);
    // Door + a little keeper's hut against the tower.
    orientedBox(metal, lh.clone().add(V(0.35, 0.4, 0.62)), V(0.36, 0.7, 0.06), V(0, 1, 0), new THREE.Color('#5a3a2a'), rng, 0.4);
  }
  const lampY = lh.y + 5 * 0.78 + 0.5;
  // Ruined arch: two piers, one broken, a lintel stump, fallen blocks.
  {
    const base = V(7.7, 0, -3.6);
    base.y = topAt(base.x, base.z);
    const pier = (x: number, h: number) => { for (let k = 0; k < h; k++) orientedBox(white, base.clone().add(V(x, 0.3 + k * 0.6, 0)), V(0.62 - (k % 2) * 0.05, 0.6, 0.62), V(0, 1, 0), grey(0.62 + rng.next() * 0.12), rng, (rng.next() - 0.5) * 0.12); };
    pier(-1.0, 5); pier(1.0, 3);
    orientedBox(white, base.clone().add(V(-0.35, 3.15, 0)), V(1.7, 0.42, 0.6), V(-0.12, 1, 0), grey(0.65), rng, 0);
    for (const [dx, dz, s] of [[1.6, 0.8, 0.5], [0.5, 1.2, 0.42], [1.3, 1.6, 0.36]] as const) orientedBox(white, base.clone().add(V(dx, s * 0.4, dz)), V(s * 1.2, s * 0.8, s), V((rng.next() - 0.5) * 0.5, 1, (rng.next() - 0.5) * 0.5), grey(0.62), rng, rng.next() * 3);
  }
  // Drystone wall along the front ledge (left and right of the stair gap).
  for (let x = -6.5; x < 6.5; x += 0.42 + rng.next() * 0.2) {
    if (Math.abs(x + 0.4) < 1.1) continue;
    const z = 4.25 + Math.sin(x * 0.7) * 0.15;
    const top = topAt(x, z + 0.3);
    for (let k = 0; k < 2; k++) orientedBox(white, V(x, top + 0.14 + k * 0.24, z), V(0.4 + rng.next() * 0.15, 0.24, 0.32), V((rng.next() - 0.5) * 0.1, 1, 0), grey(0.55 + rng.next() * 0.15), rng, (rng.next() - 0.5) * 0.3);
  }
  const trunk = new VoxelBatch(32);
  const leaves = new FoliageBatch();
  const tx = 8.3, tz = 1.6;
  windsweptTree(trunk, leaves, V(tx, topAt(tx, tz), tz), 2.4, new THREE.Vector2(1.0, 0.25), rng);
  windsweptTree(trunk, leaves, V(-9.6, topAt(-9.6, 1.0), 1.0), 2.0, new THREE.Vector2(0.9, 0.2), rng);

  // ---- wind-flattened grass and sea pinks on the turf and the tiers
  const grass = atlasRect(ATLAS.grass), dune = atlasRect(ATLAS.dune), pinks = atlasRect(ATLAS.pinks);
  const clear = (x: number, z: number) => plaza(x, z) < 0.85;
  for (let i = 0; i < 150; i++) {
    const x = (rng.next() - 0.5) * 22, z = -8 + rng.next() * 14;
    if (!isLand(x, z) || clear(x, z)) continue;
    leaves.tuft(V(x, topAt(x, z) + (levelAt(hm, x, z) > 0 ? 0.0 : 0.1) - 0.04, z), 0.42, 0.32 + rng.next() * 0.35, rng.chance(0.15) ? pinks : rng.chance(0.5) ? dune : grass, grey(0.8 + rng.next() * 0.35), rng, 2);
  }
  const fol = foliageMaterial(foliageAtlas(), { strength: 0.2, speed: 2.4, dir: new THREE.Vector2(1, 0.25).normalize() });
  track(fol.material); track(fol.depth);
  const folMesh = mk(leaves.build(), fol.material, true, true);
  folMesh.customDepthMaterial = fol.depth;
  group.add(folMesh);
  updates.push(fol.update);

  group.add(mk(white.build(), track(surfaceMaterial(texWhite, undefined, true))));
  group.add(mk(brick.build(), track(surfaceMaterial(texBrick, undefined, true))));
  group.add(mk(metal.build(), track(surfaceMaterial(null))));
  group.add(mk(trunk.build(), track(surfaceMaterial(texSlate, undefined, true))));
  group.add(mk(glow.build(), track(new THREE.MeshBasicMaterial({ vertexColors: true })), false, false));

  if (opts.trainer) {
    // Worn ground (no chalk): mud ground into the paving where feet circle, scuffs, loose grit.
    const m = decal(troddenMarking('#3a3a30', '#c8ccc4', ['#a2a6a8', '#71767e', '#383c46'], 0.8), 0.1, 0.07, 0.0, TRODDEN_SIZE, TRODDEN_SIZE, { rot: Math.atan2(2.0, 2.8) });
    track(m.material as THREE.Material);
    group.add(m);
  }

  // ---- overcast sky with a bright haze band on the horizon (banded, no checkerboard)
  {
    const sky = ['#5e6a78', '#68768a', '#74818f', '#808c98', '#8c97a1', '#98a2aa', '#a6aeb4', '#b4bbbe'];
    const back = backdrop((t) => {
      paintSky(t, sky, 0, t.h);
      // Low, long cloud banks: lighter streaks above the haze.
      for (let k = 0; k < 18; k++) {
        const y = Math.round(t.h * (0.25 + (k % 9) * 0.06)), x0 = (k * 53) % t.w, len = 40 + ((k * 37) % 60);
        for (let x = x0; x < x0 + len; x++) t.set(x % t.w, y, sky[Math.min(sky.length - 1, Math.floor((y / t.h) * sky.length) + 1)]!);
      }
    }, 320, 64, [240, 48], [0, SEA_Y + 22, -86]);
    track(back.mesh.material as THREE.Material);
    group.add(back.mesh);
  }

  // ---- the sea below
  const water = pixelWater({
    rect: { x0: -60, z0: -90, w: 120, d: 96 }, y: SEA_Y, fieldRes: 192, range: 5,
    land: (x, z) => isLand(x, z) || levelAt(stacks, x, z) > 0,
    ramp: ['#16283a', '#1e3a4e', '#2a4e60', '#3a6470', '#58808a', '#86a4a8'],
    foam: '#eef4f4', swash: 0, deep: 7, waveK: 1.3, waveSpeed: 1.8, caps: 0.7, glints: false, far: -16,
  });
  track(water);
  group.add(water.mesh);
  updates.push(water.update);

  // ---- light: flat storm key, grey sky, slate bounce, the lighthouse lamp + its sweep
  // Overcast, but with direction: a soft key from high back-left (elev ≈ 0.9 rad).
  const key = new THREE.SpotLight(new THREE.Color('#e8ecf2'), 1.9, 0, 0.6, 0.6, 0);
  key.position.set(-7.4, 18.8, -12.6);
  key.target.position.set(0, 0, 0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 4;
  key.shadow.camera.near = 12;
  key.shadow.camera.far = 42;
  group.add(key, key.target);
  const hemi = new THREE.HemisphereLight(new THREE.Color('#c4d0dc'), new THREE.Color('#34403a'), 1.7);
  group.add(hemi);
  const fill = new THREE.DirectionalLight(new THREE.Color('#b0bccc'), 0.6);
  fill.position.set(-4, 5, 10);
  group.add(fill, fill.target);
  if (q === 'high') {
    const lamp = new THREE.PointLight(new THREE.Color('#ffd890'), 5, 6, 1.6);
    lamp.position.set(lh.x, lampY, lh.z);
    group.add(lamp);
  }
  const sweep = new THREE.Group();
  sweep.position.set(lh.x, lampY, lh.z);
  for (const a of [0, Math.PI]) {
    const b = sweepBeam(16, [0.5, 4.5], hdr('#ffe2a0', 1), 0.55);
    b.rotation.y = a;
    track(b.geometry); track(b.material as THREE.Material);
    sweep.add(b);
  }
  group.add(sweep);
  updates.push((t) => { sweep.rotation.y = t * 0.55; });

  // ---- mist, drizzle, spray at the cliff foot, gulls below the edge
  const lowK = q === 'high' ? 1 : 0.45;
  const mist = particles({
    kind: 'mist',
    emitters: [
      { min: V(-22, -3.5, -14), max: V(-8, 1.5, -5), vmin: V(0.5, -0.02, 0.02), vmax: V(0.9, 0.04, 0.12), count: Math.round(10 * lowK), life: [26, 34], size: [2.6, 4.2] },
      { min: V(-24, SEA_Y + 1, -20), max: V(-6, SEA_Y + 5, -6), vmin: V(0.6, 0, 0), vmax: V(1.0, 0.05, 0.1), count: Math.round(12 * lowK), life: [26, 34], size: [3.0, 5.0] },
    ],
    colorA: hdr('#d8e0e6', 1.0), colorB: hdr('#8a96a2', 0.95), grow: [0.8, 1.3], opacity: 0.5,
  }, rng);
  const rain = particles({
    kind: 'rain',
    emitters: [{ min: V(-12, 5, -8), max: V(10, 8, 5), vmin: V(1.6, -9, 0.4), vmax: V(2.0, -8, 0.6), count: Math.round(160 * lowK), life: [1.0, 1.2], size: [0.14, 0.2] }],
    colorA: hdr('#c8d4e0', 0.9), colorB: hdr('#c8d4e0', 0.9), opacity: 0.55,
  }, rng);
  const sprayEmit: { x: number; z: number }[] = [];
  for (let x = -12; x <= 12; x += 1.5) sprayEmit.push({ x, z: edgeZ(x) - 0.4 });
  const spray = particles({
    kind: 'spray',
    emitters: sprayEmit.map(({ x, z }) => ({ min: V(x - 0.6, SEA_Y, z - 0.6), max: V(x + 0.6, SEA_Y + 0.3, z), vmin: V(-0.4, 2.5, -0.3), vmax: V(0.4, 4.2, 0.2), count: Math.round(8 * lowK), life: [1.0, 1.8] as [number, number], size: [0.3, 0.5] as [number, number] })),
    colorA: hdr('#f4f8f8', 1.05), colorB: hdr('#8aa0aa', 0.95), accel: V(0.4, -3.2, 0), grow: [0.8, 2.0], opacity: 0.9,
  }, rng);
  const gulls = particles({
    kind: 'gull',
    emitters: [
      { min: V(-1, -3.5, -8), max: V(1, -2.5, -7), vmin: V(2.2, 0.2, 0.3), vmax: V(3.0, 0.4, 0.5), count: 3, life: [10, 10], size: [0.9, 1.0] },
      { min: V(2, 3.5, -9), max: V(3, 4.2, -8), vmin: V(2.5, 0.2, 0.3), vmax: V(3.5, 0.4, 0.5), count: 2, life: [10, 10], size: [0.9, 1.0] },
    ],
    colorA: hdr('#f0f2f4', 1.0), colorB: hdr('#30343c', 1),
  }, rng);
  for (const p of [mist, rain, spray, gulls]) { group.add(p.points); track(p); updates.push(p.update); pixelers.push(p.setPixelSize); }

  const spriteLight: SpriteLight = {
    keyDir: key.position.clone().sub(key.target.position).normalize(),
    keyColor: new THREE.Color('#e4eaf2').multiplyScalar(0.56),
    sky: new THREE.Color('#c8d2de').multiplyScalar(0.6),
    ground: new THREE.Color('#4a5650').multiplyScalar(0.55),
    rim: new THREE.Color('#e8f0f8').multiplyScalar(0.55),
  };

  return {
    group,
    spots: [V(-1.3, 0.05, 1.0), V(1.5, 0.05, -1.0)],
    people: [V(-2.5, 0.05, 1.9), V(2.75, 0.05, -1.95)],
    trainerExit: V(6.0, 0, -1.0),
    spriteLight,
    key,
    update(t) { for (const u of updates) u(t); },
    setPixelSize(px) { for (const p of pixelers) p(px); },
    dispose() { disposeGroup(group, disposables); },
  };
}

/** Drop the floor triangles whose centre is not on land (the cliff edge), non-indexed. */
function clip(g: THREE.BufferGeometry, keep: (x: number, z: number) => boolean): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const pos = src.attributes.position!;
  const tris: number[] = [];
  for (let t = 0; t < pos.count; t += 3) {
    const x = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, z = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
    if (keep(x, z)) tris.push(t);
  }
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const a = src.attributes[name]!;
    const arr = new Float32Array(tris.length * 3 * a.itemSize);
    tris.forEach((t, n) => { for (let k = 0; k < 3 * a.itemSize; k++) arr[n * 3 * a.itemSize + k] = (a.array as Float32Array)[t * a.itemSize + k]!; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  out.computeBoundingSphere();
  g.dispose();
  if (src !== g) src.dispose();
  return out;
}

function mk(g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true): THREE.Mesh {
  const out = new THREE.Mesh(g, m);
  out.castShadow = cast;
  out.receiveShadow = receive;
  return out;
}

void CELL;
