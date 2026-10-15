#!/usr/bin/env python3
"""Do the blinks actually close at the sprite bake rate? Reports the fraction of blinks whose
baked value reaches >= 0.85 (closed) and >= 0.5 (half).

  python3 blink_check.py --probe cap/kin19-blink.json [--fps 10]
      --probe = output of `capture.mjs probe` (uBlink sampled every virtual frame via view.update).
      The bake reads the rig on the first frame of each 1/fps tick (sprite.ts: tick = floor(t*fps)).
  python3 blink_check.py --simulate sine --window 0.13 --fps 10 [--n 2000]
      Monte-Carlo of a formula over the tick phase: `sine` = sin(pi x / window) (the old blink),
      `discrete` = closed for exactly one tick aligned to the tick grid.
Pass: >= 95% closed. Exit 0 pass, 1 fail, 2 bad input.
"""
import argparse
import json
import math
import random
import sys
from pathlib import Path


def analyse(samples, fps_src, fps_bake, thresh=0.85):
    step = max(1, round(fps_src / fps_bake))
    # Blink events: runs of samples > 0.02 separated by zeros.
    events, cur = [], []
    for i, v in enumerate(samples):
        if v > 0.02:
            cur.append(i)
        elif cur:
            events.append(cur)
            cur = []
    if cur:
        events.append(cur)
    closed = half = 0
    for ev in events:
        # Baked value in this blink: the sample at every frame that starts a tick (frame % step == 0).
        baked = [samples[i] for i in ev if i % step == 0]
        m = max(baked) if baked else 0.0
        closed += m >= thresh
        half += m >= 0.5
    n = len(events)
    return {'blinks': n, 'closedFraction': round(closed / n, 3) if n else None, 'halfFraction': round(half / n, 3) if n else None, 'bakeFps': fps_bake, 'meanIntervalS': round(len(samples) / fps_src / n, 2) if n else None, 'meanLengthFrames': round(sum(len(e) for e in events) / n, 1) if n else None}


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--probe')
    p.add_argument('--simulate', choices=['sine', 'discrete'])
    p.add_argument('--window', type=float, default=0.13)
    p.add_argument('--fps', type=float, default=10)
    p.add_argument('--n', type=int, default=2000)
    p.add_argument('--out')
    a = p.parse_args()
    if a.probe:
        d = json.loads(Path(a.probe).read_text())
        view = next(iter(d['views'].values()))
        res = analyse(view['samples'], view['fps'], a.fps)
        res['probe'] = a.probe
    elif a.simulate:
        rnd = random.Random(1)
        closed = 0
        for _ in range(a.n):
            phase = rnd.random() / a.fps  # where the blink starts relative to the tick grid
            if a.simulate == 'sine':
                ticks = [t for t in [k / a.fps - phase for k in range(0, 4)] if 0 <= t < a.window]
                m = max([math.sin(t / a.window * math.pi) for t in ticks] + [0])
            else:
                m = 1.0  # a closed window one tick long always contains exactly one tick boundary
            closed += m >= 0.85
        res = {'simulate': a.simulate, 'window': a.window, 'bakeFps': a.fps, 'closedFraction': round(closed / a.n, 3), 'blinks': a.n}
    else:
        sys.exit('error: pass --probe FILE or --simulate sine|discrete')
    res['pass'] = (res['closedFraction'] or 0) >= 0.95
    s = json.dumps(res, indent=1)
    if a.out:
        Path(a.out).write_text(s)
    print(s)
    sys.exit(0 if res['pass'] else 1)


if __name__ == '__main__':
    main()
