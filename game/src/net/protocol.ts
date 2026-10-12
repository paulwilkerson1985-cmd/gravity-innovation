// Arena online protocol, shared by the browser client (src/net/client.ts) and the Node
// server (server/). Messages are small JSON objects with a `t` tag. Everything coming off
// the wire is validated by hand here (no schema library) before anyone trusts it.
import type { Action, BattleEvent, BattleState } from '../engine/types';
import type { ArenaEntry } from '../engine/arena';

export const PROTOCOL_VERSION = 1;
/** Hard cap on one message (bytes / UTF-16 units). Teams are ~400 bytes; states ~6 KB. */
export const MAX_CLIENT_MESSAGE = 4096;
/** Consonants only: no I/O/0/1 confusion and no accidental words. */
export const ROOM_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const ROOM_CODE_LENGTH = 4;
export const NAME_MAX = 16;
export const DEFAULT_TURN_SECONDS = 45;
/** Consecutive timeouts after which a player forfeits. */
export const MAX_TIMEOUTS = 3;

export type Seat = 0 | 1;

// ------------------------------------------------------------------ client → server

export type ClientMessage =
  | { t: 'create'; v: number; name: string }
  | { t: 'join'; v: number; code: string; name: string }
  | { t: 'resume'; v: number; code: string; token: string }
  | { t: 'team'; team: ArenaEntry[] }
  /** `step` is the room's battle step the action is meant for (guards against stale clicks). */
  | { t: 'action'; step: number; action: Action }
  /** Playback finished on this client; lets the server start the decision timer early. */
  | { t: 'ready'; step: number }
  | { t: 'rematch' }
  | { t: 'newTeams' }
  | { t: 'leave' }
  | { t: 'ping' };

// ------------------------------------------------------------------ server → client

export interface PlayerView {
  name: string;
  connected: boolean;
  /** Team submitted and valid. */
  ready: boolean;
  /** Has committed an action for the current step (the action itself is never shared). */
  committed: boolean;
  wantsRematch: boolean;
  /** Consecutive turn timeouts (forfeits at MAX_TIMEOUTS). */
  timeouts: number;
  /** Left the room for good (as opposed to a dropped connection that may come back). */
  left: boolean;
}

export type RoomPhase = 'lobby' | 'battle' | 'over';

/** A per-player snapshot of the room. Only ever contains the receiver's own pending action. */
export interface RoomView {
  code: string;
  you: Seat;
  phase: RoomPhase;
  players: [PlayerView | null, PlayerView | null];
  /** Battle step: increments every time a turn (or replacement) resolves. */
  step: number;
  battle: BattleState | null;
  /** Does the receiver have to choose for this step? */
  mustAct: boolean;
  /** The receiver's own committed action for this step, if any. */
  yourAction: Action | null;
  /** Milliseconds until the server auto-picks for anyone still undecided (null = no timer). */
  deadlineIn: number | null;
  turnSeconds: number;
  /** Your own team as submitted (so a reconnecting client can show it in the builder). */
  yourTeam: ArenaEntry[] | null;
  stats: MatchStats;
}

export interface MatchStats { turns: number; kos: [number, number]; timeouts: [number, number] }

export type ErrorCode =
  | 'bad-message' | 'bad-version' | 'rate-limited' | 'no-room' | 'room-full' | 'bad-token'
  | 'bad-team' | 'illegal-action' | 'stale' | 'not-now' | 'server-full';

export type ServerMessage =
  | { t: 'welcome'; code: string; you: Seat; token: string }
  | { t: 'room'; room: RoomView }
  /** A resolved step: the events to play back and the new state. `actions` are revealed after both commit. */
  | { t: 'turn'; step: number; events: BattleEvent[]; actions: [Action, Action]; timedOut: [boolean, boolean]; room: RoomView }
  /** Battle (re)started: opening events (send-outs). */
  | { t: 'start'; events: BattleEvent[]; room: RoomView }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong' }
  | { t: 'closed'; reason: string };

// ------------------------------------------------------------------ validation helpers

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min: number, max: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
const isStr = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;
const ID_RE = /^[a-z0-9-]{1,32}$/;
const UID_RE = /^[A-Za-z0-9:_-]{1,40}$/;
const TOKEN_RE = /^[a-f0-9]{32}$/;

/** Trim, collapse whitespace, drop control characters, cap length. Empty → fallback. */
export function cleanName(raw: unknown, fallback = 'Player'): string {
  if (typeof raw !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return s || fallback;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, ROOM_CODE_LENGTH);
}

export function isRoomCode(x: unknown): x is string {
  if (typeof x !== 'string' || x.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of x) if (!ROOM_ALPHABET.includes(ch)) return false;
  return true;
}

export function parseAction(x: unknown): Action | null {
  if (!isObj(x)) return null;
  switch (x.type) {
    case 'move': return isInt(x.index, -1, 3) ? { type: 'move', index: x.index } : null;
    case 'switch': return isInt(x.to, 0, 5) ? { type: 'switch', to: x.to } : null;
    case 'forfeit': return { type: 'forfeit' };
    case 'pass': return { type: 'pass' };
    default: return null;
  }
}

export function parseTeam(x: unknown): ArenaEntry[] | null {
  if (!Array.isArray(x) || x.length > 6) return null;
  const out: ArenaEntry[] = [];
  for (const e of x) {
    if (!isObj(e)) return null;
    if (!isStr(e.species, 32) || !ID_RE.test(e.species)) return null;
    if (!isStr(e.uid, 40) || !UID_RE.test(e.uid)) return null;
    if (!Array.isArray(e.moves) || e.moves.length > 4) return null;
    const moves: string[] = [];
    for (const m of e.moves) {
      if (!isStr(m, 32) || !ID_RE.test(m)) return null;
      moves.push(m);
    }
    const entry: ArenaEntry = { species: e.species, uid: e.uid, moves };
    if (e.nickname !== undefined) {
      if (!isStr(e.nickname, 40)) return null;
      const nick = cleanName(e.nickname, '');
      if (nick) entry.nickname = nick;
    }
    out.push(entry);
  }
  return out;
}

/** Parse one raw client frame. Returns the message or a short reason it was rejected. */
export function parseClientMessage(raw: string): ClientMessage | { error: string } {
  if (raw.length > MAX_CLIENT_MESSAGE) return { error: 'message too large' };
  let x: unknown;
  try { x = JSON.parse(raw); } catch { return { error: 'not JSON' }; }
  if (!isObj(x) || typeof x.t !== 'string') return { error: 'missing type' };
  switch (x.t) {
    case 'create':
      if (!isInt(x.v, 0, 1000)) return { error: 'missing version' };
      if (!isStr(x.name, 64)) return { error: 'bad name' };
      return { t: 'create', v: x.v, name: cleanName(x.name) };
    case 'join': {
      if (!isInt(x.v, 0, 1000)) return { error: 'missing version' };
      if (!isStr(x.name, 64)) return { error: 'bad name' };
      const code = typeof x.code === 'string' ? normalizeCode(x.code) : '';
      if (!isRoomCode(code)) return { error: 'bad room code' };
      return { t: 'join', v: x.v, code, name: cleanName(x.name) };
    }
    case 'resume': {
      if (!isInt(x.v, 0, 1000)) return { error: 'missing version' };
      const code = typeof x.code === 'string' ? normalizeCode(x.code) : '';
      if (!isRoomCode(code)) return { error: 'bad room code' };
      if (typeof x.token !== 'string' || !TOKEN_RE.test(x.token)) return { error: 'bad token' };
      return { t: 'resume', v: x.v, code, token: x.token };
    }
    case 'team': {
      const team = parseTeam(x.team);
      return team ? { t: 'team', team } : { error: 'bad team' };
    }
    case 'action': {
      const action = parseAction(x.action);
      if (!action) return { error: 'bad action' };
      if (!isInt(x.step, 0, 1e6)) return { error: 'bad step' };
      return { t: 'action', step: x.step, action };
    }
    case 'ready':
      return isInt(x.step, 0, 1e6) ? { t: 'ready', step: x.step } : { error: 'bad step' };
    case 'rematch': case 'newTeams': case 'leave': case 'ping':
      return { t: x.t };
    default:
      return { error: `unknown type ${String(x.t).slice(0, 20)}` };
  }
}

/** Light structural check of a server frame (the client trusts the server, but not the network). */
export function parseServerMessage(raw: string): ServerMessage | null {
  let x: unknown;
  try { x = JSON.parse(raw); } catch { return null; }
  if (!isObj(x) || typeof x.t !== 'string') return null;
  switch (x.t) {
    case 'welcome': return isRoomCode(x.code) && (x.you === 0 || x.you === 1) && typeof x.token === 'string' ? (x as ServerMessage) : null;
    case 'room': case 'start': return isObj(x.room) ? (x as ServerMessage) : null;
    case 'turn': return isObj(x.room) && Array.isArray(x.events) ? (x as ServerMessage) : null;
    case 'error': return typeof x.code === 'string' && typeof x.message === 'string' ? (x as ServerMessage) : null;
    case 'pong': case 'closed': return x as ServerMessage;
    default: return null;
  }
}

/** Friendly copy for server error codes. */
export const ERROR_TEXT: Record<ErrorCode, string> = {
  'bad-message': 'The server did not understand that.',
  'bad-version': 'Your game is out of date — please reload the page.',
  'rate-limited': 'Slow down a little!',
  'no-room': 'No room with that code. Check the letters and try again.',
  'room-full': 'That room already has two players.',
  'bad-token': 'That seat belongs to someone else.',
  'bad-team': 'That team breaks the arena rules.',
  'illegal-action': 'That move is not allowed right now.',
  stale: 'That choice was for an earlier turn.',
  'not-now': 'Not right now.',
  'server-full': 'The arena is full right now. Try again soon.',
};
