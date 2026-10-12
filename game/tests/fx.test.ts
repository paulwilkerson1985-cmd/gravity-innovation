import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GEO, MeshBuilder, disposeTree, flatMaterial } from '../src/render/builder';
import { acquireFx, isPersistent, poolStats, releaseFx } from '../src/render/materials';
import { animClock } from '../src/render/anim';
import { ORB_COLORS, burst, makeOrb, orbGeometry } from '../src/render/fx';
import { moveFx, statusFx } from '../src/render/movefx';
import { orbIconSvg } from '../src/ui/icons';

describe('MeshBuilder', () => {
  it('merges parts into position + colour only (no normals) with per-face colours', () => {
    const b = new MeshBuilder();
    b.add(GEO.box, '#ff0000', { p: [1, 0, 0] });
    b.add(GEO.tet, '#00ff00', { s: 2 });
    const g = b.build();
    expect(Object.keys(g.attributes).sort()).toEqual(['color', 'position']);
    expect(g.attributes.position!.count).toBe(36 + 12);
    const col = g.attributes.color!.array;
    expect(col[0]).toBeCloseTo(1); // red box first
    expect(col[36 * 3 + 1]).toBeCloseTo(1); // then green tet
    g.computeBoundingBox();
    expect(g.boundingBox!.max.x).toBeCloseTo(1.5); // box at x=1 is widest
  });

  it('matches the transformed source geometry', () => {
    const b = new MeshBuilder();
    b.add(GEO.cone4, '#fff', { p: [0, 1, 0], r: [0.3, 0.2, 0.1], s: [1, 2, 1] });
    const ref = GEO.cone4.toNonIndexed();
    ref.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0, 1, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.2, 0.1)), new THREE.Vector3(1, 2, 1)));
    const a = b.build().attributes.position!.array;
    const r = ref.attributes.position!.array;
    expect(a.length).toBe(r.length);
    for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(r[i]!, 5);
  });

  it('does not mutate the shared GEO primitives', () => {
    const before = GEO.box.attributes.position!.array.slice();
    new MeshBuilder().add(GEO.box, '#fff', { s: 3, p: [4, 4, 4] }).build();
    expect(Array.from(GEO.box.attributes.position!.array)).toEqual(Array.from(before));
  });
});

describe('persistent materials', () => {
  it('flatMaterial is shared and survives disposeTree', () => {
    const root = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(), flatMaterial());
    const own = new THREE.MeshBasicMaterial();
    let ownDisposed = false;
    own.addEventListener('dispose', () => { ownDisposed = true; });
    let sharedDisposed = false;
    flatMaterial().addEventListener('dispose', () => { sharedDisposed = true; });
    root.add(m, new THREE.Mesh(new THREE.BoxGeometry(), own));
    disposeTree(root);
    flatMaterial().dispose(); // no-op for persistent materials
    expect(flatMaterial()).toBe(m.material);
    expect(isPersistent(flatMaterial())).toBe(true);
    expect(sharedDisposed).toBe(false);
    expect(ownDisposed).toBe(true);
  });

  it('pools FX materials', () => {
    const a = acquireFx('add');
    a.opacity = 0.2;
    releaseFx(a);
    const b = acquireFx('add');
    expect(b).toBe(a);
    expect(b.opacity).toBe(1);
    expect(b.blending).toBe(THREE.AdditiveBlending);
    releaseFx(b);
  });
});

describe('effects', () => {
  beforeEach(() => { animClock.instant = true; });
  afterEach(() => { animClock.instant = false; });

  const target = () => {
    const scene = new THREE.Scene();
    const kin = new THREE.Group();
    kin.position.set(0, 0, -2);
    kin.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 1).translate(0, 0.7, 0), flatMaterial()));
    scene.add(kin);
    return scene;
  };

  for (const type of ['Flame', 'Tide', 'Flora', 'Spark', 'Terra', 'Gale', 'Neutral'] as const) {
    for (const power of [40, 65, 95]) {
      it(`${type} (${power}) cleans up and returns its materials`, async () => {
        const scene = target();
        const pool0 = poolStats();
        await moveFx(scene, type, new THREE.Vector3(0, 0.8, 2), new THREE.Vector3(0, 0.6, -2), power);
        // let detached tails finish
        for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
        expect(scene.children.length).toBe(1);
        const pool1 = poolStats();
        expect(pool1.normal + pool1.add).toBeGreaterThanOrEqual(pool0.normal + pool0.add);
      });
    }
  }

  it('status cues and bursts clean up', async () => {
    const scene = target();
    for (const s of ['buff', 'debuff', 'burn', 'shock', 'drowsy', 'heal', 'cure'] as const) await statusFx(scene, s, new THREE.Vector3(0, 0, -2));
    await burst(scene, new THREE.Vector3(), '#ff0000', 1, 10);
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    expect(scene.children.length).toBe(1);
  });
});

describe('orbs', () => {
  it('three distinct tiers, taller than wide (a bud, not a ball)', () => {
    const sizes = (['orb', 'bright', 'star'] as const).map((t) => {
      const g = orbGeometry(t);
      g.computeBoundingBox();
      const s = g.boundingBox!.getSize(new THREE.Vector3());
      return { t, s, verts: g.attributes.position!.count };
    });
    expect(new Set(sizes.map((x) => x.verts)).size).toBe(3);
    const plain = sizes.find((x) => x.t === 'orb')!;
    expect(plain.s.y).toBeGreaterThan(plain.s.x);
    for (const x of sizes) expect(x.s.y).toBeLessThan(0.85); // about the old orb's footprint
  });

  it('makeOrb keeps the old call shape and gives each orb its own emissive material', () => {
    const a = makeOrb(ORB_COLORS.orb);
    const b = makeOrb(ORB_COLORS.star);
    expect(a.material).not.toBe(b.material);
    expect((a.material as THREE.MeshLambertMaterial).emissive).toBeDefined();
    expect(a.userData.orbTier).toBe('orb');
    expect(b.userData.orbTier).toBe('star');
    expect(makeOrb('#123456').userData.orbTier).toBe('orb');
  });

  it('orb icons are original buds per tier', () => {
    const svgs = (['orb', 'bright', 'star'] as const).map(orbIconSvg);
    expect(new Set(svgs).size).toBe(3);
    for (const s of svgs) {
      expect(s.startsWith('<svg')).toBe(true);
      expect(s).not.toMatch(/<circle/); // no ball + centre button
    }
  });
});
