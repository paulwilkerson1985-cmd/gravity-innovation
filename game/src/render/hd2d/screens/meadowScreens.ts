// HD-2D title and starter sets, both staged inside the Mossy Meadow diorama (arenas/meadow.ts):
//
//  * Title: the flower field at golden hour (low warm sun, light shafts, pollen, petals) — the
//    camera drifts slowly over it (scenes/hd2dScreen.ts `drift`), three hero kin stand in the
//    lit clearing as baked pixel sprites.
//  * Starter: the forest clearing with three lit stone daises; the chosen kin's dais gets a
//    light shaft from the canopy gap and a warm floor pool (instead of the old cone spotlight).
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { TEXEL, VoxelBatch, dustMotes, lightBeams, surfaceMaterial, type BeamSpec } from '../arena';
import { cachedTexture, paintStone } from '../textures';
import type { Quality } from '../pipeline';
import { MEADOW_RAMPS, PETALS, buildMeadowSet, meadowGrade } from '../arenas/meadow';
import { Foliage, SpriteAtlas, lightPools, mkMesh, paintFlower, paintTuft } from '../arenas/outdoorKit';
import { boulder } from '../kit/rock';
import { octSlab, type ScreenSet } from './common';

/** Golden-hour grade for the title: warmer gain, a touch more exposure and a softer vignette. */
function titleGrade() {
  const g = meadowGrade(true);
  g.gain.set(1.13, 1.0, 0.8);
  g.exposure = 1.58;
  g.vignette = 0.4;
  g.splitAmount = 0.26;
  g.highTint = new THREE.Color('#ffc874');
  g.saturation = 0.86;
  g.tiltTop = 1.4; g.focusTop = 0.74;
  return g;
}

/**
 * Foreground flora for the title: tall grass and flower clumps on the near bank (left and
 * right of the buttons), big and close, so the field has a soft, rich foreground.
 */
function titleFlora(quality: Quality): { mesh: THREE.Mesh; update(t: number): void; dispose(): void } {
  const atlas = new SpriteAtlas(256);
  for (let k = 0; k < 3; k++) atlas.add('tall', 20, 26, (p) => paintTuft(p, new Rng(320 + k), MEADOW_RAMPS.grass, 14, 1.3));
  const keys = ['pink', 'yellow', 'white', 'violet', 'orange', 'red'] as const;
  for (const key of keys) atlas.add(`f-${key}`, 22, 18, (p) => {
    const r = new Rng(600 + key.charCodeAt(0) * 3 + key.length);
    paintTuft(p, r, MEADOW_RAMPS.grass, 5, 0.8);
    for (let f = 0; f < 4; f++) paintFlower(p, r, MEADOW_RAMPS.grass, PETALS[key], key === 'yellow' ? '#7a4a12' : '#f6d64a', 3 + r.int(16), 17, 6 + r.int(9), r.chance(0.6) ? 2 : 1);
  });
  const tex = atlas.texture();
  const fol = new Foliage(atlas);
  const rng = new Rng(19);
  const n = quality === 'high' ? 110 : 70;
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (2.4 + rng.next() * 7.0), z = 4.1 + rng.next() * 1.6;
    const flower = rng.chance(0.6);
    fol.add(atlas.get(flower ? `f-${keys[rng.int(keys.length)]}` : 'tall', rng), [x, 0.7, z], 'billboard', { scale: TEXEL * (0.95 + rng.next() * 0.3), sway: 0.08, flip: rng.chance(0.5), tint: new THREE.Color(1, 1, 1).multiplyScalar(0.8 + rng.next() * 0.3) });
  }
  const mesh = fol.build(tex, { upNormal: 0.6 });
  return { mesh, update: (t) => { fol.uTime.value = t; }, dispose: () => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); (mesh.userData.disposeExtra as THREE.Material | undefined)?.dispose(); tex.dispose(); } };
}

/** The title set: the flower field at golden hour (drifting camera, set by the scene). */
export function buildTitleSet(quality: Quality): ScreenSet {
  const rig = buildMeadowSet({ quality, ctx: { routeId: 'meadow', hotspotId: 'flower-patch' }, trainerBattle: false, seed: 41 }, 'flowers');
  const flora = titleFlora(quality);
  rig.group.add(flora.mesh);
  return {
    group: rig.group, spriteLight: rig.spriteLight, grade: titleGrade(),
    background: '#f2c99a', fog: { color: '#e8c8a0', near: 10, far: 40 },
    update: (t) => { rig.update(t); flora.update(t); },
    setPixelSize: (px) => rig.setPixelSize(px),
    dispose: () => { flora.mesh.removeFromParent(); flora.dispose(); rig.dispose(); },
  };
}

/** Where the starter daises stand: a shallow arc (wide screens) or a triangle (narrow). */
export function daisSpot(j: number, narrow: boolean): THREE.Vector3 {
  if (narrow) return new THREE.Vector3((j - 1) * 1.15, 0, j === 1 ? -1.25 : 0.45);
  return new THREE.Vector3((j - 1) * 2.25, 0, j === 1 ? -0.55 : 0.35);
}
/** Height of a dais' top face (kin stand here). */
export const DAIS_TOP = 0.34;

/** A lit stone dais: a cut octagonal slab on a wider foot, a ring of set stones round it. */
function daisGeometry(rng: Rng): THREE.BufferGeometry {
  const b = new VoxelBatch(32);
  const white = new THREE.Color(1, 1, 1);
  octSlab(b, -0.02, 0.13, 0.82, white.clone().multiplyScalar(0.8), 1.1, 0.55);
  octSlab(b, 0.13, DAIS_TOP, 0.64, white.clone().multiplyScalar(0.98), 1.22, 0.7);
  // Set stones round the foot (rock kit boulders: irregular, lit tops).
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rng.next() * 0.3;
    const r = 0.9 + rng.next() * 0.06;
    const sz = 0.13 + rng.next() * 0.07;
    boulder(b, [Math.cos(a) * r, sz * 0.3, Math.sin(a) * r], [sz * 1.6, sz, sz * 1.2], white.clone().multiplyScalar(0.72 + rng.next() * 0.22), rng, { ry: -a, aoBottom: 0.5, flatBottom: true });
  }
  return b.build();
}

export interface StarterSet extends ScreenSet {
  /** One dais mesh per starter (shared geometry), placed by the scene. */
  daises: THREE.Mesh[];
  /** Light the chosen dais (shaft from the canopy gap, motes, warm floor pool); null = none. */
  placeSpot(at: THREE.Vector3 | null, scale?: number): void;
}

/** The starter set: the meadow clearing, three daises and the light for the chosen one. */
export function buildStarterSet(quality: Quality): StarterSet {
  const rig = buildMeadowSet({ quality, ctx: { routeId: 'meadow' }, trainerBattle: false, seed: 23 }, 'clearing');
  const rng = new Rng(77);
  const tex = cachedTexture('scr-dais-stone', () => paintStone(9, 32));
  const mat = surfaceMaterial(tex, undefined, true);
  const geo = daisGeometry(rng);
  const daises = [0, 1, 2].map(() => {
    const m = mkMesh(geo, mat, true, true);
    m.name = 'hd2d-dais';
    rig.group.add(m);
    return m;
  });
  // The chosen one's light: a shaft along the clearing's sun direction (from the canopy gap at
  // the back-left) onto the dais, motes in it and a warm pool round the dais. The shaft and
  // motes are built in world space (their shaders ignore the object transform): rebuilt on
  // every placement (one beam, cheap).
  // Steeper than the sun itself: a spotlight from a canopy gap almost overhead, leaning back-left.
  const sun = new THREE.Vector3(-0.42, 1, -0.32).normalize();
  // Two pools: a wide warm one on the floor round the dais and a brighter one on its top.
  const pool = lightPools([[0, 0, 2.9, 2.4]], '#a07c40', 1.7);
  const topPool = lightPools([[0, 0, 1.3, 1.1]], '#d0a860', 1.8);
  pool.visible = topPool.visible = false;
  rig.group.add(pool, topPool);
  let shaft: ReturnType<typeof lightBeams> | null = null;
  let motes: ReturnType<typeof dustMotes> | null = null;
  let px = 1;
  const clear = () => {
    for (const o of [shaft?.mesh, motes?.points]) if (o) { o.removeFromParent(); o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    shaft = null; motes = null;
  };
  return {
    group: rig.group, spriteLight: rig.spriteLight, grade: meadowGrade(false),
    background: '#9dc8e6', fog: { color: '#a9c8b8', near: 10, far: 40 },
    daises,
    placeSpot(at, scale = 1) {
      clear();
      pool.visible = topPool.visible = !!at;
      if (!at) return;
      pool.position.set(at.x, 0, at.z);
      topPool.position.set(at.x, DAIS_TOP - 0.02, at.z);
      pool.scale.setScalar(scale);
      topPool.scale.setScalar(scale);
      // The shaft lands a little past the dais (on the kin's feet), so its bright end shows.
      const end = new THREE.Vector3(at.x, 0, at.z);
      const beam: BeamSpec = { start: end.clone().addScaledVector(sun, 5.0 / sun.y), end, width: [0.55 * scale, 1.3 * scale], gain: 1.0, fade: 0.15 };
      shaft = lightBeams([beam], '#ffe2a0', 0.95);
      motes = dustMotes([beam], quality === 'high' ? 22 : 12, new Rng(5), '#fff2b8');
      motes.setPixelSize(px);
      rig.group.add(shaft.mesh, motes.points);
    },
    update: (t) => { rig.update(t); shaft?.update(t); motes?.update(t); },
    setPixelSize: (p) => { px = p; rig.setPixelSize(p); motes?.setPixelSize(p); },
    dispose: () => {
      clear();
      geo.dispose(); mat.dispose();
      for (const d of daises) d.removeFromParent();
      rig.dispose(); // disposes the pool with the group
    },
  };
}
