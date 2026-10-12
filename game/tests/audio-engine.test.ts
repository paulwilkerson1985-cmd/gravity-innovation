// Drives the real AudioEngine against a minimal fake AudioContext to check scheduling,
// node cleanup and the "never throw" contract — no browser needed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioEngine } from '../src/audio/audio';
import { SFX_NAMES, MOVE_TYPES } from '../src/audio/sfxdefs';
import { TRACK_NAMES } from '../src/audio/music/tracks';
import { SPECIES } from '../src/data/species';

class FakeParam {
  constructor(public value = 0, private ctx: FakeCtx) {}
  private check(v: number, t: number) {
    if (!Number.isFinite(v) || !Number.isFinite(t) || t < 0) throw new TypeError('non-finite automation');
  }
  setValueAtTime(v: number, t: number) { this.check(v, t); this.value = v; return this; }
  linearRampToValueAtTime(v: number, t: number) { this.check(v, t); this.value = v; return this; }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.check(v, t);
    if (v <= 0) throw new RangeError('exponential ramp to non-positive value');
    this.value = v; return this;
  }
  setTargetAtTime(v: number, t: number, tc: number) { this.check(v, t); this.check(tc, 0); this.value = v; return this; }
  cancelScheduledValues(t: number) { this.check(0, t); return this; }
  get _ctx() { return this.ctx; }
}

class FakeNode {
  outputs = new Set<FakeNode | FakeParam>();
  constructor(protected ctx: FakeCtx) { ctx.nodes.add(this); }
  connect<T extends FakeNode | FakeParam>(n: T): T { this.outputs.add(n); return n; }
  disconnect() { this.outputs.clear(); this.ctx.nodes.delete(this); }
}

class FakeSource extends FakeNode {
  onended: (() => void) | null = null;
  startAt = -1;
  stopAt = Infinity;
  frequency = new FakeParam(440, this.ctx);
  detune = new FakeParam(0, this.ctx);
  playbackRate = new FakeParam(1, this.ctx);
  type = 'sine';
  buffer: unknown = null;
  loop = false;
  start(t = 0) { if (this.startAt >= 0) throw new Error('started twice'); this.startAt = t; this.ctx.sources.add(this); }
  stop(t = 0) { this.stopAt = t; }
  setPeriodicWave() {}
}

class FakeCtx {
  currentTime = 0;
  state: 'running' | 'suspended' | 'closed' = 'suspended';
  sampleRate = 8000;
  nodes = new Set<FakeNode>();
  sources = new Set<FakeSource>();
  started = 0;
  destination = new FakeNode(this);
  createGain() { const n = new FakeNode(this) as FakeNode & { gain: FakeParam }; n.gain = new FakeParam(1, this); return n; }
  createOscillator() { this.started++; return new FakeSource(this); }
  createBufferSource() { this.started++; return new FakeSource(this); }
  createBiquadFilter() { const n = new FakeNode(this) as FakeNode & Record<string, unknown>; n.frequency = new FakeParam(350, this); n.Q = new FakeParam(1, this); n.type = 'lowpass'; return n; }
  createStereoPanner() { const n = new FakeNode(this) as FakeNode & { pan: FakeParam }; n.pan = new FakeParam(0, this); return n; }
  createDynamicsCompressor() {
    const n = new FakeNode(this) as FakeNode & Record<string, FakeParam>;
    for (const k of ['threshold', 'ratio', 'attack', 'release', 'knee']) n[k] = new FakeParam(0, this);
    return n;
  }
  createPeriodicWave() { return {}; }
  createBuffer(_ch: number, len: number, rate: number) {
    const data = new Float32Array(len);
    return { duration: len / rate, getChannelData: () => data };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  /** Advance the clock, firing onended for finished sources. */
  advance(dt: number) {
    this.currentTime += dt;
    for (const s of [...this.sources]) {
      if (s.stopAt <= this.currentTime) { this.sources.delete(s); s.onended?.(); }
    }
  }
}

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

function setup() {
  const ctx = new FakeCtx();
  const engine = new AudioEngine({ createContext: () => ctx as unknown as AudioContext, storage: memStore() });
  return { ctx, engine };
}

/** Run the scheduler the way the browser would: tick every 25 ms of context time. */
function run(ctx: FakeCtx, engine: AudioEngine, seconds: number) {
  for (let t = 0; t < seconds; t += 0.025) { ctx.advance(0.025); engine.tick(); }
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('AudioEngine without audio', () => {
  it('is a silent no-op when no AudioContext exists', () => {
    const e = new AudioEngine({ createContext: () => null, storage: null });
    expect(() => {
      e.sfx('hit'); e.move('Flame'); e.cry('ashkit'); e.music('battle');
      e.unlock(); e.unlock();
      e.sfx('select'); e.music('route'); e.music('none');
      e.setVolume({ master: 0.3 }); e.mute(true); e.tick();
    }).not.toThrow();
    expect(e.isUnlocked()).toBe(false);
    expect(e.getVolume().master).toBe(0.3);
  });

  it('survives a throwing context factory and the default node environment', () => {
    const e = new AudioEngine({ createContext: () => { throw new Error('nope'); }, storage: null });
    expect(() => { e.unlock(); e.sfx('hit'); }).not.toThrow();
    const d = new AudioEngine({ storage: null });
    expect(() => { d.unlock(); d.music('title'); d.cry('x'); }).not.toThrow();
  });

  it('does nothing before unlock', () => {
    const { ctx, engine } = setup();
    engine.sfx('hit');
    engine.music('title');
    expect(ctx.started).toBe(0);
  });
});

describe('AudioEngine with a fake context', () => {
  it('plays every sfx, move cue and cry without invalid automation', () => {
    const { ctx, engine } = setup();
    engine.unlock();
    expect(engine.isUnlocked()).toBe(true);
    for (const n of SFX_NAMES) { engine.sfx(n); ctx.advance(0.05); }
    for (const m of MOVE_TYPES) { engine.move(m); ctx.advance(0.05); }
    for (const s of SPECIES) { engine.cry(s.id); engine.cry(s.id, 0.8); ctx.advance(0.05); }
    expect(ctx.started).toBeGreaterThan(50);
    ctx.advance(5);
    expect(ctx.sources.size).toBe(0);
  });

  it('starts music requested before unlock and schedules ahead of the clock', () => {
    const { ctx, engine } = setup();
    engine.music('battle');
    engine.unlock();
    expect(engine.currentTrack()).toBe('battle');
    expect(ctx.started).toBeGreaterThan(0);
    for (const s of ctx.sources) expect(s.startAt).toBeLessThanOrEqual(ctx.currentTime + 0.2);
  });

  it('every track plays for a while and node count stays bounded (no leaks)', () => {
    for (const name of TRACK_NAMES) {
      const { ctx, engine } = setup();
      engine.unlock();
      engine.music(name);
      run(ctx, engine, 10);
      const midNodes = ctx.nodes.size;
      run(ctx, engine, 60);
      expect(ctx.nodes.size).toBeLessThan(midNodes + 40);
      expect(ctx.nodes.size).toBeLessThan(150);
      for (const s of ctx.sources) expect(s.startAt).toBeLessThanOrEqual(ctx.currentTime + 0.2);
    }
  });

  it('crossfades between tracks, ignores repeat requests and cleans up the old track', () => {
    const { ctx, engine } = setup();
    engine.unlock();
    engine.music('route');
    run(ctx, engine, 3);
    const before = ctx.started;
    engine.music('route');
    engine.tick();
    expect(engine.currentTrack()).toBe('route');
    for (const t of ['battle', 'trainer', 'champion', 'arena', 'evolution', 'title'] as const) {
      engine.music(t);
      run(ctx, engine, 2);
    }
    expect(ctx.started).toBeGreaterThan(before);
    engine.music('none');
    run(ctx, engine, 6);
    // Only the bus/compressor graph should remain.
    expect(ctx.sources.size).toBe(0);
    expect(ctx.nodes.size).toBeLessThan(10);
  });

  it('victory plays once and then frees the track slot', () => {
    const { ctx, engine } = setup();
    engine.unlock();
    engine.music('victory');
    run(ctx, engine, 3);
    expect(engine.currentTrack()).toBe('victory');
    run(ctx, engine, 5); // 4 bars at 140 bpm ≈ 6.9 s
    expect(engine.currentTrack()).toBe('none');
    const after = ctx.started;
    run(ctx, engine, 2);
    expect(ctx.started).toBe(after);
  });

  it('stops scheduling while suspended and resumes cleanly', () => {
    const { ctx, engine } = setup();
    engine.unlock();
    engine.music('title');
    run(ctx, engine, 2);
    ctx.state = 'suspended';
    const n = ctx.started;
    engine.sfx('hit');
    engine.tick();
    expect(ctx.started).toBe(n);
    ctx.currentTime += 30; // e.g. a long stall; must not burst-schedule 30 s of notes
    engine.unlock();
    expect(ctx.started - n).toBeLessThan(40);
  });

  it('applies and persists volume', () => {
    const store = memStore();
    const ctx = new FakeCtx();
    const e = new AudioEngine({ createContext: () => ctx as unknown as AudioContext, storage: store });
    e.unlock();
    e.setVolume({ master: 0.5, music: 0.2, sfx: 1.7 });
    e.mute(true);
    expect(e.getVolume()).toEqual({ master: 0.5, music: 0.2, sfx: 1, muted: true });
    const again = new AudioEngine({ createContext: () => null, storage: store });
    expect(again.getVolume()).toEqual({ master: 0.5, music: 0.2, sfx: 1, muted: true });
  });
});
