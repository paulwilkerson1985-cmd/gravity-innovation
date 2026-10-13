// Sea cliff (Squall Coast `sea-cliff`, and Gale Rider Tavi's duel): a windswept clifftop ledge
// paved with worn flagstones in the turf, grass-capped slate tiers rising left to a lighthouse
// and right to a broken arch, ruined pillars at the back of the paving, the sea a long drop
// below. Light motif: LATE AFTERNOON after a storm — the sun breaks through a painted cloud sky
// at the back-right: shafts of light fall across the clifftop, the ruins throw long shadows over
// the flagstones toward the camera (warm key, cool sky fill), a glitter path runs out to a soft,
// hazy horizon, distant headlands and islands stand in layers of haze, and low fog lies in
// horizontal bands over the water.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { CELL, Heightmap, LEVEL, VoxelBatch, dustMotes, lightBeams, rockColumns, surfaceMaterial, type ArenaRig, type BeamSpec } from '../arena';
import { boulder, boulderColumns } from '../kit/rock';
import { paintBoulder } from '../textures';
import type { SpriteLight } from '../sprite';
import { postFlags, type Grade } from '../pipeline';
import type { ArenaDef } from './index';
import { apron, backdrop, bandIndex, glints, gobo, lightPools, paintMesas, sunRig, terraces, type MesaOpts, type RgbaTile } from './outdoorKit';
import {
  ATLAS, FoliageBatch, RAMPS2, V, atlasRect, TRODDEN_SIZE, troddenMarking, cachedTexture, decal, disposeGroup, floorGrid, fogBands, foliageAtlas, foliageMaterial,
  grey, hdr, levelAt, makeGrade, orientedBox, paintFlags, paintRockOn, paintTurf, particles, pixelWater, rockStack, windsweptTree,
} from './localKit';

export const ARENA: ArenaDef = {
  id: 'cliff',
  label: 'Sea cliff',
  match: [{ route: 'coast', hotspot: 'sea-cliff' }, { trainer: 'rider-tavi' }],
  build: (o) => buildCliffArena({ seed: o.seed, quality: o.quality, trainer: o.trainerBattle }),
  grade: cliffGrade,
  background: '#c8bca8',
  fog: '#c8bca8',
  fogRange: [26, 104],
  // A little lower on desktop so the sky with the sun break shows above the sea.
  camera: { wide: { elev: 0.46 } },
};

export function cliffGrade(): Grade {
  return makeGrade({
    gain: new THREE.Vector3(1.05, 1.0, 0.92), lift: new THREE.Vector3(0.004, 0.01, 0.026), gamma: new THREE.Vector3(1.04, 1.04, 1.04),
    saturation: 0.84, contrast: 1.1,
    shadowTint: new THREE.Color('#1c3050'), highTint: new THREE.Color('#ffd49a'), splitAmount: 0.22,
    vignette: 0.32, vignetteSoft: 0.6, exposure: 1.3, shadowDesat: 0.2,
  });
}

export interface CliffOptions { seed?: number; quality?: 'high' | 'low'; trainer?: boolean }

const SEA_Y = -13;
const DROP = 13 - 0.12; // land columns reach from the sea up to just under the turf
const LH = { x: -6.5, z: -4.7 }; // lighthouse site
/** Tier level of the front row, where the set meets its apron. */
const FRONT_LV = 2;
/** Sea stacks below the cliff: x, z, foot radius, top y. */
const STACKS = [[-2.6, -9.6, 1.0, -7.5], [1.6, -11.6, 1.3, -6.2], [4.4, -8.8, 0.7, -9.6], [-6.8, -15.5, 1.5, -5.5]] as const;
/** The low sun the sky is painted with (world, on the sky plane) — the key comes from there. */
const SUN = new THREE.Vector3(26, -4.2, -69.8);
/** The sky plane: inside the camera's far plane (90) from every layout. */
const SKY_Z = -70;
/** World y where the sea meets the sky on the sky plane, and the horizon haze colour (= fog). */
const HORIZON_Y = SEA_Y;
const HAZE = '#c8bca8';
/** Distant land: cool slate with warm-lit edges, hazing toward a blue-grey (not the warm horizon). */
const LAND = ['#262a34', '#323844', '#404858', '#525a68', '#687080', '#868c96', '#a8aaae'];
const HAZE_LAND = '#8e98a6';

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
    // The last rows meet the apron (phones look far past the stage): one even front tier.
    if (j >= hm.nz - 2) lv = FRONT_LV;
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
  // Sea stacks: weathered, tapering rock-kit clumps rising from the surf.
  for (const [sx, sz, r, top] of STACKS) rockStack(rock, V(sx, SEA_Y - 0.6, sz), r, top - SEA_Y + 0.6, rng, { foot: '#9aa0a4', top: '#ffffff', taper: 0.6 });
  const onStack = (x: number, z: number) => STACKS.some(([sx, sz, r]) => Math.hypot(x - sx, z - sz) < r * 0.95);
  group.add(mk(rock.build(), track(surfaceMaterial(texSlate, undefined, true))));

  // ---- turf: the clifftop floor (clipped at the edge) + the tier tops (same material)
  const turfMat = track(surfaceMaterial(texTurf));
  {
    const g = floorGrid(hm, texTurf, 64, { res: 2, aoK: 0.8, tintAt: (x, z) => { const k = 0.9 + 0.1 * Math.sin(x * 0.7) * Math.cos(z * 0.9); return [k, k, k * 0.95]; } });
    group.add(mk(clip(g, isLand), turfMat, false, true));
  }
  group.add(mk(tierTops.build(), turfMat));
  // Apron: the front tier's turf runs on far past the near frustum (portrait phones look down
  // past the stage, where the island's underside used to show); same texture and UVs.
  {
    const zf = hm.z0 + hm.nz * CELL;
    const ap = apron({
      x0: -44, x1: 44, z0: zf - 0.02, z1: zf + 36, y: -0.12 + FRONT_LV * LEVEL, map: texTurf, tileTexels: 64,
      shade: (x, z) => (0.86 - 0.3 * THREE.MathUtils.smoothstep(z, zf, zf + 10)) * (0.9 + 0.1 * Math.sin(x * 0.6) * Math.cos(z * 0.5)),
    });
    track(ap.material as THREE.Material);
    group.add(ap);
  }
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
  // Ruined arch: two piers, one broken, a lintel stump, fallen blocks.
  {
    const base = V(7.7, 0, -3.6);
    base.y = topAt(base.x, base.z);
    const pier = (x: number, h: number) => { for (let k = 0; k < h; k++) orientedBox(white, base.clone().add(V(x, 0.3 + k * 0.6, 0)), V(0.62 - (k % 2) * 0.05, 0.6, 0.62), V(0, 1, 0), grey(0.62 + rng.next() * 0.12), rng, (rng.next() - 0.5) * 0.12); };
    pier(-1.0, 5); pier(1.0, 3);
    orientedBox(white, base.clone().add(V(-0.35, 3.15, 0)), V(1.7, 0.42, 0.6), V(-0.12, 1, 0), grey(0.65), rng, 0);
    for (const [dx, dz, s] of [[1.6, 0.8, 0.5], [0.5, 1.2, 0.42], [1.3, 1.6, 0.36]] as const) orientedBox(white, base.clone().add(V(dx, s * 0.4, dz)), V(s * 1.2, s * 0.8, s), V((rng.next() - 0.5) * 0.5, 1, (rng.next() - 0.5) * 0.5), grey(0.62), rng, rng.next() * 3);
  }
  // Ruined pillars at the back of the paving: the low sun behind them throws their long shadows
  // across the flagstones toward the camera.
  const pillar = (x: number, z: number, drums: number, broken: boolean) => {
    const y0 = Math.max(topAt(x, z), -0.05);
    for (const spin of [0, Math.PI / 4]) orientedBox(white, V(x, y0 + 0.14, z), V(1.0, 0.28, 1.0), V(0, 1, 0), grey(0.7), rng, spin);
    let y = y0 + 0.28, ox = 0, oz = 0;
    for (let k = 0; k < drums; k++) {
      const top = k === drums - 1;
      const h = top && broken ? 0.32 : 0.52;
      const r = 0.62 - k * 0.02;
      const tilt = top && broken ? 0.18 : (rng.next() - 0.5) * 0.04;
      for (const spin of [0.1, Math.PI / 4 + 0.1]) orientedBox(white, V(x + ox, y + h / 2, z + oz), V(r, h, r), V(tilt, 1, tilt * 0.6), grey(0.66 + rng.next() * 0.1), rng, spin + k * 0.2);
      y += h; ox += (rng.next() - 0.5) * 0.04; oz += (rng.next() - 0.5) * 0.04;
    }
    if (!broken) for (const spin of [0, Math.PI / 4]) orientedBox(white, V(x + ox, y + 0.1, z + oz), V(0.86, 0.2, 0.86), V(0, 1, 0), grey(0.72), rng, spin);
  };
  pillar(-2.5, -3.35, 5, false);
  pillar(4.1, -3.25, 3, true);
  // A fallen drum and chips by the broken pillar.
  orientedBox(white, V(5.1, 0.26, -2.5), V(0.58, 0.5, 0.58), V(1, 0.08, 0.3), grey(0.64), rng, 0.3);
  orientedBox(white, V(5.1, 0.26, -2.5), V(0.58, 0.5, 0.58), V(1, 0.08, 0.3), grey(0.64), rng, 0.3 + Math.PI / 4);
  for (const [dx, dz, sz] of [[0.6, 0.5, 0.18], [-0.5, 0.7, 0.14], [0.9, 1.1, 0.12]] as const) orientedBox(white, V(4.1 + dx, sz * 0.4, -3.25 + dz), V(sz * 1.4, sz, sz), V((rng.next() - 0.5) * 0.6, 1, 0.2), grey(0.62), rng, rng.next() * 3);
  // Drystone wall along the front ledge (left and right of the stair gap).
  for (let x = -6.5; x < 6.5; x += 0.42 + rng.next() * 0.2) {
    if (Math.abs(x + 0.4) < 1.1) continue;
    const z = 4.25 + Math.sin(x * 0.7) * 0.15;
    const top = topAt(x, z + 0.3);
    // Rounded rock-kit fieldstones, two courses, the top course gappy (not a row of crates).
    for (let k = 0; k < 2; k++) {
      if (k === 1 && rng.chance(0.3)) continue;
      const w = 0.42 + rng.next() * 0.18, h = 0.22 + rng.next() * 0.08;
      boulder(white, [x, top + 0.12 + k * 0.22 + h * 0.3, z + (rng.next() - 0.5) * 0.06], [w, h, 0.34], grey(0.62 + rng.next() * 0.16), rng, { ry: (rng.next() - 0.5) * 0.3, rz: (rng.next() - 0.5) * 0.15, aoBottom: 0.5, topK: 1.3 });
    }
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

  // ---- the vista, back to front: a painted late-afternoon sky (the sun breaking through cloud
  // banks, faint rays), three layers of distant headlands and islands in deepening haze, the
  // sea with its glitter path dissolving into the horizon haze, and fog lying in bands.
  {
    const sky = backdrop((t) => paintCliffSky(t, (SUN.x + 70) * 5, (14 - SUN.y) * 5, (14 - HORIZON_Y) * 5), 700, 150, [140, 30], [0, -1, SKY_Z]);
    sky.mesh.renderOrder = -10;
    track(sky.mesh.material as THREE.Material);
    group.add(sky.mesh);
    const lands: { z: number; x: [number, number]; y: [number, number]; d: number; o: Omit<MesaOpts, 'foot'> }[] = [
      { z: -60, x: [-64, 64], y: [-15, -4], d: 5, o: { ramp: LAND, capRamp: RAMPS2.turf, capRows: 2, count: 0, w: [30, 70], h: [10, 24], haze: 0.5, hazeCol: HAZE_LAND, sunX: 9999, gullies: 0.4, ridge: true, cliff: 2.2, allow: (x) => Math.abs(x / 5 - 64 - SUN.x * 0.86) > 10 } },
      { z: -47, x: [-50, 50], y: [-15, -2], d: 7, o: { ramp: LAND, capRamp: RAMPS2.turf, count: 0, w: [16, 44], h: [24, 50], haze: 0.32, hazeCol: HAZE_LAND, sunX: 9999, gullies: 0.8, foam: '#e6ece8', tilt: 0.45, cliff: 3.5, allow: (x) => { const wx = x / 7 - 50; return wx < -12 || wx > 34; } } },
      { z: -34, x: [-40, 40], y: [-15, 1], d: 10, o: { ramp: LAND, capRamp: RAMPS2.turf, count: 0, w: [22, 52], h: [40, 84], haze: 0.14, hazeCol: HAZE_LAND, sunX: 9999, gullies: 1, foam: '#eef2ee', tilt: 0.6, cliff: 2.2, allow: (x) => { const wx = x / 10 - 40; return wx < -22 || wx > 30; } } },
    ];
    lands.forEach((L, k) => {
      const W = Math.round((L.x[1] - L.x[0]) * L.d), H = Math.round((L.y[1] - L.y[0]) * L.d);
      const b = backdrop((t) => paintMesas(t, new Rng(301 + k * 13), { ...L.o, foot: Math.round((L.y[1] - SEA_Y) * L.d) }), W, H, [L.x[1] - L.x[0], L.y[1] - L.y[0]], [(L.x[0] + L.x[1]) / 2, (L.y[0] + L.y[1]) / 2, L.z], { gain: 0.82 });
      b.mesh.renderOrder = -9 + k;
      track(b.mesh.material as THREE.Material);
      group.add(b.mesh);
    });
    const glow = glints([[SUN.x, SUN.y, SUN.z + 0.3]], 7, '#ffe0a0', 2.4);
    track(glow.points.geometry); track(glow.points.material as THREE.Material);
    group.add(glow.points);
    updates.push(glow.update);
  }

  // ---- the sea below: wave texture, a glitter path out toward the sun, a soft hazy horizon
  const camX = -0.68, camZ = 11.3; // desktop camera (glitter path = the line under the sun)
  const slope = (SUN.x - camX) / (camZ - SUN.z);
  const water = pixelWater({
    rect: { x0: -70, z0: SKY_Z - 2, w: 140, d: 8 - SKY_Z }, y: SEA_Y, fieldRes: 192, range: 5,
    land: (x, z) => isLand(x, z) || onStack(x, z),
    ramp: ['#102840', '#163a56', '#1e4e6a', '#2c6680', '#467f94', '#74a0ac'],
    foam: '#f2f4ee', swash: 0, deep: 7, waveK: 1.3, waveSpeed: 1.8, caps: 0.55, glints: false, far: -16, chop: 0.6,
    glitter: { x: camX + camZ * slope, slope, width: 2.2, strength: 1, color: '#ffe2a8' },
    haze: { color: HAZE, from: -40, to: SKY_Z + 1 },
  });
  track(water);
  group.add(water.mesh);
  updates.push(water.update);

  // ---- light: ONE warm low key from the painted sun's side (back-right, ≈ 28°): long shadows of
  // the ruins and the lighthouse toward the camera, shafts across the clifftop, cool sky fill.
  const az = new THREE.Vector2(SUN.x, SUN.z).normalize();
  const sunFrom = V(az.x * 0.883, 0.47, az.y * 0.883);
  const rig = sunRig(group, {
    target: V(0.1, 0, 0), from: sunFrom, distance: 36, angle: 0.5, penumbra: 0.2, shadowRadius: 2,
    color: '#ffcc90', intensity: 12, cookie: null,
    sky: '#8ea4c4', ground: '#3a4636', hemi: 1.35,
    fill: '#a8bcd8', fillIntensity: 0.4, quality: q,
  });
  const key = rig.key;
  const gob = gobo(key, { kind: 'clouds', seed: 61, pool: { x: 0.1, z: 0, ru: 4.2, rv: 2.8, angle: Math.atan2(-2.0, 2.8), soft: 0.4 }, outside: 0.5, shade: 0.5, cover: 0.32, scale: 12, drift: [0.25, 0.1], y: 0.05 });
  track(gob);
  updates.push(gob.update);
  group.add(lightPools([[0.1, 0, 8.6, 5.8]], '#4a3a24', 1.2));
  // Shafts from the sun break, falling across the clifftop (unequal widths).
  const dir = sunFrom.clone().normalize().negate();
  const beams: BeamSpec[] = ([[-0.8, 0.4, 0.6, 2.2], [2.3, -0.5, 0.25, 0.9], [-4.0, 1.5, 0.4, 1.5]] as const).map(([x, z, w0, w1]) => {
    const end = V(x, 0, z);
    return { start: end.clone().addScaledVector(dir, -10 / -dir.y), end, width: [w0, w1] as [number, number] };
  });
  const rays = lightBeams(beams, '#ffdcaa', 0.22);
  track(rays.mesh.geometry); track(rays.mesh.material as THREE.Material);
  if (!postFlags().has('norays')) group.add(rays.mesh);
  updates.push(rays.update);
  const motes = dustMotes(beams, q === 'high' ? 22 : 12, rng, '#fff0c8');
  track(motes.points.geometry); track(motes.points.material as THREE.Material);
  group.add(motes.points);
  updates.push(motes.update);
  pixelers.push(motes.setPixelSize);

  // ---- fog lying in horizontal bands over the water and between the headlands
  const fog = fogBands([
    { x: 0, y: SEA_Y + 1.0, z: -14, w: 60, h: 2.6, color: '#d8d6cc', alpha: 0.38, speed: 0.35 },
    { x: -6, y: SEA_Y + 1.4, z: -27, w: 90, h: 3.6, color: '#d4ccbe', alpha: 0.32, speed: 0.25 },
    { x: 10, y: SEA_Y + 2.6, z: -40, w: 110, h: 4.4, color: '#d2c8b8', alpha: 0.32, speed: 0.2 },
    { x: 0, y: SEA_Y + 2.0, z: -56, w: 150, h: 5.5, color: '#cfc4b2', alpha: 0.6, speed: 0.15 },
  ]);
  track(fog);
  group.add(fog.mesh);
  updates.push(fog.update);

  // ---- spray at the cliff foot, gulls below the edge
  const lowK = q === 'high' ? 1 : 0.45;
  const sprayEmit: { x: number; z: number }[] = [];
  for (let x = -12; x <= 12; x += 1.5) sprayEmit.push({ x, z: edgeZ(x) - 0.4 });
  const spray = particles({
    kind: 'spray',
    emitters: sprayEmit.map(({ x, z }) => ({ min: V(x - 0.6, SEA_Y, z - 0.6), max: V(x + 0.6, SEA_Y + 0.3, z), vmin: V(-0.4, 2.5, -0.3), vmax: V(0.4, 4.2, 0.2), count: Math.round(8 * lowK), life: [1.0, 1.8] as [number, number], size: [0.3, 0.5] as [number, number] })),
    colorA: hdr('#fff8ee', 1.05), colorB: hdr('#9aa8b0', 0.95), accel: V(0.4, -3.2, 0), grow: [0.8, 2.0], opacity: 0.9,
  }, rng);
  const gulls = particles({
    kind: 'gull',
    emitters: [
      { min: V(-1, -3.5, -8), max: V(1, -2.5, -7), vmin: V(2.2, 0.2, 0.3), vmax: V(3.0, 0.4, 0.5), count: 3, life: [10, 10], size: [0.9, 1.0] },
      { min: V(2, 3.5, -9), max: V(3, 4.2, -8), vmin: V(2.5, 0.2, 0.3), vmax: V(3.5, 0.4, 0.5), count: 2, life: [10, 10], size: [0.9, 1.0] },
    ],
    colorA: hdr('#f0f2f4', 1.0), colorB: hdr('#30343c', 1),
  }, rng);
  for (const p of [spray, gulls]) { group.add(p.points); track(p); updates.push(p.update); pixelers.push(p.setPixelSize); }

  const spriteLight: SpriteLight = { ...rig.spriteLight, rim: new THREE.Color('#ffe0b0').multiplyScalar(0.7) };

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


const SKY = ['#3e5274', '#4c6286', '#5e7496', '#7486a2', '#8e9aae', '#aeaeb2', '#ccbca8', '#e4caa0', '#f6deb0'];
const CLOUD = ['#3e4658', '#525c72', '#6c748a', '#8a8e9e', '#aca8ac', '#d2c2b2', '#f0dcc0', '#fff4dc'];

/**
 * Late-afternoon sky on the far backdrop: flat bands from slate blue down to warm gold at the
 * horizon (the very bottom rows ARE the horizon haze colour, so the sea's haze meets it without a
 * line), a glow round the low sun, faint crepuscular rays fanning down from it, and three banks
 * of cumulus — flat bases, billowing tops, cool grey bodies, warm silver linings toward the sun.
 */
function paintCliffSky(t: RgbaTile, sunX: number, sunY: number, horizon: number) {
  const n = SKY.length;
  const ray = (x: number, y: number) => {
    if (y <= sunY) return 0;
    const a = Math.atan2(y - sunY, x - sunX);
    let k = 0;
    for (const [c, w] of [[1.75, 0.035], [2.05, 0.05], [2.4, 0.03], [1.35, 0.03], [2.75, 0.04]] as const) k = Math.max(k, 1 - Math.abs(a - c) / w);
    return Math.max(0, k) * Math.max(0, 1 - Math.hypot(x - sunX, y - sunY) / 260);
  };
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const d = Math.hypot(x - sunX, (y - sunY) * 1.6);
    let v = Math.min(1, Math.max(0, y / horizon)) ** 1.3 * (n - 2.2) + Math.max(0, 1 - d / 170) * 2.6 + (ray(x, y) > 0.3 ? 0.8 : 0);
    v = Math.min(n - 1, v);
    if (y >= horizon - 3) { t.set(x, y, HAZE); continue; }
    t.set(x, y, SKY[bandIndex(v, x, y, n, 0.08)]!);
    if (y >= horizon - 7 && (x * 7 + y * 3) % (horizon - y) === 0) t.set(x, y, HAZE);
  }
  // The sun disc (partly behind the middle cloud bank, painted over it below).
  for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) if (x * x + y * y <= 49) t.set(sunX + x, sunY + y, x * x + y * y > 30 ? '#fff0c8' : '#fffcf0');
  // Cumulus banks: union of discs with flat bases.
  const rng = new Rng(611);
  const cn = CLOUD.length;
  for (const [row, count, rMin, rMax] of [[24, 9, 16, 34], [62, 11, 10, 22], [96, 13, 6, 12]] as const) {
    const discs: [number, number, number][] = [];
    let x = rng.next() * 40;
    while (x < t.w + 20) {
      const r = rMin + rng.next() * (rMax - rMin);
      // Gaps between clouds; never a cloud right over the sun disc on the lowest bank.
      if (rng.chance(0.8) && !(row === 96 && Math.abs(x - sunX) < 50)) {
        for (let k = 0; k < 4 + rng.int(4); k++) discs.push([x + (rng.next() - 0.5) * r * 2.6, row - rng.next() * r * 0.7, r * (0.45 + rng.next() * 0.55)]);
      }
      x += r * (1.3 + rng.next() * 1.6);
    }
    void count;
    const base = row + rMax * 0.35;
    for (let y = Math.max(0, Math.floor(row - rMax * 2)); y <= base && y < horizon - 6; y++) for (let x2 = 0; x2 < t.w; x2++) {
      let best = -1, top = 0;
      for (const [cx, cy, r] of discs) {
        const dd = Math.hypot((x2 - cx) * 0.62, (y - cy) * 1.1) / r;
        if (dd < 1 && 1 - dd > best) { best = 1 - dd; top = (cy - r * 0.9 - y) / r; }
      }
      if (best < 0) continue;
      const toSun = Math.max(0, 1 - Math.hypot(x2 - sunX, y - sunY) / 190);
      const edge = best < 0.12;
      let v = 1.2 + (base - y) / (rMax * 1.4) * 1.8 + toSun * 2.4 + (top > -0.25 ? 0.7 : 0);
      if (edge) v += 0.9 + toSun * 2.6;                    // lit rim, silver lining near the sun
      if (y > base - 3) v -= 0.9;                          // flat, shaded base
      t.set(x2, y, CLOUD[bandIndex(Math.max(0, Math.min(cn - 1, v)), x2, y, cn, 0.12)]!);
    }
  }
}
