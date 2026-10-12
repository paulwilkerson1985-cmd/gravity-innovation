// Core data and battle types. Everything here is plain, JSON-serializable data.

export const ELEMENTS = ['Flame', 'Tide', 'Flora', 'Spark', 'Terra', 'Gale'] as const;
export type Element = (typeof ELEMENTS)[number];
export type MoveElement = Element | 'Neutral';

export type StatKey = 'hp' | 'atk' | 'def' | 'spe';
export type Stats = Record<StatKey, number>;
export type StageKey = 'atk' | 'def' | 'spe';
export type StatusId = 'burn' | 'shock' | 'drowsy';
export type OrbId = 'orb' | 'bright' | 'star';
export type ItemId = 'tonic' | 'mega-tonic' | 'full-tonic' | 'remedy' | 'revive-seed';
export type AiTier = 'rookie' | 'skilled' | 'ace';

export type PartKind =
  | 'ears' | 'pointyEars' | 'horns' | 'horn' | 'tail' | 'flameTail' | 'leafTail' | 'finTail'
  | 'wings' | 'fins' | 'dorsal' | 'spikes' | 'leaf' | 'crest' | 'antennae' | 'shell'
  | 'mane' | 'tusks' | 'arms' | 'crystals' | 'whiskers' | 'flame';

export type BodyKind = 'quad' | 'blob' | 'biped' | 'bird' | 'fish' | 'bug' | 'serpent';

export interface LookData {
  body: BodyKind;
  /** Overall size multiplier (stage 1 ≈ 0.8, stage 3 ≈ 1.35). */
  scale: number;
  colors: { main: string; belly: string; accent: string };
  parts: PartKind[];
}

export interface SpeciesData {
  id: string;
  name: string;
  types: Element[];
  base: Stats;
  catchRate: number;
  xpYield: number;
  evolvesTo?: { species: string; level: number };
  /** [level, moveId] pairs, ascending by level. */
  learnset: [number, string][];
  look: LookData;
  blurb: string;
}

export type MoveEffect =
  | { kind: 'status'; status: StatusId; chance: number }
  | { kind: 'stage'; who: 'self' | 'foe'; stat: StageKey; delta: number; chance: number }
  | { kind: 'heal'; fraction: number }
  | { kind: 'recoil'; fraction: number };

export interface MoveData {
  id: string;
  name: string;
  type: MoveElement;
  category: 'attack' | 'status';
  power: number;
  /** 1–100. 100 never misses. */
  accuracy: number;
  pp: number;
  priority: number;
  effect?: MoveEffect;
  blurb: string;
}

export interface EncounterSlot { species: string; weight: number; min: number; max: number }
export interface HotspotData {
  id: string;
  kind: 'grass' | 'cave' | 'water' | 'trainer';
  label: string;
  /** Wild encounter table (empty for trainer hotspots). */
  table: EncounterSlot[];
  /** Trainer id for kind 'trainer'. */
  trainer?: string;
}
export interface RouteData {
  id: string;
  name: string;
  levelRange: [number, number];
  theme: 'meadow' | 'ridge' | 'coast' | 'summit';
  hotspots: HotspotData[];
  /** Trainer ids that must all be defeated before this route opens. */
  unlockAfter?: string[];
}

export type ItemEffect =
  | { kind: 'heal'; amount: number | 'full' }
  | { kind: 'cure' }
  | { kind: 'revive'; fraction: number };

export interface ItemData {
  id: ItemId;
  name: string;
  price: number;
  effect: ItemEffect;
  blurb: string;
}

export interface TrainerPartyEntry { species: string; level: number; moves?: string[] }

export interface TrainerData {
  id: string;
  name: string;
  title: string;
  routeId: string;
  ai: AiTier;
  party: TrainerPartyEntry[];
  /** Money paid out on victory. */
  reward: number;
  intro: string;
  defeat: string;
}

/** A creature owned by a player, outside of battle. */
export interface OwnedCreature {
  uid: string;
  species: string;
  nickname?: string;
  level: number;
  xp: number;
  hp: number;
  moves: { id: string; pp: number }[];
  status: StatusId | null;
}

// ---------------------------------------------------------------- battle

export interface BattleMove { id: string; pp: number; maxPp: number }

export interface BattleCreature {
  uid: string;
  species: string;
  name: string;
  level: number;
  types: Element[];
  stats: Stats;
  hp: number;
  moves: BattleMove[];
  status: StatusId | null;
  sleepTurns: number;
  stages: Record<StageKey, number>;
}

export interface Side {
  name: string;
  controller: 'human' | 'ai';
  ai?: AiTier;
  isWild: boolean;
  party: BattleCreature[];
  active: number;
  /** Turn of this side's last voluntary (choose-phase) switch; used by the AI to avoid ping-pong. */
  lastSwitchTurn?: number;
}

export type BattleKind = 'wild' | 'trainer' | 'pvp';

export interface BattleOutcome {
  winner: 0 | 1 | null;
  reason: 'ko' | 'caught' | 'ran' | 'forfeit' | 'turnLimit';
}

/** What the human sides may do besides fighting. catch/run additionally require a wild foe. */
export interface BattleRules { items: boolean; catch: boolean; run: boolean }

export interface BattleState {
  v: 1;
  kind: BattleKind;
  rules: BattleRules;
  rng: number;
  turn: number;
  phase: 'choose' | 'replace' | 'over';
  sides: [Side, Side];
  runAttempts: number;
  /** uids that were active for side 0 against each foe uid — used for XP sharing. */
  participants: Record<string, string[]>;
  outcome: BattleOutcome | null;
  turnLimit: number;
}

export type Action =
  | { type: 'move'; index: number }
  | { type: 'switch'; to: number }
  | { type: 'catch'; orb: OrbId }
  /** Use a bag item on a party member (index into the side's party). Human sides only. */
  | { type: 'item'; item: ItemId; target: number }
  | { type: 'run' }
  | { type: 'forfeit' }
  | { type: 'pass' };

export type CantMoveReason = 'asleep' | 'shocked';

export type BattleEvent =
  | { t: 'turn'; turn: number }
  | { t: 'send'; side: 0 | 1; slot: number; name: string; species: string; hp: number; maxHp: number; level: number; status: StatusId | null }
  | { t: 'move'; side: 0 | 1; name: string; move: string; moveName: string; moveType: MoveElement }
  | { t: 'miss'; side: 0 | 1; name: string }
  | { t: 'damage'; side: 0 | 1; name: string; amount: number; hp: number; maxHp: number; mult: number; crit: boolean; source: 'move' | 'burn' | 'recoil' }
  /** `slot` is set when healing came from an item: the party index healed (may not be the active one). */
  | { t: 'heal'; side: 0 | 1; name: string; amount: number; hp: number; maxHp: number; slot?: number }
  | { t: 'item'; side: 0 | 1; item: ItemId; itemName: string; target: number; name: string }
  | { t: 'cure'; side: 0 | 1; slot: number; name: string; status: StatusId }
  | { t: 'revive'; side: 0 | 1; slot: number; name: string; hp: number; maxHp: number }
  | { t: 'status'; side: 0 | 1; name: string; status: StatusId }
  | { t: 'statusFail'; side: 0 | 1; name: string }
  | { t: 'stage'; side: 0 | 1; name: string; stat: StageKey; delta: number; value: number; capped: boolean }
  | { t: 'cantMove'; side: 0 | 1; name: string; reason: CantMoveReason }
  | { t: 'wake'; side: 0 | 1; name: string }
  | { t: 'faint'; side: 0 | 1; name: string }
  | { t: 'catch'; orb: OrbId; shakes: number; caught: boolean; name: string; probability: number }
  | { t: 'run'; success: boolean }
  | { t: 'forfeit'; side: 0 | 1 }
  | { t: 'needReplace'; side: 0 | 1 }
  | { t: 'end'; winner: 0 | 1 | null; reason: BattleOutcome['reason'] };

export interface TurnResult { state: BattleState; events: BattleEvent[] }
