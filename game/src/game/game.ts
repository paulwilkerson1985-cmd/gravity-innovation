import { Renderer } from '../render/renderer';
import { animClock, flushTweens, pendingTweens, stepTweens } from '../render/anim';
import { chooseStarter, newPlayer, type PlayerState } from './state';
import { SaveError, SaveManager, downloadSave, parseSave, summarize, type SaveSummary } from './save';
import { getDex, type Dex } from '../engine';
import { loadPrefs } from '../ui/prefs';
import { closeAllModals } from '../ui/dom';
import type { BaseScene, SceneName } from '../scenes/base';

export interface GameOptions { seed: number; debug: boolean; saves?: SaveManager }

export type SavePeek = { summary: SaveSummary } | { error: string } | null;

const AUTOSAVE_DEBOUNCE_MS = 300;

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
  readonly saves: SaveManager;
  /**
   * Autosave and play-time tracking only run once the player has started or continued an
   * adventure from the title screen — `?scene=` debug/test entry points never touch the save.
   */
  saveEnabled = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSave: { promise: Promise<boolean>; resolve: (ok: boolean) => void } | null = null;
  private writing: Promise<unknown> = Promise.resolve();
  private playAcc = 0;
  /** True while a battle runs: its effects are saved together when it ends (docs/DECISIONS.md). */
  private savesPaused = false;

  constructor(root: HTMLElement, readonly opts: GameOptions) {
    getDex(); // validate content at load
    this.renderer = new Renderer(root);
    this.overlay = document.createElement('div');
    this.overlay.id = 'overlay';
    root.appendChild(this.overlay);
    this.player = newPlayer(opts.seed);
    this.saves = opts.saves ?? new SaveManager();
    const flush = () => { if (document.visibilityState === 'hidden') void this.save({ now: true }); };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', () => void this.save({ now: true }));
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

  hasScene(name: string): boolean {
    return this.factories.has(name as SceneName);
  }

  // ---------------------------------------------------------------- saves

  /** Start a fresh adventure (the old save is only overwritten on the next save). */
  newGame() {
    this.player = newPlayer(this.opts.seed);
    this.saveEnabled = true;
    this.playAcc = 0;
    this.applyDevicePrefs();
  }

  /** The text speed last chosen on this device wins over the one stored in a save. */
  private applyDevicePrefs() {
    const ts = loadPrefs().textSpeed;
    if (ts) this.player.settings = { ...this.player.settings, textSpeed: ts };
  }

  /**
   * Save the current player. Debounced (calls within ~300 ms coalesce) unless `now` is set.
   * Resolves true when written; never throws/rejects. No-op (false) before an adventure starts.
   */
  save(opts: { now?: boolean } = {}): Promise<boolean> {
    if (!this.saveEnabled || this.savesPaused || this.player.party.length === 0) return Promise.resolve(false);
    if (!this.pendingSave) {
      let resolve!: (ok: boolean) => void;
      const promise = new Promise<boolean>((r) => { resolve = r; });
      this.pendingSave = { promise, resolve };
    }
    const pending = this.pendingSave;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const run = () => {
      this.saveTimer = null;
      this.pendingSave = null;
      if (this.savesPaused || !this.saveEnabled) { pending.resolve(false); return; }
      const snapshot = structuredClone(this.player);
      this.writing = this.writing.then(() => this.saves.write(snapshot)).then(() => pending.resolve(true), () => pending.resolve(false));
    };
    if (opts.now) run();
    else this.saveTimer = setTimeout(run, AUTOSAVE_DEBOUNCE_MS);
    return pending.promise;
  }

  /**
   * A battle is starting: write any pending autosave now, then hold autosaves (pagehide,
   * debounced) until `resumeSaves`. Spent orbs/items and battle HP are saved together with the
   * outcome, never half-way; closing the tab mid-battle resumes from just before it.
   */
  pauseSaves() {
    if (this.saveTimer) void this.save({ now: true });
    this.savesPaused = true;
  }

  resumeSaves() {
    this.savesPaused = false;
  }

  /** Is there anything in the save slot (even a damaged one)? */
  async hasSave(): Promise<boolean> {
    try { return await this.saves.exists(); } catch { return false; }
  }

  /** Summary of the stored save for the title screen, an error message if it is damaged, or null. */
  async peekSave(): Promise<SavePeek> {
    try {
      const s = await this.saves.read();
      return s ? { summary: summarize(s.player, s.savedAt) } : null;
    } catch (e) {
      return { error: e instanceof SaveError ? e.message : 'Your save could not be read.' };
    }
  }

  /** Load the stored save into `player`. Resolves false (never throws) if there is none or it is damaged. */
  async load(): Promise<boolean> {
    try {
      const s = await this.saves.read();
      if (!s) return false;
      this.player = s.player;
      this.saveEnabled = true;
      this.playAcc = 0;
      this.applyDevicePrefs();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Leave the running adventure (entering the title screen): flush a pending autosave, then
   * stop autosave + play time and drop the in-memory player, so nothing stale can be written
   * over a save imported or chosen later (e.g. by a pagehide autosave).
   */
  endAdventure() {
    if (this.saveEnabled && this.saveTimer) void this.save({ now: true });
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.saveEnabled = false;
    this.playAcc = 0;
    this.player = newPlayer(this.opts.seed);
  }

  /** Store an already parsed/validated save in the slot (title → Import). Never autosaves the old adventure afterwards. */
  async storeImported(player: PlayerState): Promise<void> {
    this.endAdventure();
    await this.writing.catch(() => {}); // any queued write of the old adventure lands first
    const write = this.saves.write(player);
    this.writing = write.catch(() => {});
    await write;
  }

  /** Validate + migrate save text and store it in the slot. Throws SaveError with a friendly message. */
  async importSave(text: string): Promise<SaveSummary> {
    const parsed = parseSave(text);
    await this.storeImported(parsed.player);
    return summarize(parsed.player, parsed.savedAt);
  }

  /** Download the current adventure as a JSON file. Returns the file name, or null on failure. */
  exportSave(): string | null {
    try { return downloadSave(this.player); } catch { return null; }
  }

  /** The scene change in progress, if any; goto() calls made meanwhile are queued (latest wins). */
  private transition: Promise<void> | null = null;
  private queued: { name: SceneName; params: Record<string, unknown>; done: () => void } | null = null;

  /**
   * Change scene. Re-entrancy safe: while a transition is in flight (double clicks, clicks
   * during the fade, a scene redirecting from its own enter) only the latest request is kept
   * and runs right after; superseded requests resolve without changing scene.
   */
  goto(name: SceneName, params: Record<string, unknown> = {}): Promise<void> {
    if (!this.factories.has(name)) return Promise.reject(new Error(`unknown scene ${name}`));
    if (this.transition) {
      this.queued?.done();
      return new Promise((done) => { this.queued = { name, params, done }; });
    }
    const t = this.runGoto(name, params);
    this.transition = t;
    const settle = () => {
      if (this.transition === t) this.transition = null;
      const q = this.queued;
      this.queued = null;
      if (q) void this.goto(q.name, q.params).then(q.done, q.done);
    };
    return t.then(settle, (err: unknown) => { settle(); throw err; });
  }

  private async runGoto(name: SceneName, params: Record<string, unknown>) {
    const f = this.factories.get(name)!;
    closeAllModals();
    if (name === 'title') this.endAdventure();
    if (name === 'route') {
      const r = String(params.route ?? 'meadow');
      if (getDex().routes.has(r)) this.player.lastRoute = r;
    }
    this.idle = false;
    flushTweens();
    this.overlay.inert = true; // no clicks on the old scene's UI while it fades out
    try {
      await this.fade(true, name === 'battle' ? 'battle' : 'plain');
      this.current?.exit();
      this.overlay.inert = false;
      const s = f(this);
      this.current = s;
      s.resize(this.renderer.width, this.renderer.height);
      document.body.dataset.scene = name;
      const entering = s.enter(params);
      void this.fade(false, 'plain');
      await entering;
    } finally {
      this.overlay.inert = false;
    }
    if (name === 'route') void this.save();
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
    this.tickPlayTime(dt);
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

  /** Count play time while an adventure is running and the tab is visible. */
  private tickPlayTime(dt: number) {
    if (!this.saveEnabled || document.hidden || this.player.party.length === 0 || this.current?.name === 'title') return;
    this.playAcc += dt;
    if (this.playAcc >= 1) {
      const whole = Math.floor(this.playAcc);
      this.player.playTime = (this.player.playTime || 0) + whole;
      this.playAcc -= whole;
    }
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
