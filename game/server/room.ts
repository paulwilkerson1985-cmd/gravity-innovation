// One server-authoritative arena room: two seats, hidden commits, turn timer, reconnects.
// Transport-agnostic: talks to players through `Conn` and to time through `RoomClock`,
// so tests can drive it without sockets or real time.
import {
  Rng, createArenaBattle, hashSeed, isLegal, legalActions, resolveTurn, validateArenaTeam,
  type Action, type ArenaEntry, type BattleEvent, type BattleState,
} from '../src/engine';
import {
  DEFAULT_TURN_SECONDS, MAX_TIMEOUTS,
  type ErrorCode, type MatchStats, type PlayerView, type RoomPhase, type RoomView, type Seat, type ServerMessage,
} from '../src/net/protocol';

export interface Conn { send(msg: ServerMessage): void }

export interface RoomClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: RoomClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface RoomOptions {
  turnMs: number;
  /** Upper bound on the playback allowance added before the decision timer starts. */
  maxPlaybackMs: number;
  /** Playback allowance per event. */
  perEventMs: number;
}

export const DEFAULT_ROOM_OPTIONS: RoomOptions = { turnMs: DEFAULT_TURN_SECONDS * 1000, maxPlaybackMs: 30_000, perEventMs: 900 };

interface Player {
  name: string;
  token: string;
  conn: Conn | null;
  team: ArenaEntry[] | null;
  lastTeam: ArenaEntry[] | null;
  /** Consecutive timeouts. */
  timeouts: number;
  wantsRematch: boolean;
  left: boolean;
  /** Finished watching the playback of the current step. */
  readyStep: number;
}

export type RoomResult<T = void> = { ok: true; value: T } | { ok: false; code: ErrorCode; message: string };
const fail = (code: ErrorCode, message: string): { ok: false; code: ErrorCode; message: string } => ({ ok: false, code, message });

const other = (s: Seat): Seat => (s === 0 ? 1 : 0);

/** End the battle immediately as a forfeit by `seat` (used when leaving, or timing out during a replacement). */
export function forceForfeit(state: BattleState, seat: Seat): { state: BattleState; events: BattleEvent[] } {
  const s = structuredClone(state);
  const winner = other(seat);
  s.phase = 'over';
  s.outcome = { winner, reason: 'forfeit' };
  return { state: s, events: [{ t: 'forfeit', side: seat }, { t: 'end', winner, reason: 'forfeit' }] };
}

/** Does `seat` have a real decision to make right now? */
export function mustAct(state: BattleState, seat: Seat): boolean {
  if (state.phase === 'over') return false;
  const legal = legalActions(state, seat);
  return !(legal.length === 1 && legal[0]!.type === 'pass');
}

/** The action the server picks for a player who ran out of time: a random legal move (never a forfeit). */
export function autoAction(state: BattleState, seat: Seat, step: number): Action {
  const legal = legalActions(state, seat).filter((a) => a.type !== 'forfeit');
  const moves = legal.filter((a) => a.type === 'move');
  const pool = moves.length ? moves : legal;
  return new Rng(hashSeed(state.rng, step, seat, 0x71e0)).pick(pool);
}

export class Room {
  readonly players: [Player | null, Player | null] = [null, null];
  phase: RoomPhase = 'lobby';
  battle: BattleState | null = null;
  step = 0;
  private pending: [Action | null, Action | null] = [null, null];
  private deadline: number | null = null;
  private timer: unknown = null;
  private matches = 0;
  stats: MatchStats = { turns: 0, kos: [0, 0], timeouts: [0, 0] };
  lastActivity: number;
  /** Set once both seats have left; the server drops the room. */
  closed = false;

  constructor(
    readonly code: string,
    private readonly clock: RoomClock,
    private readonly makeSeed: () => number,
    private readonly opts: RoomOptions = DEFAULT_ROOM_OPTIONS,
  ) {
    this.lastActivity = clock.now();
  }

  // ---------------------------------------------------------------- seats

  /** Seat a new player. Returns their seat. */
  add(name: string, token: string, conn: Conn): RoomResult<Seat> {
    const seat = this.players.findIndex((p) => p === null);
    if (seat < 0 || this.phase !== 'lobby') return fail('room-full', 'room is full');
    this.players[seat] = { name, token, conn, team: null, lastTeam: null, timeouts: 0, wantsRematch: false, left: false, readyStep: -1 };
    this.touch();
    this.broadcast();
    return { ok: true, value: seat as Seat };
  }

  /** Reattach a connection using a seat token. */
  resume(token: string, conn: Conn): RoomResult<Seat> {
    const seat = this.players.findIndex((p) => p?.token === token && !p.left);
    if (seat < 0) return fail('bad-token', 'unknown token');
    this.players[seat]!.conn = conn;
    this.touch();
    this.broadcast();
    return { ok: true, value: seat as Seat };
  }

  disconnect(seat: Seat, conn: Conn) {
    const p = this.players[seat];
    if (!p || p.conn !== conn) return; // an older socket closing after a resume
    p.conn = null;
    this.touch();
    this.broadcast();
  }

  leave(seat: Seat) {
    const p = this.players[seat];
    if (!p) return;
    p.left = true;
    p.conn = null;
    p.wantsRematch = false;
    if (this.phase === 'battle' && this.battle) {
      const r = forceForfeit(this.battle, seat);
      const acts: [Action, Action] = [{ type: 'pass' }, { type: 'pass' }];
      acts[seat] = { type: 'forfeit' };
      this.finishStep(r.state, r.events, acts, [false, false]);
    } else if (this.phase === 'lobby') {
      this.players[seat] = null;
    }
    if (this.players.every((q) => q === null || q.left)) this.close();
    this.touch();
    this.broadcast();
  }

  connected(): number {
    return this.players.filter((p) => p?.conn).length;
  }

  // ---------------------------------------------------------------- lobby

  setTeam(seat: Seat, team: ArenaEntry[]): RoomResult {
    if (this.phase !== 'lobby') return fail('not-now', 'teams are locked during a battle');
    const errs = validateArenaTeam(team);
    if (errs.length) return fail('bad-team', errs.join('; '));
    const p = this.players[seat]!;
    p.team = team;
    p.lastTeam = team;
    this.touch();
    if (this.players.every((q) => q?.team && !q.left)) this.startBattle();
    else this.broadcast();
    return { ok: true, value: undefined };
  }

  private startBattle() {
    const [a, b] = this.players as [Player, Player];
    this.matches++;
    const seed = hashSeed(this.makeSeed(), this.matches) >>> 0;
    const { state, events } = createArenaBattle(seed, a.name, a.team!, b.name, b.team!);
    this.battle = state;
    this.phase = 'battle';
    this.step = 0;
    this.stats = { turns: 0, kos: [0, 0], timeouts: [0, 0] };
    for (const p of [a, b]) { p.timeouts = 0; p.wantsRematch = false; p.readyStep = -1; }
    this.beginDecision(events.length);
    for (const seat of [0, 1] as const) this.sendTo(seat, { t: 'start', events, room: this.view(seat) });
  }

  rematch(seat: Seat): RoomResult {
    if (this.phase !== 'over') return fail('not-now', 'no finished match');
    const opp = this.players[other(seat)];
    if (!opp || opp.left) return fail('not-now', 'your opponent left');
    this.players[seat]!.wantsRematch = true;
    this.touch();
    if (this.players.every((p) => p?.wantsRematch)) this.startBattle();
    else this.broadcast();
    return { ok: true, value: undefined };
  }

  /** Back to team building for both players (keeps their last teams as a starting point). */
  newTeams(_seat: Seat): RoomResult {
    if (this.phase !== 'over') return fail('not-now', 'no finished match');
    this.phase = 'lobby';
    this.battle = null;
    this.step = 0;
    for (const p of this.players) if (p) { p.team = null; p.wantsRematch = false; }
    for (const [i, p] of this.players.entries()) if (p?.left) this.players[i] = null;
    this.touch();
    this.broadcast();
    return { ok: true, value: undefined };
  }

  // ---------------------------------------------------------------- battle

  submit(seat: Seat, step: number, action: Action): RoomResult {
    if (this.phase !== 'battle' || !this.battle) return fail('not-now', 'no battle in progress');
    if (step !== this.step) return fail('stale', `expected step ${this.step}`);
    if (!mustAct(this.battle, seat)) return fail('not-now', 'nothing to choose');
    if (this.pending[seat]) return fail('not-now', 'already chosen');
    if (!isLegal(this.battle, seat, action)) return fail('illegal-action', 'illegal action');
    this.pending[seat] = action;
    this.players[seat]!.timeouts = 0;
    this.touch();
    // A forfeit ends the match at once: the opponent's slot is filled with a placeholder
    // move (the forfeit always resolves first, so it never runs).
    const opp = other(seat);
    if (action.type === 'forfeit' && !this.pending[opp]) this.pending[opp] = autoAction(this.battle, opp, this.step);
    if (this.pending.every(Boolean)) this.resolve([false, false]);
    else this.broadcast();
    return { ok: true, value: undefined };
  }

  /** The client finished playing back `step`: start the decision clock as soon as everyone has. */
  ready(seat: Seat, step: number) {
    if (this.phase !== 'battle' || step !== this.step) return;
    this.players[seat]!.readyStep = step;
    const waiting = this.players.some((p) => p?.conn && p.readyStep !== this.step);
    if (!waiting && this.deadline !== null) {
      const d = this.clock.now() + this.opts.turnMs;
      if (d < this.deadline) { this.setDeadline(d); this.broadcast(); }
    }
  }

  private beginDecision(eventCount: number) {
    const battle = this.battle!;
    this.pending = [null, null];
    for (const seat of [0, 1] as const) if (!mustAct(battle, seat)) this.pending[seat] = { type: 'pass' };
    const playback = Math.min(this.opts.maxPlaybackMs, 1500 + eventCount * this.opts.perEventMs);
    this.setDeadline(this.clock.now() + playback + this.opts.turnMs);
  }

  private setDeadline(at: number | null) {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.deadline = at;
    if (at !== null) this.timer = this.clock.setTimeout(() => this.onTimeout(), Math.max(0, at - this.clock.now()));
  }

  private onTimeout() {
    this.timer = null;
    if (this.phase !== 'battle' || !this.battle) return;
    const timedOut: [boolean, boolean] = [false, false];
    for (const seat of [0, 1] as const) {
      if (this.pending[seat]) continue;
      const p = this.players[seat]!;
      p.timeouts++;
      this.stats.timeouts[seat]++;
      timedOut[seat] = true;
      if (p.timeouts >= MAX_TIMEOUTS) {
        if (this.battle.phase === 'choose') this.pending[seat] = { type: 'forfeit' };
        else {
          const r = forceForfeit(this.battle, seat);
          const acts: [Action, Action] = [{ type: 'pass' }, { type: 'pass' }];
          acts[seat] = { type: 'forfeit' };
          this.finishStep(r.state, r.events, acts, timedOut);
          return;
        }
      } else {
        this.pending[seat] = autoAction(this.battle, seat, this.step);
      }
    }
    this.resolve(timedOut);
  }

  private resolve(timedOut: [boolean, boolean]) {
    const actions = this.pending as [Action, Action];
    const r = resolveTurn(this.battle!, actions);
    this.finishStep(r.state, r.events, actions, timedOut);
  }

  private finishStep(state: BattleState, events: BattleEvent[], actions: [Action, Action], timedOut: [boolean, boolean]) {
    this.battle = state;
    this.step++;
    this.stats.turns = state.turn;
    for (const e of events) if (e.t === 'faint') this.stats.kos[other(e.side)]++;
    if (state.phase === 'over') {
      this.phase = 'over';
      this.pending = [null, null];
      this.setDeadline(null);
    } else {
      this.beginDecision(events.length);
    }
    this.touch();
    for (const seat of [0, 1] as const) this.sendTo(seat, { t: 'turn', step: this.step, events, actions, timedOut, room: this.view(seat) });
  }

  // ---------------------------------------------------------------- views

  view(seat: Seat): RoomView {
    const pv = (p: Player | null, i: number): PlayerView | null => p && {
      name: p.name, connected: !!p.conn, ready: !!p.team, committed: this.phase === 'battle' && !!this.pending[i] && !!this.battle && mustAct(this.battle, i as Seat),
      wantsRematch: p.wantsRematch, timeouts: p.timeouts, left: p.left,
    };
    const me = this.players[seat];
    const acting = this.phase === 'battle' && !!this.battle && mustAct(this.battle, seat);
    return {
      code: this.code,
      you: seat,
      phase: this.phase,
      players: [pv(this.players[0], 0), pv(this.players[1], 1)],
      step: this.step,
      // Never leak the rng state: a modded client could predict crits, misses and catches.
      battle: this.battle && { ...this.battle, rng: 0 },
      mustAct: acting && !this.pending[seat],
      yourAction: acting ? this.pending[seat] : null,
      deadlineIn: this.deadline === null ? null : Math.max(0, this.deadline - this.clock.now()),
      turnSeconds: Math.round(this.opts.turnMs / 1000),
      yourTeam: me?.team ?? me?.lastTeam ?? null,
      stats: structuredClone(this.stats),
    };
  }

  sendTo(seat: Seat, msg: ServerMessage) {
    this.players[seat]?.conn?.send(msg);
  }

  broadcast() {
    for (const seat of [0, 1] as const) this.sendTo(seat, { t: 'room', room: this.view(seat) });
  }

  private touch() {
    this.lastActivity = this.clock.now();
  }

  close() {
    this.closed = true;
    this.setDeadline(null);
  }

  /** Should the server drop this room? */
  expired(now: number, ttl: { empty: number; idle: number }): boolean {
    if (this.closed) return true;
    if (this.connected() === 0 && now - this.lastActivity > ttl.empty) return true;
    return now - this.lastActivity > ttl.idle;
  }
}
