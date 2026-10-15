// Tiny promise-based tween system driven by the main loop. Supports a global speed
// multiplier and an instant mode used by tests (window.__game.setFast(true)).

type Tween = { elapsed: number; duration: number; fn: (k: number) => void; done: () => void };

const active: Tween[] = [];
/** `frame` counts main-loop ticks (timing marks and tests count frames, not ms). */
export const animClock = { speed: 1, instant: false, time: 0, frame: 0 };

export function stepTweens(dt: number) {
  animClock.time += dt;
  animClock.frame++;
  const scaled = dt * animClock.speed;
  for (let i = active.length - 1; i >= 0; i--) {
    const tw = active[i]!;
    tw.elapsed += scaled;
    const k = Math.min(1, tw.elapsed / tw.duration);
    tw.fn(k);
    if (k >= 1) {
      active.splice(i, 1);
      tw.done();
    }
  }
}

export function tween(ms: number, fn: (k: number) => void): Promise<void> {
  if (animClock.instant || ms <= 0) {
    fn(1);
    return Promise.resolve();
  }
  return new Promise((done) => active.push({ elapsed: 0, duration: ms / 1000, fn, done }));
}

export const wait = (ms: number) => tween(ms, () => {});

/** Finish every running tween immediately. */
export function flushTweens() {
  while (active.length) {
    const tw = active.pop()!;
    tw.fn(1);
    tw.done();
  }
}

export function pendingTweens() {
  return active.length;
}

export const ease = {
  outBack: (k: number) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2,
  outCubic: (k: number) => 1 - (1 - k) ** 3,
  inOut: (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2),
  inCubic: (k: number) => k ** 3,
};
