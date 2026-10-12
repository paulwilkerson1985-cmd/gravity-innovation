// ArenaClient against a real in-process server: connect, create/join, and automatic
// reconnect + seat resume after the connection drops.
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createArenaServer, type ArenaServer } from '../server/server';
import { ArenaClient, loadSavedSeat, type NetStatus, type SocketLike } from '../src/net/client';
import { PROTOCOL_VERSION, type ServerMessage } from '../src/net/protocol';

const factory = (u: string) => new WebSocket(u) as unknown as SocketLike;
let server: ArenaServer | null = null;
const clients: ArenaClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server?.close();
  server = null;
});

function until(pred: () => boolean, ms = 3000): Promise<void> {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (pred()) return resolve();
      if (Date.now() - t0 > ms) return reject(new Error('timed out'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe('ArenaClient', () => {
  it('fails gracefully when the server is unreachable', async () => {
    const c = new ArenaClient('ws://127.0.0.1:1', { socket: factory, connectTimeoutMs: 2000 });
    clients.push(c);
    await expect(c.connect()).rejects.toThrow();
    expect(c.status).toBe('failed');
  });

  it('creates, joins, and resumes after a dropped connection', async () => {
    server = await createArenaServer({ port: 0, heartbeatMs: 0, sweepMs: 0 });
    const url = `ws://127.0.0.1:${server.port}`;
    const storage = memoryStorage();
    const a = new ArenaClient(url, { socket: factory, backoff: [50, 50, 50], storage });
    const b = new ArenaClient(url, { socket: factory, backoff: [50, 50, 50] });
    clients.push(a, b);
    const statuses: NetStatus[] = [];
    a.onStatus((s) => statuses.push(s));
    await a.connect();
    a.send({ t: 'create', v: PROTOCOL_VERSION, name: 'Ember' });
    await until(() => a.code !== null);
    expect(loadSavedSeat(storage)?.code).toBe(a.code);
    await b.connect();
    b.send({ t: 'join', v: PROTOCOL_VERSION, code: a.code!, name: 'Rill' });
    await until(() => b.seat === 1 && a.room?.players[1]?.name === 'Rill');

    // Drop A's socket from the server side: the client reconnects and reclaims seat 0.
    const seen: ServerMessage[] = [];
    b.on((m) => seen.push(m));
    const room = server.rooms.get(a.code!)!;
    expect(room.connected()).toBe(2);
    (a as unknown as { ws: SocketLike }).ws.close();
    await until(() => statuses.includes('reconnecting'));
    await until(() => a.status === 'open' && room.connected() === 2);
    expect(a.seat).toBe(0);
    await until(() => seen.some((m) => m.t === 'room' && m.room.players[0]?.connected === false));
    await until(() => b.room?.players[0]?.connected === true);

    a.leave();
    await until(() => b.room?.players[0] === null);
    expect(loadSavedSeat(storage)).toBeNull();
  });
});
