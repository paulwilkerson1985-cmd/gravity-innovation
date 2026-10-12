// window.__game: deterministic test/debug surface used by Playwright.
import { animClock, flushTweens, pendingTweens } from '../render/anim';
import type { Game } from '../game/game';
import type { SceneName } from '../scenes/base';
import type { BattleScene } from '../scenes/battle';
import { withDebugParty, withDefeated, type DebugEntry } from '../game/progress';
import { chooseAction, type Action } from '../engine';
import type { BagId } from '../game/state';
import { openGameMenu } from '../ui/menu';
import { makeCreature } from '../engine';
import { PARTY_MAX } from '../game/state';

export interface GameHooks {
  scene(): string | null;
  player(): unknown;
  battle(): unknown;
  goto(name: SceneName, params?: Record<string, unknown>): Promise<void>;
  setFast(on: boolean): void;
  setSpeed(k: number): void;
  skip(): void;
  idle(): boolean;
  waitIdle(timeoutMs?: number): Promise<boolean>;
  canvasStats(): { distinct: number; nonBlack: number; samples: number } | null;
  renderInfo(): { calls: number; triangles: number };
  seed: number;
  // ---- meta (saves & menus)
  save(): Promise<boolean>;
  load(): Promise<boolean>;
  hasSave(): Promise<boolean>;
  saveBackend(): string;
  openMenu(): void;
  /** Debug: give the player a kin (party if room, else box). */
  addKin(species: string, level?: number): void;
  /** Debug: shallow-patch the player state (e.g. { money: 5000 }). */
  patchPlayer(patch: Record<string, unknown>): void;
  // ---- adventure (XP, trainers, evolution)
  /** Debug: replace the party, e.g. [{ species: 'ashkit', level: 13, xpToNext: 1 }]. */
  debugSetParty(entries: DebugEntry[]): void;
  /** Debug: mark trainers as defeated (opens routes; the Champion also sets the flag). */
  debugDefeat(...trainerIds: string[]): void;
  /** Debug: set how many of a bag item / orb the player holds. */
  debugGive(id: BagId, count: number): void;
  /** Debug: what the Ace AI would do for your side right now (lets e2e play strong battles via the UI). */
  debugSuggest(): Action | null;
  // ---- arena (PvP)
  /** Snapshot of the current arena scene (lobby/builder, battle or victory), else null. */
  arena(): Record<string, unknown> | null;
}

export function installHooks(game: Game) {
  const hooks: GameHooks = {
    seed: game.opts.seed,
    scene: () => game.current?.name ?? null,
    player: () => structuredClone(game.player),
    battle: () => (game.current?.name === 'battle' ? structuredClone((game.current as BattleScene).snapshot()) : null),
    goto: (name, params) => game.goto(name, params),
    setFast: (on) => { animClock.instant = on; if (on) flushTweens(); },
    setSpeed: (k) => { animClock.speed = k; },
    skip: () => flushTweens(),
    idle: () => game.idle && pendingTweens() === 0,
    waitIdle: (timeoutMs = 10000) => new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        if (game.idle && pendingTweens() === 0) return resolve(true);
        if (performance.now() - t0 > timeoutMs) return resolve(false);
        setTimeout(tick, 30);
      };
      tick();
    }),
    canvasStats: () => (game.current ? game.renderer.sample(game.current.scene, game.current.camera) : null),
    renderInfo: () => ({ calls: game.renderer.gl.info.render.calls, triangles: game.renderer.gl.info.render.triangles }),
    save: () => { game.saveEnabled = true; return game.save({ now: true }); },
    load: () => game.load(),
    hasSave: () => game.hasSave(),
    saveBackend: () => game.saves.backendKind,
    openMenu: () => { openGameMenu(game); },
    addKin: (speciesId, level = 5) => {
      const p = structuredClone(game.player);
      const c = makeCreature(speciesId, level, `c${p.nextUid++}`);
      if (p.party.length < PARTY_MAX) p.party.push(c); else p.box.push(c);
      if (!p.seen.includes(speciesId)) p.seen.push(speciesId);
      if (!p.caught.includes(speciesId)) p.caught.push(speciesId);
      game.player = p;
    },
    patchPlayer: (patch) => { game.player = { ...game.player, ...structuredClone(patch) } as typeof game.player; },
    debugSetParty: (entries) => { game.player = withDebugParty(game.player, entries); },
    debugDefeat: (...ids) => { game.player = withDefeated(game.player, ids); },
    debugSuggest: () => {
      if (game.current?.name !== 'battle') return null;
      const st = (game.current as BattleScene).snapshot();
      return st.phase === 'over' ? null : chooseAction(st, 0, 'ace');
    },
    debugGive: (id, count) => { game.player = { ...game.player, bag: { ...game.player.bag, [id]: Math.max(0, Math.floor(count)) } }; },
    arena: () => {
      const cur = game.current as unknown as { arenaSnapshot?: () => Record<string, unknown> } | null;
      return cur?.arenaSnapshot ? structuredClone(cur.arenaSnapshot()) : null;
    },
  };
  (window as unknown as { __game: GameHooks }).__game = hooks;
}
