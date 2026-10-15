"""sprite_post: supersampled renders -> pixel-art sprite sheet (python3 or the Blender python; numpy, Pillow optional for PNG).

  python3 -I sprite_post.py passes_dir --out sheet.png [--ss 4] [--palette ramps.json:ember,rock] [--colours 16]
      [--hysteresis 0.25] [--outline 1a1218] [--selout] [--scale 1] [--json sheet.json]
Steps (lab.md 8: colours per frame 95 -> 34 -> 16, pixel churn -27 % relative, verified):
  mode_down     dominant-colour downsample of each ss x ss block (alpha = coverage >= 50 %); never a
                bilinear/box downscale (that gives a soft 'shrunken render')
  hysteresis    keep the previous frame's colour for a pixel when it still holds >= --hysteresis of its
                block (temporal stability across frames of one facing)
  palette lock  nearest colour in OKLab to the given ramps (or a k-means palette of --colours from
                the frames themselves when no ramps are given)
  outline       1 px 4-neighbour outer outline in a dark hue-shifted colour (never pure black);
                --selout darkens the outermost opaque pixels instead
Sheet layout: one row per facing, frames left to right, each cell height px; also writes <out>_x4.png
for review (nearest x4). normal_* passes are packed the same way into <out>_normal.png when present.
"""
import sys, os, json, glob, argparse
import numpy as np
try:
    from PIL import Image
except ImportError:  # Blender python / hash-locked venv: PNG-only fallback
    import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__)))
    from pngio import Image


def blocks(a, s):
    h, w = a.shape[0] // s, a.shape[1] // s
    return a[:h * s, :w * s].reshape(h, s, w, s, -1).swapaxes(1, 2).reshape(h, w, s * s, -1)


def mode_down(img, s, prev=None, hysteresis=0.0):
    b = blocks(img, s); opaque = b[..., 3] >= 128
    key = (b[..., 0].astype(np.int64) << 16) | (b[..., 1].astype(np.int64) << 8) | b[..., 2]
    key = np.where(opaque, key, -1)
    h, w, n = key.shape
    out = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        for x in range(w):
            k = key[y, x]; k = k[k >= 0]
            if len(k) * 2 < n:
                continue
            vals, cnt = np.unique(k, return_counts=True); v = vals[cnt.argmax()]
            if prev is not None and hysteresis > 0 and prev[y, x, 3] > 0:
                pk = (int(prev[y, x, 0]) << 16) | (int(prev[y, x, 1]) << 8) | int(prev[y, x, 2])
                if (k == pk).sum() >= hysteresis * n:
                    v = pk
            out[y, x] = ((v >> 16) & 255, (v >> 8) & 255, v & 255, 255)
    return out


def oklab(rgb):
    c = rgb.astype(np.float64) / 255
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    lms = c @ np.array([[0.4122214708, 0.2119034982, 0.0883024619], [0.5363325363, 0.6806995451, 0.2817188376], [0.0514459929, 0.1073969566, 0.6299787005]])
    return np.cbrt(lms) @ np.array([[0.2104542553, 1.9779984951, 0.0259040371], [0.7936177850, -2.4285922050, 0.7827717662], [-0.0040720468, 0.4505937099, -0.8086757660]])


def kmeans_palette(frames, k=16, iters=12, seed=0):
    px = np.concatenate([f[f[..., 3] > 0][:, :3] for f in frames])
    lab = oklab(px); rng = np.random.default_rng(seed)
    cent = lab[rng.choice(len(lab), min(k, len(lab)), replace=False)]
    for _ in range(iters):
        lbl = ((lab[:, None] - cent[None]) ** 2).sum(-1).argmin(1)
        for i in range(len(cent)):
            if (lbl == i).any():
                cent[i] = lab[lbl == i].mean(0)
    lbl = ((lab[:, None] - cent[None]) ** 2).sum(-1).argmin(1)
    return np.array([px[lbl == i].mean(0) if (lbl == i).any() else [0, 0, 0] for i in range(len(cent))]).astype(np.uint8)


def quantize_oklab(img, pal):
    out = img.copy(); m = out[..., 3] > 0
    if m.any():
        lab = oklab(out[m][:, :3]); pl = oklab(pal)
        out[m, :3] = pal[((lab[:, None] - pl[None]) ** 2).sum(-1).argmin(1)]
    return out


def outline(img, rgb=(26, 18, 24), selout=False):
    a = img[..., 3] > 0
    n = np.zeros_like(a)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        n |= np.roll(np.roll(a, dy, 0), dx, 1)
    out = img.copy(); out[n & ~a] = (*rgb, 255)
    if selout:
        inner = a & ~(np.roll(a, 1, 0) & np.roll(a, -1, 0) & np.roll(a, 1, 1) & np.roll(a, -1, 1))
        out[inner, :3] = (out[inner, :3] * 0.62).astype(np.uint8)
    return out


def hex_rgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('passes'); ap.add_argument('--out', required=True); ap.add_argument('--ss', type=int, default=None)
    ap.add_argument('--palette', help='ramps.json:rampA,rampB'); ap.add_argument('--colours', type=int, default=16)
    ap.add_argument('--hysteresis', type=float, default=0.25); ap.add_argument('--outline', default='1a1218'); ap.add_argument('--selout', action='store_true')
    ap.add_argument('--scale', type=int, default=1); ap.add_argument('--json')
    a = ap.parse_args(argv)
    meta = json.load(open(os.path.join(a.passes, 'passes.json'))) if os.path.exists(os.path.join(a.passes, 'passes.json')) else {}
    ss = a.ss or meta.get('ss', 4)
    files = sorted(glob.glob(os.path.join(a.passes, 'albedo_f*_*.png')))
    if not files:
        print(json.dumps({'error': f'no albedo_f*_*.png in {a.passes}'})); return 2
    facings = sorted({os.path.basename(f).split('_')[1] for f in files})
    rows = []; stats = {'frames': 0, 'colours_per_frame': []}
    pal = None
    if a.palette:
        src, names = a.palette.split(':'); ramps = json.load(open(src))['ramps']
        pal = np.array([hex_rgb(c) for n in names.split(',') for c in ramps[n]], np.uint8)
    for fac in facings:
        row = []; prev = None
        fr = sorted(f for f in files if f'_{fac}_' in os.path.basename(f))
        downs = []
        for f in fr:
            img = np.asarray(Image.open(f).convert('RGBA'))
            d = mode_down(img, ss, prev, a.hysteresis); prev = d; downs.append(d)
        if pal is None:
            pal = kmeans_palette(downs, a.colours)
        for d in downs:
            d = quantize_oklab(d, pal)
            d = outline(d, hex_rgb(a.outline), a.selout) if a.outline.lower() != 'none' else d
            row.append(d); stats['frames'] += 1
            stats['colours_per_frame'].append(int(len(np.unique(d[d[..., 3] > 0][:, :3], axis=0))))
        rows.append(row)
    h = rows[0][0].shape[0]; w = rows[0][0].shape[1]
    sheet = np.zeros((h * len(rows), w * max(len(r) for r in rows), 4), np.uint8)
    for i, r in enumerate(rows):
        for j, d in enumerate(r):
            sheet[i * h:(i + 1) * h, j * w:(j + 1) * w] = d
    if a.scale > 1:
        sheet = sheet.repeat(a.scale, 0).repeat(a.scale, 1)
    Image.fromarray(sheet).save(a.out)
    base, ext = os.path.splitext(a.out)
    Image.fromarray(sheet.repeat(4, 0).repeat(4, 1)).save(f'{base}_x4{ext}')
    nfiles = sorted(glob.glob(os.path.join(a.passes, 'normal_f*_*.png')))
    if nfiles:
        nrows = []
        for fac in facings:
            nrow = [mode_down(np.asarray(Image.open(f).convert('RGBA')), ss) for f in sorted(x for x in nfiles if f'_{fac}_' in os.path.basename(x))]
            nrows.append(nrow)
        ns = np.zeros_like(sheet[:h * len(nrows), :w * max(len(r) for r in nrows)]) if a.scale == 1 else None
        if ns is not None:
            for i, r in enumerate(nrows):
                for j, d in enumerate(r):
                    ns[i * h:(i + 1) * h, j * w:(j + 1) * w] = d
            Image.fromarray(ns).save(f'{base}_normal{ext}')
    rep = {'out': a.out, 'facings': len(rows), 'frames_per_facing': len(rows[0]), 'cell': [w, h], 'palette_size': int(len(pal)), **stats}
    if a.json:
        json.dump(rep, open(a.json, 'w'), indent=1)
    print(json.dumps(rep)); return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
