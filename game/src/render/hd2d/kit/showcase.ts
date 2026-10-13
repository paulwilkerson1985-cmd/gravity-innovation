// A small outdoor arena built ONLY from the shared kit — the worked example for arena builders
// (docs/HD2D.md "Shared kit") and the capture rig for kit changes. Not registered as a terrain:
// register it at runtime (`registerArena`) or copy it as a starting point.
//
// Layout: a grass clearing ringed by boulder terraces (left/back), a pond with foam and
// ripples (front-right), trees, bushes, tall grass and flowers at the edges, a fence, a
// banner pole and a lantern; preset light rig + matching particles.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { Heightmap, VoxelBatch, surfaceMaterial, type ArenaRig } from '../arena';
import { RAMPS, cachedTexture, paintBoulder, paintGrass, paintPlanks, paintRock, paintSteel } from '../textures';
import type { Quality } from '../pipeline';
import { FoliageBatch, tree } from './foliage';
import { lightRig, type LightPreset } from './lights';
import { particleSystem, type ParticlePreset } from './particles';
import { banner, crate, fence, lanternPost, type PropBatches } from './props';
import { boulderColumns, organicTerraces, pebbles, rubblePile } from './rock';
import { TEXEL } from './units';
import { pixelWater } from './water';

export interface ShowcaseOptions { seed?: number; quality?: Quality; light?: LightPreset; particles?: ParticlePreset }

export function buildKitShowcase(o: ShowcaseOptions = {}): ArenaRig & { background: THREE.Color; fog: THREE.Color } {
  const rng = new Rng(o.seed ?? 21);
  const q = o.quality ?? 'high';
  const group = new THREE.Group();
  group.name = 'hd2d-kit-showcase';
  const spots: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-1.3, 0, 1.0), new THREE.Vector3(1.5, 0, -1.0)];
  const keepOut = [{ x: -3.4, z: -2.9, r: 2.3 }, { x: -1.3, z: 1.0, r: 1.4 }, { x: 1.5, z: -1.0, r: 1.4 }, { x: -2.5, z: 1.9, r: 0.8 }, { x: 2.75, z: -1.95, r: 0.8 }];

  // Terraces: floor ellipse, rising to the back and left; open toward the pond (front right).
  const hm = new Heightmap(30, 22, -13.5, -13);
  organicTerraces(hm, (x, z) => {
    return (Math.hypot(x / 6.4, z / 4.4) - 1) * 4.2;
  }, rng, { step: 1.5, max: 6 });
  const rock = new VoxelBatch(32);
  boulderColumns(hm, rock, rng, { tints: ['#ffffff', '#e8f0d8'], shade: [0.8, 1.12] });
  group.add(mesh(rock.build(), surfaceMaterial(cachedTexture('kit-boulder-stone', () => paintBoulder(31, 32, RAMPS.stone)), undefined, true)));

  // Ground: grass, with stones.
  {
    const g = new THREE.PlaneGeometry(30, 26);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv!, pos = g.attributes.position!;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / (TEXEL * 64), -pos.getZ(i) / (TEXEL * 64));
    const ground = mesh(g, surfaceMaterial(cachedTexture('kit-grass', () => paintGrass(4, 64))), false, true);
    ground.material.vertexColors = false;
    group.add(ground);
  }
  const stone = new VoxelBatch(32);
  rubblePile(stone, [-5.6, 0, 1.4], rng, { radius: 1.1 });
  pebbles(stone, [-5.5, -3, 5.5, 3.5], 30, rng, keepOut);
  group.add(mesh(stone.build(), surfaceMaterial(cachedTexture('kit-boulder-stone', () => paintBoulder(31, 32, RAMPS.stone)), undefined, true)));

  // Pond (back left) with ripple rings.
  const pondLand = (x: number, z: number) => Math.hypot((x + 3.4) / 2.4, (z + 2.9) / 1.15) > 1 + Math.sin(x * 2.3 + z) * 0.07;
  const water = pixelWater({ rect: { x0: -6.2, z0: -4.3, w: 5.6, d: 2.8 }, y: 0.02, land: pondLand, range: 1.1, ripples: [[-4.0, -3.0], [-2.6, -2.6]], light: o.light === 'moonlight' ? 0.32 : o.light === 'sunset' ? 0.85 : 1 });
  group.add(water.mesh);

  // Props.
  const wood = new VoxelBatch(32), paint = new VoxelBatch(16), glow = new VoxelBatch(16);
  const pb: PropBatches = { wood, paint, glow, stone: undefined };
  fence(pb, [[-6, 0, 3.2], [-3.6, 0, 3.9], [-1.2, 0, 4.1]], rng);
  banner(pb, [4.6, 2.3, -3.6], rng, { cloth: '#3f7a52', trim: '#e8dcc0' });
  wood.box([4.6 - 0.05, 0, -3.65], [4.6 + 0.05, 2.35, -3.55], new THREE.Color(0.8, 0.8, 0.8), rng);
  const lampAt = lanternPost(pb, [-6.0, 0, -0.6], rng);
  crate(pb, [5.6, 0, -1.6], 0.5, rng, { ry: 0.4 });
  const trunks = new VoxelBatch(32);

  // Foliage.
  const fol = new FoliageBatch();
  for (const [x, z, h] of [[-6.5, -3.6, 2.8], [6.8, -2.6, 3.2], [-7.6, 1.5, 2.4], [8.5, 0.2, 2.6]] as const) tree(trunks, fol, [x, hm.get(...hm.cell(x, z)) > 0 ? 0 : 0, z], rng, { height: h });
  fol.scatter(['bush'], [-7, -4, 7, -3], 6, rng, { keepOut });
  fol.scatter(['tallgrass', 'tuft', 'tuft'], [-6.5, -3.5, 6.5, 4], 60, rng, { keepOut });
  fol.scatter(['flowerRed', 'flowerYellow', 'flowerBlue', 'flowerWhite'], [-6, -3, 3, 4], 30, rng, { keepOut, scale: 1.3 });
  const foliage = fol.build({ strength: o.particles === 'snow' ? 0.4 : 1 });
  group.add(foliage.mesh);

  group.add(mesh(trunks.build(), surfaceMaterial(cachedTexture('kit-bark', () => paintRock(12, 32, RAMPS.bark)), undefined, true)));
  group.add(mesh(wood.build(), surfaceMaterial(cachedTexture('plank', () => paintPlanks(4, 64, 64, 8)), undefined, true)));
  group.add(mesh(paint.build(), surfaceMaterial(cachedTexture('paint', () => paintSteel(2, 16, RAMPS.paint)), undefined, true)));
  group.add(mesh(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true }), false, false));

  // Light + atmosphere.
  const preset = o.light ?? 'daylight';
  const rig = lightRig(group, preset, { quality: q, extent: 11 });
  if (q === 'high' && (preset === 'moonlight' || preset === 'sunset')) {
    const p = new THREE.PointLight(new THREE.Color('#ffb04a'), 4, 5, 1.6);
    p.position.copy(lampAt);
    group.add(p);
  }
  const fx = particleSystem(o.particles ?? (preset === 'moonlight' ? 'fireflies' : 'pollen'), { min: [-7, 0.2, -4], max: [7, 3, 4], count: q === 'high' ? 70 : 35 }, rng);
  group.add(fx.points);

  return {
    group, spots,
    people: [new THREE.Vector3(-2.5, 0, 1.9), new THREE.Vector3(2.75, 0, -1.95)],
    trainerExit: new THREE.Vector3(5, 0, -5),
    spriteLight: rig.spriteLight,
    key: rig.key,
    background: rig.background, fog: rig.fog,
    update(t) { water.update(t); foliage.update(t); fx.update(t); },
    setPixelSize(px) { fx.setPixelSize(px); },
    dispose() {
      water.dispose(); foliage.dispose(); fx.dispose(); rig.dispose();
      group.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh && m.name !== 'hd2d-water' && m.name !== 'hd2d-foliage') { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
    },
  };
}

function mesh(g: THREE.BufferGeometry, m: THREE.MeshLambertMaterial | THREE.MeshBasicMaterial, cast = true, receive = true) {
  const out = new THREE.Mesh(g, m);
  out.castShadow = cast;
  out.receiveShadow = receive;
  return out;
}
