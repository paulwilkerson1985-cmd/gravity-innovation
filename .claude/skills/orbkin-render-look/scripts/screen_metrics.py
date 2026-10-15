#!/usr/bin/env python3
"""Depth-of-field band profile and value/colour statistics of HD-2D frames (clean canvas PNGs).

  python3 -I ${CLAUDE_SKILL_DIR}/scripts/screen_metrics.py AFTER.clean.png [--before BEFORE.clean.png]
      [--focal x0,y0,x1,y1 | --focal subjects] [--focus-band bottom,top] [--band-max 0.6] [--band-tol 0.03] [--json OUT.json]

The frame is first reduced to its INTERNAL pixel grid (one sample per device-px block; the grid size
and scale come from the capture's sidecar `<name>.json`, or --grid W,H / --scale S), so a phone frame
is measured at 271×586 and a desk frame at 640×360: the nearest upscale never counts as detail.
Then, per 12 horizontal bands (listed top → bottom), relative sharpness
  sharp_b = mean|L − G(1)| / mean|L − G(4)|  divided by the sharpest band,
plus notan (dark/mid/light shares), L* mean, chroma p95 and the cool-pixel share (CIE b* < 0).
Checks (exit 1 when any fails):
  --focus-band b,t    the Grade's focusBottom,focusTop (BOTTOM-UP fractions, as in pipeline.ts): the
                      bands inside that range must be as sharp as before (≥ before − --band-tol; ≥ 0.9
                      when there is no --before) and the top band and the bottom band ≤ --band-max.
                      The focus band is normalised by the sharpest band, so a content-driven low band
                      is judged against --before, not an absolute.
  --focal …           with --before: the subject crop (fractions of width/height, or `subjects` = the
                      union box from the sidecar meta written by capture.mjs) must be pixel-identical
                      (focalDiff = 0). Hold the camera (drift off, pan 0) when measuring this: a frozen
                      frame at a non-zero pan rasterises differently before/after a camera change, and a
                      vignette change reaches any subject wider than the frame's centre third.
Also reported: focalDiffByRadiusPct (in the grade's vignette radius hypot((u−0.5)·aspect, v−0.5): a
vignette change shows only beyond 0.85 − vignetteSoft, i.e. outside r ≈ 0.2–0.4; bands r<0.2 / 0.2–0.4 / ≥0.4), focalDiffMaxLevel, focalDiffRead, and maxBandJump with seamWarning (> 0.5
between adjacent bands reads as a visible seam where the blur starts).
Octopath field shots at 640 px for context: top 0.46–0.64, bottom 0.26–0.36, focus band at 0.5–0.67 of
the height (non-battle-screens §1.2). These are critique context, not targets.
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageFilter

def load(p):
    return Image.open(p).convert('RGB')

def luma(im):
    a = np.asarray(im).astype(np.float64)
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]

def to_grid(im, path, grid=None, scale=None):
    """Reduce a device-px capture to the internal grid (block centres), using the sidecar meta."""
    meta = os.path.splitext(path)[0]
    meta = (meta[:-6] if meta.endswith('.clean') else meta) + '.json'
    if grid is None or scale is None:
        try:
            m = json.load(open(meta))
            grid = grid or (m.get('perf') or {}).get('internal') or [m['canvas']['bw'], m['canvas']['bh']]
            scale = scale or m.get('scale')
        except (OSError, ValueError, KeyError):
            pass
    if not scale:
        scale = max(1, round(im.width / (grid[0] if grid else 640)))
    a = np.asarray(im)
    s = int(scale)
    off = s // 2
    g = a[off::s, off::s]
    if grid:
        g = g[:min(g.shape[0], grid[1]), :min(g.shape[1], grid[0])]
    return Image.fromarray(g), s, [g.shape[1], g.shape[0]]

def dof_profile(im, bands=12):
    h = im.height
    L = Image.fromarray(np.clip(luma(im), 0, 255).astype(np.uint8))
    l = np.asarray(L).astype(np.float64)
    g1 = np.asarray(L.filter(ImageFilter.GaussianBlur(1))).astype(np.float64)
    g4 = np.asarray(L.filter(ImageFilter.GaussianBlur(4))).astype(np.float64)
    out = []
    for b in range(bands):
        y0, y1 = int(h * b / bands), int(h * (b + 1) / bands)
        hi = np.abs(l[y0:y1] - g1[y0:y1]).mean()
        lo = np.abs(l[y0:y1] - g4[y0:y1]).mean()
        out.append(hi / lo if lo > 1e-6 else 0.0)
    m = float(max(out)) or 1.0
    return [round(float(v) / m, 3) for v in out]

def srgb_to_lab(a):
    a = a / 255.0
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    L = 116 * f[..., 1] - 16
    A = 500 * (f[..., 0] - f[..., 1])
    B = 200 * (f[..., 1] - f[..., 2])
    return L, A, B

def stats(im):
    small = im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.BOX)
    a = np.asarray(small).astype(np.float64)
    L, A, B = srgb_to_lab(a)
    C = np.hypot(A, B)
    dark, mid, light = (L < 35).mean(), ((L >= 35) & (L < 65)).mean(), (L >= 65).mean()
    return {'notan': [round(float(dark), 3), round(float(mid), 3), round(float(light), 3)], 'Lstar': round(float(L.mean()), 1), 'chromaP95': round(float(np.percentile(C, 95)), 1), 'coolShare': round(float((B < 0).mean()), 3), 'litBstar': round(float(B[L > 50].mean()) if (L > 50).any() else 0.0, 1)}

def crop(im, box):
    x0, y0, x1, y1 = box
    return im.crop((int(x0 * im.width), int(y0 * im.height), int(x1 * im.width), int(y1 * im.height)))

def subjects_box(path):
    meta = os.path.splitext(path)[0]
    meta = (meta[:-6] if meta.endswith('.clean') else meta) + '.json'
    try:
        u = json.load(open(meta)).get('subjectsUnion')
    except (OSError, ValueError):
        u = None
    if not u:
        sys.exit(f'--focal subjects: no subjectsUnion in {meta} (capture.mjs writes it for scenes with subjects())')
    return u

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('after'); ap.add_argument('--before'); ap.add_argument('--focal'); ap.add_argument('--focus-band')
    ap.add_argument('--band-max', type=float, default=0.6); ap.add_argument('--band-tol', type=float, default=0.03); ap.add_argument('--json')
    ap.add_argument('--grid', help='internal W,H when there is no sidecar meta'); ap.add_argument('--scale', type=int, help='device px per internal px when there is no sidecar meta')
    a = ap.parse_args()
    grid = [int(v) for v in a.grid.split(',')] if a.grid else None
    im_full = load(a.after)
    im, scale, g = to_grid(im_full, a.after, grid, a.scale)
    res = {'file': a.after, 'size': [im_full.width, im_full.height], 'grid': g, 'scale': scale, 'bands': 'top→bottom', 'dof': dof_profile(im), **stats(im), 'checks': {}}
    bim = None
    if a.before:
        bim_full = load(a.before)
        bim, _, _ = to_grid(bim_full, a.before, grid, a.scale)
        res['before'] = {'file': a.before, 'dof': dof_profile(bim), **stats(bim)}
        if bim_full.size != im_full.size:
            res['checks']['sameSize'] = False
    if a.focal:
        box = subjects_box(a.after) if a.focal == 'subjects' else [float(v) for v in a.focal.split(',')]
        res['focalBox'] = box
        if a.before:
            ca, cb = np.asarray(crop(im_full, box)).astype(int), np.asarray(crop(bim_full, box)).astype(int)
            diff = int(np.abs(ca - cb).sum()) if ca.shape == cb.shape else -1
            res['focalDiff'] = diff
            if ca.shape == cb.shape:
                d = np.abs(ca - cb)
                changed = d.sum(-1) > 0
                yy, xx = np.mgrid[0:ca.shape[0], 0:ca.shape[1]]
                # the grade's vignette radius: r = hypot((u − 0.5)·aspect, v − 0.5); the vignette starts at 0.85 − vignetteSoft
                aspect = im_full.width / im_full.height
                u = box[0] + (box[2] - box[0]) * (xx + 0.5) / max(1, ca.shape[1])
                v = box[1] + (box[3] - box[1]) * (yy + 0.5) / max(1, ca.shape[0])
                rr = np.hypot((u - 0.5) * aspect, v - 0.5)
                res['focalDiffPixelsPct'] = round(100.0 * float(changed.mean()), 3)
                res['focalDiffMaxLevel'] = int(d.max())
                res['focalDiffByRadiusPct'] = {'vignetteRadius': 'hypot((u-0.5)*aspect, v-0.5); vignette starts at 0.85 - vignetteSoft', 'r<0.2': round(100.0 * float(changed[rr < 0.2].mean()), 3) if (rr < 0.2).any() else None, '0.2-0.4': round(100.0 * float(changed[(rr >= 0.2) & (rr < 0.4)].mean()), 3) if ((rr >= 0.2) & (rr < 0.4)).any() else None, 'r>=0.4': round(100.0 * float(changed[rr >= 0.4].mean()), 3) if (rr >= 0.4).any() else None}
                res['focalDiffRead'] = 'identical' if diff == 0 else ('vignette ring (centre r<0.2 untouched)' if (rr < 0.2).any() and changed[rr < 0.2].mean() < 0.001 and res['focalDiffMaxLevel'] <= 2 else 'subject pixels changed: inspect')
            res['checks']['focalIdentical'] = diff == 0
    if a.focus_band:
        bot, top = [float(v) for v in a.focus_band.split(',')]
        if bot > top:
            bot, top = top, bot
        n = len(res['dof'])
        # bands are listed top→bottom; the Grade's fractions are bottom-up: band i covers height
        # fractions [1 − (i+1)/n, 1 − i/n] bottom-up.
        idx = [i for i in range(n) if bot <= 1 - (i + 0.5) / n <= top]
        inband = [res['dof'][i] for i in idx]
        res['focusBandRowsTopDown'] = idx
        res['focusBandMin'] = min(inband) if inband else None
        if bim is not None:
            before_in = [res['before']['dof'][i] for i in idx]
            res['focusBandMinBefore'] = min(before_in) if before_in else None
            res['checks']['focusBandKept'] = bool(inband) and all(x >= y - a.band_tol for x, y in zip(inband, before_in))
        else:
            res['checks']['focusBandSharp'] = bool(inband) and min(inband) >= 0.9
        res['checks']['topBandBlurred'] = res['dof'][0] <= a.band_max
        res['checks']['bottomBandBlurred'] = res['dof'][-1] <= a.band_max
    jumps = [abs(res['dof'][i + 1] - res['dof'][i]) for i in range(len(res['dof']) - 1)]
    res['maxBandJump'] = round(max(jumps), 3)
    res['seamWarning'] = res['maxBandJump'] > 0.5  # a hard line where the blur starts: widen the ramp (focus edges) before the owner sees it
    res['pass'] = all(res['checks'].values()) if res['checks'] else None
    txt = json.dumps(res, indent=1)
    if a.json:
        open(a.json, 'w').write(txt)
    print(txt)
    sys.exit(0 if res['pass'] in (True, None) else 1)

if __name__ == '__main__':
    main()
