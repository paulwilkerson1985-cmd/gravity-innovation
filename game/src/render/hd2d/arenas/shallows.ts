// Rough shallows (Squall Coast `shallows`, water hotspot): the battle stands on a long sandbar
// in open water — wet sand with a dry crown, ringed by pixel surf — between weed-capped sea
// stacks (weathered, tapering rock-kit clumps), a half-sunken wreck and a striped mooring post.
// Kelp ribbons float and sway, spray bursts off the rocks. Light motif: STORM LIGHT — a dark,
// cool overcast sea with drifting cloud shadows, and one warm sun break falling on the sandbar
// (a world-space gobo pool; the water under it lifts and glitters) with long shadows.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { Heightmap, VoxelBatch, dustMotes, lightBeams, surfaceMaterial, type ArenaRig, type BeamSpec } from '../arena';
import { rubblePile } from '../kit/rock';
import { RAMPS, paintBoulder, paintSteel } from '../textures';
import type { SpriteLight } from '../sprite';
import type { Grade } from '../pipeline';
import type { ArenaDef } from './index';
import {
  ATLAS, FoliageBatch, RAMPS2, V, atlasRect, TRODDEN_SIZE, troddenMarking, cachedTexture, decal, disposeGroup, floorGrid, foliageAtlas, foliageMaterial,
  grey, hdr, makeGrade, orientedBox, paintDrift, paintSand, particles, pixelWater, rockStack, sunlitRock, tube,
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
/** The low storm-break sun (≈ 25°) from the back-left. */
const SUN_FROM = new THREE.Vector3(-0.62, 0.45, -0.64);

export function buildShallowsArena(opts: ShallowsOptions = {}): ArenaRig {
  const rng = new Rng(opts.seed ?? 37);
  const q = opts.quality ?? 'high';
  const group = new THREE.Group();
  group.name = 'hd2d-shallows-arena';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const updates: ((t: number) => void)[] = [];
  const pixelers: ((px: number) => void)[] = [];

  // Light dry sand on the crown (the brightest stage), darkened into a wet band at the rim.
  const texSand = cachedTexture('sand-bar', () => paintSand(43, 64, RAMPS2.sand));
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
  for (const [sx, sz, r, h] of stacks) rockStack(rock, V(sx, WATER_Y - 0.7, sz), r, h + 0.7, rng, { foot: '#b0b8b8', top: '#fff6e8', taper: 0.58 });
  // A few loose boulders at the foot of each stack, half in the water.
  for (const [sx, sz, r] of stacks.slice(0, 8)) rubblePile(rock, [sx, WATER_Y - 0.15, sz + r * 0.6], rng, { radius: r * 0.7, heap: 0.35, big: Math.min(0.6, r * 0.4) });
  // Warm sunlit tops and a rim from the low sun, a wet dark foot, moss and bird-lime streaks.
  group.add(mk(sunlitRock(rock.build(), { sun: SUN_FROM, waterY: WATER_Y, moss: 0.3, lime: 0.2 }), track(surfaceMaterial(texRock, undefined, true))));

  // ---- sand (dry crown → a clear darker wet band at the rim)
  {
    const g = floorGrid(hm, texSand, 64, {
      res: 2, heightAt: sandY, aoK: 0.3,
      tintAt: (x, z) => {
        const r = barR(x, z);
        const wet = THREE.MathUtils.smoothstep(r, 0.72, 0.8);
        const k = 1.06 - wet * 0.42 - THREE.MathUtils.smoothstep(r, 0.3, 0.72) * 0.08;
        return [k, k * 0.98, k * (0.95 + wet * 0.08)];
      },
    });
    group.add(mk(g, track(surfaceMaterial(texSand)), false, true));
  }

  // ---- the water around everything (reaching far past the near frustum: phones look down
  // past the stage), dark and cool under the overcast, lit under the sun break
  const water = pixelWater({
    rect: { x0: -44, z0: -80, w: 88, d: 124 }, y: WATER_Y, fieldRes: 288, range: 6,
    land: (x, z) => sandY(x, z) > WATER_Y || onStack(x, z),
    // Storm-dark open water, TURQUOISE over the sand round the bar (lifted under the sun break).
    ramp: ['#0e2a3e', '#143e56', '#1a5c70', '#1f8090', '#3caaa6', '#8ad6c4'],
    foam: '#f2f8f2', wet: '#5e4c3c', swash: 0.4, deep: 4, waveK: 1.9, waveSpeed: 1.9, caps: 0.3, far: -9, chop: 0.45, glints: false,
    pool: { x: 0.4, z: -0.2, rx: 7.0, rz: 4.6, outside: -0.9, inside: 0.55 },
    glitter: { x: -3.8, slope: -0.75, width: 1.6, strength: 0.7, color: '#ffe0a8' },
    haze: { color: '#8a9aa6', from: -16, to: -44 },
  });
  track(water);
  group.add(water.mesh);
  updates.push(water.update);

  // ---- props: wreck, mooring post, driftwood, pebbles & shells on the bar
  const drift = new VoxelBatch(32);
  const props = new VoxelBatch(32);
  const paint = props; // painted props (buoy) share the neutral paint batch
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
  // A weathered mooring float tied to a driftwood stake at the front left (the colour accent):
  // a round, faded-red buoy with a white band, half afloat, a rope down to the stake.
  {
    const p = V(-4.4, WATER_Y, 2.7);
    tube(drift, p.clone().add(V(0, -0.3, 0)), p.clone().add(V(0.12, 1.25, 0.05)), (t) => 0.13 - t * 0.04, { sides: 7, rings: 3, wobble: 0.08, seed: 3, tint: (t) => grey(0.82 + t * 0.2) });
    const bp = p.clone().add(V(0.62, -0.06, 0.38));
    tube(paint, bp.clone().add(V(0, -0.2, 0)), bp.clone().add(V(0, 0.42, 0)), (t) => Math.sin(Math.PI * (0.08 + t * 0.84)) * 0.27, {
      sides: 10, rings: 6, tint: (t) => new THREE.Color(t > 0.42 && t < 0.62 ? '#ece6da' : '#c44a34'),
    });
    tube(paint, bp.clone().add(V(0, 0.4, 0)), bp.clone().add(V(0, 0.56, 0)), () => 0.05, { sides: 6, rings: 1, tint: () => new THREE.Color('#3a3634') });
    orientedBox(drift, p.clone().add(V(0.33, 0.12, 0.2)), V(0.035, 0.75, 0.035), V(0.82, 0.12, 0.5), grey(0.7), rng); // rope
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
    leaves.card(V(x, WATER_Y + 0.03, z), side, dir.clone().multiplyScalar(l).add(V(0, 0.05, 0)), kelp, new THREE.Color(0.42, 0.5, 0.36).multiplyScalar(0.8 + rng.next() * 0.3), 0.2, 1, V(0, 1, 0));
  };
  for (const [sx, sz, r] of stacks.slice(0, 7)) for (let k = 0; k < 3; k++) { const a = rng.next() * Math.PI * 2; kelpAt(sx + Math.cos(a) * (r + 0.1 + rng.next() * 0.3), sz + Math.sin(a) * (r + 0.1 + rng.next() * 0.3)); }
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
  group.add(mk(props.build(), track(surfaceMaterial(cachedTexture('paint-weathered', () => paintSteel(47, 16, RAMPS.paint)), undefined, true))));

  if (opts.trainer) {
    const m = decal(troddenMarking('#5e4a38', '#e8d8b8', ['#e8e0d0', '#a89a88', '#5e4a38']), 0.1, 0.012, 0.0, TRODDEN_SIZE, TRODDEN_SIZE, { rot: Math.atan2(2.0, 2.8) });
    track(m.material as THREE.Material);
    group.add(m);
  }

  // ---- light: storm light — ONE low warm sun (≈ 25°, back-left) breaking through: a broken-
  // cloud gobo (dark drifting cloud shade everywhere, a clear sun pool on the sandbar), one long
  // shaft falling onto the bar, cool weak sky fill. The sunlit island is the brightest stage.
  const rig = sunRig(group, {
    target: V(0.3, 0, -0.1), from: SUN_FROM, distance: 34, angle: 0.5, penumbra: 0.2, shadowRadius: 2,
    color: '#ffd29a', intensity: 13.5, cookie: null,
    sky: '#8a9cbc', ground: '#2e4650', hemi: 1.3,
    fill: '#8aa4c0', fillIntensity: 0.3, quality: q,
  });
  const key = rig.key;
  const gob = gobo(key, { kind: 'clouds', seed: 9, pool: { x: 0.3, z: -0.1, ru: 4.9, rv: 2.9, angle: Math.atan2(-2.0, 2.8), soft: 0.3 }, outside: 0.48, shade: 0.4, cover: 0.5, scale: 9, drift: [0.3, 0.12], y: 0.1 });
  track(gob);
  updates.push(gob.update);
  group.add(lightPools([[0.3, -0.1, 9.8, 6.0]], '#5a4426', 1.5));
  // One shaft from the cloud break onto the sandbar, with a few motes.
  const dir = SUN_FROM.clone().normalize().negate();
  const beams: BeamSpec[] = [{ start: V(0.6, 0, 0.1).addScaledVector(dir, -11 / -dir.y), end: V(0.6, 0, 0.1), width: [0.9, 3.2] }];
  const rays = lightBeams(beams, '#ffe2b0', 0.2);
  track(rays.mesh.geometry); track(rays.mesh.material as THREE.Material);
  group.add(rays.mesh);
  updates.push(rays.update);
  const motes = dustMotes(beams, q === 'high' ? 18 : 10, rng, '#fff2cc');
  track(motes.points.geometry); track(motes.points.material as THREE.Material);
  group.add(motes.points);
  updates.push(motes.update);
  pixelers.push(motes.setPixelSize);

  // ---- spray off the rocks and the bar ends, a few gulls
  const lowK = q === 'high' ? 1 : 0.5;
  // Spray only where waves break on the stack bases: short, low bursts that fall straight back
  // (no specks drifting over the frame).
  const sprayEmit = stacks.slice(0, 7).map(([x, z, r]) => ({ x, z: z + r * 0.75, r: r * 0.8 }))
    .map(({ x, z, r }) => ({ min: V(x - r, WATER_Y, z - 0.1), max: V(x + r, WATER_Y + 0.12, z + 0.2), vmin: V(-0.3, 0.9, -0.1), vmax: V(0.3, 1.5, 0.3), count: Math.round(7 * lowK), life: [0.45, 0.8] as [number, number], size: [0.16, 0.26] as [number, number] }));
  const spray = particles({ kind: 'spray', emitters: sprayEmit, colorA: hdr('#ffffff', 1.12), colorB: hdr('#9cc8d8', 0.95), accel: V(0.3, -5.5, 0), grow: [0.9, 1.5], opacity: 0.95 }, rng);
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
