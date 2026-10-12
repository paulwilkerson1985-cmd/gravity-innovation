import { describe, expect, it } from 'vitest';
import { cleanName, isRoomCode, normalizeCode, parseAction, parseClientMessage, parseServerMessage, parseTeam, PROTOCOL_VERSION } from '../src/net/protocol';
import { arenaServerUrl } from '../src/net/client';
import { newRoomCode } from '../server/server';

describe('arena protocol validation', () => {
  it('cleans names', () => {
    expect(cleanName('  Ember\u0000​  the   Bold  ')).toBe('Ember the Bold');
    expect(cleanName('x'.repeat(40))).toHaveLength(16);
    expect(cleanName('   ')).toBe('Player');
    expect(cleanName(42)).toBe('Player');
  });

  it('normalises and checks room codes', () => {
    expect(normalizeCode(' bc-df ')).toBe('BCDF');
    expect(isRoomCode('BCDF')).toBe(true);
    expect(isRoomCode('ABCD')).toBe(false); // vowels are not in the alphabet
    expect(isRoomCode('BCD')).toBe(false);
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) codes.add(newRoomCode((c) => codes.has(c)));
    for (const c of codes) expect(isRoomCode(c)).toBe(true);
  });

  it('parses only well-formed actions', () => {
    expect(parseAction({ type: 'move', index: 2 })).toEqual({ type: 'move', index: 2 });
    expect(parseAction({ type: 'move', index: -1 })).toEqual({ type: 'move', index: -1 });
    expect(parseAction({ type: 'move', index: 4 })).toBeNull();
    expect(parseAction({ type: 'move', index: 1.5 })).toBeNull();
    expect(parseAction({ type: 'switch', to: '1' })).toBeNull();
    expect(parseAction({ type: 'item', item: 'tonic', target: 0 })).toBeNull();
    expect(parseAction({ type: 'catch', orb: 'star' })).toBeNull();
    expect(parseAction({ type: 'forfeit', extra: 1 })).toEqual({ type: 'forfeit' });
    expect(parseAction(null)).toBeNull();
  });

  it('parses teams defensively', () => {
    const ok = [{ species: 'pyrelord', uid: 'r-pyrelord', moves: ['pyre-crash'], nickname: ' Blaze ' }];
    expect(parseTeam(ok)).toEqual([{ species: 'pyrelord', uid: 'r-pyrelord', moves: ['pyre-crash'], nickname: 'Blaze' }]);
    expect(parseTeam([{ ...ok[0], species: '../etc' }])).toBeNull();
    expect(parseTeam([{ ...ok[0], moves: ['a', 'b', 'c', 'd', 'e'] }])).toBeNull();
    expect(parseTeam([{ ...ok[0], __proto__: { x: 1 } }])).not.toBeNull();
    expect(parseTeam(new Array(7).fill(ok[0]))).toBeNull();
    expect(parseTeam('nope')).toBeNull();
  });

  it('parses client frames and rejects junk', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'create', v: PROTOCOL_VERSION, name: 'A' }))).toEqual({ t: 'create', v: PROTOCOL_VERSION, name: 'A' });
    expect(parseClientMessage(JSON.stringify({ t: 'join', v: 1, code: 'bcdf', name: 'B' }))).toEqual({ t: 'join', v: 1, code: 'BCDF', name: 'B' });
    expect(parseClientMessage(JSON.stringify({ t: 'resume', v: 1, code: 'BCDF', token: 'zz' }))).toEqual({ error: 'bad token' });
    expect(parseClientMessage(JSON.stringify({ t: 'action', step: -1, action: { type: 'pass' } }))).toEqual({ error: 'bad step' });
    expect(parseClientMessage('[]')).toEqual({ error: 'missing type' });
    expect(parseClientMessage('{')).toEqual({ error: 'not JSON' });
    expect(parseClientMessage(JSON.stringify({ t: 'hack' }))).toHaveProperty('error');
    expect(parseClientMessage('x'.repeat(5000))).toEqual({ error: 'message too large' });
  });

  it('parses server frames', () => {
    expect(parseServerMessage('{"t":"pong"}')).toEqual({ t: 'pong' });
    expect(parseServerMessage('{"t":"turn"}')).toBeNull();
    expect(parseServerMessage('{"t":"welcome","code":"BCDF","you":1,"token":"x"}')).not.toBeNull();
    expect(parseServerMessage('nope')).toBeNull();
  });

  it('picks the server URL', () => {
    const loc = (o: Partial<Record<'protocol' | 'hostname' | 'host' | 'port' | 'search', string>>) => ({ protocol: 'http:', hostname: 'localhost', host: 'localhost:4173', port: '4173', search: '', ...o });
    expect(arenaServerUrl(loc({ search: '?server=wss://x.example/arena' }))).toBe('wss://x.example/arena');
    expect(arenaServerUrl(loc({}), 'wss://env.example')).toBe('wss://env.example');
    expect(arenaServerUrl(loc({}))).toBe('ws://localhost:8787');
    expect(arenaServerUrl(loc({ protocol: 'https:', hostname: 'orbkin.example', host: 'orbkin.example', port: '' }))).toBe('wss://orbkin.example/arena');
  });
});
