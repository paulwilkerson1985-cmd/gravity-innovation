import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getDex } from '../src/engine';
import { buildCreatureGeometry, CreatureView, HIT_CONTACT_HOLD_MS, hitStrobeOn, speciesIdForLook } from '../src/render/creature';
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

  it('HD-2D cel actions (lunge, hit, faint) also survive instantly and settle back to rest', async () => {
    const { animClock } = await import('../src/render/anim');
    animClock.instant = true;
    try {
      for (const id of ['cindertail', 'dropple', 'stormoth', 'maelstrode', 'pyrelord']) {
        const v = new CreatureView(dex.species.get(id)!.look, 1);
        v.cels = true;
        let struck = 0;
        await v.lunge(new THREE.Vector3(2, 0, 2), () => { struck++; });
        expect(struck, id).toBe(1);
        expect(v.inner.position.length(), id).toBeCloseTo(0);
        await v.hit(true);
        await v.hit(false, { calm: true });
        expect(v.blinkOff).toBe(false);
        expect(v.animating).toBe(false);
        await v.faint();
        expect(v.root.visible).toBe(false);
        v.dispose();
      }
    } finally {
      animClock.instant = false;
    }
  });

  it('HD-2D blinks are drawn cels: every blink shows a fully shut eye on exactly one sprite tick', () => {
    // The sprite bakes the rig at whole ticks of uTime (10 fps); sample uBlink there over 60 s.
    for (const [id, fps] of [['cindertail', 10], ['dropple', 8], ['mossling', 10]] as const) {
      const v = new CreatureView(dex.species.get(id)!.look, 3);
      v.blinkFps = fps;
      const shutPerCycle = new Map<number, number>();
      let lastTick = -1;
      const every = (v as unknown as { blinkEvery: number }).blinkEvery;
      for (let f = 0; f < 60 * 60; f++) {
        v.update(f / 60);
        const tt = v.uniforms.uTime.value;
        const tick = Math.floor(tt * fps);
        if (tick === lastTick) continue;
        lastTick = tick;
        const cycle = Math.floor(tick / (every * fps) + 1e-9);
        if (v.uniforms.uBlink.value === 1) shutPerCycle.set(cycle, (shutPerCycle.get(cycle) ?? 0) + 1);
      }
      v.update(0);
      const c0 = Math.floor(v.uniforms.uTime.value / every) + 1;
      v.update(60);
      const c1 = Math.floor(v.uniforms.uTime.value / every) - 1;
      // (a cycle is counted by the tick its blink is baked on, as the sprite does)
      expect(c1 - c0).toBeGreaterThan(8);
      for (let c = c0; c <= c1; c++) expect(shutPerCycle.get(c), `${id} blink ${c}`).toBe(c % 3 === 1 ? 2 : 1);
      v.dispose();
    }
  });

  it('a hit target stays drawn through the contact hold, then strobes', () => {
    for (const dur of [320, 420]) {
      for (let ms = 0; ms < HIT_CONTACT_HOLD_MS; ms += 1000 / 60) expect(hitStrobeOn(ms / dur, dur), `${dur} ms @ ${ms}`).toBe(true);
      let hidden = 0;
      for (let ms = HIT_CONTACT_HOLD_MS; ms < dur; ms += 1000 / 60) if (!hitStrobeOn(ms / dur, dur)) hidden++;
      expect(hidden, `${dur} ms strobes after the hold`).toBeGreaterThan(0);
      for (let ms = 0; ms < dur; ms += 1000 / 60) expect(hitStrobeOn(ms / dur, dur, true)).toBe(true);
    }
  });

  it('unknown looks still build with the generic generator', () => {
    const g = buildCreatureGeometry({ body: 'quad', scale: 1, colors: { main: '#ff0000', belly: '#ffffff', accent: '#00ff00' }, parts: ['tail', 'ears'] });
    expect(g.attributes.position!.count).toBeGreaterThan(100);
  });
});
