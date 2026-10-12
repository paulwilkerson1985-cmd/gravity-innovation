// window.__game: deterministic test/debug surface used by Playwright.
import { animClock, flushTweens, pendingTweens } from '../render/anim';
import type { Game } from '../game/game';
import type { SceneName } from '../scenes/base';
import type { BattleScene } from '../scenes/battle';

export interface GameHooks {
  scene(): string | null;
  player(): unknown;
  battle(): unknown;
  goto(name: SceneName, params?: Record<string, unknown>): Promise<void>;
  setFast(on: boolean): void;
  skip(): void;
  idle(): boolean;
  waitIdle(timeoutMs?: number): Promise<boolean>;
  canvasStats(): { distinct: number; nonBlack: number; samples: number } | null;
  renderInfo(): { calls: number; triangles: number };
  seed: number;
}

export function installHooks(game: Game) {
  const hooks: GameHooks = {
    seed: game.opts.seed,
    scene: () => game.current?.name ?? null,
    player: () => structuredClone(game.player),
    battle: () => (game.current?.name === 'battle' ? structuredClone((game.current as BattleScene).snapshot()) : null),
    goto: (name, params) => game.goto(name, params),
    setFast: (on) => { animClock.instant = on; if (on) flushTweens(); },
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
  };
  (window as unknown as { __game: GameHooks }).__game = hooks;
}
