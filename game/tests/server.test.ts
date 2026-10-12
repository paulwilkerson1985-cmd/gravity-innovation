// End-to-end tests of the arena server: real sockets on an ephemeral port, two `ws` clients.
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createArenaServer, type ArenaServer } from '../server/server';
import { RENTALS } from '../src/data/rentals';
import { createArenaBattle, hashSeed, legalActions, resolveTurn, type Action, type ArenaEntry, type BattleEvent } from '../src/engine';
import { PROTOCOL_VERSION, type RoomView, type ServerMessage } from '../src/net/protocol';

const team = (ids: string[]): ArenaEntry[] => ids.map((id) => {
  const r = RENTALS.find((x) => x.id === id)!;
  return { species: r.species, moves: [...r.moves], uid: r.id };
});
const TEAM_A = team(['r-pyrelord', 'r-maelstrode', 'r-verdantusk']);
const TEAM_B = team(['r-stormoth', 'r-cragmaul', 'r-cyclonyx']);

class TestClient {
  ws: WebSocket;
  inbox: ServerMessage[] = [];
  all: ServerMessage[] = [];
  private waiters: (() => void)[] = [];
  room: RoomView | null = null;
  token = '';
  code = '';
  closed = false;

  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}`);
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMessage;
      if (m.t === 'welcome') { this.token = m.token; this.code = m.code; }
      if ('room' in m) this.room = m.room;
      this.inbox.push(m);
      this.all.push(m);
      for (const w of this.waiters.splice(0)) w();
    });
    this.ws.on('close', () => { this.closed = true; for (const w of this.waiters.splice(0)) w(); });
  }

  open() { return new Promise<void>((r, j) => { this.ws.once('open', () => r()); this.ws.once('error', j); }); }
  send(m: unknown) { this.ws.send(JSON.stringify(m)); }

  /** Wait for (and consume up to) the first inbox message matching `pred`. */
  async next<T extends ServerMessage>(pred: (m: ServerMessage) => m is T, ms?: number): Promise<T>;
  async next(pred: (m: ServerMessage) => boolean, ms?: number): Promise<ServerMessage>;
  async next(pred: (m: ServerMessage) => boolean, ms = 3000): Promise<ServerMessage> {
    const t0 = Date.now();
    for (;;) {
      const i = this.inbox.findIndex(pred);
      if (i >= 0) { const m = this.inbox[i]!; this.inbox.splice(0, i + 1); return m; }
      if (Date.now() - t0 > ms) throw new Error(`timeout waiting; inbox: ${JSON.stringify(this.inbox.map((m) => m.t))}`);
      await new Promise<void>((r) => { this.waiters.push(r); setTimeout(r, 50); });
    }
  }
  close() { this.ws.close(); }
}

const isT = <K extends ServerMessage['t']>(t: K) => (m: ServerMessage): m is Extract<ServerMessage, { t: K }> => m.t === t;

let server: ArenaServer | null = null;
const clients: TestClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server?.close();
  server = null;
});

async function start(opts: Parameters<typeof createArenaServer>[0] = {}) {
  server = await createArenaServer({ port: 0, heartbeatMs: 0, sweepMs: 0, makeSeed: () => 12345, ...opts });
  return server;
}
async function client(port: number) {
  const c = new TestClient(port);
  clients.push(c);
  await c.open();
  return c;
}
async function pair(port: number, withTeams = true) {
  const a = await client(port);
  a.send({ t: 'create', v: PROTOCOL_VERSION, name: 'Ember' });
  const wa = await a.next(isT('welcome'));
  const b = await client(port);
  b.send({ t: 'join', v: PROTOCOL_VERSION, code: wa.code.toLowerCase(), name: '  Rill\u0007  ' });
  const wb = await b.next(isT('welcome'));
  expect(wb.you).toBe(1);
  if (withTeams) {
    a.send({ t: 'team', team: TEAM_A });
    b.send({ t: 'team', team: TEAM_B });
    await a.next(isT('start'));
    await b.next(isT('start'));
  }
  return { a, b, code: wa.code };
}

/** First legal non-forfeit action (prefers the strongest-looking move index 0). */
function pick(room: RoomView): Action {
  const legal = legalActions(room.battle!, room.you).filter((x) => x.type !== 'forfeit');
  return legal[0]!;
}

describe('arena server', () => {
  it('serves /health', async () => {
    const s = await start();
    const res = await fetch(`http://127.0.0.1:${s.port}/health`);
    const body = await res.json() as { ok: boolean; rooms: number };
    expect(body.ok).toBe(true);
    expect(body.rooms).toBe(0);
  });

  it('plays a full deterministic match that matches a local replay', async () => {
    const s = await start();
    const { a, b } = await pair(s.port);
    expect(a.room!.players[1]!.name).toBe('Rill');
    const actions: [Action, Action][] = [];
    const events: BattleEvent[] = [];
    for (let guard = 0; guard < 200 && a.room!.phase === 'battle'; guard++) {
      const step = a.room!.step;
      const acts: [Action, Action] = [{ type: 'pass' }, { type: 'pass' }];
      for (const [c, seat] of [[a, 0], [b, 1]] as const) {
        if (c.room!.mustAct) {
          acts[seat] = pick(c.room!);
          c.send({ t: 'action', step, action: acts[seat] });
        }
      }
      const ta = await a.next(isT('turn'));
      const tb = await b.next(isT('turn'));
      expect(ta.actions).toEqual(acts);
      expect(tb.events).toEqual(ta.events);
      expect(tb.room.battle).toEqual(ta.room.battle);
      actions.push(acts);
      events.push(...ta.events);
    }
    expect(a.room!.phase).toBe('over');
    expect(a.room!.battle!.outcome?.reason).toBe('ko');
    // Replay locally with the same seed: identical events.
    let st = createArenaBattle(hashSeed(12345, 1) >>> 0, 'Ember', TEAM_A, 'Rill', TEAM_B).state;
    const local: BattleEvent[] = [];
    for (const acts of actions) { const r = resolveTurn(st, acts); st = r.state; local.push(...r.events); }
    expect(local).toEqual(events);
    expect(a.room!.stats.kos[0] + a.room!.stats.kos[1]).toBeGreaterThanOrEqual(3);
    expect(a.room!.stats.turns).toBe(st.turn);
  });

  it('hides a committed choice until both have chosen', async () => {
    const s = await start();
    const { a, b } = await pair(s.port);
    const step = a.room!.step;
    a.send({ t: 'action', step, action: { type: 'move', index: 1 } });
    const seen = await b.next((m) => m.t === 'room' && !!m.room.players[0]?.committed);
    expect(seen.t).toBe('room');
    const rb = (seen as Extract<ServerMessage, { t: 'room' }>).room;
    expect(rb.yourAction).toBeNull();
    expect(JSON.stringify(rb)).not.toContain('"index":1');
    expect(b.all.some((m) => m.t === 'turn')).toBe(false);
    // A's own view echoes its action back.
    const ra = await a.next((m) => m.t === 'room' && !!m.room.yourAction);
    expect((ra as Extract<ServerMessage, { t: 'room' }>).room.yourAction).toEqual({ type: 'move', index: 1 });
    // Choosing twice is refused.
    a.send({ t: 'action', step, action: { type: 'move', index: 0 } });
    expect((await a.next(isT('error'))).code).toBe('not-now');
    b.send({ t: 'action', step, action: { type: 'move', index: 0 } });
    const t = await b.next(isT('turn'));
    expect(t.actions).toEqual([{ type: 'move', index: 1 }, { type: 'move', index: 0 }]);
  });

  it('rejects illegal, stale and malformed messages', async () => {
    const s = await start();
    const { a } = await pair(s.port);
    const active = a.room!.battle!.sides[0].active;
    a.send({ t: 'action', step: a.room!.step, action: { type: 'switch', to: active } });
    expect((await a.next(isT('error'))).code).toBe('illegal-action');
    a.send({ t: 'action', step: a.room!.step + 5, action: { type: 'move', index: 0 } });
    expect((await a.next(isT('error'))).code).toBe('stale');
    a.send({ t: 'action', step: a.room!.step, action: { type: 'catch', orb: 'star' } });
    expect((await a.next(isT('error'))).code).toBe('bad-message');
    a.ws.send('{not json');
    expect((await a.next(isT('error'))).code).toBe('bad-message');
    a.ws.send(JSON.stringify({ t: 'team', team: 'x'.repeat(9000) }));
    expect((await a.next(isT('error'))).message).toMatch(/too large/);
    // Joining a missing room / a full room.
    const c = await client(s.port);
    c.send({ t: 'join', v: PROTOCOL_VERSION, code: 'ZZZZ', name: 'x' });
    expect((await c.next(isT('error'))).code).toBe('no-room');
    c.send({ t: 'join', v: PROTOCOL_VERSION, code: a.code, name: 'x' });
    expect((await c.next(isT('error'))).code).toBe('room-full');
    c.send({ t: 'create', v: 999, name: 'x' });
    expect((await c.next(isT('error'))).code).toBe('bad-version');
  });

  it('validates teams with the arena rules', async () => {
    const s = await start();
    const { a } = await pair(s.port, false);
    a.send({ t: 'team', team: [TEAM_A[0], TEAM_A[0], TEAM_A[1]] });
    const e = await a.next(isT('error'));
    expect(e.code).toBe('bad-team');
    a.send({ t: 'team', team: [{ ...TEAM_A[0]!, moves: ['pyre-crash', 'riptide-slam'] }, TEAM_A[1], TEAM_A[2]] });
    expect((await a.next(isT('error'))).message).toMatch(/cannot learn/);
    a.send({ t: 'team', team: TEAM_A });
    const r = await a.next((m) => m.t === 'room' && !!m.room.players[0]?.ready);
    expect(r.t).toBe('room');
  });

  it('auto-moves on timeout and forfeits after three in a row', async () => {
    const s = await start({ room: { turnMs: 120, maxPlaybackMs: 0, perEventMs: 0 } });
    const { a, b } = await pair(s.port);
    // B never answers. A keeps choosing.
    let forfeited = false;
    for (let i = 0; i < 6 && !forfeited; i++) {
      if (a.room!.mustAct) a.send({ t: 'action', step: a.room!.step, action: pick(a.room!) });
      const t = await a.next(isT('turn'), 3000);
      if (t.room.phase === 'over') {
        forfeited = true;
        expect(t.room.battle!.outcome).toEqual({ winner: 0, reason: 'forfeit' });
        expect(t.events.some((e) => e.t === 'forfeit' && e.side === 1)).toBe(true);
      } else if (t.timedOut[1]) {
        expect(t.actions[1].type).not.toBe('forfeit');
      }
    }
    expect(forfeited).toBe(true);
    const last = await b.next((m) => m.t === 'turn' && m.room.phase === 'over');
    expect((last as Extract<ServerMessage, { t: 'turn' }>).room.stats.timeouts[1]).toBe(3);
  });

  it('lets a dropped player resume with their token', async () => {
    const s = await start();
    const { a, b, code } = await pair(s.port);
    const token = b.token;
    // One turn first.
    a.send({ t: 'action', step: 0, action: pick(a.room!) });
    b.send({ t: 'action', step: 0, action: pick(b.room!) });
    await a.next(isT('turn'));
    b.close();
    const gone = await a.next((m) => m.t === 'room' && m.room.players[1]?.connected === false);
    expect(gone.t).toBe('room');
    // Wrong token is refused.
    const intruder = await client(s.port);
    intruder.send({ t: 'resume', v: PROTOCOL_VERSION, code, token: 'f'.repeat(32) });
    expect((await intruder.next(isT('error'))).code).toBe('bad-token');
    // Right token restores the seat and the full state.
    const b2 = await client(s.port);
    b2.send({ t: 'resume', v: PROTOCOL_VERSION, code, token });
    const w = await b2.next(isT('welcome'));
    expect(w.you).toBe(1);
    const r = await b2.next(isT('room'));
    expect(r.room.step).toBe(1);
    expect(r.room.battle).toEqual(a.room!.battle);
    await a.next((m) => m.t === 'room' && m.room.players[1]?.connected === true);
    b2.send({ t: 'action', step: 1, action: pick(r.room) });
    a.send({ t: 'action', step: 1, action: pick(a.room!) });
    const t = await b2.next(isT('turn'));
    expect(t.step).toBe(2);
  });

  it('supports rematch and new teams, and leaving forfeits', async () => {
    const s = await start();
    const { a, b } = await pair(s.port);
    a.send({ t: 'action', step: 0, action: { type: 'forfeit' } });
    // A forfeit resolves at once, without waiting for the opponent.
    const t = await b.next(isT('turn'));
    expect(t.room.phase).toBe('over');
    expect(t.room.battle!.outcome?.winner).toBe(1);
    a.send({ t: 'rematch' });
    await b.next((m) => m.t === 'room' && !!m.room.players[0]?.wantsRematch);
    b.send({ t: 'rematch' });
    const st = await b.next(isT('start'));
    expect(st.room.phase).toBe('battle');
    expect(st.room.step).toBe(0);
    // Leaving mid-battle forfeits.
    a.send({ t: 'leave' });
    const t2 = await b.next(isT('turn'));
    expect(t2.room.battle!.outcome).toEqual({ winner: 1, reason: 'forfeit' });
    expect(t2.room.players[0]!.left).toBe(true);
    b.send({ t: 'rematch' });
    expect((await b.next(isT('error'))).code).toBe('not-now');
  });

  it('returns both players to team building on newTeams', async () => {
    const s = await start();
    const { a, b } = await pair(s.port);
    a.send({ t: 'action', step: 0, action: { type: 'forfeit' } });
    await a.next(isT('turn'));
    b.send({ t: 'newTeams' });
    const r = await a.next((m) => m.t === 'room' && m.room.phase === 'lobby');
    const room = (r as Extract<ServerMessage, { t: 'room' }>).room;
    expect(room.players[0]!.ready).toBe(false);
    expect(room.yourTeam).toEqual(TEAM_A);
  });

  it('rate-limits floods and sweeps abandoned rooms', async () => {
    let now = 1_000_000;
    const clock = { now: () => now, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
    const s = await start({ clock, rate: { burst: 5, perSecond: 1 } });
    const a = await client(s.port);
    for (let i = 0; i < 12; i++) a.send({ t: 'ping' });
    const err = await a.next(isT('error'));
    expect(err.code).toBe('rate-limited');
    now += 60_000;
    a.inbox.length = 0;
    a.send({ t: 'create', v: PROTOCOL_VERSION, name: 'Solo' });
    await a.next(isT('welcome'));
    expect(s.rooms.size).toBe(1);
    a.close();
    await new Promise((r) => setTimeout(r, 100));
    now += 3 * 60_000;
    s.sweep();
    expect(s.rooms.size).toBe(0);
  });
  it('answers malformed URLs with 400 and keeps serving', async () => {
    const s = await start({ staticDir: 'src' });
    const bad = await fetch(`http://127.0.0.1:${s.port}/%E0%A4%A`);
    expect(bad.status).toBe(400);
    const nul = await fetch(`http://127.0.0.1:${s.port}/a%00b`);
    expect(nul.status).toBe(400);
    const ok = await fetch(`http://127.0.0.1:${s.port}/health`);
    expect(ok.status).toBe(200);
  });

  it('never sends the battle rng to clients', async () => {
    const s = await start();
    const { a, b, code } = await pair(s.port);
    expect(s.rooms.get(code)!.battle!.rng).not.toBe(0);
    expect(a.room!.battle!.rng).toBe(0);
    expect(b.room!.battle!.rng).toBe(0);
    for (const c of [a, b]) if (c.room!.mustAct) c.send({ t: 'action', step: c.room!.step, action: pick(c.room!) });
    const t = await a.next(isT('turn'));
    expect(t.room.battle!.rng).toBe(0);
  });

  it('ignores X-Forwarded-For unless trustProxy is set', async () => {
    const tryConnect = (port: number, xff: string) => new Promise<boolean>((done) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { 'X-Forwarded-For': xff } });
      ws.once('open', () => { open.push(ws); done(true); });
      ws.once('error', () => done(false));
    });
    const open: WebSocket[] = [];
    try {
      const s = await start({ maxConnectionsPerIp: 1, trustProxy: false });
      expect(await tryConnect(s.port, '1.1.1.1')).toBe(true);
      expect(await tryConnect(s.port, '2.2.2.2')).toBe(false); // same real socket address
      for (const ws of open.splice(0)) ws.close();
      await server!.close();
      const t = await start({ maxConnectionsPerIp: 1, trustProxy: true });
      expect(await tryConnect(t.port, '1.1.1.1')).toBe(true);
      expect(await tryConnect(t.port, '2.2.2.2')).toBe(true);
    } finally {
      for (const ws of open) ws.close();
    }
  });
});
