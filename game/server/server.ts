// Orbkin arena server: HTTP (health + optional static site) and a WebSocket endpoint that
// hosts server-authoritative PvP rooms. Run with `npm run server` (see docs/ONLINE.md).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  ERROR_TEXT, PROTOCOL_VERSION, ROOM_ALPHABET, ROOM_CODE_LENGTH, parseClientMessage,
  type ClientMessage, type ErrorCode, type Seat,
} from '../src/net/protocol';
import { DEFAULT_ROOM_OPTIONS, Room, realClock, type Conn, type RoomClock, type RoomOptions } from './room';

export interface ArenaServerOptions {
  /** 0 = pick a free port. */
  port?: number;
  host?: string;
  clock?: RoomClock;
  room?: Partial<RoomOptions>;
  /** Directory of the built client to serve over HTTP (optional). */
  staticDir?: string | null;
  maxRooms?: number;
  maxConnectionsPerIp?: number;
  /** Token bucket: burst size and refill per second, per connection. */
  rate?: { burst: number; perSecond: number };
  /** Heartbeat interval for dropping dead sockets (ms; 0 disables). */
  heartbeatMs?: number;
  /** How often expired rooms are swept (ms; 0 disables). */
  sweepMs?: number;
  ttl?: { empty: number; idle: number };
  log?: (msg: string) => void;
  /** Source of battle seeds (defaults to crypto randomness; tests pass a fixed one). */
  makeSeed?: () => number;
}

export interface ArenaServer {
  port: number;
  rooms: Map<string, Room>;
  close(): Promise<void>;
  /** Remove expired rooms now (also runs on a timer). */
  sweep(): void;
}

interface Client {
  ws: WebSocket;
  ip: string;
  room: Room | null;
  seat: Seat | null;
  conn: Conn;
  tokens: number;
  lastRefill: number;
  strikes: number;
  alive: boolean;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

export function newRoomCode(taken: (code: string) => boolean): string {
  for (let i = 0; i < 200; i++) {
    let code = '';
    for (let k = 0; k < ROOM_CODE_LENGTH; k++) code += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)];
    if (!taken(code)) return code;
  }
  throw new Error('no free room codes');
}

export function createArenaServer(options: ArenaServerOptions = {}): Promise<ArenaServer> {
  const clock = options.clock ?? realClock;
  const roomOpts: RoomOptions = { ...DEFAULT_ROOM_OPTIONS, ...options.room };
  const maxRooms = options.maxRooms ?? 500;
  const maxPerIp = options.maxConnectionsPerIp ?? 24;
  const rate = options.rate ?? { burst: 30, perSecond: 10 };
  const ttl = options.ttl ?? { empty: 2 * 60_000, idle: 30 * 60_000 };
  const log = options.log ?? (() => {});
  const makeSeed = options.makeSeed ?? (() => randomInt(0, 2 ** 32));
  const staticDir = options.staticDir ? resolve(options.staticDir) : null;
  const rooms = new Map<string, Room>();
  const perIp = new Map<string, number>();
  const clients = new Set<Client>();
  const started = clock.now();

  const http = createServer((req, res) => handleHttp(req, res));

  function handleHttp(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, rooms: rooms.size, players: clients.size, uptimeSec: Math.round((clock.now() - started) / 1000) }));
      return;
    }
    if (staticDir && (req.method === 'GET' || req.method === 'HEAD')) {
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      let file = join(staticDir, rel);
      if (file !== staticDir && !file.startsWith(staticDir + sep)) { res.writeHead(403).end(); return; }
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(staticDir, 'index.html');
      if (existsSync(file)) {
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
        res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
        return;
      }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Orbkin arena server. Connect with a WebSocket; GET /health for status.');
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  http.on('upgrade', (req, socket, head) => {
    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()) || req.socket.remoteAddress || '?';
    if ((perIp.get(ip) ?? 0) >= maxPerIp) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip));
  });

  function onConnection(ws: WebSocket, ip: string) {
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    const client: Client = {
      ws, ip, room: null, seat: null, tokens: rate.burst, lastRefill: clock.now(), strikes: 0, alive: true,
      conn: { send: (msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); } },
    };
    clients.add(client);
    ws.on('pong', () => { client.alive = true; });
    ws.on('message', (data, isBinary) => {
      client.alive = true;
      if (isBinary) return reject(client, 'bad-message', 'text frames only');
      if (!takeToken(client)) {
        client.strikes++;
        if (client.strikes > 40) ws.close(1008, 'rate limited');
        else reject(client, 'rate-limited', 'too many messages');
        return;
      }
      const raw = data.toString();
      const msg = parseClientMessage(raw);
      if ('error' in msg) return reject(client, 'bad-message', msg.error);
      try {
        handle(client, msg);
      } catch (err) {
        log(`error handling ${msg.t}: ${(err as Error).stack ?? String(err)}`);
        reject(client, 'bad-message', 'server error');
      }
    });
    ws.on('close', () => {
      clients.delete(client);
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n <= 0) perIp.delete(ip); else perIp.set(ip, n);
      if (client.room && client.seat !== null) client.room.disconnect(client.seat, client.conn);
    });
    ws.on('error', () => { /* close follows */ });
  }

  function takeToken(c: Client): boolean {
    const now = clock.now();
    c.tokens = Math.min(rate.burst, c.tokens + ((now - c.lastRefill) / 1000) * rate.perSecond);
    c.lastRefill = now;
    if (c.tokens < 1) return false;
    c.tokens -= 1;
    return true;
  }

  function reject(c: Client, code: ErrorCode, detail: string) {
    c.conn.send({ t: 'error', code, message: code === 'bad-team' || code === 'bad-message' ? detail : ERROR_TEXT[code] });
  }

  function attach(c: Client, room: Room, seat: Seat, token: string) {
    // One room per connection: leaving a previous room counts as leaving for good.
    if (c.room && c.room !== room && c.seat !== null) c.room.leave(c.seat);
    c.room = room;
    c.seat = seat;
    c.conn.send({ t: 'welcome', code: room.code, you: seat, token });
    c.conn.send({ t: 'room', room: room.view(seat) });
  }

  function handle(c: Client, msg: ClientMessage) {
    switch (msg.t) {
      case 'ping': c.conn.send({ t: 'pong' }); return;
      case 'create': {
        if (msg.v !== PROTOCOL_VERSION) return reject(c, 'bad-version', '');
        if (rooms.size >= maxRooms) { sweep(); if (rooms.size >= maxRooms) return reject(c, 'server-full', ''); }
        const code = newRoomCode((k) => rooms.has(k));
        const room = new Room(code, clock, makeSeed, roomOpts);
        rooms.set(code, room);
        const token = randomBytes(16).toString('hex');
        const r = room.add(msg.name, token, c.conn);
        if (!r.ok) return reject(c, r.code, r.message);
        log(`room ${code} created`);
        attach(c, room, r.value, token);
        return;
      }
      case 'join': {
        if (msg.v !== PROTOCOL_VERSION) return reject(c, 'bad-version', '');
        const room = rooms.get(msg.code);
        if (!room || room.closed) return reject(c, 'no-room', '');
        if (c.room === room) return reject(c, 'not-now', '');
        const token = randomBytes(16).toString('hex');
        const r = room.add(msg.name, token, c.conn);
        if (!r.ok) return reject(c, r.code, r.message);
        attach(c, room, r.value, token);
        return;
      }
      case 'resume': {
        if (msg.v !== PROTOCOL_VERSION) return reject(c, 'bad-version', '');
        const room = rooms.get(msg.code);
        if (!room || room.closed) return reject(c, 'no-room', '');
        const r = room.resume(msg.token, c.conn);
        if (!r.ok) return reject(c, r.code, r.message);
        attach(c, room, r.value, msg.token);
        return;
      }
      default: break;
    }
    const room = c.room;
    const seat = c.seat;
    if (!room || seat === null) return reject(c, 'no-room', '');
    let r: { ok: boolean; code?: ErrorCode; message?: string } = { ok: true };
    switch (msg.t) {
      case 'team': r = room.setTeam(seat, msg.team); break;
      case 'action': r = room.submit(seat, msg.step, msg.action); break;
      case 'ready': room.ready(seat, msg.step); break;
      case 'rematch': r = room.rematch(seat); break;
      case 'newTeams': r = room.newTeams(seat); break;
      case 'leave':
        room.leave(seat);
        c.room = null;
        c.seat = null;
        if (room.closed) rooms.delete(room.code);
        c.conn.send({ t: 'closed', reason: 'left' });
        break;
    }
    if (!r.ok && r.code) reject(c, r.code, r.message ?? '');
  }

  function sweep() {
    const now = clock.now();
    for (const [code, room] of rooms) {
      if (room.expired(now, ttl)) {
        room.close();
        rooms.delete(code);
        log(`room ${code} removed`);
      }
    }
  }

  const sweepTimer = (options.sweepMs ?? 30_000) > 0 ? setInterval(sweep, options.sweepMs ?? 30_000) : null;
  sweepTimer?.unref();
  const heartbeat = (options.heartbeatMs ?? 25_000) > 0 ? setInterval(() => {
    for (const c of clients) {
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch { /* closing */ }
    }
  }, options.heartbeatMs ?? 25_000) : null;
  heartbeat?.unref();

  return new Promise((resolvePromise, rejectPromise) => {
    http.once('error', rejectPromise);
    http.listen(options.port ?? 8787, options.host, () => {
      const addr = http.address();
      const port = typeof addr === 'object' && addr ? addr.port : options.port ?? 8787;
      resolvePromise({
        port,
        rooms,
        sweep,
        close: () => new Promise<void>((done) => {
          if (sweepTimer) clearInterval(sweepTimer);
          if (heartbeat) clearInterval(heartbeat);
          for (const room of rooms.values()) room.close();
          for (const c of clients) c.ws.terminate();
          wss.close();
          http.close(() => done());
        }),
      });
    });
  });
}
