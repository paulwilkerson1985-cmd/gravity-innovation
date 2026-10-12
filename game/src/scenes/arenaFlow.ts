// Local (hotseat / vs-CPU) turn flow, kept free of DOM and three so it can be unit-tested.
// The battle scene asks a TurnCollector which seat must choose next, shows the curtain
// between human seats, and resolves the turn once every seat has an action.
import { chooseAction, isLegal, legalActions, type Action, type ArenaEntry, type BattleState } from '../engine';

export type Seat = 0 | 1;
export type ArenaMode = 'hotseat' | 'cpu' | 'online';

/** Everything needed to (re)start a local match. */
export interface LocalMatchSetup {
  mode: 'hotseat' | 'cpu';
  names: [string, string];
  teams: [ArenaEntry[], ArenaEntry[]];
  /** Base seed; every rematch derives a fresh battle seed from it. */
  seed: number;
  /** 1 for the first match, +1 per rematch. */
  round: number;
}

export interface MatchSummary {
  mode: ArenaMode;
  names: [string, string];
  teams: [ArenaEntry[], ArenaEntry[]];
  winner: Seat | null;
  reason: 'ko' | 'forfeit' | 'turnLimit' | 'caught' | 'ran';
  turns: number;
  kos: [number, number];
  /** Remaining HP fraction per team member, by side (for the podium). */
  hp: [number[], number[]];
}

/** Does `seat` have a real choice to make right now (more than a forced pass)? */
export function needsChoice(state: BattleState, seat: Seat): boolean {
  if (state.phase === 'over') return false;
  const legal = legalActions(state, seat);
  return !(legal.length === 1 && legal[0]!.type === 'pass');
}

/**
 * Collects one action per seat for the current battle step. Human seats are asked in
 * seat order; CPU seats decide up front from the same (pre-turn) state, so the AI never
 * sees the human's choice.
 */
export class TurnCollector {
  readonly actions: [Action | null, Action | null] = [null, null];
  private readonly order: Seat[] = [];

  constructor(readonly state: BattleState, humanSeats: readonly Seat[], cpu: (state: BattleState, seat: Seat) => Action = (s, seat) => chooseAction(s, seat, 'ace')) {
    for (const seat of [0, 1] as const) {
      if (!needsChoice(state, seat)) this.actions[seat] = { type: 'pass' };
      else if (humanSeats.includes(seat)) this.order.push(seat);
      else this.actions[seat] = cpu(state, seat);
    }
  }

  /** The next human seat that must choose, or null when complete. */
  next(): Seat | null {
    return this.order.find((s) => this.actions[s] === null) ?? null;
  }

  /** Human seats that will be asked this step (in order). */
  get humans(): readonly Seat[] {
    return this.order;
  }

  submit(seat: Seat, action: Action) {
    if (this.next() !== seat) throw new Error(`not seat ${seat}'s turn to choose`);
    if (!isLegal(this.state, seat, action)) throw new Error(`illegal action ${JSON.stringify(action)}`);
    this.actions[seat] = action;
  }

  done(): boolean {
    return this.next() === null;
  }

  result(): [Action, Action] {
    if (!this.done()) throw new Error('turn not complete');
    return this.actions as [Action, Action];
  }
}

/**
 * Hotseat privacy rule: a curtain is needed before a human seat chooses whenever another
 * human seat has chosen (or will choose) on this device in the same step, and before the
 * shared playback once more than one human chose.
 */
export function curtainBefore(mode: ArenaMode, collector: TurnCollector, seat: Seat): boolean {
  if (mode !== 'hotseat') return false;
  const humans = collector.humans;
  return humans.length > 1 && humans.indexOf(seat) > 0;
}

export function curtainBeforePlayback(mode: ArenaMode, collector: TurnCollector): boolean {
  return mode === 'hotseat' && collector.humans.length > 1;
}
