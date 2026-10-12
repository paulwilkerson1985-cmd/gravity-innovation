// Content registry + schema validation. Content is validated once when the dex is built
// (at game load) and again in tests.
import { MOVES, DESPERATION } from '../data/moves';
import { SPECIES } from '../data/species';
import { ROUTES } from '../data/routes';
import { ELEMENTS } from './types';
import type { MoveData, RouteData, SpeciesData } from './types';

export interface Dex {
  species: Map<string, SpeciesData>;
  moves: Map<string, MoveData>;
  routes: Map<string, RouteData>;
}

const HEX = /^#[0-9a-f]{6}$/i;
const STAT_KEYS = ['hp', 'atk', 'def', 'spe'] as const;

export function validateContent(species: SpeciesData[], moves: MoveData[], routes: RouteData[]): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);
  const moveIds = new Set<string>();
  const names = new Set<string>();

  for (const m of moves) {
    if (!/^[a-z0-9-]+$/.test(m.id)) err(`move ${m.id}: bad id`);
    if (moveIds.has(m.id)) err(`move ${m.id}: duplicate id`);
    moveIds.add(m.id);
    if (!m.name) err(`move ${m.id}: missing name`);
    if (m.type !== 'Neutral' && !ELEMENTS.includes(m.type)) err(`move ${m.id}: bad type ${m.type}`);
    if (m.category === 'attack' && !(m.power > 0)) err(`move ${m.id}: attack needs power`);
    if (m.category === 'status' && (m.power !== 0 || !m.effect)) err(`move ${m.id}: status move needs effect, no power`);
    if (!(m.accuracy >= 1 && m.accuracy <= 100)) err(`move ${m.id}: accuracy out of range`);
    if (!(Number.isInteger(m.pp) && m.pp >= 1 && m.pp <= 40)) err(`move ${m.id}: bad pp`);
    if (!Number.isInteger(m.priority) || Math.abs(m.priority) > 3) err(`move ${m.id}: bad priority`);
    const e = m.effect;
    if (e) {
      if ('chance' in e && !(e.chance > 0 && e.chance <= 1)) err(`move ${m.id}: bad effect chance`);
      if (e.kind === 'stage' && (e.delta === 0 || Math.abs(e.delta) > 3)) err(`move ${m.id}: bad stage delta`);
      if ((e.kind === 'heal' || e.kind === 'recoil') && !(e.fraction > 0 && e.fraction <= 1)) err(`move ${m.id}: bad fraction`);
    }
  }

  const speciesIds = new Set(species.map((s) => s.id));
  if (speciesIds.size !== species.length) err('duplicate species id');
  for (const s of species) {
    if (!/^[a-z0-9-]+$/.test(s.id)) err(`species ${s.id}: bad id`);
    if (names.has(s.name.toLowerCase())) err(`species ${s.id}: duplicate name`);
    names.add(s.name.toLowerCase());
    if (s.types.length < 1 || s.types.length > 2) err(`species ${s.id}: needs 1–2 types`);
    if (new Set(s.types).size !== s.types.length) err(`species ${s.id}: repeated type`);
    for (const t of s.types) if (!ELEMENTS.includes(t)) err(`species ${s.id}: bad type ${t}`);
    for (const k of STAT_KEYS) if (!(Number.isInteger(s.base[k]) && s.base[k] >= 1 && s.base[k] <= 160)) err(`species ${s.id}: bad base ${k}`);
    if (!(s.catchRate >= 3 && s.catchRate <= 255)) err(`species ${s.id}: bad catchRate`);
    if (!(s.xpYield > 0)) err(`species ${s.id}: bad xpYield`);
    if (s.evolvesTo) {
      if (!speciesIds.has(s.evolvesTo.species)) err(`species ${s.id}: evolves into unknown ${s.evolvesTo.species}`);
      if (!(s.evolvesTo.level > 1 && s.evolvesTo.level <= 30)) err(`species ${s.id}: bad evolve level`);
    }
    if (s.learnset.length < 2) err(`species ${s.id}: learnset too small`);
    let prev = 0;
    for (const [lvl, mid] of s.learnset) {
      if (lvl < prev) err(`species ${s.id}: learnset not ascending`);
      prev = lvl;
      if (!moveIds.has(mid)) err(`species ${s.id}: unknown move ${mid}`);
    }
    if (s.learnset.filter(([l]) => l <= 1).length < 1) err(`species ${s.id}: needs a level-1 move`);
    const look = s.look;
    if (!look || !(look.scale > 0.3 && look.scale < 2.5)) err(`species ${s.id}: bad look.scale`);
    for (const c of Object.values(look?.colors ?? {})) if (!HEX.test(c)) err(`species ${s.id}: bad colour ${c}`);
  }

  for (const r of routes) {
    if (r.hotspots.length === 0) err(`route ${r.id}: no hotspots`);
    for (const h of r.hotspots) {
      if (h.kind !== 'trainer' && h.table.length === 0) err(`route ${r.id}/${h.id}: empty table`);
      for (const slot of h.table) {
        if (!speciesIds.has(slot.species)) err(`route ${r.id}/${h.id}: unknown species ${slot.species}`);
        if (!(slot.weight > 0)) err(`route ${r.id}/${h.id}: bad weight`);
        if (!(slot.min >= 1 && slot.max >= slot.min && slot.max <= 30)) err(`route ${r.id}/${h.id}: bad level band`);
      }
    }
  }
  return errors;
}

let cached: Dex | null = null;

export function getDex(): Dex {
  if (cached) return cached;
  const errors = validateContent(SPECIES, MOVES, ROUTES);
  if (errors.length) throw new Error(`Invalid game content:\n- ${errors.join('\n- ')}`);
  cached = {
    species: new Map(SPECIES.map((s) => [s.id, s])),
    moves: new Map([...MOVES, DESPERATION].map((m) => [m.id, m])),
    routes: new Map(ROUTES.map((r) => [r.id, r])),
  };
  return cached;
}

export function species(id: string): SpeciesData {
  const s = getDex().species.get(id);
  if (!s) throw new Error(`unknown species ${id}`);
  return s;
}

export function move(id: string): MoveData {
  const m = getDex().moves.get(id);
  if (!m) throw new Error(`unknown move ${id}`);
  return m;
}
