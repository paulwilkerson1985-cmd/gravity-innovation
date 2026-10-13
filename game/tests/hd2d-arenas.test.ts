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
