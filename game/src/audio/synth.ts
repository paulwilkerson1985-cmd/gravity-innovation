// Web Audio rendering of Tone data and sequencer notes/drums. Every node created here is
// stopped at a scheduled time and disconnected in `onended`, so nothing accumulates.
import { pulseCoefficients, lfsrNoise } from './waves';
import type { Tone, Points, Wave } from './tone';

export class Synth {
  private waves = new Map<string, PeriodicWave>();
  private noiseBuf: AudioBuffer | null = null;
  private metalBuf: AudioBuffer | null = null;
  private noiseOffset = 0;
  /** Number of live sources; new sfx voices are dropped above the cap to stay light on mobile. */
  live = 0;
  readonly maxVoices = 48;

  constructor(readonly ctx: BaseAudioContext) {}

  private periodic(duty: number): PeriodicWave {
    const key = String(duty);
    let w = this.waves.get(key);
    if (!w) {
      const { real, imag } = pulseCoefficients(duty, 40);
      w = this.ctx.createPeriodicWave(real, imag);
      this.waves.set(key, w);
    }
    return w;
  }

  private buffer(metal: boolean): AudioBuffer {
    const existing = metal ? this.metalBuf : this.noiseBuf;
    if (existing) return existing;
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * (metal ? 0.25 : 1));
    // Generate LFSR samples at ~a chip-ish clock then hold them, giving a crunchy grain.
    const hold = metal ? 4 : 2;
    const raw = lfsrNoise(Math.ceil(len / hold) + 1, metal);
    const buf = this.ctx.createBuffer(1, len, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = raw[Math.floor(i / hold)]! * 0.8;
    if (metal) this.metalBuf = buf; else this.noiseBuf = buf;
    return buf;
  }

  /** Create a started source for a wave; caller connects it. Returns the node whose `frequency` is controllable (or null for noise). */
  private source(wave: Wave, t0: number, t1: number, rate = 1): { node: AudioScheduledSourceNode; freq: AudioParam | null; detune: AudioParam | null } {
    const ctx = this.ctx;
    let node: AudioScheduledSourceNode;
    let freq: AudioParam | null = null;
    let detune: AudioParam | null = null;
    if (wave === 'noise' || wave === 'metal') {
      const src = ctx.createBufferSource();
      const buf = this.buffer(wave === 'metal');
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = rate;
      detune = src.detune ?? null;
      node = src;
      this.noiseOffset = (this.noiseOffset + 0.137) % Math.max(0.01, buf.duration - 0.01);
      src.start(t0, this.noiseOffset);
    } else {
      const osc = ctx.createOscillator();
      if (wave === 'pulse25') osc.setPeriodicWave(this.periodic(0.25));
      else if (wave === 'pulse12') osc.setPeriodicWave(this.periodic(0.125));
      else osc.type = wave;
      freq = osc.frequency;
      detune = osc.detune;
      node = osc;
      osc.start(t0);
    }
    node.stop(t1);
    this.live++;
    return { node, freq, detune };
  }

  private static applyPoints(param: AudioParam, pts: Points | number, t0: number, exp: boolean): void {
    if (typeof pts === 'number') { param.setValueAtTime(pts, t0); return; }
    const first = pts[0];
    if (!first) return;
    param.setValueAtTime(Math.max(1, first[1]), t0 + first[0]);
    for (let i = 1; i < pts.length; i++) {
      const [t, v] = pts[i]!;
      if (exp) param.exponentialRampToValueAtTime(Math.max(1, v), t0 + t);
      else param.linearRampToValueAtTime(v, t0 + t);
    }
  }

  private static envelope(g: AudioParam, env: Tone['env'], vol: number, t0: number, dur: number): void {
    const a = Math.min(0.006, dur / 4);
    g.setValueAtTime(0, t0);
    if (Array.isArray(env)) {
      for (const [t, v] of env) g.linearRampToValueAtTime(Math.max(0, v) * vol, t0 + Math.min(t, dur));
      g.linearRampToValueAtTime(0, t0 + dur);
      return;
    }
    switch (env ?? 'pluck') {
      case 'hold': {
        const r = Math.min(0.04, dur / 3);
        g.linearRampToValueAtTime(vol, t0 + a);
        g.setValueAtTime(vol, t0 + dur - r);
        g.linearRampToValueAtTime(0, t0 + dur);
        break;
      }
      case 'swell':
        g.linearRampToValueAtTime(vol, t0 + dur * 0.6);
        g.linearRampToValueAtTime(0, t0 + dur);
        break;
      default:
        g.linearRampToValueAtTime(vol, t0 + a);
        g.exponentialRampToValueAtTime(0.0005, t0 + dur);
        g.linearRampToValueAtTime(0, t0 + dur + 0.005);
    }
  }

  /** Play a set of tones starting at absolute context time `when`. */
  playTones(tones: readonly Tone[], dest: AudioNode, when: number, pitch = 1): void {
    for (const tone of tones) {
      if (this.live >= this.maxVoices) return;
      this.playTone(tone, dest, when + tone.at, pitch);
    }
  }

  private playTone(tone: Tone, dest: AudioNode, t0: number, pitch: number): void {
    const ctx = this.ctx;
    const t1 = t0 + tone.dur + 0.02;
    const { node, freq, detune } = this.source(tone.wave, t0, t1, tone.rate ?? 1);
    const nodes: AudioNode[] = [node];
    if (freq && tone.freq !== undefined) {
      const f = typeof tone.freq === 'number' ? tone.freq * pitch : tone.freq.map(([t, v]) => [t, v * pitch] as [number, number]);
      Synth.applyPoints(freq, f, t0, true);
    }
    if (tone.vibrato && detune) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = tone.vibrato.rate;
      depth.gain.value = tone.vibrato.depth;
      lfo.connect(depth).connect(detune);
      lfo.start(t0);
      lfo.stop(t1);
      lfo.onended = () => { lfo.disconnect(); depth.disconnect(); };
    }
    let out: AudioNode = node;
    if (tone.filter) {
      const f = ctx.createBiquadFilter();
      f.type = tone.filter.type;
      f.Q.value = tone.filter.q ?? 1;
      Synth.applyPoints(f.frequency, tone.filter.freq, t0, true);
      out.connect(f);
      out = f;
      nodes.push(f);
    }
    const g = ctx.createGain();
    Synth.envelope(g.gain, tone.env, Math.min(1, Math.max(0, tone.vol)), t0, tone.dur);
    out.connect(g);
    nodes.push(g);
    if (tone.pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = tone.pan;
      g.connect(p);
      nodes.push(p);
      p.connect(dest);
    } else {
      g.connect(dest);
    }
    node.onended = () => {
      this.live = Math.max(0, this.live - 1);
      for (const n of nodes) n.disconnect();
    };
  }

  /** A sequencer note: oscillator with a light chip envelope; long notes get delayed vibrato. */
  playNote(wave: Wave, midi: number, t0: number, dur: number, vol: number, dest: AudioNode, vibrato: boolean): void {
    const ctx = this.ctx;
    const t1 = t0 + dur + 0.01;
    const { node, freq, detune } = this.source(wave, t0, t1);
    if (freq) freq.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), t0);
    const g = ctx.createGain();
    const p = g.gain;
    const isTri = wave === 'triangle';
    p.setValueAtTime(0, t0);
    p.linearRampToValueAtTime(vol, t0 + 0.004);
    if (!isTri) p.linearRampToValueAtTime(vol * 0.7, t0 + Math.min(0.12, dur * 0.5));
    p.setValueAtTime(isTri ? vol : vol * 0.7, Math.max(t0 + 0.005, t1 - 0.03));
    p.linearRampToValueAtTime(0, t1);
    node.connect(g).connect(dest);
    if (vibrato && detune && dur > 0.35) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.setValueAtTime(0, t0);
      depth.gain.setValueAtTime(0, t0 + 0.18);
      depth.gain.linearRampToValueAtTime(18, t0 + 0.4);
      lfo.connect(depth).connect(detune);
      lfo.start(t0);
      lfo.stop(t1);
      lfo.onended = () => { lfo.disconnect(); depth.disconnect(); };
    }
    node.onended = () => { this.live = Math.max(0, this.live - 1); node.disconnect(); g.disconnect(); };
  }

  playDrum(kind: string, t0: number, vol: number, dest: AudioNode): void {
    switch (kind) {
      case 'k':
        this.playTones([
          { wave: 'triangle', at: 0, dur: 0.12, freq: [[0, 160], [0.1, 45]], vol: vol * 0.9, env: 'pluck' },
          { wave: 'noise', at: 0, dur: 0.02, vol: vol * 0.3, env: 'pluck', filter: { type: 'lowpass', freq: 1500 } },
        ], dest, t0);
        break;
      case 's':
        this.playTones([
          { wave: 'noise', at: 0, dur: 0.12, vol: vol * 0.45, env: 'pluck', filter: { type: 'highpass', freq: 1200 } },
          { wave: 'triangle', at: 0, dur: 0.06, freq: [[0, 260], [0.06, 160]], vol: vol * 0.4, env: 'pluck' },
        ], dest, t0);
        break;
      case 'h':
        this.playTones([{ wave: 'noise', at: 0, dur: 0.03, vol: vol * 0.18, env: 'pluck', rate: 1.5, filter: { type: 'highpass', freq: 6000 } }], dest, t0);
        break;
      case 'o':
        this.playTones([{ wave: 'noise', at: 0, dur: 0.16, vol: vol * 0.16, env: 'pluck', rate: 1.5, filter: { type: 'highpass', freq: 5000 } }], dest, t0);
        break;
      case 'c':
        this.playTones([{ wave: 'noise', at: 0, dur: 0.6, vol: vol * 0.25, env: 'pluck', filter: { type: 'highpass', freq: 3000 } }], dest, t0);
        break;
      case 't':
        this.playTones([{ wave: 'triangle', at: 0, dur: 0.16, freq: [[0, 220], [0.16, 90]], vol: vol * 0.6, env: 'pluck' }], dest, t0);
        break;
    }
  }
}
