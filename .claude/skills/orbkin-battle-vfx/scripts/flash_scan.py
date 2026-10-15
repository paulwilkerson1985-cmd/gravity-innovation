#!/usr/bin/env python3
"""Flash shape and set dim, measured on the impact frames of a timeline run.

  python3 flash_scan.py RUN_DIR [--max-white 1.3] [--max-halo 2.0] [--min-dim 0.10] [--json]

1. FLASH SHAPE: on the frames impact+1 and impact+2 it counts blown-out pixels (luma >= 232 and min(R,G,B) >= 200)
   inside 2.5x the target's box and divides by the target box area. A white flash is a SHAPE over the
   target (a disc or crescent of about the target's size); bloom from a hot book or an over-driven glow
   turns it into an orb that hides the sprite. Fails when the ratio exceeds --max-white (default 1.3).
   HALO: a warm-tinted bloom passes the white test (min(R,G,B) < 200), so it also counts bright pixels
   of ANY hue (luma >= 200) inside 2.5x the box at impact+1/+2 minus the same count at impact-2, over
   the box area; fails above --max-halo (default 2.0; the pilot's halo measured 3.9 while white read
   0.8). It also reports the floor pool: bright floor pixels outside 1.5x the box, as a radius in px.
2. SET DIM: mean luminance of the set (the full frame minus both kin boxes and minus 3x the target box,
   where the FX light pools) on the frames impact-2 .. impact+2, against the launch frame. Reports the
   peak drop; fails when an electric/strong move dims less than --min-dim (10 %) while the run says it
   dims (--min-dim 0 disables). Scaling only the scene lights leaves emissive set materials (lava, lit
   ledges, window glow) untouched: this measures what the player sees.
Exit 0 pass, 1 fail, 2 usage/missing frames. Needs numpy + Pillow; runs on strip-frames.json.
"""
import json, os, sys
import numpy as np
from PIL import Image


def load(p):
    return np.asarray(Image.open(p).convert('RGB')).astype(np.int32)


def luma(a):
    return (a[..., 0] * 299 + a[..., 1] * 587 + a[..., 2] * 114) / 1000


def box_mask(shape, box, k):
    m = np.zeros(shape[:2], bool)
    if not box:
        return m
    cx, cy = box['x'] + box['w'] / 2, box['y'] + box['h'] / 2
    hw, hh = box['w'] * k / 2, box['h'] * k / 2
    x0, x1 = max(0, int(cx - hw)), min(shape[1], int(cx + hw))
    y0, y1 = max(0, int(cy - hh)), min(shape[0], int(cy + hh))
    m[y0:y1, x0:x1] = True
    return m


def main(argv):
    if '--help' in argv:
        print(__doc__); return 0
    if not argv:
        print(__doc__); return 2
    run = argv[0]
    o = {argv[i]: argv[i + 1] for i in range(1, len(argv) - 1) if argv[i].startswith('--') and not argv[i + 1].startswith('--')}
    max_white = float(o.get('--max-white', '1.3')); min_dim = float(o.get('--min-dim', '0.10'))
    with open(os.path.join(run, 'strip-frames.json')) as f:
        sf = json.load(f)
    foe, mine = sf.get('foeBox'), sf.get('mineBox')
    imp = {x['d']: x['file'] for x in sf.get('impactStrip', []) if x['file']}
    launch = sf.get('launchFrame') or (sf['frames'][0] if sf.get('frames') else None)
    if not foe or not imp or not launch:
        sys.exit('flash_scan: the run has no impact strip or target box (re-run timeline.mjs on a hit)')
    base = load(launch)
    out = {'run': run, 'foeBox': foe, 'flash': [], 'dim': []}
    area = foe['w'] * foe['h']
    near = box_mask(base.shape, foe, 2.5)
    pre = load(imp[-2]) if -2 in imp else base
    bright0 = int(((luma(pre) >= 200) & near).sum())
    for d in (1, 2):
        if d not in imp:
            continue
        a = load(imp[d])
        # Tone mapping turns a blown-out flash cream, not pure white: bright + nearly neutral counts.
        white = (a.min(-1) >= 200) & (luma(a) >= 232) & near
        bright = (luma(a) >= 200) & near
        halo = max(0, int(bright.sum()) - bright0) / area
        pool = (luma(a) >= 200) & ~box_mask(a.shape, foe, 1.5)
        ys, xs = np.where(pool)
        pool_r = int(max(np.abs(xs - (foe['x'] + foe['w'] / 2)).max() if xs.size else 0, np.abs(ys - (foe['y'] + foe['h'] / 2)).max() if ys.size else 0))
        out['flash'].append({'frame': f'impact+{d}', 'whitePx': int(white.sum()), 'ratioToTarget': round(float(white.sum()) / area, 2), 'haloRatio': round(halo, 2), 'poolRadiusPx': pool_r})
    setm = ~(box_mask(base.shape, foe, 3.0) | box_mask(base.shape, mine, 1.5))
    l0 = float(luma(base)[setm].mean())
    for d in (-2, 0, 1, 2, 4, 8):
        if d not in imp:
            continue
        l = float(luma(load(imp[d]))[setm].mean())
        out['dim'].append({'frame': f'impact{d:+d}', 'setLuma': round(l, 1), 'drop': round(1 - l / l0, 3)})
    out['setLumaLaunch'] = round(l0, 1)
    out['dimPeak'] = max([x['drop'] for x in out['dim']] or [0])
    out['whitePeak'] = max([x['ratioToTarget'] for x in out['flash']] or [0])
    out['haloPeak'] = max([x['haloRatio'] for x in out['flash']] or [0])
    max_halo = float(o.get('--max-halo', '2.0'))
    fails = []
    if out['haloPeak'] > max_halo:
        fails.append(f"bloom halo: bright pixels of any hue {out['haloPeak']}x the target box at impact+1/+2 (max {max_halo}); the flash disc and the FX light peak must not coincide, light distance 3-4, pool <= 2x the target height")
    if out['whitePeak'] > max_white:
        fails.append(f"flash is an orb: saturated white {out['whitePeak']}x the target box (max {max_white}); cap book glow at 1.0, keep the flash a shape, let the FX light do the bloom")
    if min_dim > 0 and out['dimPeak'] < min_dim:
        fails.append(f"set dim {round(out['dimPeak'] * 100)} % < {round(min_dim * 100)} %: emissive set materials are not dimmed (scale their intensity too, or dim through a set-only pass)")
    out['fails'] = fails
    out['verdict'] = 'pass' if not fails else 'fail'
    if '--json' in argv:
        print(json.dumps(out, indent=1))
    else:
        print(f"flash_scan {run}: white at impact+1/+2 = {[x['ratioToTarget'] for x in out['flash']]} x target box (max {max_white}); halo {[x['haloRatio'] for x in out['flash']]} (max {max_halo}); floor pool radius {[x['poolRadiusPx'] for x in out['flash']]} px; set dim per frame {[(x['frame'], x['drop']) for x in out['dim']]} peak {round(out['dimPeak'] * 100)} %")
        for f in fails:
            print('  FAIL', f)
        print('verdict:', out['verdict'])
    return 0 if not fails else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
