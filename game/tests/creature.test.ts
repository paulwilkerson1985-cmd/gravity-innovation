import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getDex } from '../src/engine';
import { buildCreatureGeometry, CreatureView, speciesIdForLook } from '../src/render/creature';
import { DESIGNS, LINES } from '../src/render/creatures/designs';

const dex = getDex();
const all = [...dex.species.values()];
const stage = (id: string) => {
  // 1 = no pre-evolution, 2 = evolves from a stage-1, 3 = two steps in.
  let s = 1;
  let cur = id;
  for (;;) {
    const prev = all.find((x) => x.evolvesTo?.species === cur);
    if (!prev) return s;
    s++;
    cur = prev.id;
  }
};

describe('creature models', () => {
  it('every species has a bespoke design and appears in a lineup', () => {
    for (const s of all) {
      expect(DESIGNS[s.id], s.id).toBeDefined();
      expect(LINES.flat(), s.id).toContain(s.id);
    }
  });

  it('views resolve their species from the look object', () => {
    for (const s of all) expect(speciesIdForLook(s.look)).toBe(s.id);
  });

  for (const s of all) {
    it(`${s.id}: sane geometry, on the ground, within budget`, () => {
      // Build time: best of 3 (the first build also warms the shared primitive cache; GC noise is ignored).
      let ms = Infinity;
      for (let r = 0; r < 2; r++) {
        const t0 = performance.now();
        buildCreatureGeometry(s.look, s.id).dispose();
        ms = Math.min(ms, performance.now() - t0);
      }
      const t0 = performance.now();
      const g = buildCreatureGeometry(s.look, s.id);
      ms = Math.min(ms, performance.now() - t0);
      const pos = g.attributes.position!;
      const tris = pos.count / 3;
      for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i]!)).toBe(true);
      for (const name of ['color', 'rigA', 'rigB']) expect(g.attributes[name]?.count, name).toBe(pos.count);
      const bb = g.boundingBox!;
      expect(bb.min.y).toBeGreaterThanOrEqual(-0.01);
      expect(bb.min.y).toBeLessThan(0.01);
      const size = bb.getSize(new THREE.Vector3());
      expect(size.y).toBeGreaterThan(0.45);
      expect(size.y).toBeLessThan(2.6);
      expect(size.x).toBeLessThan(2.6);
      expect(size.z).toBeLessThan(2.8);
      // Roughly centred over its shadow.
      expect(Math.abs((bb.max.x + bb.min.x) / 2)).toBeLessThan(0.15);
      expect(tris).toBeLessThanOrEqual(stage(s.id) === 1 && s.evolvesTo ? 1800 : 2500);
      // Target < 15 ms in the browser; typical is 1–7 ms. Generous bound for slow CI machines.
      expect(ms).toBeLessThan(80);
      const col = g.attributes.color!.array;
      for (let i = 0; i < col.length; i++) expect(col[i]! >= 0 && col[i]! < 1.6).toBe(true);
      g.dispose();
    });
  }

  it('stages escalate in overall size (bounding diagonal)', () => {
    for (const line of LINES.slice(0, 6)) {
      const heights = line.map((id) => {
        const v = new CreatureView(dex.species.get(id)!.look, 0);
        const size = v.mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
        const h = size.length() * v.baseScale;
        v.dispose();
        return h;
      });
      for (let i = 1; i < heights.length; i++) expect(heights[i]!, line.join('>')).toBeGreaterThan(heights[i - 1]! * 1.15);
    }
  });

  it('CreatureView keeps one mesh plus a shadow and survives every action instantly', async () => {
    const { animClock } = await import('../src/render/anim');
    animClock.instant = true;
    try {
      for (const s of all) {
        const v = new CreatureView(s.look, 1);
        let meshes = 0;
        v.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
        expect(meshes).toBe(2);
        v.update(1.234);
        await v.appear();
        await v.lunge(new THREE.Vector3(2, 0, 2));
        await v.hit(false);
        await v.hit(true);
        await v.pulse('#ff0000');
        await v.faint();
        expect(v.root.visible).toBe(false);
        v.reset();
        expect(v.root.visible).toBe(true);
        expect(v.inner.scale.x).toBeCloseTo(v.baseScale);
        expect(v.body.scale.y).toBeCloseTo(1);
        v.dispose();
      }
    } finally {
      animClock.instant = false;
    }
  });

  it('unknown looks still build with the generic generator', () => {
    const g = buildCreatureGeometry({ body: 'quad', scale: 1, colors: { main: '#ff0000', belly: '#ffffff', accent: '#00ff00' }, parts: ['tail', 'ears'] });
    expect(g.attributes.position!.count).toBeGreaterThan(100);
  });
});
