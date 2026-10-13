import { describe, expect, it } from 'vitest';
import { arenas, matchScore, resolveArena, type ArenaDef } from '../src/render/hd2d/arenas';
import { ROUTES } from '../src/data/routes';

const fake = (id: string, match: ArenaDef['match']): ArenaDef => ({ id, label: id, match, build: () => { throw new Error('not built'); }, background: '#000', fog: null });

describe('hd2d arena registry', () => {
  it('needs every given field to match and prefers the most specific rule', () => {
    const defs = [fake('cave', [{ kind: 'cave' }, { route: 'ridge' }]), fake('scrub', [{ route: 'ridge', hotspot: 'scrub' }]), fake('duel', [{ trainer: 'hiker-brann' }])];
    expect(resolveArena({ routeId: 'ridge', hotspotId: 'scrub', hotspotKind: 'grass' }, defs)?.id).toBe('scrub');
    expect(resolveArena({ routeId: 'ridge', hotspotId: 'vent-cave', hotspotKind: 'cave' }, defs)?.id).toBe('cave');
    expect(resolveArena({ routeId: 'ridge', hotspotId: 'hiker-brann', hotspotKind: 'trainer', trainerId: 'hiker-brann' }, defs)?.id).toBe('duel');
    expect(resolveArena({ routeId: 'meadow', hotspotId: 'hollow', hotspotKind: 'cave' }, defs)?.id).toBe('cave');
    expect(resolveArena({ routeId: 'coast', hotspotId: 'dune-grass', hotspotKind: 'grass' }, defs)).toBeNull();
    expect(matchScore({}, { routeId: 'x' })).toBe(-1);
    expect(matchScore({ mode: 'pvp' }, { routeId: 'x' })).toBe(-1);
    expect(matchScore({ mode: 'pvp' }, { routeId: 'x', mode: 'pvp' })).toBeGreaterThan(0);
  });

  it('priority breaks ties between equally specific rules', () => {
    const defs = [fake('a', [{ route: 'r', priority: 1 }]), fake('b', [{ route: 'r' }])];
    expect(resolveArena({ routeId: 'r' }, defs)?.id).toBe('a');
  });

  it('registered arenas have unique ids and only claim real routes / hotspots / trainers', () => {
    const all = arenas();
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all.map((d) => d.id)).size).toBe(all.length);
    const routes = new Set(ROUTES.map((r) => r.id));
    const spots = new Set(ROUTES.flatMap((r) => r.hotspots.map((h) => h.id)));
    const trainers = new Set(ROUTES.flatMap((r) => r.hotspots.flatMap((h) => (h.trainer ? [h.trainer] : []))));
    for (const d of all) for (const m of d.match) {
      if (m.route) expect(routes, `${d.id}: route ${m.route}`).toContain(m.route);
      if (m.hotspot) expect(spots, `${d.id}: hotspot ${m.hotspot}`).toContain(m.hotspot);
      if (m.trainer) expect(trainers, `${d.id}: trainer ${m.trainer}`).toContain(m.trainer);
    }
  });
});

describe('hd2d outdoor kit: world-space gobo', () => {
  it('cookieGround maps the cookie of a straight-down spot onto the ground under it', async () => {
    const THREE = await import('three');
    const { cookieGround } = await import('../src/render/hd2d/arenas/outdoorKit');
    const key = new THREE.SpotLight(0xffffff, 1, 0, 0.4);
    key.position.set(0, 20, 0.001);
    key.target.position.set(0, 0, 0);
    const S = 16;
    const g = cookieGround(key, S);
    const half = 20 * Math.tan(0.4);
    // Centre texels land near the target, corner texels near ±tan(angle)·height.
    const c = (S / 2) * S + S / 2;
    expect(Math.hypot(g[c * 2]!, g[c * 2 + 1]!)).toBeLessThan(half * 0.2);
    const xs = Array.from({ length: S * S }, (_, k) => g[k * 2]!);
    expect(Math.max(...xs)).toBeGreaterThan(half * 0.85);
    expect(Math.min(...xs)).toBeLessThan(-half * 0.85);
  });

  it('gobo lights the battle pool fully and keeps the set around it darker', async () => {
    const THREE = await import('three');
    const { gobo } = await import('../src/render/hd2d/arenas/outdoorKit');
    const key = new THREE.SpotLight(0xffffff, 1, 0, 0.45);
    key.position.set(-14, 18, -10);
    key.target.position.set(0, 0, 0);
    const gob = gobo(key, { kind: 'clouds', seed: 3, pool: { x: 0, z: 0, ru: 4, rv: 3, soft: 0.2 }, outside: 0.4, cover: 0, size: 32 });
    const d = gob.texture.image.data as Uint8Array;
    // Centre of the cookie (the target) is in the pool: full light; a corner is outside: dim.
    const at = (px: number, py: number) => d[(py * 32 + px) * 4]!;
    expect(at(16, 16)).toBeGreaterThan(240);
    expect(at(1, 1)).toBeLessThan(0.5 * 255);
    expect(key.map).toBe(gob.texture);
    gob.dispose();
  });
});
