import { getDex } from './dex';
import { Rng } from './rng';

export interface EncounterRoll { species: string; level: number; rng: number }

/** Weighted pick from a hotspot's table. Returns the next rng state for the caller to store. */
export function rollEncounter(routeId: string, hotspotId: string, rngState: number): EncounterRoll {
  const route = getDex().routes.get(routeId);
  const spot = route?.hotspots.find((h) => h.id === hotspotId);
  if (!spot || spot.table.length === 0) throw new Error(`no encounter table for ${routeId}/${hotspotId}`);
  const rng = new Rng(rngState);
  const total = spot.table.reduce((n, s) => n + s.weight, 0);
  let r = rng.next() * total;
  let slot = spot.table[spot.table.length - 1]!;
  for (const s of spot.table) {
    r -= s.weight;
    if (r < 0) { slot = s; break; }
  }
  const level = rng.range(slot.min, slot.max);
  return { species: slot.species, level, rng: rng.state };
}
