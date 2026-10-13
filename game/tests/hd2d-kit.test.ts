import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '../src/engine/rng';
import { Heightmap, VoxelBatch } from '../src/render/hd2d/arena';
import { boulder, boulderColumns, organicTerraces, pebbles, rubblePile } from '../src/render/hd2d/kit/rock';

const tris = (b: VoxelBatch) => b.count / 3;

function checkGeometry(g: THREE.BufferGeometry) {
  const pos = g.attributes.position!, nor = g.attributes.normal!;
  for (let i = 0; i < pos.count; i++) {
    expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
    expect(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i))).toBeCloseTo(1, 3);
  }
  expect(g.attributes.aFace!.itemSize).toBe(4);
}

describe('hd2d kit: rock', () => {
  it('a boulder is a closed rounded block with outward normals', () => {
    const b = new VoxelBatch(32);
    boulder(b, [0, 0.5, 0], [1, 1, 1], new THREE.Color(1, 1, 1), new Rng(1), { skip: [false, false, false, false, false, false], jitter: 0, topJitter: 0 });
    // Octagonal rings (8 quads per band): foot bevel + bottom cap, two side bands around the bulge,
    // two top-edge bevel bands, top cap.
    expect(tris(b)).toBe(16 + 6 + 2 * 16 + 2 * 16 + 6);
    const g = b.build();
    checkGeometry(g);
    const pos = g.attributes.position!, nor = g.attributes.normal!;
    for (let i = 0; i < pos.count; i += 3) {
      const c = new THREE.Vector3();
      for (let k = 0; k < 3; k++) c.add(new THREE.Vector3(pos.getX(i + k), pos.getY(i + k) - 0.5, pos.getZ(i + k)));
      expect(c.dot(new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i)))).toBeGreaterThan(0);
    }
  });

  it('skips hidden faces and flat bottoms', () => {
    const full = new VoxelBatch(32), flat = new VoxelBatch(32);
    boulder(full, [0, 0, 0], [1, 1, 1], new THREE.Color(1, 1, 1), new Rng(2));
    boulder(flat, [0, 0, 0], [1, 1, 1], new THREE.Color(1, 1, 1), new Rng(2), { flatBottom: true });
    expect(tris(flat)).toBeLessThan(tris(full));
    expect(tris(full)).toBeLessThan(92);
  });

  it('a top-only (pillow) boulder is 26 closed-looking triangles', () => {
    const b = new VoxelBatch(32);
    boulder(b, [0, 0.5, 0], [1, 1, 1], new THREE.Color(1, 1, 1), new Rng(1), { topOnly: true, skip: [false, false, false, true, false, false] });
    expect(tris(b)).toBe(3 * 4 * 2 + 2); // side, steep and shallow top bevel bands + top cap
    checkGeometry(b.build());
  });

  it('walls emit nothing for fully buried blocks and are deterministic', () => {
    const make = () => {
      const hm = new Heightmap(8, 8, -3.6, -3.6);
      organicTerraces(hm, (x, z) => Math.max(Math.abs(x), Math.abs(z)) - 1.5, new Rng(4), { max: 5 });
      const b = new VoxelBatch(32);
      boulderColumns(hm, b, new Rng(5));
      return { hm, b };
    };
    const a = make(), c = make();
    expect(a.b.count).toBe(c.b.count);
    expect(a.hm.get(4, 4)).toBe(0);
    expect(Math.max(...a.hm.h)).toBeGreaterThan(1);
    // Far fewer triangles than one full boulder per block.
    let blocks = 0;
    for (const v of a.hm.h) blocks += Math.ceil(v);
    expect(tris(a.b)).toBeLessThan(blocks * 44);
    checkGeometry(a.b.build());
  });

  it('rubble and pebbles keep out of the kin spots', () => {
    const b = new VoxelBatch(32);
    rubblePile(b, [3, 0, 0], new Rng(6), { radius: 1 });
    pebbles(b, [-2, -2, 2, 2], 60, new Rng(7), [{ x: 0, z: 0, r: 1 }]);
    const g = b.build();
    checkGeometry(g);
    const pos = g.attributes.position!;
    for (let i = 0; i < pos.count; i++) expect(Math.hypot(pos.getX(i), pos.getZ(i))).toBeGreaterThan(0.8);
  });
});

describe('hd2d kit: sprites', () => {
  it('extracts a small palette that keeps rare distinct colours (eyes) and merges jitter', async () => {
    const { extractPalette, SPRITE_PALETTE_MAX } = await import('../src/render/hd2d/sprite');
    const cols: number[] = [];
    const push = (hex: string, n: number, jit: number) => {
      const c = new THREE.Color(hex);
      for (let i = 0; i < n; i++) { const k = 1 + ((i % 7) - 3) * jit; cols.push(c.r * k, c.g * k, c.b * k); }
    };
    push('#ff7a2e', 600, 0.015); // body, ±4.5% per-face jitter
    push('#f4e6c8', 200, 0.015); // belly
    push('#1d1838', 6, 0);       // eyes: rare but distinct
    const g = new THREE.BufferGeometry();
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const pal = extractPalette(g);
    expect(pal.length).toBeGreaterThanOrEqual(3);
    expect(pal.length).toBeLessThanOrEqual(SPRITE_PALETTE_MAX);
    const eye = new THREE.Color('#1d1838');
    expect(Math.min(...pal.map((c) => Math.hypot(c.r - eye.r, c.g - eye.g, c.b - eye.b)))).toBeLessThan(0.02);
  });

  it('people are ~4.5+ heads tall with the head on top', async () => {
    const { buildFigureGeometry, HERO_LOOK } = await import('../src/render/hd2d/characters');
    const g = buildFigureGeometry({ ...HERO_LOOK, hat: 'band' });
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(bb.max.y).toBeGreaterThan(1.0);
    expect(bb.max.y).toBeLessThan(1.2);
  });
});

describe('hd2d kit: props', () => {
  it('prop builders append finite geometry into the given batches', async () => {
    const { bookcase, crate, barrel, table, banner, brazier, fence, lanternPost } = await import('../src/render/hd2d/kit/props');
    const b = { wood: new VoxelBatch(32), paint: new VoxelBatch(16), glow: new VoxelBatch(16), stone: new VoxelBatch(32) };
    const rng = new Rng(3);
    bookcase(b, [0, 0, 0], rng);
    crate(b, [2, 0, 0], 0.5, rng, { ry: 0.3 });
    barrel(b, [3, 0, 0], 0.25, 0.6, rng);
    table(b, [4, 0, 0], [1.2, 0.7, 0.6], rng);
    banner(b, [5, 2, 0], rng);
    const light = brazier(b, [6, 0, 0], rng);
    fence(b, [[0, 0, 3], [3, 0, 3], [3, 0, 5]], rng);
    lanternPost(b, [7, 0, 0], rng);
    expect(light.y).toBeGreaterThan(0.7);
    for (const k of ['wood', 'paint', 'glow', 'stone'] as const) {
      expect(b[k].count).toBeGreaterThan(0);
      checkGeometry(b[k].build());
    }
  });
});

describe('hd2d kit: outdoor', () => {
  it('light presets build a shadow key, a sprite light and a grade', async () => {
    const { lightRig, presetGrade, LIGHT_PRESETS } = await import('../src/render/hd2d/kit/lights');
    for (const p of Object.keys(LIGHT_PRESETS) as (keyof typeof LIGHT_PRESETS)[]) {
      const g = new THREE.Group();
      const rig = lightRig(g, p, { quality: 'low' });
      expect(rig.key.castShadow).toBe(true);
      expect(rig.spriteLight.keyDir.y).toBeGreaterThan(0);
      expect(presetGrade(p).exposure).toBeGreaterThan(0.5);
      rig.dispose();
    }
  });

  it('particle presets make one Points each', async () => {
    const { particleSystem, PARTICLE_PRESETS } = await import('../src/render/hd2d/kit/particles');
    for (const p of Object.keys(PARTICLE_PRESETS) as (keyof typeof PARTICLE_PRESETS)[]) {
      const s = particleSystem(p, { min: [-1, 0, -1], max: [1, 1, 1], count: 20 }, new Rng(1));
      expect(s.points.geometry.getAttribute('position').count).toBe(20);
      s.update(3); s.setPixelSize(2); s.dispose();
    }
  });

  it('shore distance is 0 on land and grows over water', async () => {
    const { shoreDistance } = await import('../src/render/hd2d/kit/water');
    const tex = shoreDistance({ x0: 0, z0: 0, w: 4, d: 1 }, (x) => x < 1, 4, 2);
    const d = tex.image.data as Uint8Array;
    expect(d[0]).toBe(0);
    expect(d[15]!).toBeGreaterThan(d[5]!);
    expect(d[5]!).toBeGreaterThan(0);
  });

  it('foliage batches quads and keeps out of the kin spots', async () => {
    const { FoliageBatch } = await import('../src/render/hd2d/kit/foliage');
    const f = new FoliageBatch();
    f.add('bush', [0, 0, 0]);
    f.scatter(['tuft', 'flowerRed'], [-2, -2, 2, 2], 100, new Rng(2), { keepOut: [{ x: 0, z: 0, r: 1 }] });
    expect(f.count).toBeGreaterThan(30);
    expect(f.count).toBeLessThan(101);
  });
});
