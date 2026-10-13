// HD-2D terrain registry: which arena a battle gets, from data.
//
// Every arena lives in its own file in this folder and exports `ARENA` (or `ARENAS`) — an
// `ArenaDef` with its builder, grade, sky colours and the `match` rules that claim battles.
// Files are picked up automatically (import.meta.glob below), so adding a terrain never edits
// a central list: drop `arenas/<name>.ts`, export `ARENA`, done (docs/HD2D.md "Adding a terrain").
//
// Selection (`resolveArena(ctx)`): every rule whose fields ALL equal the battle context matches;
// the most specific match wins (trainer > hotspot > route > kind > mode, summed), then the rule's
// `priority`, then file order. A rule with no fields never matches (no accidental catch-alls).
//
// Arena files may only `import type` from this module (it imports them).
import type * as THREE from 'three';
import type { ArenaRig } from '../arena';
import type { Grade, Quality } from '../pipeline';

/** What a battle knows about where it happens. */
export interface ArenaContext {
  routeId: string;
  /** Hotspot id on the route map ('tall-grass', 'hiker-brann', …). */
  hotspotId?: string;
  /** Hotspot kind: 'grass' | 'cave' | 'water' | 'trainer'. */
  hotspotKind?: string;
  /** Trainer id for trainer battles. */
  trainerId?: string;
  /** 'adventure' (default) or e.g. 'pvp' for the Arena mode. */
  mode?: string;
}

/** A rule claiming battles for an arena. All given fields must match. */
export interface ArenaMatch {
  route?: string;
  hotspot?: string;
  kind?: string;
  trainer?: string;
  mode?: string;
  /** Tie-breaker between equally specific rules (higher wins). */
  priority?: number;
}

export interface ArenaBuildOptions {
  quality: Quality;
  seed?: number;
  ctx: ArenaContext;
  /** A trainer battle: mark the battle ground (chalk ring, worn patch…). */
  trainerBattle: boolean;
}

/** Per-layout camera preset (see hd2dBattle.ts `CAMERA`). */
export interface CameraPreset {
  /** Elevation and yaw (rad), vertical FOV (deg). */
  elev: number; yaw: number; fov: number;
  /** How tall a standing person reads (fraction of screen height). */
  person: number;
  /** Where your kin / the foe kin land (screen fractions). */
  mine: readonly [number, number]; foe: readonly [number, number];
}
export type LayoutName = 'wide' | 'portrait' | 'land';

export interface ArenaDef {
  /** Terrain id ('cave', 'meadow', …). Unique. */
  id: string;
  label: string;
  match: ArenaMatch[];
  build(opts: ArenaBuildOptions): ArenaRig;
  /** Post grade (defaults to the warm cave grade). */
  grade?(): Grade;
  /** Clear colour behind everything, and the distance-fog colour (null: no fog). */
  background: THREE.ColorRepresentation;
  fog: THREE.ColorRepresentation | null;
  /** Fog distances beyond the camera-to-stage distance [near, far] (default [6, 30]). */
  fogRange?: [number, number];
  /** Optional camera tweaks per layout (merged over the defaults). */
  camera?: Partial<Record<LayoutName, Partial<CameraPreset>>>;
}

type ArenaModule = { ARENA?: ArenaDef; ARENAS?: ArenaDef[] };

function collect(): ArenaDef[] {
  const mods = import.meta.glob<ArenaModule>(['./*.ts', '!./index.ts'], { eager: true });
  const out: ArenaDef[] = [];
  for (const path of Object.keys(mods).sort()) {
    const m = mods[path]!;
    if (m.ARENA) out.push(m.ARENA);
    if (m.ARENAS) out.push(...m.ARENAS);
  }
  return out;
}

let registry: ArenaDef[] | null = null;
const extra: ArenaDef[] = [];

/**
 * `?leak=1` (captures only): every arena clears to pure magenta, so a world-edge leak (the clear
 * colour showing past the set) is trivially detectable in a screenshot.
 */
function leakCheck(defs: ArenaDef[]): ArenaDef[] {
  if (typeof location === 'undefined' || new URLSearchParams(location.search).get('leak') !== '1') return defs;
  return defs.map((d) => ({ ...d, background: '#ff00ff' }));
}

/** All registered arenas (file order, then `registerArena` calls). */
export function arenas(): readonly ArenaDef[] {
  registry ??= leakCheck(collect());
  return [...registry, ...extra];
}

/** Register an arena at runtime (tests, experiments). Files in this folder register themselves. */
export function registerArena(def: ArenaDef) {
  const i = extra.findIndex((d) => d.id === def.id);
  if (i >= 0) extra.splice(i, 1);
  extra.push(def);
}

export function arenaById(id: string): ArenaDef | undefined {
  return [...arenas()].reverse().find((d) => d.id === id);
}

const WEIGHT = { trainer: 16, hotspot: 8, route: 4, kind: 2, mode: 1 } as const;

/** Specificity of a rule against a context, or -1 when it doesn't match. */
export function matchScore(m: ArenaMatch, ctx: ArenaContext): number {
  const fields: [keyof typeof WEIGHT, string | undefined][] = [
    ['trainer', ctx.trainerId], ['hotspot', ctx.hotspotId], ['route', ctx.routeId], ['kind', ctx.hotspotKind], ['mode', ctx.mode ?? 'adventure'],
  ];
  let score = 0, any = false;
  for (const [k, v] of fields) {
    const want = m[k];
    if (want === undefined) continue;
    if (want !== v) return -1;
    score += WEIGHT[k];
    any = true;
  }
  return any ? score + (m.priority ?? 0) * 0.01 : -1;
}

/** The arena a battle gets (null: no HD-2D arena for this place yet → default renderer). */
export function resolveArena(ctx: ArenaContext, defs: readonly ArenaDef[] = arenas()): ArenaDef | null {
  let best: ArenaDef | null = null, bestScore = -1;
  for (const d of defs) for (const m of d.match) {
    const s = matchScore(m, ctx);
    if (s >= bestScore && s >= 0) { best = d; bestScore = s; }
  }
  return best;
}
