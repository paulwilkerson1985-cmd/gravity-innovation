// Rough shallows (Squall Coast `shallows`, water hotspot): the battle stands on a long sandbar
// in open water — wet sand with a dry crown, ringed by pixel surf — between weed-capped sea
// stacks (weathered, tapering rock-kit clumps), a half-sunken wreck and a striped mooring post.
// Kelp ribbons float and sway, spray bursts off the rocks. Light motif: STORM LIGHT — a dark,
// cool overcast sea with drifting cloud shadows, and one warm sun break falling on the sandbar
// (a world-space gobo pool; the water under it lifts and glitters) with long shadows.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { Heightmap, VoxelBatch, surfaceMaterial, type ArenaRig } from '../arena';
import { rubblePile } from '../kit/rock';
import { paintBoulder } from '../textures';
import type { SpriteLight } from '../sprite';
import type { Grade } from '../pipeline';
import type { ArenaDef } from './index';
import {
  ATLAS, FoliageBatch, RAMPS2, V, atlasRect, TRODDEN_SIZE, troddenMarking, cachedTexture, decal, disposeGroup, floorGrid, foliageAtlas, foliageMaterial,
  grey, hdr, makeGrade, orientedBox, paintDrift, paintSand, particles, pixelWater, rockStack,
} from './localKit';
import { gobo, lightPools, sunRig } from './outdoorKit';

export const ARENA: ArenaDef = {
  id: 'shallows',
  label: 'Rough shallows',
  match: [{ route: 'coast', hotspot: 'shallows' }, { kind: 'water', priority: -1 }],
  build: (o) => buildShallowsArena({ seed: o.seed, quality: o.quality, trainer: o.trainerBattle }),
  grade: shallowsGrade,
  background: '#3e5260',
  fog: '#7a8c98',
  fogRange: [8, 44],
};

export function shallowsGrade(): Grade {
  return makeGrade({
    gain: new THREE.Vector3(1.04, 1.0, 0.94), lift: new THREE.Vector3(0.0, 0.01, 0.024),
    saturation: 0.8, contrast: 1.12,
    shadowTint: new THREE.Color('#183450'), highTint: new THREE.Color('#ffd8a0'), splitAmount: 0.22,
    vignette: 0.38, vignetteSoft: 0.58, exposure: 1.2, shadowDesat: 0.25,
  });
}

export interface ShallowsOptions { seed?: number; quality?: 'high' | 'low'; trainer?: boolean }

const WATER_Y = -0.14;

export function buildShallowsArena(opts: ShallowsOptions = {}): ArenaRig {
  const rng = new Rng(opts.seed ?? 37);
  const q = opts.quality ?? 'high';
  const group = new THREE.Group();
  group.name = 'hd2d-shallows-arena';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const updates: ((t: number) => void)[] = [];
  const pixelers: ((px: number) => void)[] = [];

  const texSand = cachedTexture('wet-sand', () => paintSand(43, 64, RAMPS2.wetSand));
  const texRock = cachedTexture('sea-boulder', () => paintBoulder(29, 32, RAMPS2.seaRock));
  const texDrift = cachedTexture('drift', () => paintDrift(25, 32));

  // ---- the sandbar: an ellipse along the kin diagonal, with a ragged rim
  const ax = new THREE.Vector2(2.8, -2.0).normalize(), ac = new THREE.Vector2(-ax.y, ax.x);
  const centre = new THREE.Vector2(0.1, 0.05);
  const barR = (x: number, z: number) => {
    const d = new THREE.Vector2(x, z).sub(centre);
    const u = d.dot(ax) / 5.4, v = d.dot(ac) / 2.5;
    const wob = Math.sin(x * 1.3 + z * 0.7) * 0.06 + Math.sin(z * 2.1 - x * 1.7) * 0.05;
    return Math.hypot(u, v) - wob;
  };
  const sandY = (x: number, z: number) => {
    const r = barR(x, z);
    return Math.max(-0.75, -Math.max(0, r - 0.72) * 1.3);
  };

  // ---- sea stacks: weathered, tapering rock-kit clumps (wet dark feet, salt-bleached tops)
  const X0 = -13.5, Z0 = -14.4;
  const hm = new Heightmap(30, 23, X0, Z0); // flat: the floor grid's extent (no rock columns)
  const stacks: [number, number, number, number][] = [
    // x, z, foot radius, height above the water
    [-5.6, -5.4, 1.5, 3.2], [-3.4, -7.4, 1.0, 2.0], [-8.6, -2.0, 1.3, 2.6], [-8.8, 2.4, 1.0, 1.3],
    [7.0, -4.0, 1.4, 2.7], [8.6, 0.2, 1.2, 1.9], [5.6, 4.4, 0.8, 0.8], [1.8, -9.5, 1.2, 3.8], [-10.5, -7.5, 1.9, 4.6], [10.8, -8.6, 2.0, 4.8],
  ];
  const onStack = (x: number, z: number) => stacks.some(([sx, sz, r]) => Math.hypot(x - sx, (z - sz) * 1.1) < r * 0.95);
  const rock = new VoxelBatch(32);
  for (const [sx, sz, r, h] of stacks) rockStack(rock, V(sx, WATER_Y - 0.7, sz), r, h + 0.7, rng, { foot: '#8e9a9c', top: '#fffdf4', taper: 0.58 });
  // A few loose boulders at the foot of each stack, half in the water.
  for (const [sx, sz, r] of stacks.slice(0, 8)) rubblePile(rock, [sx, WATER_Y - 0.15, sz + r * 0.6], rng, { radius: r * 0.7, heap: 0.35, big: Math.min(0.6, r * 0.4) });
  group.add(mk(rock.build(), track(surfaceMaterial(texRock, undefined, true))));

  // ---- sand (dry crown → wet rim)
  {
    const g = floorGrid(hm, texSand, 64, {
      res: 2, heightAt: sandY, aoK: 0.3,
      tintAt: (x, z) => { const r = barR(x, z); const dry = 1 - THREE.MathUtils.smoothstep(r, 0.35, 0.8); return [1 + dry * 0.38, 1 + dry * 0.34, 1 + dry * 0.26]; },
    });
    group.add(mk(g, track(surfaceMaterial(texSand)), false, true));
  }

  // ---- the water around everything (reaching far past the near frustum: phones look down
  // past the stage), dark and cool under the overcast, lit under the sun break
  const water = pixelWater({
    rect: { x0: -44, z0: -80, w: 88, d: 124 }, y: WATER_Y, fieldRes: 288, range: 6,
    land: (x, z) => sandY(x, z) > WATER_Y || onStack(x, z),
    ramp: ['#102a3e', '#173c54', '#21526a', '#326a7c', '#4e8890', '#86b4b2'],
    foam: '#eef6f2', wet: '#5e4c3c', swash: 0.4, deep: 4, waveK: 1.9, waveSpeed: 1.9, caps: 0.5, far: -9, chop: 0.6,
    pool: { x: 0.4, z: -0.2, rx: 7.5, rz: 5.0, outside: -0.7, inside: 0.5 },
    glitter: { x: -3.8, slope: -0.75, width: 1.6, strength: 0.7, color: '#ffe0a8' },
    haze: { color: '#8a9aa6', from: -16, to: -44 },
  });
  track(water);
  group.add(water.mesh);
  updates.push(water.update);

  // ---- props: wreck, mooring post, driftwood, pebbles & shells on the bar
  const drift = new VoxelBatch(32);
  const props = new VoxelBatch(32);
  const wetBits = new VoxelBatch(32);
  // Half-sunken hull at the back right: a keel and curved ribs sticking out of the water.
  {
    const c = V(4.6, WATER_Y, -6.2), yaw = -0.6;
    const fwd = V(Math.cos(yaw), 0, -Math.sin(yaw)), side = V(Math.sin(yaw), 0, Math.cos(yaw));
    orientedBox(drift, c.clone().add(V(0, 0.05, 0)), V(0.22, 0.2, 3.6), V(0, 1, 0), grey(0.7), rng, yaw + Math.PI / 2);
    for (let k = -3; k <= 3; k++) {
      const p = c.clone().addScaledVector(fwd, k * 0.5);
      const h = 0.9 + (3 - Math.abs(k)) * 0.18;
      for (const s of [-1, 1]) {
        if (k === 2 && s === 1) continue; // a broken rib
        orientedBox(drift, p.clone().addScaledVector(side, s * 0.45).add(V(0, h * 0.4, 0)), V(0.12, h, 0.12), V(s * 0.45, 1, 0).applyAxisAngle(V(0, 1, 0), yaw), grey(0.8 + rng.next() * 0.2), rng);
      }
    }
    // Hull planking still on the near side: long strakes slanting down into the water.
    for (let k = 0; k < 3; k++) orientedBox(drift, c.clone().addScaledVector(side, 0.55 + k * 0.04).addScaledVector(fwd, -0.3 + k * 0.2).add(V(0, 0.25 + k * 0.28, 0)), V(0.08, 0.26, 2.6 - k * 0.5), V(0.5, 1, 0).applyAxisAngle(V(0, 1, 0), yaw), grey(0.62 + k * 0.08), rng, yaw + Math.PI / 2);
    orientedBox(drift, c.clone().addScaledVector(fwd, 1.8).add(V(0, 0.7, 0)), V(0.16, 1.5, 0.16), V(0.5, 1, 0).applyAxisAngle(V(0, 1, 0), yaw), grey(0.75), rng); // stem post
  }
  // Mooring post with red/white bands and a buoy (a colour accent at the front left).
  {
    const p = V(-4.6, WATER_Y, 2.6);
    for (let k = 0; k < 5; k++) orientedBox(props, p.clone().add(V(0, 0.18 + k * 0.3, 0)), V(0.24, 0.3, 0.24), V(0.05, 1, 0), new THREE.Color(k % 2 ? '#f2efe6' : '#d0402e'), rng, 0.3);
    orientedBox(props, p.clone().add(V(0.55, 0.05, 0.4)), V(0.36, 0.3, 0.36), V(0, 1, 0), new THREE.Color('#ff7a2a'), rng, 0.7);
  }
  // Driftwood on the bar ends.
  for (const [x, z, a, l] of [[-3.7, 2.7, 0.8, 1.5], [3.8, -2.9, -0.2, 1.7], [0.9, 2.0, 2.4, 0.9]] as const) {
    orientedBox(drift, V(x, sandY(x, z) + 0.1, z), V(0.22, l, 0.22), V(Math.cos(a), 0.03, Math.sin(a)), grey(0.95), rng, rng.next());
  }
  // Wet rocks on the bar's ends (off the kin spots) + pebbles and shells.
  const clear = (x: number, z: number) => Math.hypot(x + 1.3, z - 1.0) < 1.3 || Math.hypot(x - 1.5, z + 1.0) < 1.3 || Math.hypot(x + 2.5, z - 1.9) < 0.75 || Math.hypot(x - 2.75, z + 1.95) < 0.75;
  const outcrops: [number, number, number][] = [[-4.4, 0.6, 0.7], [4.5, -1.3, 0.8], [0.0, -2.6, 0.5], [-1.0, 3.4, 0.5]];
  for (const [cx, cz, r] of outcrops) rubblePile(wetBits, [cx, Math.max(WATER_Y, sandY(cx, cz)) - 0.1, cz], rng, { radius: r * 1.1, heap: 0.6, big: Math.min(0.7, r * 0.8) });
  for (let i = 0; i < 30; i++) {
    const d = new THREE.Vector2((rng.next() - 0.5) * 10, (rng.next() - 0.5) * 4);
    const x = centre.x + ax.x * d.x + ac.x * d.y, z = centre.y + ax.y * d.x + ac.y * d.y;
    if (clear(x, z) || barR(x, z) > 0.85) continue;
    orientedBox(props, V(x, sandY(x, z) + 0.03, z), V(0.1, 0.06, 0.09), V(0, 1, 0), new THREE.Color(rng.pick(['#e8e0d0', '#c8b8a8', '#f0c0a8', '#8a8a90'])), rng, rng.next() * 3);
  }

  // ---- kelp (floating ribbons round the rocks and the bar), weed on the stacks
  const leaves = new FoliageBatch();
  const kelp = atlasRect(ATLAS.kelp), grass = atlasRect(ATLAS.grass);
  const kelpAt = (x: number, z: number) => {
    const a = rng.next() * Math.PI * 2, l = 0.7 + rng.next() * 0.7;
    const dir = V(Math.cos(a), 0, Math.sin(a));
    const side = V(-dir.z, 0, dir.x).multiplyScalar(0.34);
    // A flat card on the surface, root at (x, z), slightly raised at the tip.
    leaves.card(V(x, WATER_Y + 0.03, z), side, dir.clone().multiplyScalar(l).add(V(0, 0.05, 0)), kelp, grey(0.9 + rng.next() * 0.3), 0.2, 1, V(0, 1, 0));
  };
  for (const [sx, sz, r] of stacks.slice(0, 7)) for (let k = 0; k < 5; k++) { const a = rng.next() * Math.PI * 2; kelpAt(sx + Math.cos(a) * (r + 0.1 + rng.next() * 0.3), sz + Math.sin(a) * (r + 0.1 + rng.next() * 0.3)); }
  for (let k = 0; k < 10; k++) {
    const d = new THREE.Vector2((rng.next() - 0.5) * 13, (rng.chance(0.5) ? 1 : -1) * (3.0 + rng.next() * 1.4));
    kelpAt(centre.x + ax.x * d.x + ac.x * d.y, centre.y + ax.y * d.x + ac.y * d.y);
  }
  for (const [sx, sz, r, h] of stacks) for (let k = 0; k < 2; k++) {
    leaves.tuft(V(sx + (rng.next() - 0.5) * r * 0.5, WATER_Y + h * 0.9, sz + (rng.next() - 0.5) * r * 0.4), 0.3, 0.25 + rng.next() * 0.2, grass, grey(0.65 + rng.next() * 0.25), rng, 2);
  }
  const fol = foliageMaterial(foliageAtlas(), { strength: 0.1, speed: 1.6 });
  track(fol.material); track(fol.depth);
  const folMesh = mk(leaves.build(), fol.material, false, true);
  group.add(folMesh);
  updates.push(fol.update);

  group.add(mk(drift.build(), track(surfaceMaterial(texDrift, undefined, true))));
  group.add(mk(wetBits.build(), track(surfaceMaterial(texRock, undefined, true))));
  group.add(mk(props.build(), track(surfaceMaterial(null))));

  if (opts.trainer) {
    const m = decal(troddenMarking('#5e4a38', '#e8d8b8', ['#e8e0d0', '#a89a88', '#5e4a38']), 0.1, 0.012, 0.0, TRODDEN_SIZE, TRODDEN_SIZE, { rot: Math.atan2(2.0, 2.8) });
    track(m.material as THREE.Material);
    group.add(m);
  }

  // ---- light: storm light — one warm sun break (≈ 38°, back-left) on the sandbar with long
  // shadows, drifting dark cloud shadows everywhere else, cool weak sky fill.
  const rig = sunRig(group, {
    target: V(0.3, 0, -0.1), from: V(-0.55, 0.62, -0.55), distance: 34, angle: 0.5, penumbra: 0.2, shadowRadius: 2,
    color: '#ffd498', intensity: 13, cookie: null,
    sky: '#8a9cb4', ground: '#2a4048', hemi: 1.25,
    fill: '#9ab0c8', fillIntensity: 0.35, quality: q,
  });
  const key = rig.key;
  const gob = gobo(key, { kind: 'clouds', seed: 9, pool: { x: 0.3, z: -0.1, ru: 4.6, rv: 2.9, angle: Math.atan2(-2.0, 2.8), soft: 0.35 }, outside: 0.3, shade: 0.35, cover: 0.5, scale: 10, drift: [0.3, 0.12], y: 0.1 });
  track(gob);
  updates.push(gob.update);
  group.add(lightPools([[0.3, -0.1, 9.6, 6.2]], '#4a3a20', 1.2));

  // ---- spray off the rocks and the bar ends, a few gulls
  const lowK = q === 'high' ? 1 : 0.5;
  const sprayEmit = [...stacks.slice(0, 7).map(([x, z, r]) => ({ x, z, r: r + 0.2 })), ...outcrops.map(([x, z, r]) => ({ x, z, r }))]
    .map(({ x, z, r }) => ({ min: V(x - r, WATER_Y, z - r * 0.5), max: V(x + r, WATER_Y + 0.2, z + r * 0.5), vmin: V(-0.5, 1.2, -0.2), vmax: V(0.5, 2.4, 0.5), count: Math.round(14 * lowK), life: [0.8, 1.5] as [number, number], size: [0.12, 0.24] as [number, number] }));
  const spray = particles({ kind: 'spray', emitters: sprayEmit, colorA: hdr('#ffffff', 1.12), colorB: hdr('#9cc8d8', 0.95), accel: V(0.3, -2.8, 0), grow: [0.8, 1.7], opacity: 0.95 }, rng);
  const gulls = particles({
    kind: 'gull',
    emitters: [{ min: V(-2, 5.0, -9), max: V(2, 5.8, -7), vmin: V(3, 0.2, 0.3), vmax: V(4, 0.4, 0.5), count: 3, life: [10, 10], size: [0.85, 1.0] }],
    colorA: hdr('#f8f8f4', 1.05), colorB: hdr('#3a3a44', 1),
  }, rng);
  for (const p of [spray, gulls]) { group.add(p.points); track(p); updates.push(p.update); pixelers.push(p.setPixelSize); }

  const spriteLight: SpriteLight = { ...rig.spriteLight, rim: new THREE.Color('#fff0d0').multiplyScalar(0.62) };

  return {
    group,
    spots: [V(-1.3, 0, 1.0), V(1.5, 0, -1.0)],
    people: [V(-2.5, 0, 1.9), V(2.75, 0, -1.95)],
    trainerExit: V(4.0, 0, -2.8),
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
