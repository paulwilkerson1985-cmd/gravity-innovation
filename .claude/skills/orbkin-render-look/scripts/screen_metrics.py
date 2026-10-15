#!/usr/bin/env python3
"""Depth-of-field band profile and value/colour statistics of HD-2D frames (clean canvas PNGs).

  python3 -I ${CLAUDE_SKILL_DIR}/scripts/screen_metrics.py AFTER.clean.png [--before BEFORE.clean.png]
      [--focal x0,y0,x1,y1] [--focus-band 0.36,0.60] [--band-max 0.6] [--band-min 0.9] [--json OUT.json]

Prints JSON: per 12 horizontal bands (top → bottom) the relative sharpness
  sharp_b = mean|L − G(1)| / mean|L − G(4)|  (per band, divided by the max band)
measured at 640 px wide (the pixel-grid scale; native scale reads dither as detail), plus notan
(dark/mid/light shares), L* mean, chroma p95 and the cool-pixel share (CIE b* < 0).
Optional checks (exit 1 when any fails, 0 otherwise):
  --focus-band a,b    bands whose centre lies in [a, b] of the height must have sharpness ≥ --band-min (0.9)
                      and the top band and the bottom band must be ≤ --band-max (0.6).
  --focal x0,y0,x1,y1 (fractions of width/height) with --before: the crop must be pixel-identical in
                      both frames (focalDiff = 0): a DoF change must never touch the subject.
Octopath field shots at 640 px for context: top 0.46–0.64, bottom 0.26–0.36, focus band at 0.5–0.67 of
the height (non-battle-screens §1.2). These are critique context, not targets.
"""
import argparse, json, sys
import numpy as np
from PIL import Image, ImageFilter

def load(p):
    return Image.open(p).convert('RGB')

def luma(im):
    a = np.asarray(im).astype(np.float64)
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]

def dof_profile(im, bands=12):
    w = 640
    h = max(1, round(im.height * w / im.width))
    im = im.resize((w, h), Image.BOX)
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

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('after'); ap.add_argument('--before'); ap.add_argument('--focal'); ap.add_argument('--focus-band')
    ap.add_argument('--band-max', type=float, default=0.6); ap.add_argument('--band-min', type=float, default=0.9); ap.add_argument('--json')
    a = ap.parse_args()
    im = load(a.after)
    res = {'file': a.after, 'size': [im.width, im.height], 'dof': dof_profile(im), **stats(im), 'checks': {}}
    if a.before:
        bim = load(a.before)
        res['before'] = {'file': a.before, 'dof': dof_profile(bim), **stats(bim)}
        if bim.size != im.size:
            res['checks']['sameSize'] = False
    if a.focal:
        box = [float(v) for v in a.focal.split(',')]
        res['focalBox'] = box
        if a.before:
            ca, cb = np.asarray(crop(im, box)).astype(int), np.asarray(crop(bim, box)).astype(int)
            diff = int(np.abs(ca - cb).sum()) if ca.shape == cb.shape else -1
            res['focalDiff'] = diff
            res['checks']['focalIdentical'] = diff == 0
    if a.focus_band:
        lo, hi = [float(v) for v in a.focus_band.split(',')]
        n = len(res['dof'])
        inband = [res['dof'][i] for i in range(n) if lo <= (i + 0.5) / n <= hi]
        res['focusBandMin'] = min(inband) if inband else None
        res['checks']['focusBandSharp'] = bool(inband) and min(inband) >= a.band_min
        res['checks']['topBandBlurred'] = res['dof'][0] <= a.band_max
        res['checks']['bottomBandBlurred'] = res['dof'][-1] <= a.band_max
    res['pass'] = all(res['checks'].values()) if res['checks'] else None
    txt = json.dumps(res, indent=1)
    if a.json:
        open(a.json, 'w').write(txt)
    print(txt)
    sys.exit(0 if res['pass'] in (True, None) else 1)

if __name__ == '__main__':
    main()
