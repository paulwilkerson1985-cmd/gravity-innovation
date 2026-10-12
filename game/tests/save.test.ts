import { describe, expect, it } from 'vitest';
import {
  SAVE_FORMAT, SAVE_KEY, SAVE_SCHEMA, SaveError, SaveManager, exportFileName, localStorageBackend, memoryBackend, migrate,
  parseSave, serializeSave, summarize, validatePlayerState, type SaveBackend,
} from '../src/game/save';
import { chooseStarter, newPlayer, type PlayerState } from '../src/game/state';
import { makeCreature } from '../src/engine';

const fresh = (): PlayerState => {
  const p = chooseStarter(newPlayer(42), 'ashkit');
  p.playTime = 321;
  p.money = 1234;
  p.box.push(makeCreature('pebblet', 7, 'c9'));
  p.seen.push('pebblet');
  p.caught.push('pebblet');
  p.nextUid = 10;
  return p;
};

function failing(kind: SaveBackend['kind']): SaveBackend {
  const boom = async () => { throw new Error('quota'); };
  return { kind, get: boom, set: boom, remove: boom };
}

class FakeStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const V1 = {
  v: 1, seed: 7, rng: 12345, nextUid: 3, name: 'You',
  party: [{ uid: 'c1', species: 'ashkit', level: 12, xp: 1728, hp: 30, moves: [{ id: 'bump', pp: 35 }, { id: 'cinder-spit', pp: 20 }], status: null }],
  box: [{ uid: 'c2', species: 'breezel', level: 4, xp: 64, hp: 15, moves: [{ id: 'quick-jab', pp: 30 }], status: 'burn' }],
  bag: { orb: 4, bright: 1, star: 0 },
  seen: ['ashkit', 'breezel', 'pebblet'], caught: ['ashkit', 'breezel'], money: 900,
  unlockedRoutes: ['meadow', 'ridge'],
};

describe('save envelope', () => {
  it('round-trips through serialize/parse', () => {
    const p = fresh();
    const text = serializeSave(p, new Date('2026-01-02T03:04:05Z'));
    const env = JSON.parse(text);
    expect(env.format).toBe(SAVE_FORMAT);
    expect(env.schema).toBe(SAVE_SCHEMA);
    expect(env.savedAt).toBe('2026-01-02T03:04:05.000Z');
    const r = parseSave(text);
    expect(r.player).toEqual(p);
    expect(r.savedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(r.migratedFrom).toBeNull();
  });

  it('accepts a bare PlayerState', () => {
    const p = fresh();
    expect(parseSave(JSON.stringify(p)).player).toEqual(p);
  });

  it('summarizes for the title screen', () => {
    const s = summarize(fresh(), 'x');
    expect(s).toMatchObject({ leadName: 'Ashkit', leadLevel: 5, caught: 2, playTime: 321, money: 1234, savedAt: 'x' });
  });

  it('builds a dated export file name', () => {
    expect(exportFileName(new Date(2026, 0, 2, 3, 4))).toBe('orbkin-save-20260102-0304.json');
  });
});

describe('migration', () => {
  it('upgrades v1 → v2 with sensible defaults and keeps progress', () => {
    const r = parseSave(JSON.stringify({ format: SAVE_FORMAT, schema: 1, savedAt: '2025-05-05T00:00:00Z', data: V1 }));
    const p = r.player;
    expect(r.migratedFrom).toBe(1);
    expect(p.v).toBe(2);
    expect(p.bag).toEqual({ orb: 4, bright: 1 });
    expect(p.defeatedTrainers).toEqual(['scout-pim']);
    expect(p.lastRoute).toBe('ridge');
    expect(p.champion).toBe(false);
    expect(p.playTime).toBe(0);
    expect(p.settings).toEqual({ textSpeed: 'normal' });
    expect(p.party[0]!.species).toBe('ashkit');
    expect(p.box[0]!.status).toBe('burn');
    expect('unlockedRoutes' in p).toBe(false);
  });

  it('migrates bare v1 state too', () => {
    expect(parseSave(JSON.stringify(V1)).player.lastRoute).toBe('ridge');
  });

  it('refuses saves from the future', () => {
    expect(() => migrate({}, SAVE_SCHEMA + 1)).toThrow(/newer version/);
  });
});

describe('validation', () => {
  const bad = (mut: (p: Record<string, unknown>) => void) => {
    const p = JSON.parse(JSON.stringify(fresh())) as Record<string, unknown>;
    mut(p);
    return () => parseSave(JSON.stringify({ format: SAVE_FORMAT, schema: 2, savedAt: 'x', data: p }));
  };

  it.each([
    ['not json', () => parseSave('{oops')],
    ['empty', () => parseSave('')],
    ['array', () => parseSave('[1,2]')],
    ['other format', () => parseSave(JSON.stringify({ format: 'something-else', data: {} }))],
    ['random object', () => parseSave(JSON.stringify({ hello: 'world' }))],
    ['no party', bad((p) => { p.party = []; })],
    ['party too big', bad((p) => { p.party = Array.from({ length: 7 }, (_, i) => makeCreature('ashkit', 5, `x${i}`)); })],
    ['unknown species', bad((p) => { (p.party as { species: string }[])[0]!.species = 'missingno'; })],
    ['bad level', bad((p) => { (p.party as { level: number }[])[0]!.level = 99; })],
    ['bad money', bad((p) => { p.money = -5; })],
    ['bag garbage', bad((p) => { p.bag = { orb: 'lots' }; })],
    ['duplicate uids', bad((p) => { (p.box as { uid: string }[])[0]!.uid = 'c1'; })],
    ['unknown move', bad((p) => { (p.party as { moves: { id: string; pp: number }[] }[])[0]!.moves = [{ id: 'nope', pp: 1 }]; })],
  ])('rejects %s with a friendly SaveError', (_name, fn) => {
    expect(fn).toThrow(SaveError);
  });

  it('repairs harmless oddities', () => {
    const p = JSON.parse(JSON.stringify(fresh()));
    p.seen.push('not-a-species');
    p.caught = [];
    p.settings.textSpeed = 'ludicrous';
    p.party[0].moves[0].pp = 999;
    p.party[0].hp = 9999;
    p.bag.retired = 5;
    p.nextUid = 1;
    p.lastRoute = 'atlantis';
    const v = validatePlayerState(p);
    expect(v.seen).not.toContain('not-a-species');
    expect(v.caught).toEqual(expect.arrayContaining(['ashkit', 'pebblet']));
    expect(v.settings.textSpeed).toBe('normal');
    expect(v.party[0]!.moves[0]!.pp).toBe(35);
    expect(v.party[0]!.hp).toBeLessThan(100);
    expect('retired' in v.bag).toBe(false);
    expect(v.nextUid).toBeGreaterThan(9);
    expect(v.lastRoute).toBe('meadow');
  });
});

describe('SaveManager', () => {
  it('writes and reads back via the first backend', async () => {
    const mem = memoryBackend();
    const sm = new SaveManager([mem]);
    expect(await sm.exists()).toBe(false);
    expect(await sm.read()).toBeNull();
    const p = fresh();
    expect(await sm.write(p)).toBe('memory');
    expect(await sm.exists()).toBe(true);
    expect((await sm.read())!.player).toEqual(p);
    await sm.clear();
    expect(await sm.exists()).toBe(false);
  });

  it('falls back from a broken IndexedDB to localStorage, then memory', async () => {
    const ls = new FakeStorage();
    const sm = new SaveManager([failing('indexeddb'), localStorageBackend(ls)]);
    expect(await sm.write(fresh())).toBe('localstorage');
    expect(sm.backendKind).toBe('localstorage');
    expect(ls.getItem(SAVE_KEY)).toContain(SAVE_FORMAT);
    expect((await sm.read())!.backend).toBe('localstorage');

    const sm2 = new SaveManager([failing('indexeddb'), failing('localstorage')]);
    expect(await sm2.write(fresh())).toBe('memory');
    expect((await sm2.read())!.player.money).toBe(1234);
  });

  it('a null backend (unavailable API) is skipped', async () => {
    const sm = new SaveManager([null, localStorageBackend(null), localStorageBackend(new FakeStorage())]);
    expect(await sm.write(fresh())).toBe('localstorage');
  });

  it('prefers the newest copy across backends', async () => {
    const a = memoryBackend();
    const ls = new FakeStorage();
    const b = localStorageBackend(ls)!;
    const old = fresh();
    const newer = { ...fresh(), money: 9999 };
    await a.set(SAVE_KEY, serializeSave(old, new Date('2026-01-01T00:00:00Z')));
    await b.set(SAVE_KEY, serializeSave(newer, new Date('2026-02-01T00:00:00Z')));
    const sm = new SaveManager([{ ...a, kind: 'indexeddb' }, b]);
    expect((await sm.read())!.player.money).toBe(9999);
  });

  it('throws a SaveError (not a crash) when the stored save is corrupt', async () => {
    const mem = memoryBackend();
    await mem.set(SAVE_KEY, '{"format":"orbkin-save","schema":2,"data":{"party":"???"}}');
    const sm = new SaveManager([mem]);
    await expect(sm.read()).rejects.toBeInstanceOf(SaveError);
  });

  it('ignores a corrupt copy when a good one exists elsewhere', async () => {
    const a = memoryBackend();
    const ls = new FakeStorage();
    await a.set(SAVE_KEY, 'garbage');
    ls.setItem(SAVE_KEY, serializeSave(fresh()));
    const sm = new SaveManager([{ ...a, kind: 'indexeddb' }, localStorageBackend(ls)]);
    expect((await sm.read())!.player.money).toBe(1234);
  });

  it('export text imports back identically (export/import)', () => {
    const p = fresh();
    const exported = JSON.stringify(JSON.parse(serializeSave(p)), null, 2);
    expect(parseSave(exported).player).toEqual(p);
  });
});
