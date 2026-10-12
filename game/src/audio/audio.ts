// Orbkin procedural audio: chiptune-style SFX, element move cues, creature cries and music,
// all synthesized with the Web Audio API. Every public method is a silent no-op when audio
// is unavailable (no AudioContext, not yet unlocked, headless test browser).
import { sfxTones, type SfxName, type MoveType, moveTones } from './sfxdefs';
import { cryParams, cryTones, type CryParams } from './cry';
import { compileTrack, type CompiledTrack } from './music/pattern';
import { TRACKS, type TrackName } from './music/tracks';
import { loadVolume, mergeVolume, saveVolume, type Volume } from './settings';
import { Synth } from './synth';
import { TrackPlayer } from './sequencer';

export type { SfxName, MoveType, TrackName, Volume };
export type MusicTrack = TrackName | 'none';

const LOOKAHEAD = 0.15; // seconds of audio scheduled ahead of the clock
const TICK_MS = 25; // how often the scheduler wakes up
const CROSSFADE = 0.35;

export interface AudioEngineOptions {
  /** Factory for the context; return null when audio should be disabled. */
  createContext?: () => AudioContext | null;
  /** Storage for volume settings (defaults to localStorage). */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

function defaultContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    // Headless test browsers: stay silent (and cheap) unless explicitly asked with ?audio=1.
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.webdriver && !/[?&]audio=1\b/.test(window.location?.search ?? '')) return null;
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    return Ctor ? new Ctor({ latencyHint: 'interactive' }) : null;
  } catch {
    return null;
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private synth: Synth | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private failed = false;
  private vol: Volume;
  private wanted: MusicTrack = 'none';
  private player: TrackPlayer | null = null;
  private fading: TrackPlayer[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSfx = new Map<string, number>();
  private compiled = new Map<TrackName, CompiledTrack>();
  private cries = new Map<string, CryParams>();
  private readonly createContext: () => AudioContext | null;
  private readonly storage: AudioEngineOptions['storage'];

  constructor(opts: AudioEngineOptions = {}) {
    this.createContext = opts.createContext ?? defaultContext;
    this.storage = opts.storage;
    this.vol = this.storage === undefined ? loadVolume() : loadVolume(this.storage);
  }

  /** Create/resume the AudioContext. Call from a user gesture (click/tap/key). Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx && !this.failed) this.init();
      const ctx = this.ctx;
      if (!ctx) return;
      if (ctx.state !== 'running') {
        const p = ctx.resume();
        if (p && typeof p.then === 'function') p.then(() => this.onRunning(), () => undefined);
      }
      this.onRunning();
    } catch {
      // never throw from audio
    }
  }

  /** Attach one-shot listeners that call unlock() on the first pointer/key/touch gesture. */
  installUnlock(target: EventTarget | undefined = typeof window !== 'undefined' ? window : undefined): void {
    if (!target) return;
    const events = ['pointerdown', 'keydown', 'touchend', 'mousedown'];
    const handler = () => {
      this.unlock();
      if (this.isUnlocked() || this.failed) for (const e of events) target.removeEventListener(e, handler, true);
    };
    for (const e of events) target.addEventListener(e, handler, { capture: true, passive: true });
  }

  isUnlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  sfx(name: SfxName): void {
    if (!this.ready()) return;
    try {
      const now = this.ctx!.currentTime;
      const last = this.lastSfx.get(name) ?? -1;
      if (now - last < 0.03) return; // collapse rapid repeats (xpTick spam)
      this.lastSfx.set(name, now);
      this.synth!.playTones(sfxTones(name), this.sfxBus!, now + 0.005);
    } catch { /* silent */ }
  }

  move(type: MoveType | string): void {
    if (!this.ready()) return;
    try {
      this.synth!.playTones(moveTones(type), this.sfxBus!, this.ctx!.currentTime + 0.005);
    } catch { /* silent */ }
  }

  /** Procedural creature cry. `pitch` multiplies frequency (0.25..4; e.g. 0.8 when fainting). */
  cry(speciesId: string, pitch = 1): void {
    if (!this.ready()) return;
    try {
      let p = this.cries.get(speciesId);
      if (!p) { p = cryParams(String(speciesId)); this.cries.set(speciesId, p); }
      this.synth!.playTones(cryTones(p, pitch), this.sfxBus!, this.ctx!.currentTime + 0.005);
    } catch { /* silent */ }
  }

  /** Switch music with a short crossfade. Same track again is a no-op. May be called before unlock(). */
  music(track: MusicTrack): void {
    try {
      if (track !== 'none' && !(track in TRACKS)) return;
      if (track === this.wanted) return;
      this.wanted = track;
      if (this.ready()) this.startWanted();
    } catch { /* silent */ }
  }

  currentTrack(): MusicTrack {
    return this.wanted;
  }

  setVolume(patch: Partial<Pick<Volume, 'master' | 'music' | 'sfx'>>): void {
    this.vol = mergeVolume(this.vol, patch);
    this.applyVolume();
    this.persist();
  }

  getVolume(): Volume {
    return { ...this.vol };
  }

  mute(on: boolean): void {
    this.vol = { ...this.vol, muted: !!on };
    this.applyVolume();
    this.persist();
  }

  // ---- internals -------------------------------------------------------------------------

  private persist(): void {
    if (this.storage === undefined) saveVolume(this.vol); else saveVolume(this.vol, this.storage);
  }

  private ready(): boolean {
    return !!this.ctx && !!this.synth && this.ctx.state === 'running';
  }

  private init(): void {
    let ctx: AudioContext | null = null;
    try { ctx = this.createContext(); } catch { ctx = null; }
    if (!ctx) { this.failed = true; return; }
    try {
      this.ctx = ctx;
      this.synth = new Synth(ctx);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      this.master = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(comp).connect(ctx.destination);
      this.applyVolume();
      // iOS: playing a silent buffer inside the gesture fully unlocks output.
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.onended = () => src.disconnect();
      src.start(0);
      src.stop(ctx.currentTime + 0.05);
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => this.onVisibility());
      }
    } catch {
      this.ctx = null;
      this.synth = null;
      this.failed = true;
    }
  }

  private onVisibility(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (document.hidden) {
        if (ctx.state === 'running') void ctx.suspend().catch(() => undefined);
      } else if (ctx.state !== 'running' && ctx.state !== 'closed') {
        ctx.resume().then(() => this.onRunning(), () => undefined);
      }
    } catch { /* silent */ }
  }

  private onRunning(): void {
    if (!this.ready()) return;
    const want = this.wanted;
    if (want !== 'none' && (!this.player || this.player.track !== this.getTrack(want))) this.startWanted();
    this.kick();
  }

  private getTrack(name: TrackName): CompiledTrack {
    let t = this.compiled.get(name);
    if (!t) { t = compileTrack(TRACKS[name]); this.compiled.set(name, t); }
    return t;
  }

  private startWanted(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const hadPrevious = !!this.player;
    if (this.player) {
      this.player.stop(now, CROSSFADE);
      this.fading.push(this.player);
      this.player = null;
    }
    if (this.wanted !== 'none') {
      const start = now + (hadPrevious ? CROSSFADE * 0.5 : 0.06);
      this.player = new TrackPlayer(this.synth!, this.getTrack(this.wanted), this.musicBus!, start, hadPrevious ? 0.15 : 0);
    }
    this.kick();
  }

  private kick(): void {
    if (this.timer !== null) return;
    this.tick();
  }

  /** Scheduler heartbeat. Exposed for tests. */
  tick(): void {
    this.timer = null;
    const ctx = this.ctx;
    if (!ctx || !this.ready()) return;
    try {
      const now = ctx.currentTime;
      if (this.player) {
        this.player.schedule(now + LOOKAHEAD, now);
        if (this.player.done && this.player.endTime < now) {
          this.player.dispose();
          this.player = null;
          this.wanted = 'none'; // a finished one-shot (victory) can be requested again
        }
      }
      this.fading = this.fading.filter((p) => {
        if (p.endTime < now) { p.dispose(); return false; }
        return true;
      });
    } catch { /* silent */ }
    if (this.player || this.fading.length > 0) this.timer = setTimeout(() => this.tick(), TICK_MS);
  }

  private applyVolume(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.musicBus || !this.sfxBus) return;
    try {
      const now = ctx.currentTime;
      const set = (g: GainNode, v: number) => { g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(v, now, 0.02); };
      // Perceptual-ish curve: square the slider value.
      set(this.master, this.vol.muted ? 0 : this.vol.master * this.vol.master);
      set(this.musicBus, this.vol.music * this.vol.music);
      set(this.sfxBus, this.vol.sfx * this.vol.sfx);
    } catch { /* silent */ }
  }
}

/** The game-wide audio singleton. */
export const audio = new AudioEngine();
