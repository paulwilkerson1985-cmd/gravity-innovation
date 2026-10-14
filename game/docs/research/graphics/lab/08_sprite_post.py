"""Lab 08b - pixel-art post-process for Blender sprite renders + comparison sheet with the current game.

Run:  python3 08_sprite_post.py      (system python: numpy + Pillow; no Blender needed)
Ops (pure numpy):
  mode_down(img, s)   dominant-colour downsample of an s x s supersampled render (keeps flat toon tones,
                      no blended edge colours; alpha = coverage >= 50 %)  [pseudo-pixel post.downsample idea]
  box_down(img, s)    plain area average (what a naive resize does)
  quantize_oklab      nearest colour in a palette, distance in OKLab (perceptual)
  kmeans_palette      k-means in OKLab to build a palette from the render itself
  outline(img, rgb)   1 px outer outline from alpha (4-neighbour), optional 'selout' (darkened local colour)
Writes out/08/sprite_*.png and out/08_sprite_compare.png (x4 nearest, labelled).
"""
import os, numpy as np
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(HERE, 'out', '08')


def load(n):
    return np.asarray(Image.open(os.path.join(D, n)).convert('RGBA')).copy()


def save(a, n):
    Image.fromarray(a).save(os.path.join(D, n))


def blocks(a, s):
    h, w = a.shape[0] // s, a.shape[1] // s
    return a[:h * s, :w * s].reshape(h, s, w, s, -1).swapaxes(1, 2).reshape(h, w, s * s, -1)


def mode_down(img, s):
    b = blocks(img, s)                                   # (h, w, n, 4)
    opaque = b[..., 3] >= 128
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
            out[y, x] = ((v >> 16) & 255, (v >> 8) & 255, v & 255, 255)
    return out


def box_down(img, s):
    b = blocks(img, s).astype(np.float32)
    a = b[..., 3:4] / 255.0
    rgb = (b[..., :3] * a).sum(2) / np.maximum(a.sum(2), 1e-6)
    alpha = b[..., 3].mean(2)
    out = np.concatenate([rgb, alpha[..., None]], -1)
    out[..., 3] = np.where(alpha >= 128, 255, 0)
    return out.clip(0, 255).astype(np.uint8)


def oklab(rgb):
    c = rgb.astype(np.float64) / 255
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    lms = c @ np.array([[0.4122214708, 0.2119034982, 0.0883024619], [0.5363325363, 0.6806995451, 0.2817188376], [0.0514459929, 0.1073969566, 0.6299787005]])
    return np.cbrt(lms) @ np.array([[0.2104542553, 1.9779984951, 0.0259040371], [0.7936177850, -2.4285922050, 0.7827717662], [-0.0040720468, 0.4505937099, -0.8086757660]])


def kmeans_palette(img, k=12, iters=12, seed=0):
    px = img[img[..., 3] > 0][:, :3]
    lab = oklab(px)
    rng = np.random.default_rng(seed)
    cent = lab[rng.choice(len(lab), k, replace=False)]
    for _ in range(iters):
        lbl = ((lab[:, None] - cent[None]) ** 2).sum(-1).argmin(1)
        for i in range(k):
            if (lbl == i).any():
                cent[i] = lab[lbl == i].mean(0)
    # return the mean sRGB colour of each cluster
    return np.array([px[lbl == i].mean(0) if (lbl == i).any() else [0, 0, 0] for i in range(k)]).astype(np.uint8)


def quantize_oklab(img, pal):
    out = img.copy(); m = out[..., 3] > 0
    lab = oklab(out[m][:, :3]); pl = oklab(pal)
    out[m, :3] = pal[((lab[:, None] - pl[None]) ** 2).sum(-1).argmin(1)]
    return out


def outline(img, rgb=(26, 18, 24), selout=False):
    a = img[..., 3] > 0
    n = np.zeros_like(a)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        n |= np.roll(np.roll(a, dy, 0), dx, 1)
    ring = n & ~a
    out = img.copy(); out[ring] = (*rgb, 255)
    if selout:  # darken the outermost opaque pixels instead of a flat colour ring (softer, 'selective outline')
        inner = a & ~(np.roll(a, 1, 0) & np.roll(a, -1, 0) & np.roll(a, 1, 1) & np.roll(a, -1, 1))
        out[inner, :3] = (out[inner, :3] * 0.62).astype(np.uint8)
    return out


def crop_opaque(a, pad=2):
    ys, xs = np.nonzero(a[..., 3])
    return a[max(ys.min() - pad, 0):ys.max() + pad + 1, max(xs.min() - pad, 0):xs.max() + pad + 1]


results = {}
for H in (48, 96):
    tn = load(f'raw_toon_native_{H}.png')
    ts = mode_down(load(f'raw_toon_ss4_{H}.png'), 4)
    cy = box_down(load(f'raw_cycles_ss4_{H}.png'), 4)
    wb = load(f'raw_wb_native_{H}.png')
    pal = kmeans_palette(cy, k=14)
    cyq = quantize_oklab(cy, pal)
    variants = {
        'A toon native (no SS)': outline(tn),
        'B toon SS4 mode-down': outline(ts),
        'C cycles SS4 box-down': outline(cy),
        'D cycles + 14-col OKLab': outline(cyq),
        'E workbench native': outline(wb),
    }
    for k, v in variants.items():
        save(v, f'sprite_{H}_{k[0]}.png')
        results[f'{H}:{k}'] = int(len(np.unique(v[v[..., 3] > 0][:, :3], axis=0)))
    variants['B toon SS4 selout'] = outline(ts, selout=True)
    results[f'{H}:B selout'] = int(len(np.unique(variants['B toon SS4 selout'][variants['B toon SS4 selout'][..., 3] > 0][:, :3], axis=0)))
    if H == 48:
        v48 = variants
    else:
        v96 = variants

# game crops (current in-game sprite bake, 1280x720 capture = 2 device px per internal px)
g = np.asarray(Image.open(os.path.join(D, 'game_wild_meadow.png')).convert('RGBA'))
ashkit = g[372:512, 480:600]
breezel = g[310:420, 708:806]


def to_internal(a):  # 2x device px -> 1 internal px (nearest), to compare at true texel size
    return a[::2, ::2]


def tile(a, scale, label, bg=(111, 143, 90)):
    a = a.copy()
    rgb = a[..., :3].astype(np.float32); al = a[..., 3:4].astype(np.float32) / 255
    comp = (rgb * al + np.array(bg, np.float32) * (1 - al)).astype(np.uint8)
    im = Image.fromarray(comp).resize((a.shape[1] * scale, a.shape[0] * scale), Image.NEAREST)
    canvas = Image.new('RGB', (max(im.width, 230), im.height + 18), (24, 26, 32))
    canvas.paste(im, ((canvas.width - im.width) // 2, 18))
    ImageDraw.Draw(canvas).text((4, 3), label, fill=(230, 230, 230))
    return canvas


rows = []
row = [tile(crop_opaque(v), 4, f'48px {k}') for k, v in v48.items()]
row += [tile(to_internal(ashkit), 4, 'GAME Ashkit (internal px)', bg=(0, 0, 0)), tile(to_internal(breezel), 4, 'GAME Breezel (internal px)', bg=(0, 0, 0))]
rows.append(row)
rows.append([tile(crop_opaque(v), 2, f'96px {k}') for k, v in v96.items()])
W = max(sum(t.width for t in r) for r in rows); Hh = sum(max(t.height for t in r) for r in rows)
sheet = Image.new('RGB', (W, Hh), (24, 26, 32)); y = 0
for r in rows:
    x = 0
    for t in r:
        sheet.paste(t, (x, y)); x += t.width
    y += max(t.height for t in r)
sheet.save(os.path.join(HERE, 'out', '08_sprite_compare.png'))
print(results)
