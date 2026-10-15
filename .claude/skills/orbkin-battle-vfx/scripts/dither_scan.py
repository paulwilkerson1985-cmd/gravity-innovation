#!/usr/bin/env python3
"""Count visible checkerboard (Bayer screen-door) texels in strip frames: the "dissolve by shape" gate.

  python3 dither_scan.py RUN_DIR [--texel 2] [--crop x0,y0,x1,y1] [--json]
  python3 dither_scan.py --frames a.png b.png ... [--texel 2] [--crop ...]

For every strip frame (launch -> +70 f) it downsamples the crop to the sprite texel grid (--texel,
internal px per texel on this capture: 2 on the 1280x720 desk capture), then counts texels whose
four edge-neighbours all differ from them strongly while their diagonal neighbours match them
(a 2x2 checkerboard core). Isolated hits are pixel-art detail; it reports the CLUSTERED count
(a checkerboard texel with >= 2 checkerboard diagonal neighbours), which only an ordered-dither
dissolve or a dithered gradient produces. The gate: clustered count on every frame after the
launch frame must not exceed the launch frame's own count (the set's static dither) + 2.
Exit 0 = pass, 1 = checkerboard dissolve present, 2 = usage. Needs numpy + Pillow.
"""
import json, os, sys
import numpy as np
from PIL import Image


def scan(path, crop, texel):
    im = Image.open(path).convert('RGB')
    if crop:
        im = im.crop(crop)
    a = np.asarray(im).astype(np.int32)
    # Texel grid: sample the top-left pixel of each texel (nearest, no averaging).
    a = a[::texel, ::texel]
    lum = (a[..., 0] * 299 + a[..., 1] * 587 + a[..., 2] * 114) // 1000
    c = lum[1:-1, 1:-1]
    up, dn, lf, rt = lum[:-2, 1:-1], lum[2:, 1:-1], lum[1:-1, :-2], lum[1:-1, 2:]
    ul, ur, dl, dr = lum[:-2, :-2], lum[:-2, 2:], lum[2:, :-2], lum[2:, 2:]
    T = 28  # luma step that reads as a different shade
    edges_differ = (np.abs(c - up) > T) & (np.abs(c - dn) > T) & (np.abs(c - lf) > T) & (np.abs(c - rt) > T)
    same_sign = (np.sign(c - up) == np.sign(c - dn)) & (np.sign(c - up) == np.sign(c - lf)) & (np.sign(c - up) == np.sign(c - rt))
    diag_match = (np.abs(c - ul) <= T) & (np.abs(c - ur) <= T) & (np.abs(c - dl) <= T) & (np.abs(c - dr) <= T)
    cb = edges_differ & same_sign & diag_match
    raw = int(cb.sum())
    # Clustered: checkerboard texels with >= 2 checkerboard diagonal neighbours.
    p = np.pad(cb, 1)
    nb = p[:-2, :-2].astype(int) + p[:-2, 2:] + p[2:, :-2] + p[2:, 2:]
    clustered = int((cb & (nb >= 2)).sum())
    return raw, clustered


def main(argv):
    if not argv or '--help' in argv:
        print(__doc__); return 2
    texel = int(argv[argv.index('--texel') + 1]) if '--texel' in argv else 2
    crop = [int(v) for v in argv[argv.index('--crop') + 1].split(',')] if '--crop' in argv else None
    as_json = '--json' in argv
    if '--frames' in argv:
        i = argv.index('--frames') + 1
        frames = []
        while i < len(argv) and not argv[i].startswith('--'):
            frames.append(argv[i]); i += 1
    else:
        run = argv[0]
        with open(os.path.join(run, 'strip-frames.json')) as f:
            sf = json.load(f)
        frames = [p for p in sf['frames'] if p]
        if crop is None:
            crop = sf['crop']
    rows = []
    for p in frames:
        raw, cl = scan(p, crop, texel)
        rows.append({'frame': os.path.basename(p), 'raw': raw, 'clustered': cl})
    floor = rows[0]['clustered'] + 2 if rows else 0
    bad = [r for r in rows[1:] if r['clustered'] > floor]
    verdict = 'pass' if not bad else 'checkerboard-dissolve'
    if as_json:
        print(json.dumps({'texel': texel, 'crop': crop, 'rows': rows, 'floor': floor, 'verdict': verdict}, indent=1))
    else:
        print(f'dither_scan (texel {texel}, crop {crop}): floor = launch frame clustered {rows[0]["clustered"] if rows else 0} + 2')
        for r in rows:
            flag = '  <-- over floor' if r in bad else ''
            print(f"  {r['frame']}: raw {r['raw']:4d}  clustered {r['clustered']:4d}{flag}")
        print(f'verdict: {verdict}')
    return 0 if not bad else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
