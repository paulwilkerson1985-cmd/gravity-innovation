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
  it('a boulder is a closed chamfered box with outward normals', () => {
    const b = new VoxelBatch(32);
    boulder(b, [0, 0.5, 0], [1, 1, 1], new THREE.Color(1, 1, 1), new Rng(1), { skip: [false, false, false, false, false, false], jitter: 0, topJitter: 0 });
    expect(tris(b)).toBe(6 * 2 + 12 * 2 + 8); // faces + edge bevels + corners
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
    expect(tris(full)).toBeLessThan(44);
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
