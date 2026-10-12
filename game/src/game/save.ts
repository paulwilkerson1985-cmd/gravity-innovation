// Save system: a versioned envelope around PlayerState, a migration registry, strict-but-forgiving
// validation, and pluggable storage backends (IndexedDB → localStorage → memory) so the whole
// thing is unit-testable in node. Nothing here ever throws past `SaveManager`/`parseSave` except
// `SaveError`, whose message is safe to show to the player.
import { PARTY_MAX, PLAYER_STATE_VERSION, TEXT_SPEEDS, allBagIds, type BagId, type PlayerState } from './state';
import { LEVEL_CAP, calcStats, getDex, xpForLevel, type OwnedCreature, type StatusId } from '../engine';

export const SAVE_FORMAT = 'orbkin-save';
export const SAVE_SCHEMA = PLAYER_STATE_VERSION;
export const SAVE_KEY = 'orbkin.save.slot1';
const BOX_MAX = 500;

export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  schema: number;
  savedAt: string;
  data: PlayerState;
}

/** A load/import failure with a player-facing message. */
export class SaveError extends Error {
  constructor(message: string, readonly details: string[] = []) {
    super(message);
    this.name = 'SaveError';
  }
}

// ---------------------------------------------------------------- migrations

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** MIGRATIONS[n] upgrades schema n data to schema n+1. */
export const MIGRATIONS: Record<number, (d: Json) => Json> = {
  1: (d) => {
    // v1: bag held only orbs, routes were unlocked by id, no trainers/champion/playTime/lastRoute/settings.
    const unlocked = Array.isArray(d.unlockedRoutes) ? d.unlockedRoutes.filter((r): r is string => typeof r === 'string') : ['meadow'];
    const dex = getDex();
    // Preserve progress: a route that was unlocked implies its gate trainers were beaten.
    const defeated = new Set<string>();
    for (const id of unlocked) for (const t of dex.routes.get(id)?.unlockAfter ?? []) defeated.add(t);
    const order = [...dex.routes.keys()];
    const furthest = unlocked.filter((r) => dex.routes.has(r)).sort((a, b) => order.indexOf(b) - order.indexOf(a))[0] ?? 'meadow';
    const out: Json = { ...d, v: 2 };
    delete out.unlockedRoutes;
    out.bag = isObj(d.bag) ? { ...d.bag } : {};
    out.defeatedTrainers = [...defeated];
    out.champion = false;
    out.playTime = 0;
    out.lastRoute = furthest;
    out.settings = { textSpeed: 'normal' };
    return out;
  },
};

/** Run every migration from `schema` up to SAVE_SCHEMA. */
export function migrate(data: unknown, schema: number): Json {
  if (!isObj(data)) throw new SaveError('This save file is empty or damaged.');
  if (!Number.isInteger(schema) || schema < 1) throw new SaveError('This save file has an unknown version.');
  if (schema > SAVE_SCHEMA) throw new SaveError('This save was made by a newer version of Orbkin. Please update the game.');
  let d: Json = structuredClone(data);
  for (let v = schema; v < SAVE_SCHEMA; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new SaveError(`Can't upgrade saves from version ${v}.`);
    d = step(d);
  }
  return d;
}

// ---------------------------------------------------------------- validation

const STATUSES: (StatusId | null)[] = [null, 'burn', 'shock', 'drowsy'];
const isInt = (v: unknown, min = -Infinity, max = Infinity): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isNum = (v: unknown, min = -Infinity): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min;

function normalizeCreature(raw: unknown, where: string, errs: string[]): OwnedCreature | null {
  const dex = getDex();
  if (!isObj(raw)) { errs.push(`${where}: not a creature`); return null; }
  const { uid, species, level, xp, hp, moves, status, nickname } = raw;
  if (typeof uid !== 'string' || !uid) errs.push(`${where}: missing uid`);
  if (typeof species !== 'string' || !dex.species.has(species)) { errs.push(`${where}: unknown species ${String(species)}`); return null; }
  if (!isInt(level, 1, LEVEL_CAP)) { errs.push(`${where}: bad level`); return null; }
  if (!isNum(hp, 0)) errs.push(`${where}: bad hp`);
  if (!Array.isArray(moves) || moves.length < 1 || moves.length > 4) { errs.push(`${where}: needs 1–4 moves`); return null; }
  const outMoves: OwnedCreature['moves'] = [];
  for (const m of moves) {
    if (!isObj(m) || typeof m.id !== 'string' || !dex.moves.has(m.id)) { errs.push(`${where}: unknown move`); continue; }
    const max = dex.moves.get(m.id)!.pp;
    outMoves.push({ id: m.id, pp: isInt(m.pp, 0) ? Math.min(max, m.pp) : max });
  }
  if (!STATUSES.includes((status ?? null) as StatusId | null)) errs.push(`${where}: bad status`);
  if (nickname !== undefined && (typeof nickname !== 'string' || nickname.length > 24)) errs.push(`${where}: bad nickname`);
  if (errs.length) return null;
  const maxHp = calcStats(species, level as number).hp;
  const c: OwnedCreature = {
    uid: uid as string,
    species,
    level: level as number,
    // Soft fixes: clamp numbers into range instead of rejecting the whole save.
    xp: Math.max(xpForLevel(level as number), Math.min(xpForLevel(LEVEL_CAP), isNum(xp, 0) ? Math.floor(xp) : 0)),
    hp: Math.min(maxHp, Math.floor(hp as number)),
    moves: outMoves,
    status: (status ?? null) as StatusId | null,
  };
  if (typeof nickname === 'string' && nickname) c.nickname = nickname;
  return c;
}

const strList = (v: unknown, keep: (s: string) => boolean): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string' && keep(s)))] : [];

/**
 * Check a (migrated) save and return a clean PlayerState. Structural problems throw SaveError;
 * harmless oddities (unknown bestiary ids, PP above max, out-of-range text speed) are repaired.
 */
export function validatePlayerState(d: unknown): PlayerState {
  if (!isObj(d)) throw new SaveError('This save file is empty or damaged.');
  const errs: string[] = [];
  const dex = getDex();
  if (d.v !== SAVE_SCHEMA) errs.push(`unexpected state version ${String(d.v)}`);
  if (!isNum(d.seed)) errs.push('missing seed');
  if (!isNum(d.rng)) errs.push('missing rng');
  if (!isInt(d.money, 0)) errs.push('bad money');
  if (!Array.isArray(d.party) || d.party.length < 1 || d.party.length > PARTY_MAX) errs.push(`party must hold 1–${PARTY_MAX} kin`);
  if (!Array.isArray(d.box) || d.box.length > BOX_MAX) errs.push('bad storage box');
  if (!isObj(d.bag)) errs.push('bad bag');
  if (errs.length) throw new SaveError('This save file is damaged and can\'t be loaded.', errs);

  const party = (d.party as unknown[]).map((c, i) => normalizeCreature(c, `party ${i + 1}`, errs));
  const box = (d.box as unknown[]).map((c, i) => normalizeCreature(c, `box ${i + 1}`, errs));
  const bag: PlayerState['bag'] = {};
  const ids = allBagIds();
  for (const [k, v] of Object.entries(d.bag as Json)) {
    if (!ids.includes(k as BagId)) continue; // retired item: drop silently
    if (!isInt(v, 0, 999)) { errs.push(`bag ${k}: bad count`); continue; }
    if (v > 0) bag[k as BagId] = v;
  }
  const all = [...party, ...box].filter((c): c is OwnedCreature => !!c);
  const uids = new Set(all.map((c) => c.uid));
  if (uids.size !== all.length) errs.push('duplicate creature ids');
  if (errs.length) throw new SaveError('This save file is damaged and can\'t be loaded.', errs);

  // Keep uid generation collision-free even if nextUid was edited.
  const maxUid = Math.max(0, ...all.map((c) => Number(/^c(\d+)$/.exec(c.uid)?.[1] ?? 0)));
  const settings = isObj(d.settings) ? d.settings : {};
  const speed = TEXT_SPEEDS.includes(settings.textSpeed as never) ? (settings.textSpeed as PlayerState['settings']['textSpeed']) : 'normal';
  const caught = strList(d.caught, (s) => dex.species.has(s));
  for (const c of all) if (!caught.includes(c.species)) caught.push(c.species);
  const seen = strList(d.seen, (s) => dex.species.has(s));
  for (const s of caught) if (!seen.includes(s)) seen.push(s);
  return {
    v: 2,
    seed: d.seed as number,
    rng: (d.rng as number) >>> 0,
    nextUid: Math.max(isInt(d.nextUid, 1) ? d.nextUid : 1, maxUid + 1),
    name: typeof d.name === 'string' && d.name.length <= 24 ? d.name : 'You',
    party: party as OwnedCreature[],
    box: box as OwnedCreature[],
    bag,
    seen,
    caught,
    money: d.money as number,
    defeatedTrainers: strList(d.defeatedTrainers, (t) => dex.trainers.has(t)),
    champion: d.champion === true,
    playTime: isNum(d.playTime, 0) ? d.playTime : 0,
    lastRoute: typeof d.lastRoute === 'string' && dex.routes.has(d.lastRoute) ? d.lastRoute : 'meadow',
    settings: { ...settings, textSpeed: speed },
  };
}

// ---------------------------------------------------------------- (de)serialisation

export function makeEnvelope(p: PlayerState, now: Date = new Date()): SaveEnvelope {
  return { format: SAVE_FORMAT, schema: SAVE_SCHEMA, savedAt: now.toISOString(), data: structuredClone(p) };
}

export function serializeSave(p: PlayerState, now: Date = new Date()): string {
  return JSON.stringify(makeEnvelope(p, now));
}

export interface ParsedSave { player: PlayerState; savedAt: string | null; migratedFrom: number | null }

/**
 * Parse save text (an envelope, or a bare PlayerState with a `v` field), migrate and validate it.
 * Throws SaveError with a friendly message on anything unusable.
 */
export function parseSave(text: unknown): ParsedSave {
  if (typeof text !== 'string' || !text.trim()) throw new SaveError('This save file is empty.');
  if (text.length > 5_000_000) throw new SaveError('This file is far too big to be an Orbkin save.');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SaveError('This doesn\'t look like an Orbkin save file.'); }
  if (!isObj(raw)) throw new SaveError('This doesn\'t look like an Orbkin save file.');
  let schema: number;
  let data: unknown;
  let savedAt: string | null = null;
  if (raw.format === SAVE_FORMAT) {
    if (!isInt(raw.schema, 0)) throw new SaveError('This save file has an unknown version.');
    schema = raw.schema;
    data = raw.data;
    if (typeof raw.savedAt === 'string' && !Number.isNaN(Date.parse(raw.savedAt))) savedAt = raw.savedAt;
  } else if ('format' in raw) {
    throw new SaveError('This doesn\'t look like an Orbkin save file.');
  } else if (isInt(raw.v, 1) && Array.isArray(raw.party)) {
    schema = raw.v;
    data = raw;
  } else {
    throw new SaveError('This doesn\'t look like an Orbkin save file.');
  }
  const migrated = migrate(data, schema);
  return { player: validatePlayerState(migrated), savedAt, migratedFrom: schema < SAVE_SCHEMA ? schema : null };
}

export interface SaveSummary {
  leadSpecies: string;
  leadName: string;
  leadLevel: number;
  partySize: number;
  playTime: number;
  caught: number;
  seen: number;
  money: number;
  champion: boolean;
  badges: number;
  savedAt: string | null;
}

export function summarize(p: PlayerState, savedAt: string | null = null): SaveSummary {
  const lead = p.party[0]!;
  return {
    leadSpecies: lead.species,
    leadName: lead.nickname ?? getDex().species.get(lead.species)?.name ?? lead.species,
    leadLevel: lead.level,
    partySize: p.party.length,
    playTime: p.playTime,
    caught: p.caught.length,
    seen: p.seen.length,
    money: p.money,
    champion: p.champion,
    badges: p.defeatedTrainers.length,
    savedAt,
  };
}

export function exportFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `orbkin-save-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}

// ---------------------------------------------------------------- storage backends

export interface SaveBackend {
  readonly kind: 'indexeddb' | 'localstorage' | 'memory';
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export function memoryBackend(): SaveBackend {
  const m = new Map<string, string>();
  return {
    kind: 'memory',
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => { m.set(k, v); },
    remove: async (k) => { m.delete(k); },
  };
}

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function localStorageBackend(store?: KV | null): SaveBackend | null {
  let s: KV | null | undefined = store;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage : null; } catch { s = null; }
  }
  if (!s) return null;
  const st = s;
  return {
    kind: 'localstorage',
    get: async (k) => st.getItem(k),
    set: async (k, v) => { st.setItem(k, v); },
    remove: async (k) => { st.removeItem(k); },
  };
}

const IDB_NAME = 'orbkin';
const IDB_STORE = 'saves';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('storage timed out')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e: unknown) => { clearTimeout(t); reject(e instanceof Error ? e : new Error(String(e))); });
  });
}

export function indexedDbBackend(factory?: IDBFactory | null): SaveBackend | null {
  let f: IDBFactory | null | undefined = factory;
  if (f === undefined) {
    try { f = typeof indexedDB !== 'undefined' ? indexedDB : null; } catch { f = null; }
  }
  if (!f) return null;
  const idb = f;
  let dbp: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (!dbp) {
      dbp = withTimeout(new Promise<IDBDatabase>((resolve, reject) => {
        const req = idb.open(IDB_NAME, 1);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE); };
        req.onsuccess = () => {
          const db = req.result;
          // Let other tabs / deleteDatabase proceed; we reopen lazily on next use.
          db.onversionchange = () => { db.close(); dbp = null; };
          resolve(db);
        };
        req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
        req.onblocked = () => reject(new Error('indexedDB blocked'));
      }), 4000);
      dbp.catch(() => { dbp = null; });
    }
    return dbp;
  };
  const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
    withTimeout(open().then((db) => new Promise<T>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, mode);
      const req = fn(tx.objectStore(IDB_STORE));
      let result: T;
      req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('indexedDB transaction aborted'));
    })), 4000);
  return {
    kind: 'indexeddb',
    get: async (k) => {
      const v = await run('readonly', (s) => s.get(k) as IDBRequest<unknown>);
      return typeof v === 'string' ? v : null;
    },
    set: async (k, v) => { await run('readwrite', (s) => s.put(v, k)); },
    remove: async (k) => { await run('readwrite', (s) => s.delete(k)); },
  };
}

export interface StoredSave extends ParsedSave { backend: SaveBackend['kind'] }

/**
 * Reads/writes the save slot through an ordered list of backends. A backend that throws is
 * demoted and the next one is used; memory is always the last resort so saving "works" for the
 * session even in the most locked-down browser.
 */
export class SaveManager {
  private backends: SaveBackend[];
  private active = 0;

  constructor(backends: (SaveBackend | null | undefined)[] = [indexedDbBackend(), localStorageBackend()], readonly key = SAVE_KEY) {
    this.backends = backends.filter((b): b is SaveBackend => !!b);
    if (!this.backends.some((b) => b.kind === 'memory')) this.backends.push(memoryBackend());
  }

  get backendKind(): SaveBackend['kind'] {
    return this.backends[this.active]!.kind;
  }

  /** Write the player; returns the backend used. Never throws. */
  async write(p: PlayerState, now: Date = new Date()): Promise<SaveBackend['kind']> {
    const text = serializeSave(p, now);
    while (this.active < this.backends.length) {
      const b = this.backends[this.active]!;
      try {
        await b.set(this.key, text);
        return b.kind;
      } catch {
        this.active++;
      }
    }
    this.active = this.backends.length - 1;
    return 'memory';
  }

  private async readRaw(): Promise<{ text: string; backend: SaveBackend }[]> {
    const out: { text: string; backend: SaveBackend }[] = [];
    for (const b of this.backends) {
      try {
        const t = await b.get(this.key);
        if (t) out.push({ text: t, backend: b });
      } catch { /* try the next backend */ }
    }
    return out;
  }

  /**
   * Load the newest valid save across all backends (a session that fell back to localStorage may
   * have left a newer copy there). Returns null when there is no save. Throws SaveError only when
   * saves exist but none are usable.
   */
  async read(): Promise<StoredSave | null> {
    const found = await this.readRaw();
    if (found.length === 0) return null;
    let best: StoredSave | null = null;
    let firstError: SaveError | null = null;
    for (const f of found) {
      try {
        const parsed = parseSave(f.text);
        if (!best || (parsed.savedAt ?? '') > (best.savedAt ?? '')) best = { ...parsed, backend: f.backend.kind };
      } catch (e) {
        firstError ??= e instanceof SaveError ? e : new SaveError('Your save could not be read.');
      }
    }
    if (best) return best;
    throw firstError!;
  }

  async exists(): Promise<boolean> {
    return (await this.readRaw()).length > 0;
  }

  async clear(): Promise<void> {
    for (const b of this.backends) {
      try { await b.remove(this.key); } catch { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------- browser file export / import

/** Trigger a download of the save as JSON. Returns the file name. */
export function downloadSave(p: PlayerState, now: Date = new Date()): string {
  const name = exportFileName(now);
  const blob = new Blob([JSON.stringify(makeEnvelope(p, now), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}

/** Open a file picker and resolve with the chosen file's text (null if cancelled). */
export function pickSaveFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    input.dataset.testid = 'save-file-input';
    document.body.appendChild(input);
    const done = () => input.remove();
    input.addEventListener('cancel', () => { done(); resolve(null); });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      done();
      if (!file) { resolve(null); return; }
      if (file.size > 5_000_000) { reject(new SaveError('This file is far too big to be an Orbkin save.')); return; }
      file.text().then(resolve, () => reject(new SaveError('That file could not be read.')));
    });
    input.click();
  });
}
