#!/usr/bin/env python3
"""Pan sign check for the pan-grid locks (camera.md §3): compare a held frame with the same frame
under a forced whole-pixel pan and report the dominant per-block shift.

  python3 -I ${CLAUDE_SKILL_DIR}/scripts/sign_check.py HELD.clean.png PANNED.clean.png --expect=-1,0 [--json OUT.json]

Both PNGs come from capture.mjs (sidecar .json gives the grid and scale); PANNED is captured with
your workspace's forced-pan switch (`--extra 'dpx=1,0'`: the drift() recipe reads it; write `--expect=-1,0` with the `=`, the value starts with a minus). Prints, on
the internal grid: the histogram of best whole-px shifts over 16×16 blocks (top-down y: +1 = down),
the dominant shift, the % of pixels that match exactly after that shift (whole frame and the centre
band r < 0.4), and the mean residual. Exit 0 when the dominant shift equals --expect and ≥ 95 % of
the centre band (or ≥ 99 % of the frame) matches exactly; else 1. Screen-anchored lenses (vignette, tilt ramps) legitimately
break the match toward the edges (72 % whole-frame exact at vignette 0.6, 99.9 % in the centre); run
with `post=nograde` on both captures for a ≥ 99.9 % whole-frame match.
"""
import argparse, json, os, sys
from collections import Counter
import numpy as np
from PIL import Image

def to_grid(path):
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.int32)
    meta = os.path.splitext(path)[0]
    meta = (meta[:-6] if meta.endswith('.clean') else meta) + '.json'
    scale, grid = 1, None
    if not os.path.exists(meta):
        meta = os.path.join(os.path.dirname(os.path.abspath(path)), 'clip.json')  # cam_capture frames
    try:
        m = json.load(open(meta))
        scale = m.get('scale') or 1
        grid = (m.get('perf') or {}).get('internal') or m.get('internal')
    except (OSError, ValueError):
        pass
    s = int(scale)
    g = im[s // 2::s, s // 2::s]
    if grid:
        g = g[:grid[1], :grid[0]]
    return g

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('held'); ap.add_argument('panned'); ap.add_argument('--expect', default='-1,0'); ap.add_argument('--json'); ap.add_argument('--block', type=int, default=16)
    a = ap.parse_args()
    A, B = to_grid(a.held), to_grid(a.panned)
    if A.shape != B.shape:
        sys.exit(f'grid mismatch {A.shape} vs {B.shape}')
    h, w = A.shape[:2]
    La, Lb = A.mean(-1), B.mean(-1)
    hist, n = Counter(), 0
    bs, rng = a.block, 3
    for y in range(rng, h - bs - rng, bs):
        for x in range(rng, w - bs - rng, bs):
            blk = Lb[y:y + bs, x:x + bs]
            if blk.std() < 2:
                continue  # flat block: no shift information
            best, bd = None, None
            for dy in range(-rng, rng + 1):
                for dx in range(-rng, rng + 1):
                    r = np.abs(La[y - dy:y - dy + bs, x - dx:x - dx + bs] - blk).mean()
                    if best is None or r < best:
                        best, bd = r, (dx, dy)
            hist[bd] += 1; n += 1
    dom, cnt = hist.most_common(1)[0] if hist else ((0, 0), 0)
    dx, dy = dom
    # exact match after shifting A by the dominant shift
    ys = slice(max(0, dy), h + min(0, dy)); xs = slice(max(0, dx), w + min(0, dx))
    ys2 = slice(max(0, -dy), h + min(0, -dy)); xs2 = slice(max(0, -dx), w + min(0, -dx))
    eq = (A[ys2, xs2] == B[ys, xs]).all(-1)
    yy, xx = np.mgrid[0:eq.shape[0], 0:eq.shape[1]]
    r = np.hypot((xx / eq.shape[1] - 0.5) * 2, (yy / eq.shape[0] - 0.5) * 2)
    centre = eq[r < 0.4]
    exp = tuple(int(v) for v in a.expect.split(','))
    out = {'held': a.held, 'panned': a.panned, 'grid': [w, h], 'blocks': n, 'shiftHistogram': {f'{k[0]},{k[1]}': v for k, v in hist.most_common(6)},
           'dominantShift': [dx, dy], 'dominantShare': round(cnt / max(1, n), 3), 'expected': list(exp),
           'exactPct': round(100 * float(eq.mean()), 2), 'centreExactPct': round(100 * float(centre.mean()), 2) if centre.size else None,
           'meanResidualAfterShift': round(float(np.abs(A[ys2, xs2] - B[ys, xs]).mean()), 3)}
    out['pass'] = dom == exp and ((out['centreExactPct'] or 0) >= 95.0 or out['exactPct'] >= 99.0)
    txt = json.dumps(out, indent=1)
    if a.json:
        open(a.json, 'w').write(txt)
    print(txt)
    sys.exit(0 if out['pass'] else 1)

if __name__ == '__main__':
    main()
