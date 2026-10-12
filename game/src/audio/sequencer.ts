// Lookahead step sequencer. Timing comes from the AudioContext clock; the JS timer only wakes
// us up to schedule the next slice of notes (see "A Tale of Two Clocks").
import { stepSeconds, type CompiledTrack, type NoteEvent } from './music/pattern';
import type { Synth } from './synth';

/** Flattened, time-sorted list of everything a track plays in one pass. Pure. */
export type SeqEvent =
  | { step: number; ch: 'lead' | 'harm' | 'bass'; note: NoteEvent }
  | { step: number; ch: 'drum'; kind: string };

export function flattenTrack(t: CompiledTrack): SeqEvent[] {
  const out: SeqEvent[] = [];
  for (const ch of ['lead', 'harm', 'bass'] as const) for (const note of t[ch]) out.push({ step: note.step, ch, note });
  for (const d of t.drums) out.push({ step: d.step, ch: 'drum', kind: d.kind });
  return out.sort((a, b) => a.step - b.step);
}

export class TrackPlayer {
  readonly out: GainNode;
  private events: SeqEvent[];
  private idx = 0;
  /** Context time at which step 0 of the current pass plays. */
  private passStart: number;
  private readonly stepDur: number;
  done = false;
  /** Context time after which this player can be dropped (set once stopped or finished). */
  endTime = Infinity;

  constructor(private synth: Synth, readonly track: CompiledTrack, dest: AudioNode, start: number, fadeIn: number) {
    const ctx = synth.ctx;
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : 1, start);
    if (fadeIn > 0) this.out.gain.linearRampToValueAtTime(1, start + fadeIn);
    this.out.connect(dest);
    this.events = flattenTrack(track);
    this.passStart = start;
    this.stepDur = stepSeconds(track.bpm);
  }

  /** Schedule every event that starts before `until` (context seconds). */
  schedule(until: number, now: number): void {
    if (this.done) return;
    // If the page stalled badly (e.g. a long GC or a throttled tab), jump ahead instead of bursting.
    const passLen = this.track.steps * this.stepDur;
    if (this.eventTime() < now - 0.25) this.resync(now);
    let guard = 0;
    while (!this.done && this.eventTime() < until && guard++ < 512) {
      const ev = this.events[this.idx];
      if (ev) this.play(ev, this.eventTime());
      this.idx++;
      if (this.idx >= this.events.length) {
        if (this.track.loop) {
          this.idx = 0;
          this.passStart += passLen;
        } else {
          this.done = true;
          this.endTime = this.passStart + passLen + 0.5;
        }
      }
    }
  }

  private eventTime(): number {
    const ev = this.events[this.idx];
    return this.passStart + (ev ? ev.step : this.track.steps) * this.stepDur;
  }

  private resync(now: number): void {
    const passLen = this.track.steps * this.stepDur;
    if (!this.track.loop) { this.done = true; this.endTime = now; return; }
    while (this.passStart + passLen < now) this.passStart += passLen;
    const target = (now - this.passStart) / this.stepDur + 0.5;
    this.idx = this.events.findIndex((e) => e.step >= target);
    if (this.idx < 0) { this.idx = 0; this.passStart += passLen; }
  }

  private play(ev: SeqEvent, t: number): void {
    const def = this.track.def;
    if (ev.ch === 'drum') {
      if (def.drums) this.synth.playDrum(ev.kind, t, def.drums.vol, this.out);
      return;
    }
    const voice = def[ev.ch];
    if (!voice) return;
    const gate = ev.ch === 'bass' ? 0.85 : 0.92;
    const dur = Math.max(0.03, ev.note.len * this.stepDur * gate);
    const dest = this.paned(voice.pan);
    this.synth.playNote(voice.wave, ev.note.midi, t, dur, voice.vol, dest, ev.ch === 'lead' && !!def.lead.vibrato);
  }

  private pans = new Map<number, AudioNode>();
  private paned(pan: number | undefined): AudioNode {
    if (!pan || typeof this.synth.ctx.createStereoPanner !== 'function') return this.out;
    let node = this.pans.get(pan);
    if (!node) {
      const p = this.synth.ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(this.out);
      this.pans.set(pan, p);
      node = p;
    }
    return node;
  }

  /** Fade out and stop scheduling. */
  stop(now: number, fade: number): void {
    this.done = true;
    this.endTime = now + fade + 0.6;
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
  }

  dispose(): void {
    for (const p of this.pans.values()) p.disconnect();
    this.pans.clear();
    this.out.disconnect();
  }
}
