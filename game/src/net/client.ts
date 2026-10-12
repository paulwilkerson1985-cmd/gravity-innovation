// Browser-side arena client: one WebSocket to the arena server with typed messages,
// automatic reconnect + seat resume, and a small status model for the UI.
import {
  PROTOCOL_VERSION, parseServerMessage,
  type ClientMessage, type RoomView, type Seat, type ServerMessage,
} from './protocol';

export type NetStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'failed';

/** Minimal WebSocket surface (browser WebSocket and the `ws` package both fit). */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}
export type SocketFactory = (url: string) => SocketLike;

export interface ClientOptions {
  socket?: SocketFactory;
  /** Reconnect delays in ms; after the last one the client gives up ('failed'). */
  backoff?: number[];
  connectTimeoutMs?: number;
  /** Persist {url, code, token} so a reload can rejoin (browser only). */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

const OPEN = 1;
export const SAVED_SEAT_KEY = 'orbkin.arena.seat';

export interface SavedSeat { url: string; code: string; token: string; savedAt: number }

/** Where the arena server lives: `?server=` param, then VITE_ARENA_SERVER, then a same-host default. */
export function arenaServerUrl(loc: { protocol: string; hostname: string; host: string; port: string; search: string }, envUrl?: string): string {
  const param = new URLSearchParams(loc.search).get('server');
  if (param) return param;
  if (envUrl) return envUrl;
  const secure = loc.protocol === 'https:';
  // Vite dev/preview servers don't speak WebSocket for us: use the arena server's default port.
  if (['5173', '4173'].includes(loc.port)) return `${secure ? 'wss' : 'ws'}://${loc.hostname}:8787`;
  return `${secure ? 'wss' : 'ws'}://${loc.host}/arena`;
}

export class ArenaClient {
  status: NetStatus = 'idle';
  room: RoomView | null = null;
  code: string | null = null;
  seat: Seat | null = null;
  private token: string | null = null;
  private ws: SocketLike | null = null;
  private listeners = new Set<(m: ServerMessage) => void>();
  private statusListeners = new Set<(s: NetStatus) => void>();
  private attempt = 0;
  private intentional = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private readonly socket: SocketFactory;
  private readonly backoff: number[];
  private readonly connectTimeoutMs: number;
  private readonly storage: ClientOptions['storage'];

  constructor(readonly url: string, opts: ClientOptions = {}) {
    this.socket = opts.socket ?? ((u) => new WebSocket(u) as unknown as SocketLike);
    this.backoff = opts.backoff ?? [500, 1000, 2000, 3000, 5000, 5000, 8000, 10000];
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 6000;
    this.storage = opts.storage ?? null;
  }

  on(fn: (m: ServerMessage) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: (s: NetStatus) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  /** Open the socket. Resolves once connected; rejects if the server can't be reached. */
  connect(): Promise<void> {
    this.intentional = false;
    this.setStatus('connecting');
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.teardown();
        this.setStatus('failed');
        reject(new Error('timeout'));
      }, this.connectTimeoutMs);
      this.open(
        () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } },
        () => { if (!settled) { settled = true; clearTimeout(timer); this.setStatus('failed'); reject(new Error('unreachable')); } },
      );
    });
  }

  private open(onOpen: () => void, onFail: () => void) {
    let ws: SocketLike;
    try { ws = this.socket(this.url); } catch { onFail(); return; }
    this.ws = ws;
    let opened = false;
    ws.onopen = () => {
      opened = true;
      this.attempt = 0;
      this.setStatus('open');
      this.startPing();
      // Resuming after a drop: reclaim our seat.
      if (this.code && this.token) this.send({ t: 'resume', v: PROTOCOL_VERSION, code: this.code, token: this.token });
      onOpen();
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      const m = parseServerMessage(ev.data);
      if (m) this.dispatch(m);
    };
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.stopPing();
      this.ws = null;
      if (!opened) { if (this.status === 'reconnecting') this.scheduleRetry(); else onFail(); return; }
      if (this.intentional) { this.setStatus('closed'); return; }
      if (this.code && this.token) { this.setStatus('reconnecting'); this.scheduleRetry(); }
      else this.setStatus('closed');
    };
  }

  private scheduleRetry() {
    if (this.intentional) return;
    const delay = this.backoff[this.attempt];
    if (delay === undefined) { this.setStatus('failed'); return; }
    this.attempt++;
    this.setStatus('reconnecting');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open(() => {}, () => this.scheduleRetry());
    }, delay);
  }

  /** Try to reconnect right away (e.g. the player pressed "Retry"). */
  retryNow() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.attempt = 0;
    this.intentional = false;
    if (!this.ws) { this.setStatus('reconnecting'); this.open(() => {}, () => this.scheduleRetry()); }
  }

  private dispatch(m: ServerMessage) {
    if (m.t === 'welcome') {
      this.code = m.code;
      this.seat = m.you;
      this.token = m.token;
      this.save();
    }
    if (m.t === 'error' && (m.code === 'bad-token' || m.code === 'no-room') && this.token) {
      // Our seat is gone (server restarted or the room expired).
      this.forget();
    }
    if ('room' in m && m.room) this.room = m.room;
    if (m.t === 'closed') this.forget();
    for (const fn of [...this.listeners]) fn(m);
  }

  send(m: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== OPEN) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  /** Resume a seat saved earlier (e.g. after a page reload). */
  resume(code: string, token: string) {
    this.code = code;
    this.token = token;
    this.send({ t: 'resume', v: PROTOCOL_VERSION, code, token });
  }

  /** Leave the room for good and close the socket. */
  leave() {
    if (this.code) this.send({ t: 'leave' });
    this.forget();
    this.close();
  }

  close() {
    this.intentional = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.teardown();
    this.setStatus('closed');
  }

  private teardown() {
    this.stopPing();
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch { /* ignore */ } }
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => this.send({ t: 'ping' }), 20_000);
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private setStatus(s: NetStatus) {
    if (this.status === s) return;
    this.status = s;
    for (const fn of [...this.statusListeners]) fn(s);
  }

  private save() {
    try {
      if (this.storage && this.code && this.token) {
        const seat: SavedSeat = { url: this.url, code: this.code, token: this.token, savedAt: Date.now() };
        this.storage.setItem(SAVED_SEAT_KEY, JSON.stringify(seat));
      }
    } catch { /* storage unavailable */ }
  }

  private forget() {
    this.code = null;
    this.token = null;
    this.room = null;
    try { this.storage?.removeItem(SAVED_SEAT_KEY); } catch { /* ignore */ }
  }
}

/** A seat saved by a previous page load (younger than 30 minutes), if any. */
export function loadSavedSeat(storage: Pick<Storage, 'getItem'> | null | undefined): SavedSeat | null {
  try {
    const raw = storage?.getItem(SAVED_SEAT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedSeat;
    if (typeof s.code !== 'string' || typeof s.token !== 'string' || typeof s.url !== 'string') return null;
    if (Date.now() - s.savedAt > 30 * 60_000) return null;
    return s;
  } catch {
    return null;
  }
}
