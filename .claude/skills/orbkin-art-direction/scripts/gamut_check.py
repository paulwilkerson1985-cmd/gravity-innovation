#!/usr/bin/env python3
"""gamut_check.py - per-arena colour gamut: derive it from an accepted frame, then fail any frame,
painter tile or grade output that leaves it or that spends the hues reserved for kin and UI.

Why: the cave frame put 98 % of its chromatic pixels in two adjacent orange bins ("monochrome
orange", judge gap #4). A gamut file makes the allowed ramps and the reserved accent hues explicit
per arena, so a painter or grade change that drifts out of it fails a script instead of a judge.

Run isolated:
  python3 -I gamut_check.py derive CLEAN.png --arena cave --out gamut.json
          [--layout capture.json:ID] [--k 14] [--reserve "180-260,300-340"] [--tol 14]
      Clusters the environment pixels (focal boxes excluded) into ramps grouped by hue family and
      writes the gamut. Reserved hues default to the 30-degree bins the environment barely uses
      (< 1 % each), marked "proposed": confirm them against docs/CREATURES.md kin palettes.
  python3 -I gamut_check.py check IMG.png [IMG2 ...] --gamut gamut.json [--layout capture.json:ID]
          [--max-outside 0.03] [--max-reserved 0.01] [--tile] [--json]
      outside_share = share of environment pixels (chroma > 12) farther than tol dE76 from every
      gamut colour; reserved_share = share of chromatic environment pixels inside a reserved hue
      range. Either above its max -> FAIL (exit 1). --tile: the image is a painter output (no
      masks, no focal boxes, every pixel counts).

Gamut JSON: {"arena", "source", "tol", "ramps": [{"name", "hue", "colors": ["#rrggbb" ...]}],
             "reserved": [{"hue": [a, b], "owner": "kin|ui|fx", "status": "proposed|confirmed"}]}
Edit it by hand to add ramp colours (hex) or adjust reserved ranges; re-derive after an accepted
grade change (the gamut is per arena per ACCEPTED frame).

Exit codes: 0 pass, 1 fail, 2 bad input.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
import adlib as A  # noqa: E402

CHROMA_MIN = 12.0   # below this a pixel is a neutral and belongs to every gamut


def hue_of(lab):
    return (np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) + 360) % 360


def in_ranges(h, ranges):
    m = np.zeros(h.shape, bool)
    for a, b in ranges:
        m |= (h >= a) & (h <= b) if a <= b else (h >= a) | (h <= b)
    return m


def env_pixels(path, layout, tile, ui_clean=True):
    """Environment Lab pixels at 640 wide: UI (clean diff) and focal boxes removed unless --tile."""
    im = Image.open(path).convert('RGB')
    W0, H0 = im.size
    keep_full = np.ones((H0, W0), bool)
    if not tile:
        clean = A.resolve_clean(path) if ui_clean else None
        if clean:
            cim = Image.open(clean).convert('RGB')
            keep_full &= ~A.ui_mask_from_clean(im, cim)
            im = cim
        if layout:
            shot, _ = A.load_capture_shot(layout)
            sc = A.layout_scale(shot, W0)
            for _, (x0, y0, x1, y1) in A.layout_entries(shot, sc):
                gx, gy = int(0.15 * (x1 - x0)), int(0.15 * (y1 - y0))
                keep_full[max(0, y0 - gy):y1 + gy, max(0, x0 - gx):x1 + gx] = False
    rgb, s = A.working_frame(im, 640)
    H = rgb.shape[0]
    keep = np.asarray(Image.fromarray(keep_full).resize((640, H), Image.NEAREST))
    return A.to_lab(rgb)[keep], (W0, H0)


def derive(a):
    try:
        lab, size = env_pixels(a.image, a.layout, False)
    except (OSError, ValueError, json.JSONDecodeError) as ex:
        print(f'error: {ex}', file=sys.stderr)
        sys.exit(2)
    C = np.hypot(lab[:, 1], lab[:, 2])
    h = hue_of(lab)
    X = lab[::max(1, len(lab) // 60000)]
    Cn, w = A.kmeans(X, a.k, it=30)
    # group clusters into ramps by hue family (neutrals -> "neutral")
    fams = {}
    for c, wt in zip(Cn, w):
        ch = float(np.hypot(c[1], c[2]))
        key = 'neutral' if ch < CHROMA_MIN else f'h{int(hue_of(c) // 30) * 30:03d}'
        fams.setdefault(key, []).append((c, wt))
    ramps = []
    for key, cl in sorted(fams.items()):
        cl.sort(key=lambda t: t[0][0])
        ramps.append({'name': key, 'hue': None if key == 'neutral' else int(key[1:]), 'share': round(float(sum(t[1] for t in cl)), 3),
                      'colors': [A.rgb_to_hex(A.lab_to_srgb(t[0])) for t in cl]})
    # reserved hues: bins the environment barely uses
    chrom = C > 15
    hh = np.histogram(h[chrom], bins=12, range=(0, 360))[0] / max(1, chrom.sum())
    if a.reserve:
        reserved = [{'hue': [float(x) for x in r.split('-')], 'owner': 'kin', 'status': 'confirmed'} for r in a.reserve.split(',')]
    else:
        reserved = []
        run = []
        for i, share in enumerate(list(hh) + [1.0]):
            if share < 0.01:
                run.append(i)
            elif run:
                reserved.append({'hue': [run[0] * 30, (run[-1] + 1) * 30], 'owner': 'kin', 'status': 'proposed', 'env_share': round(float(hh[run].sum()), 4)})
                run = []
    gam = {'arena': a.arena, 'source': os.path.abspath(a.image), 'size': list(size), 'tol': a.tol,
           'hue_hist_12x30deg': [round(float(x), 3) for x in hh], 'ramps': ramps, 'reserved': reserved,
           'note': 'ramps = allowed environment colours (dE76 tol); reserved = hue ranges the environment must not use (kin/UI accents). Re-derive after an accepted grade change.'}
    with open(a.out, 'w') as f:
        json.dump(gam, f, indent=1)
    print(json.dumps({'ok': True, 'out': a.out, 'ramps': len(ramps), 'colors': sum(len(r['colors']) for r in ramps), 'reserved': reserved}))


def check(a):
    with open(a.gamut) as f:
        gam = json.load(f)
    cols = np.array([A.to_lab(np.array(A.hex_to_rgb(c), float)) for rr in gam['ramps'] for c in rr['colors']])
    if not len(cols):
        print('error: gamut has no colours', file=sys.stderr)
        sys.exit(2)
    ranges = [tuple(r['hue']) for r in gam.get('reserved', [])]
    tol = a.tol if a.tol is not None else gam.get('tol', 14)
    results, failed = [], False
    for p in a.images:
        try:
            lab, size = env_pixels(p, a.layout, a.tile)
        except (OSError, ValueError, json.JSONDecodeError) as ex:
            print(f'error: {p}: {ex}', file=sys.stderr)
            sys.exit(2)
        C = np.hypot(lab[:, 1], lab[:, 2])
        chrom = lab[C > CHROMA_MIN]
        if len(chrom) == 0:
            results.append({'file': p, 'outside_share': 0.0, 'reserved_share': 0.0, 'verdict': 'PASS', 'note': 'no chromatic pixels'})
            continue
        X = chrom[::max(1, len(chrom) // 120000)]
        d = np.sqrt(((X[:, None, :] - cols[None]) ** 2).sum(-1)).min(1)
        outside = float((d > tol).mean())
        h = hue_of(X)
        res_share = float(in_ranges(h, ranges).mean()) if ranges else 0.0
        # where are the offenders (hue bins), to locate the critique
        off = X[d > tol]
        off_bins = np.histogram(hue_of(off), bins=12, range=(0, 360))[0] / max(1, len(off)) if len(off) else np.zeros(12)
        verdict = 'FAIL' if (outside > a.max_outside or res_share > a.max_reserved) else 'PASS'
        failed |= verdict == 'FAIL'
        results.append({'file': p, 'arena': gam.get('arena'), 'tol': tol, 'outside_share': round(outside, 4), 'max_outside': a.max_outside,
                        'reserved_share': round(res_share, 4), 'max_reserved': a.max_reserved,
                        'offender_hue_bins_12x30deg': [round(float(x), 3) for x in off_bins],
                        'offender_mean_dE': A.r(d[d > tol].mean(), 1) if (d > tol).any() else None, 'verdict': verdict})
    for rr in results:
        if not a.json:
            print(json.dumps(rr))
    if a.json:
        print(json.dumps(results, indent=1))
    sys.exit(1 if failed else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    d = sub.add_parser('derive')
    d.add_argument('image')
    d.add_argument('--arena', required=True)
    d.add_argument('--out', required=True)
    d.add_argument('--layout')
    d.add_argument('--k', type=int, default=14)
    d.add_argument('--reserve', help='comma list of hue ranges a-b (degrees) reserved for kin/UI')
    d.add_argument('--tol', type=float, default=14.0)
    c = sub.add_parser('check')
    c.add_argument('images', nargs='+')
    c.add_argument('--gamut', required=True)
    c.add_argument('--layout')
    c.add_argument('--tile', action='store_true')
    c.add_argument('--tol', type=float)
    c.add_argument('--max-outside', type=float, default=0.03)
    c.add_argument('--max-reserved', type=float, default=0.01)
    c.add_argument('--json', action='store_true')
    a = ap.parse_args()
    (derive if a.cmd == 'derive' else check)(a)


if __name__ == '__main__':
    main()
