// Coast cove / beach (Squall Coast `dune-grass`, and the coast's default incl. Storm Angler
// Merrow): a sandy cove between two terraced sandstone headlands, pixel waves rolling in from
// the back with foam and a running swash, a weathered pier on the right, a beached rowboat,
// driftwood, rock outcrops with spray, palms and dune grass, gulls wheeling over the water.
// Light motif: a high late-morning sun through drifting cloud (a dappled cookie on the sun
// spot), sun glints on the sea, warm sand bounce.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { CELL, Heightmap, LEVEL, VoxelBatch, surfaceMaterial, type ArenaRig } from '../arena';
import { boulderColumns, rubblePile } from '../kit/rock';
import { paintBoulder } from '../textures';
import type { SpriteLight } from '../sprite';
import type { Grade } from '../pipeline';
import type { ArenaDef } from './index';
import { mergeGeos } from './outdoorKit';
import { paintPlanks } from '../textures';
import {
  ATLAS, FoliageBatch, RAMPS2, V, atlasRect, TRODDEN_SIZE, troddenMarking, cachedTexture, cloudCookie, decal, disposeGroup, floorGrid, foliageAtlas, foliageMaterial,
  cachedCanvas, grey, hdr, levelAt, makeGrade, orientedBox, paintAlpha, paintBark, paintDrift, paintSand, palmTree, particles, pixelWater,
} from './localKit';

export const ARENA: ArenaDef = {
  id: 'coast',
  label: 'Coast cove',
  match: [{ route: 'coast' }, { route: 'coast', hotspot: 'dune-grass' }, { trainer: 'angler-merrow' }],
  build: (o) => buildCoastArena({ seed: o.seed, quality: o.quality, trainer: o.trainerBattle }),
  grade: coastGrade,
  background: '#cfe6ee',
  fog: '#cfe6ee',
  fogRange: [8, 46],
};

export function coastGrade(): Grade {
  return makeGrade({
    gain: new THREE.Vector3(1.02, 1.0, 0.97), lift: new THREE.Vector3(0.0, 0.006, 0.014),
    saturation: 0.82, contrast: 1.05,
    shadowTint: new THREE.Color('#2a3a5a'), highTint: new THREE.Color('#fff0c8'), splitAmount: 0.12,
    vignette: 0.16, exposure: 1.08,
  });
}

export interface CoastOptions { seed?: number; quality?: 'high' | 'low'; trainer?: boolean }

const WATER_Y = -0.16;

export function buildCoastArena(opts: CoastOptions = {}): ArenaRig {
  const rng = new Rng(opts.seed ?? 31);
  const q = opts.quality ?? 'high';
  const group = new THREE.Group();
  group.name = 'hd2d-coast-arena';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const updates: ((t: number) => void)[] = [];
  const pixelers: ((px: number) => void)[] = [];

  const texSand = cachedTexture('sand', () => paintSand(21, 64));
  const texStone = cachedTexture('sandstone-boulder', () => paintBoulder(23, 32, RAMPS2.sandstone));
  const texWet = cachedTexture('wet-boulder', () => paintBoulder(29, 32, RAMPS2.wetRock));
  const texDrift = cachedTexture('drift', () => paintDrift(25, 32));
  const texBark = cachedTexture('palm-bark', () => paintBark(27, 16));
  const texPlank = cachedTexture('pier-plank', () => paintPlanks(33, 64, 64, 8, RAMPS2.drift));

  // ---- the shape of the cove
  const shoreZ = (x: number) => -3.5 + 0.035 * x * x + Math.sin(x * 0.9) * 0.15;
  const sandY = (x: number, z: number) => {
    const s = z - shoreZ(x);
    let y = s >= 1.3 ? 0 : (s - 1.3) * 0.22;
    y = Math.max(y, -0.7);
    // Front dune ridge.
    y += 0.55 * THREE.MathUtils.smoothstep(z, 3.9, 6.2) * (0.8 + 0.2 * Math.sin(x * 0.8));
    return y;
  };
  const X0 = -13.5, Z0 = -13.5;
  const hm = new Heightmap(30, 22, X0, Z0);
  for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
    const x = hm.cx(i), z = hm.cz(j);
    const wob = Math.sin(x * 1.2 + z * 0.8) * 0.4 + Math.sin(z * 1.9 - x * 0.6) * 0.3;
    let lv = 0;
    // Headlands: rise outward, run back into the sea and taper off as stacks.
    const left = -6.6 - x + wob, right = x - 6.9 + wob;
    for (const d of [left, right]) {
      if (d <= 0) continue;
      const back = Math.max(0, -3.0 - z); // how far out to sea
      const h = 1 + Math.floor(d / 1.3) + (d > 2.6 ? Math.floor((d - 2.6) / 1.0) : 0) - Math.floor(back / 2.2);
      if (z < -11) continue;
      lv = Math.max(lv, h);
    }
    // Sea stacks.
    for (const [sx, sz, r, h] of [[-4.8, -9.0, 1.3, 3], [5.6, -10.6, 1.5, 4], [-0.6, -12.4, 1.0, 2]] as const) if (Math.hypot(x - sx, z - sz) < r) lv = Math.max(lv, h);
    if (lv > 0) {
      const cl = Math.sin(Math.floor(i / 2) * 12.9898 + Math.floor(j / 2) * 78.233) * 43758.5453;
      const n = cl - Math.floor(cl);
      lv = Math.max(1, Math.min(8, lv + (n > 0.78 ? 1 : n < 0.12 ? -1 : 0)));
    }
    hm.set(i, j, lv);
  }

  // ---- sandstone terraces with sand mats on top (rock reaches under water)
  const rock = new VoxelBatch(32);
  boulderColumns(hm, rock, rng, { baseY: -0.7, tints: ['#ffffff', '#fff4e8', '#f4ece4'] });
  group.add(mk(rock.build(), track(surfaceMaterial(texStone, undefined, true))));
  // ---- sand floor (dry → wet toward the water) + caps share the sand texture
  {
    const g = floorGrid(hm, texSand, 64, {
      res: 2, heightAt: sandY, aoK: 0.6,
      tintAt: (x, z) => { const s = z - shoreZ(x); const wet = 1 - THREE.MathUtils.smoothstep(s, 0.6, 1.6); return [1 - wet * 0.32, 1 - wet * 0.3, 1 - wet * 0.24]; },
    });
    group.add(mk(g, track(surfaceMaterial(texSand)), false, true));
  }

  // ---- sea
  const water = pixelWater({
    rect: { x0: -50, z0: -100, w: 100, d: 108 }, y: WATER_Y, fieldRes: 256, range: 7,
    land: (x, z) => sandY(x, z) > WATER_Y || levelAt(hm, x, z) > 0,
    ramp: ['#14466e', '#1c6390', '#2a84aa', '#3aa2bc', '#5ec2c8', '#9adcd2'],
    foam: '#f6fbf6', wet: '#8a7154', swash: 0.55, deep: 6, waveK: 1.5, waveSpeed: 1.6, caps: 0.25, far: -10,
  });
  track(water);
  group.add(water.mesh);
  updates.push(water.update);

  // ---- props: pier, rowboat, driftwood, outcrops, shells
  const wood = new VoxelBatch(64);
  const drift = new VoxelBatch(32);
  const wet = new VoxelBatch(32);
  const bark = new VoxelBatch(16);
  const props = new VoxelBatch(32);
  // Pier: deck on posts from the beach out over the water, right of the foe.
  const pier = { x: 5.0, z0: -2.4, z1: -10.5, w: 1.3, y: 0.32 };
  for (let z = pier.z0; z > pier.z1; z -= 0.42) {
    wood.box([pier.x - pier.w / 2, pier.y - 0.1, z - 0.4], [pier.x + pier.w / 2, pier.y, z], grey(0.85 + rng.next() * 0.25), rng, { aoBottom: 0.8 });
  }
  for (let z = pier.z0 - 0.3; z > pier.z1; z -= 1.6) for (const sx of [-1, 1]) {
    drift.box([pier.x + sx * (pier.w / 2) - 0.1, -0.9, z - 0.1], [pier.x + sx * (pier.w / 2) + 0.1, pier.y + (z < pier.z1 + 2 ? 0.55 : 0.1), z + 0.1], grey(0.7), rng);
  }
  // Rail on the sea end + a lantern post and a crate of rope.
  drift.box([pier.x - pier.w / 2, pier.y + 0.4, pier.z1 + 0.2], [pier.x + pier.w / 2, pier.y + 0.48, pier.z1 + 0.32], grey(0.8), rng);
  orientedBox(drift, V(pier.x - 0.3, pier.y + 0.2, pier.z0 - 1.4), V(0.4, 0.4, 0.4), V(0, 1, 0), grey(0.75), rng, 0.3);
  // Rowboat: hull from oriented planks, beached on its side at the left.
  {
    const c = V(-4.9, 0.18, -2.3), yaw = 0.5;
    const fwd = V(Math.cos(yaw), 0, -Math.sin(yaw)), side = V(Math.sin(yaw), 0, Math.cos(yaw));
    orientedBox(wood, c.clone().add(V(0, -0.08, 0)), V(0.7, 0.1, 2.0), V(0, 1, 0), new THREE.Color('#ff8a5a').multiplyScalar(1.3), rng, yaw + Math.PI / 2);
    for (const s of [-1, 1]) orientedBox(wood, c.clone().addScaledVector(side, s * 0.38).add(V(0, 0.08, 0)), V(0.1, 0.36, 2.0), V(s * 0.3, 1, 0).applyAxisAngle(V(0, 1, 0), yaw), new THREE.Color('#5ab0e8').multiplyScalar(1.4), rng, yaw + Math.PI / 2);
    orientedBox(wood, c.clone().addScaledVector(fwd, 0.95).add(V(0, 0.1, 0)), V(0.6, 0.36, 0.12), V(0, 1, 0), new THREE.Color('#5ab0e8').multiplyScalar(1.4), rng, yaw);
    orientedBox(wood, c.clone().addScaledVector(fwd, -0.95).add(V(0, 0.1, 0)), V(0.6, 0.36, 0.12), V(0, 1, 0), new THREE.Color('#5ab0e8').multiplyScalar(1.4), rng, yaw);
    orientedBox(wood, c.clone().add(V(0, 0.16, 0)), V(0.68, 0.06, 0.18), V(0, 1, 0), grey(0.9), rng, yaw + Math.PI / 2); // thwart
    orientedBox(drift, c.clone().addScaledVector(side, 0.9).add(V(0.1, 0.06, 0)), V(0.08, 1.7, 0.08), V(0.2, 0.06, 1).applyAxisAngle(V(0, 1, 0), yaw), grey(0.8), rng); // oar
  }
  // Driftwood logs (with a stub branch) along the edges of the beach.
  for (const [x, z, a, l] of [[-5.6, 1.2, 0.4, 1.9], [3.9, 3.2, -0.3, 1.6], [6.0, 0.4, 1.3, 1.3], [-2.8, 4.0, 0.1, 1.2]] as const) {
    const dir = V(Math.cos(a), 0.04, Math.sin(a));
    orientedBox(drift, V(x, 0.12 + sandY(x, z), z), V(0.24, l, 0.24), dir, grey(0.95 + rng.next() * 0.15), rng, rng.next());
    orientedBox(drift, V(x + dir.x * l * 0.2, 0.3 + sandY(x, z), z + dir.z * l * 0.2 + 0.1), V(0.08, 0.5, 0.08), V(0.4, 1, 0.3), grey(0.9), rng);
  }
  // Wet rock outcrops at the water line (spray goes here).
  const outcrops: [number, number, number][] = [[-6.2, -3.4, 0.9], [6.9, -2.7, 0.8], [-2.6, -5.6, 0.6], [2.2, -6.4, 0.5]];
  for (const [cx, cz, r] of outcrops) rubblePile(wet, [cx, WATER_Y - 0.2, cz], rng, { radius: r * 1.2, heap: 0.7, big: Math.min(0.75, r * 0.8) });
  // Shells, a starfish, pebbles (off the kin spots).
  const clear = (x: number, z: number) => Math.hypot(x + 1.3, z - 1.0) < 1.3 || Math.hypot(x - 1.5, z + 1.0) < 1.3 || Math.hypot(x + 2.5, z - 1.9) < 0.7 || Math.hypot(x - 2.75, z + 1.95) < 0.7;
  for (let i = 0; i < 26; i++) {
    const x = (rng.next() - 0.5) * 11, z = -2.6 + rng.next() * 6.5;
    if (clear(x, z)) continue;
    const c = rng.pick(['#f6e6d8', '#f0b8a0', '#e8d0b0', '#c8b8a8', '#ff9a7a']);
    orientedBox(props, V(x, sandY(x, z) + 0.03, z), V(0.12, 0.06, 0.1), V(0, 1, 0), new THREE.Color(c), rng, rng.next() * 3);
  }
  for (const [x, z] of [[-3.6, -1.6], [3.4, 1.8]] as const) for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    orientedBox(props, V(x + Math.cos(a) * 0.1, sandY(x, z) + 0.025, z + Math.sin(a) * 0.1), V(0.07, 0.04, 0.2), V(0, 1, 0), new THREE.Color('#ff7a4a'), rng, -a + Math.PI / 2);
  }

  // ---- foreground sand dressing (the near dune, under the camera): a half-buried rock pile,
  // tide pools, shells and a driftwood branch — the beach reads close-up, not empty.
  rubblePile(wet, [-3.9, sandY(-3.9, 5.2) - 0.24, 5.2], rng, { radius: 0.95, heap: 0.45, big: 0.6 });
  rubblePile(wet, [4.6, sandY(4.6, 5.6) - 0.2, 5.6], rng, { radius: 0.6, heap: 0.4, big: 0.42 });
  orientedBox(drift, V(1.6, sandY(1.6, 5.0) + 0.1, 5.0), V(0.2, 1.7, 0.2), V(Math.cos(0.3), 0.05, Math.sin(0.3)), grey(1.0), rng, 0.4);
  orientedBox(drift, V(2.1, sandY(2.1, 5.2) + 0.2, 5.25), V(0.07, 0.55, 0.07), V(0.5, 1, 0.2), grey(0.9), rng);
  for (let i = 0; i < 22; i++) {
    const x = (rng.next() - 0.5) * 12, z = 3.4 + rng.next() * 2.8;
    if (clear(x, z)) continue;
    const c = rng.pick(['#f6e6d8', '#f0b8a0', '#e8d0b0', '#ffd8c8', '#d8c8b8']);
    orientedBox(props, V(x, sandY(x, z) + 0.03, z), V(0.12 + rng.next() * 0.06, 0.06, 0.1), V((rng.next() - 0.5) * 0.3, 1, 0), new THREE.Color(c), rng, rng.next() * 3);
  }
  {
    const tex = cachedCanvas('tide-pool', () => paintAlpha(40, 26, ['#6a5240', '#86684c', '#245e7a', '#327c98', '#58a8b8', '#a8dcd8', '#f0fbf6'], (x, y) => {
      const u = (x + 0.5 - 20) / 19, v = (y + 0.5 - 13) / 12;
      const r = Math.hypot(u, v) + Math.sin(x * 0.7 + y * 0.4) * 0.05;
      if (r > 1) return -1;
      if (r > 0.82) return r > 0.92 ? 0 : 1;          // wet sand rim
      const d = 1 - r / 0.82;
      if ((x * 5 + y * 3) % 23 === 0 && d > 0.3) return 6; // glint
      return 2 + Math.min(3, Math.floor(d * 3 + (v < -0.2 ? 1 : 0)));
    }));
    const geos = ([[3.4, 4.5, 1.5, 0.9, 0.3], [5.7, 3.7, 1.1, 0.7, -0.4], [-1.6, 5.6, 1.2, 0.75, 0.1]] as const).map(([x, z, w, d, r]) => {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2); g.rotateY(r); g.translate(x, sandY(x, z) + 0.02, z);
      return g;
    });
    const pools = mk(mergeGeos(geos), track(new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 })), false, true);
    group.add(pools);
  }

  // ---- palms + dune grass (one foliage mesh), trunks (bark mesh)
  const leaves = new FoliageBatch();
  const capTop = (x: number, z: number) => { const [i, j] = hm.cell(x, z); return -0.7 + hm.get(i, j) * LEVEL; };
  palmTree(bark, leaves, V(-6.0, sandY(-6.0, 2.6), 2.6), 3.6, new THREE.Vector2(1.0, 0.4), rng);
  palmTree(bark, leaves, V(-8.3, capTop(-8.3, -0.8), -0.8), 3.2, new THREE.Vector2(0.9, -0.3), rng);
  palmTree(bark, leaves, V(7.6, capTop(7.6, 1.6), 1.6), 3.4, new THREE.Vector2(-1.1, 0.2), rng);
  const dune = atlasRect(ATLAS.dune), grass = atlasRect(ATLAS.grass), pinks = atlasRect(ATLAS.pinks);
  for (let i = 0; i < 70; i++) {
    const x = (rng.next() - 0.5) * 16, z = 3.6 + rng.next() * 2.8;
    leaves.tuft(V(x, sandY(x, z) - 0.02, z), 0.5 + rng.next() * 0.3, 0.55 + rng.next() * 0.45, rng.chance(0.75) ? dune : grass, grey(0.85 + rng.next() * 0.3), rng, 2);
  }
  for (let i = 0; i < 40; i++) {
    const x = (rng.chance(0.5) ? -1 : 1) * (6.4 + rng.next() * 4), z = -4 + rng.next() * 9;
    const [ci, cj] = hm.cell(x, z);
    if (hm.get(ci, cj) <= 0) continue;
    leaves.tuft(V(x, capTop(x, z) - 0.02, z), 0.45, 0.45 + rng.next() * 0.35, rng.pick([dune, grass, pinks]), grey(0.85 + rng.next() * 0.3), rng, 2);
  }
  for (let i = 0; i < 12; i++) {
    const x = (rng.chance(0.5) ? -1 : 1) * (4.4 + rng.next() * 1.8), z = -1.5 + rng.next() * 5;
    if (clear(x, z)) continue;
    leaves.tuft(V(x, sandY(x, z) - 0.02, z), 0.4, 0.4 + rng.next() * 0.3, dune, grey(0.9), rng, 2);
  }
  const fol = foliageMaterial(foliageAtlas(), { strength: 0.12, speed: 1.3 });
  track(fol.material); track(fol.depth);
  const folMesh = mk(leaves.build(), fol.material, true, true);
  folMesh.customDepthMaterial = fol.depth;
  group.add(folMesh);
  updates.push(fol.update);

  group.add(mk(wood.build(), track(surfaceMaterial(texPlank, undefined, true))));
  group.add(mk(drift.build(), track(surfaceMaterial(texDrift, undefined, true))));
  group.add(mk(wet.build(), track(surfaceMaterial(texWet, undefined, true))));
  group.add(mk(bark.build(), track(surfaceMaterial(texBark, undefined, true))));
  group.add(mk(props.build(), track(surfaceMaterial(null))));

  if (opts.trainer) {
    // A trodden oval in the sand (no chalk): packed damp sand, scuffs, kicked shells and pebbles.
    const m = decal(troddenMarking('#8a6c4c', '#f8ead0', ['#f6e6d8', '#c8b8a8', '#7a6450']), 0.1, 0.012, 0.0, TRODDEN_SIZE, TRODDEN_SIZE, { rot: Math.atan2(2.0, 2.8) });
    track(m.material as THREE.Material);
    group.add(m);
  }

  // ---- light: sun (a far spot with a drifting-cloud cookie), sky/sand hemisphere, sea fill
  const key = new THREE.SpotLight(new THREE.Color('#fff1d6'), 3.3, 0, 0.62, 0.3, 0);
  key.position.set(-11, 22, -6);
  key.target.position.set(0.3, 0, 0.2);
  key.map = cloudCookie(5);
  track(key.map);
  key.castShadow = true;
  key.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 3;
  key.shadow.camera.near = 12;
  key.shadow.camera.far = 40;
  group.add(key, key.target);
  const hemi = new THREE.HemisphereLight(new THREE.Color('#cfe8ff'), new THREE.Color('#c8a070'), 1.25);
  group.add(hemi);
  const fill = new THREE.DirectionalLight(new THREE.Color('#bfe0ff'), 0.6);
  fill.position.set(4, 5, 10);
  group.add(fill, fill.target);

  // ---- spray at the outcrops, gulls over the water
  const lowK = q === 'high' ? 1 : 0.5;
  const spray = particles({
    kind: 'spray',
    emitters: outcrops.map(([x, z, r]) => ({ min: V(x - r, WATER_Y, z - r * 0.6), max: V(x + r, WATER_Y + 0.3, z + r * 0.4), vmin: V(-0.4, 1.0, 0.0), vmax: V(0.4, 2.0, 0.6), count: Math.round(18 * lowK), life: [0.8, 1.6] as [number, number], size: [0.12, 0.22] as [number, number] })),
    colorA: hdr('#ffffff', 1.1), colorB: hdr('#a8d8e8', 0.95), accel: V(0, -2.6, 0), grow: [0.8, 1.6], opacity: 0.95,
  }, rng);
  const gulls = particles({
    kind: 'gull',
    emitters: [
      { min: V(-3, 4.6, -8), max: V(-2, 5.2, -7), vmin: V(2.5, 0.25, 0.3), vmax: V(3.5, 0.45, 0.5), count: 3, life: [10, 10], size: [0.85, 1.0] },
      { min: V(3, 5.4, -11), max: V(4, 6.0, -10), vmin: V(3, -0.3, 0.3), vmax: V(4.5, -0.2, 0.5), count: 3, life: [10, 10], size: [0.85, 1.0] },
    ],
    colorA: hdr('#f8f8f4', 1.05), colorB: hdr('#3a3a44', 1),
  }, rng);
  for (const p of [spray, gulls]) { group.add(p.points); track(p); updates.push(p.update); pixelers.push(p.setPixelSize); }

  const spriteLight: SpriteLight = {
    keyDir: key.position.clone().sub(key.target.position).normalize(),
    keyColor: new THREE.Color('#fff0d6').multiplyScalar(0.7),
    sky: new THREE.Color('#cfe6ff').multiplyScalar(0.55),
    ground: new THREE.Color('#d8b080').multiplyScalar(0.5),
    rim: new THREE.Color('#fff4dc').multiplyScalar(0.6),
  };

  return {
    group,
    spots: [V(-1.3, 0, 1.0), V(1.5, 0, -1.0)],
    people: [V(-2.5, 0, 1.9), V(2.75, 0, -1.95)],
    trainerExit: V(pier.x, pier.y, pier.z0 - 2),
    spriteLight,
    key,
    update(t) { for (const u of updates) u(t); },
    setPixelSize(px) { for (const p of pixelers) p(px); },
    dispose() { disposeGroup(group, disposables); },
  };
}

function mk(g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true): THREE.Mesh {
  const out = new THREE.Mesh(g, m);
  out.castShadow = cast;
  out.receiveShadow = receive;
  return out;
}

void CELL;
