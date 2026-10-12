import { Renderer } from '../render/renderer';
import { animClock, flushTweens, pendingTweens, stepTweens } from '../render/anim';
import { chooseStarter, newPlayer, type PlayerState } from './state';
import { getDex, type Dex } from '../engine';
import type { BaseScene, SceneName } from '../scenes/base';

export interface GameOptions { seed: number; debug: boolean }

type Factory = (g: Game) => BaseScene;

export class Game {
  readonly renderer: Renderer;
  readonly overlay: HTMLElement;
  player: PlayerState;
  current: BaseScene | null = null;
  private factories = new Map<SceneName, Factory>();
  private last = 0;
  private fpsEl: HTMLElement | null = null;
  private frames = 0;
  private fpsT = 0;
  /** Resolvers waiting for the UI to become idle (awaiting player input). */
  idle = false;

  constructor(root: HTMLElement, readonly opts: GameOptions) {
    getDex(); // validate content at load
    this.renderer = new Renderer(root);
    this.overlay = document.createElement('div');
    this.overlay.id = 'overlay';
    root.appendChild(this.overlay);
    this.player = newPlayer(opts.seed);
    if (opts.debug) {
      this.fpsEl = document.createElement('div');
      this.fpsEl.id = 'fps';
      root.appendChild(this.fpsEl);
    }
    window.addEventListener('resize', () => this.onResize());
    requestAnimationFrame((t) => this.loop(t));
  }

  register(name: SceneName, f: Factory) {
    this.factories.set(name, f);
  }

  async goto(name: SceneName, params: Record<string, unknown> = {}) {
    const f = this.factories.get(name);
    if (!f) throw new Error(`unknown scene ${name}`);
    this.idle = false;
    flushTweens();
    await this.fade(true, name === 'battle' ? 'battle' : 'plain');
    this.current?.exit();
    const s = f(this);
    this.current = s;
    s.resize(this.renderer.width, this.renderer.height);
    document.body.dataset.scene = name;
    const entering = s.enter(params);
    void this.fade(false, 'plain');
    await entering;
  }

  private curtain: HTMLElement | null = null;

  /** Scene transition: a quick wipe (battles get a striped flash). Skipped in instant mode. */
  private fade(cover: boolean, style: 'plain' | 'battle'): Promise<void> {
    if (!this.curtain) {
      this.curtain = document.createElement('div');
      this.curtain.id = 'curtain';
      document.getElementById('app')!.appendChild(this.curtain);
    }
    const c = this.curtain;
    if (animClock.instant || !this.current) { c.className = ''; return Promise.resolve(); }
    c.className = `${style} ${cover ? 'cover' : 'reveal'}`;
    return new Promise((r) => setTimeout(r, cover ? (style === 'battle' ? 520 : 220) : 0));
  }

  private onResize() {
    this.renderer.resize();
    this.current?.resize(this.renderer.width, this.renderer.height);
  }

  private loop(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000 || 0);
    this.last = now;
    stepTweens(dt);
    const s = this.current;
    if (s) {
      s.update(dt, animClock.time);
      this.renderer.render(s.scene, s.camera);
    }
    if (this.fpsEl) {
      this.frames++;
      this.fpsT += dt;
      if (this.fpsT >= 0.5) {
        const info = this.renderer.gl.info.render;
        this.fpsEl.textContent = `${Math.round(this.frames / this.fpsT)} fps · ${info.calls} calls · ${info.triangles} tris`;
        this.frames = 0;
        this.fpsT = 0;
      }
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  dex(): Dex {
    return getDex();
  }

  /** Used when a scene is opened directly (?scene=…) without a starter chosen. */
  debugParty() {
    if (this.player.party.length === 0) this.player = chooseStarter(this.player, 'ashkit');
  }

  busy(): boolean {
    return pendingTweens() > 0 || !this.idle;
  }
}
