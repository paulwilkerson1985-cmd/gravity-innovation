// Camera kick for strong hits (docs/DECISIONS.md "Battle feel"): one damped, directional push in
// WHOLE internal pixels (A·e^(−t/70 ms)·cos(2π·9 Hz·t), over ≤ 8 frames) along the blow, instead
// of a two-axis sine buzz that flipped sign almost every frame.

/** Kick amplitude (internal px) for a move's hit; 0 = no kick (only strong hits kick, as before). */
export function kickPx(e: { mult: number; crit: boolean }): number {
  if (e.crit && e.mult > 1) return 6;
  if (e.crit) return 5;
  if (e.mult > 1) return 4;
  return 0;
}

/** Kick length (frames at 60 fps); after it the offset is exactly 0. */
export const KICK_FRAMES = 8;

/**
 * A directional camera kick. `start(amp, dx, dy)` with (dx, dy) the blow's direction on screen
 * (y down); `step(dt)` returns the content displacement in whole internal px, (0, 0) when done.
 */
export class Kick {
  private t = -1;
  private amp = 0;
  private dir: [number, number] = [1, 0];
  private out: [number, number] = [0, 0];

  get active(): boolean { return this.t >= 0; }

  start(amp: number, dx: number, dy: number) {
    const len = Math.hypot(dx, dy) || 1;
    this.dir = [dx / len, dy / len];
    this.amp = amp;
    this.t = 0;
  }

  stop() { this.t = -1; }

  step(dt: number): [number, number] {
    if (this.t < 0) { this.out[0] = this.out[1] = 0; return this.out; }
    const t = this.t;
    this.t += dt;
    if (t >= KICK_FRAMES / 60) { this.t = -1; this.out[0] = this.out[1] = 0; return this.out; }
    const a = this.amp * Math.exp(-t / 0.07) * Math.cos(2 * Math.PI * 9 * t);
    // Math.round(-0.4) is -0: normalise so callers can compare against 0.
    this.out[0] = Math.round(a * this.dir[0]) || 0;
    this.out[1] = Math.round(a * this.dir[1]) || 0;
    return this.out;
  }
}
