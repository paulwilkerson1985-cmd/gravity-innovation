#!/usr/bin/env python3
"""Turn rendered or hand-drawn frames into a palette-locked pixel flipbook for FlipBatch.

  python3 book_from_renders.py --id spark-arc --out DIR --ramp spark --w 32 --h 48 FRAME_DIR [FRAME_DIR2 ...]
      [--edges 0.3,0.6,0.92] [--thr 0.25] [--dither 0.1] [--mode 1] [--close 0] [--no-band] [--gamma 1.0]
      [--blank 2,5] [--fit] [--keep-hot] [--passthrough] [--orphans 8|4|0] [--holds 1,2,2,2] [--json]

Hand-drawn frames already painted on the ramp's colours (impact_book.py output, your own painter):
use --passthrough: every texel takes the nearest ramp colour by exact/nearest RGB (no re-banding by
luminance, no mode filter, no edge band, no orphan cleanup), so the frames stay as drawn. Rendered
frames (Blender, anything with gradients) go through the full pipeline below.

Frames are the PNGs of each FRAME_DIR in name order, concatenated (put hand-ruled impact key frames
from impact_book.py in the first dir, the Blender body in the second). Pipeline per frame
(the recipe in references/elements.md section 4, measured here):
  1. premultiplied BOX downscale to --w x --h texels (alpha-weighted area average; never bilinear);
     frames already at the target size pass through untouched. --fit first crops every frame to the
     union content box (same box for all frames, so nothing swims) and pads to the aspect.
  2. value = luminance / the sequence's 99th percentile (then ** --gamma); alpha < --thr is clear.
  3. ramp index by band --edges (count = colours - 1; default evenly spaced), with a small Bayer
     offset ONLY within --dither of a band edge (so bands stay solid, no speckle).
  4. optional morphological closing (--close N, merges droplets a texel apart).
  5. --mode N passes of a 3x3 mode filter over the index image, transparency included as a class
     (kills interior speckle and lone holes; the "avoid noise" rule).
  6. orphan cleanup (--orphans 8, default): lone texels with no 8-neighbour are removed (a diagonal
     neighbour keeps dotted lines and diagonal rays); --orphans 4 is stricter, 0 disables; the count
     per frame is reported.
  7. dark edge band: outer texels become ramp index 1 unless they are the hot (top) index
     (--keep-hot keeps every index >= top-1 unbanded; --no-band skips it).
  8. --blank i,j forces those frame indices empty (electric "on twos": blanks at 2 and 5).
  9. --holds n0,n1,... duplicates source frame i n_i times, so a book with uneven holds (impact:
     1,2,2,2) plays at ONE fixed fps (60 for frame-exact holds, 30 for holds in pairs) with no
     per-frame timing hacks; the frame budget counts the duplicated frames.
Frames already at the target size skip only the downscale (step 1); they still go through steps
2-8 unless --passthrough.
Writes DIR/<id>.json {id, w, h, frames, ramp, idx[frame][w*h]} (the FlipBatch book), DIR/<id>.png
(frames side by side, RGBA, nearest) and DIR/<id>.x4.png (a 4x preview strip), and prints stats.
Ramps: the FX_RAMPS names in game/src/render/hd2d/fx.ts or "#hex,#hex,..." (index 0 transparent,
dark -> light). Needs numpy + Pillow. Exit 2 on usage errors.
"""
import json, os, sys
import numpy as np
from PIL import Image

RAMPS = {
    'flame': ['#000000', '#6a1208', '#c42a10', '#f87418', '#ffc23a', '#fff4c0'],
    'water': ['#000000', '#16378a', '#2378d2', '#48c6f0', '#c4f2ff', '#ffffff'],
    'leaf': ['#000000', '#173f1c', '#2f7a2c', '#6cc23a', '#d2f27a', '#ff7ab0'],
    'spark': ['#000000', '#c0500c', '#ffa21e', '#ffe85a', '#ffffff'],
    'rock': ['#000000', '#33221a', '#5e4330', '#8e6c4c', '#bf9b72'],
    'dust': ['#000000', '#7d6a58', '#a99178', '#cfbb9e', '#ebe0ca'],
    'smoke': ['#000000', '#251c22', '#3e3238', '#5c4e50', '#7a6c68'],
    'foam': ['#000000', '#4f7fa8', '#9fd2ec', '#e6f7ff', '#ffffff'],
    'wind': ['#000000', '#4fa6cc', '#a6e2f4', '#ffffff'],
    'star': ['#000000', '#8c8c8c', '#d0d0d0', '#ffffff'],
}
BAYER4 = (np.array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], dtype=np.float32).reshape(4, 4) + 0.5) / 16


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def load_frames(dirs):
    paths = []
    for d in dirs:
        if os.path.isfile(d):
            paths.append(d); continue
        fs = sorted(f for f in os.listdir(d) if f.lower().endswith('.png') and 'sheet' not in f and 'preview' not in f)
        if not fs:
            sys.exit(f'book_from_renders: no PNG frames in {d}')
        paths += [os.path.join(d, f) for f in fs]
    return paths, [np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255 for p in paths]


def content_box(frames, thr):
    ys, xs = [], []
    for f in frames:
        m = f[..., 3] > thr
        if m.any():
            y, x = np.where(m); ys += [y.min(), y.max()]; xs += [x.min(), x.max()]
    if not ys:
        return None
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def box_down(f, w, h):
    """Premultiplied BOX downscale (alpha-weighted area average)."""
    H, W = f.shape[:2]
    if (W, H) == (w, h):
        return f
    a = f[..., 3:4]
    pre = np.concatenate([f[..., :3] * a, a], axis=-1)
    im = Image.fromarray((pre * 255).round().astype(np.uint8), 'RGBA').resize((w, h), Image.BOX)
    d = np.asarray(im).astype(np.float32) / 255
    alpha = d[..., 3:4]
    rgb = np.clip(np.where(alpha > 1e-3, d[..., :3] / np.maximum(alpha, 1e-3), 0), 0, 1)
    return np.concatenate([rgb, alpha], axis=-1)


def closing(idx, n):
    from itertools import product
    for _ in range(n):
        m = idx > 0
        d = m.copy()
        for dy, dx in product((-1, 0, 1), repeat=2):
            d |= np.roll(np.roll(m, dy, 0), dx, 1)
        e = d.copy()
        for dy, dx in product((-1, 0, 1), repeat=2):
            e &= np.roll(np.roll(d, dy, 0), dx, 1)
        fill = e & ~m
        # filled texels take the most common non-zero neighbour value
        vals = np.stack([np.roll(np.roll(idx, dy, 0), dx, 1) for dy, dx in product((-1, 0, 1), repeat=2)])
        for y, x in zip(*np.where(fill)):
            v = vals[:, y, x]; v = v[v > 0]
            idx[y, x] = np.bincount(v).argmax() if v.size else 0
    return idx


def mode3(idx, n_classes):
    H, W = idx.shape
    p = np.pad(idx, 1, mode='edge')
    stack = np.stack([p[dy:dy + H, dx:dx + W] for dy in range(3) for dx in range(3)])
    counts = np.stack([(stack == k).sum(0) for k in range(n_classes)])
    # ties go to the centre texel's own value
    best = counts.max(0)
    centre = idx
    keep = counts[centre, np.arange(H)[:, None], np.arange(W)[None, :]] == best
    return np.where(keep, centre, counts.argmax(0))


def despeckle(idx, conn=8):
    if not conn:
        return 0
    m = idx > 0
    nb = np.zeros_like(m)
    nb[1:, :] |= m[:-1, :]; nb[:-1, :] |= m[1:, :]; nb[:, 1:] |= m[:, :-1]; nb[:, :-1] |= m[:, 1:]
    if conn == 8:
        nb[1:, 1:] |= m[:-1, :-1]; nb[1:, :-1] |= m[:-1, 1:]; nb[:-1, 1:] |= m[1:, :-1]; nb[:-1, :-1] |= m[1:, 1:]
    lone = m & ~nb
    idx[lone] = 0
    return int(lone.sum())


def nearest_ramp(f, rgb, thr):
    """Passthrough: each texel -> the nearest ramp entry by RGB distance (transparent below thr)."""
    px = f[..., :3][..., None, :]
    pal = np.asarray(rgb, dtype=np.float32)[None, None, 1:, :] / 255
    d = ((px - pal) ** 2).sum(-1)
    idx = d.argmin(-1).astype(np.int64) + 1
    idx[f[..., 3] < thr] = 0
    return idx


def edge_band(idx, keep_from):
    m = idx > 0
    nb = np.ones_like(m)
    nb[1:, :] &= m[:-1, :]; nb[:-1, :] &= m[1:, :]; nb[:, 1:] &= m[:, :-1]; nb[:, :-1] &= m[:, 1:]
    nb[0, :] = False; nb[-1, :] = False; nb[:, 0] = False; nb[:, -1] = False
    edge = m & ~nb & (idx < keep_from)
    idx[edge] = 1
    return idx


def main(argv):
    if not argv or '--help' in argv:
        print(__doc__); return 2
    o, dirs = {}, []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ('--no-band', '--fit', '--keep-hot', '--json', '--passthrough'):
            o[a] = True; i += 1
        elif a.startswith('--'):
            o[a] = argv[i + 1]; i += 2
        else:
            dirs.append(a); i += 1
    if not dirs or '--out' not in o:
        print(__doc__); return 2
    bid = o.get('--id', 'book')
    ramp = RAMPS[o['--ramp']] if o.get('--ramp', 'spark') in RAMPS else o['--ramp'].split(',')
    n = len(ramp); top = n - 1
    w, h = int(o.get('--w', '32')), int(o.get('--h', '32'))
    thr = float(o.get('--thr', '0.25')); dither = float(o.get('--dither', '0.1')); gamma = float(o.get('--gamma', '1.0'))
    edges = [float(v) for v in o['--edges'].split(',')] if '--edges' in o else [(k + 1) / (n - 1) for k in range(n - 2)]
    if len(edges) != n - 2:
        sys.exit(f'book_from_renders: --edges needs {n - 2} values for a {n - 1}-colour ramp, got {len(edges)}')
    blanks = {int(v) for v in o['--blank'].split(',')} if o.get('--blank') else set()
    paths, frames = load_frames(dirs)
    if o.get('--fit'):
        box = content_box(frames, thr)
        if box:
            x0, y0, x1, y1 = box
            # pad the box to the target aspect, centred
            bw, bh = x1 - x0, y1 - y0
            if bw / bh < w / h:
                nw = int(round(bh * w / h)); x0 -= (nw - bw) // 2; x1 = x0 + nw
            else:
                nh = int(round(bw * h / w)); y0 -= (nh - bh) // 2; y1 = y0 + nh
            frames = [np.pad(f, ((max(0, -y0), max(0, y1 - f.shape[0])), (max(0, -x0), max(0, x1 - f.shape[1])), (0, 0)))[max(0, y0) + max(0, -y0):y1 + max(0, -y0), max(0, x0) + max(0, -x0):x1 + max(0, -x0)] for f in frames]
    small = [box_down(f, w, h) for f in frames]
    lum = [0.2126 * f[..., 0] + 0.7152 * f[..., 1] + 0.0722 * f[..., 2] for f in small]
    vis = np.concatenate([l[f[..., 3] >= thr] for l, f in zip(lum, small)]) if any((f[..., 3] >= thr).any() for f in small) else np.array([1.0])
    norm = max(1e-4, float(np.percentile(vis, 99)))
    by, bx = np.indices((h, w))
    bayer = BAYER4[by % 4, bx % 4] - 0.5
    books, stats = [], []
    rgb = [hex_rgb(c) for c in ramp]
    for fi, (f, l) in enumerate(zip(small, lum)):
        if o.get('--passthrough'):
            idx = nearest_ramp(f, rgb, thr)
            if fi in blanks:
                idx[:] = 0
            books.append(idx)
            used = sorted(set(np.unique(idx).tolist()) - {0})
            stats.append({'frame': fi, 'src': os.path.basename(paths[fi]), 'fill': round(float((idx > 0).mean()), 3), 'colours': used, 'orphansRemoved': 0})
            continue
        v = np.clip(l / norm, 0, 1) ** gamma
        idx = np.ones((h, w), dtype=np.int64)
        for e in edges:
            # Bayer offset only in a thin zone around each band edge
            near = np.abs(v - e) < dither
            idx += (v + np.where(near, bayer * dither * 2, 0) > e).astype(np.int64)
        idx[f[..., 3] < thr] = 0
        if fi in blanks:
            idx[:] = 0
        c = int(o.get('--close', '0'))
        if c:
            idx = closing(idx, c)
        for _ in range(int(o.get('--mode', '1'))):
            idx = mode3(idx, n)
        orphans = despeckle(idx, int(o.get('--orphans', '8')))
        if not o.get('--no-band'):
            idx = edge_band(idx, top - 1 if o.get('--keep-hot') else top)
        books.append(idx)
        used = sorted(set(np.unique(idx).tolist()) - {0})
        stats.append({'frame': fi, 'src': os.path.basename(paths[fi]), 'fill': round(float((idx > 0).mean()), 3), 'colours': used, 'orphansRemoved': orphans})
    if o.get('--holds'):
        holds = [int(v) for v in o['--holds'].split(',')]
        if len(holds) != len(books):
            sys.exit(f'book_from_renders: --holds needs {len(books)} values, got {len(holds)}')
        books = [b for b, n in zip(books, holds) for _ in range(n)]
        stats = [dict(st, hold=n) for st, n in zip(stats, holds)]
    os.makedirs(o['--out'], exist_ok=True)
    book = {'id': bid, 'w': w, 'h': h, 'frames': len(books), 'ramp': ramp, 'idx': [b.flatten().tolist() for b in books]}
    with open(os.path.join(o['--out'], f'{bid}.json'), 'w') as fh:
        json.dump(book, fh)
    rgb = np.array(rgb, dtype=np.uint8)
    atlas = np.zeros((h, w * len(books), 4), dtype=np.uint8)
    for fi, b in enumerate(books):
        atlas[:, fi * w:(fi + 1) * w, :3] = rgb[b]
        atlas[:, fi * w:(fi + 1) * w, 3] = np.where(b > 0, 255, 0)
    Image.fromarray(atlas, 'RGBA').save(os.path.join(o['--out'], f'{bid}.png'))
    prev = Image.fromarray(atlas, 'RGBA').resize((atlas.shape[1] * 4, h * 4), Image.NEAREST)
    bg = Image.new('RGBA', prev.size, (40, 36, 48, 255)); bg.alpha_composite(prev); bg.convert('RGB').save(os.path.join(o['--out'], f'{bid}.x4.png'))
    kb = w * h * len(books) * 4 / 1024
    summary = {'id': bid, 'out': o['--out'], 'w': w, 'h': h, 'frames': len(books), 'colours': n - 1, 'rgbaKB': round(kb, 1), 'norm99': round(norm, 4), 'frameStats': stats,
               'budget': {'frames<=12': len(books) <= 12, 'size<=48': w <= 48 and h <= 48, 'colours<=6': n - 1 <= 6, 'kb<=80': kb <= 80}}
    print(json.dumps(summary, indent=1 if o.get('--json') else None))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
