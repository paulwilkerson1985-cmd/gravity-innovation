"""adlib.py - shared image helpers for the orbkin-art-direction scripts (numpy + Pillow only).

Imported by critique.py, screen_metrics.py, ui_checks.py and gamut_check.py. Every script adds its
own directory to sys.path first because they are run with `python3 -I` (isolated mode drops the
script directory from sys.path).

Conventions
- Boxes are "x0,y0,x1,y1" strings; values all in 0..1 are fractions of the ORIGINAL image, anything
  else is pixels of the ORIGINAL image.
- Frames are box-resampled to a working width (default 640 px = Orbkin's internal HD-2D width) so
  2000-px references, 1280-px desk captures and 1081-px phone captures measure on the same scale.
- Colour maths is CIELAB (D65) from sRGB; chroma C = hypot(a*, b*); "cool" = b* < 0.
"""
import json
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

M_RGB2XYZ = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
WHITE = np.array([0.95047, 1.0, 1.08883])

# Standard battle masks (fractions of a 16:9 frame): foe plate, own plate + command box, dialog band.
# Used when no UI-free (.clean.png) frame is available. From judge-calibration.md §2.
BATTLE_DESK_MASKS = ['0,0,0.28,0.13', '0.67,0.6,1,1', '0,0.83,1,1']


def srgb_to_linear(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_lab(rgb):
    """rgb: (..., 3) float 0..255 -> Lab (..., 3)."""
    lin = srgb_to_linear(np.asarray(rgb, np.float64))
    xyz = (lin @ M_RGB2XYZ.T) / WHITE
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def lab_to_srgb(lab):
    """lab: (..., 3) -> uint8 sRGB (..., 3)."""
    lab = np.asarray(lab, np.float64)
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], -1)
    xyz = np.where(f ** 3 > 0.008856, f ** 3, (f - 16 / 116) / 7.787) * WHITE
    lin = np.clip(xyz @ np.linalg.inv(M_RGB2XYZ).T, 0, 1)
    srgb = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * lin ** (1 / 2.4) - 0.055)
    return (srgb * 255 + 0.5).astype(np.uint8)


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb):
    return '#%02x%02x%02x' % tuple(int(v) for v in rgb)


def kmeans(X, k=8, it=25, seed=0):
    """Plain k-means in whatever space X is in. Returns centres and weights (deterministic seed)."""
    rng = np.random.default_rng(seed)
    k = min(k, len(X))
    C = X[rng.choice(len(X), k, replace=False)].copy()
    lab = np.zeros(len(X), int)
    for _ in range(it):
        lab = ((X[:, None, :] - C[None]) ** 2).sum(-1).argmin(1)
        for j in range(k):
            m = X[lab == j]
            if len(m):
                C[j] = m.mean(0)
    return C, np.bincount(lab, minlength=k) / len(X)


def parse_box(s, W, H):
    v = [float(x) for x in str(s).split(',')]
    if len(v) != 4:
        raise ValueError(f'box needs 4 numbers: {s!r}')
    if all(0 <= x <= 1.0 for x in v):
        v = [v[0] * W, v[1] * H, v[2] * W, v[3] * H]
    return [int(round(x)) for x in v]


def box_mask(boxes, W, H, sx=1.0, sy=1.0):
    """Boolean mask (H, W) at working scale from boxes given in original pixels (scaled by sx, sy)."""
    m = np.zeros((H, W), bool)
    for x0, y0, x1, y1 in boxes:
        m[max(0, int(y0 * sy)):min(H, int(np.ceil(y1 * sy))), max(0, int(x0 * sx)):min(W, int(np.ceil(x1 * sx)))] = True
    return m


def spectral_residual_saliency(gray):
    """Hou & Zhang 2007 on a 64-px-wide thumbnail, returned at full working size in 0..1.
    Crude: it tends to find windows and beams, not sprites. Use the focal ratios as the real signal."""
    h, w = gray.shape
    g = np.asarray(Image.fromarray(gray.astype(np.uint8)).resize((64, max(8, int(h * 64 / w))), Image.BILINEAR), float)
    F = np.fft.fft2(g)
    A = np.log(np.abs(F) + 1e-9)
    P = np.angle(F)
    Ap = np.pad(A, 1, mode='wrap')
    avg = sum(Ap[i:i + A.shape[0], j:j + A.shape[1]] for i in range(3) for j in range(3)) / 9
    sal = np.abs(np.fft.ifft2(np.exp(A - avg + 1j * P))) ** 2
    img = Image.fromarray((sal / max(1e-9, sal.max()) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5))
    return np.asarray(img.resize((w, h), Image.BILINEAR), float) / 255


def r(x, n=3):
    """Round for JSON; None for NaN/inf/None."""
    if x is None:
        return None
    try:
        xf = float(x)
    except (TypeError, ValueError):
        return x
    if not np.isfinite(xf):
        return None
    return round(xf, n)


def load_capture_shot(spec):
    """'capture.json:ID' -> (shot dict, capture dir). Raises ValueError with the available ids."""
    path, sid = spec.rsplit(':', 1)
    with open(path) as f:
        cap = json.load(f)
    for sh in cap.get('shots', []):
        if sh.get('id') == sid:
            return sh, os.path.dirname(os.path.abspath(path))
    ids = ', '.join(s.get('id', '?') for s in cap.get('shots', []))
    raise ValueError(f'shot {sid!r} not in {path}; available: {ids}')


CSS_WIDTH = {'desk': 1280, 'phone': 393, 'land': 844}   # harness viewports (CSS px)


def css_scale(shot, image_width):
    """Device px per CSS px of a harness shot (phone 2.75, desk 1): for --emitter given in CSS px and for
    the falloff ring radii, which are specified in CSS px whatever the capture format."""
    css_w = CSS_WIDTH.get(shot.get('vp'))
    if css_w and image_width >= css_w * 1.5:
        return image_width / css_w
    return 1.0


def layout_scale(shot, image_width):
    """Factor that maps capture.json layout boxes onto the image. Two harness formats exist: the gate's
    capture.mjs since d579229 writes boxes in DEVICE px and records `layoutDpr` (factor 1); older captures
    (the pilot's, the refine harness) wrote CSS px, so phone boxes need x2.75. A box that already exceeds the
    CSS viewport is treated as device px as well."""
    if shot.get('layoutDpr') is not None:
        return 1.0
    css_w = CSS_WIDTH.get(shot.get('vp'))
    if css_w and image_width >= css_w * 1.5:
        lay = layout_list(shot)
        if lay and max(b['x'] + b['w'] for b in lay) > css_w * 1.05:
            return 1.0
        return image_width / css_w
    return 1.0


def layout_list(shot):
    """The layout boxes of a harness shot, wherever the harness version put them.
    capture.mjs (orbkin-visual-gate) writes shot['layout'] at the top level; the older refine harness
    wrote shot['stats']['layout']. Entries are {name, x, y, w, h} in CSS px. [] when absent."""
    lay = shot.get('layout')
    if isinstance(lay, dict):
        lay = lay.get('subjects')
    if not lay:
        lay = (shot.get('stats') or {}).get('layout')
    return [b for b in (lay or []) if isinstance(b, dict) and all(k in b for k in ('name', 'x', 'y', 'w', 'h'))]


def layout_boxes(shot, names=('mine', 'foe'), scale=1.0):
    """Pixel boxes 'x0,y0,x1,y1' (image pixels) for the named layout entries of a harness shot."""
    out = []
    for b in layout_list(shot):
        if b.get('name') in names:
            out.append('%d,%d,%d,%d' % (round(b['x'] * scale), round(b['y'] * scale),
                                         round((b['x'] + b['w']) * scale), round((b['y'] + b['h']) * scale)))
    return out


def layout_entries(shot, scale=1.0):
    """[(name, (x0, y0, x1, y1)) ...] in image pixels."""
    out = []
    for b in layout_list(shot):
        out.append((b['name'], (round(b['x'] * scale), round(b['y'] * scale), round((b['x'] + b['w']) * scale), round((b['y'] + b['h']) * scale))))
    return out


def capture_sanity(shot):
    """Why a harness shot must not be trusted even when ok:true (the pilot saw a blank phone frame and a
    black-walled desk frame both reported ok). Returns a list of strings; empty = nothing suspicious."""
    bad = []
    if shot.get('ok') is False:
        bad.append('shot.ok is false')
    for e in shot.get('errors') or []:
        bad.append(f'capture error: {str(e)[:120]}')
    for w in shot.get('warnings') or []:
        bad.append(f'capture warning: {str(w)[:120]}')
    sc = shot.get('selfCheck')
    if isinstance(sc, dict) and sc.get('identical') is False:
        bad.append('self-check not identical (unfrozen clock or a loaded box)')
    if isinstance(sc, str) and sc not in ('identical', 'ok'):
        bad.append(f'self-check: {sc}')
    if not layout_list(shot):
        bad.append('no layout boxes in capture.json (window.__game.layout() failed or the scene never mounted)')
    calls = shot.get('calls')
    if isinstance(calls, (int, float)) and calls < 10:
        bad.append(f'only {calls} draw calls: the scene is probably missing')
    return bad


EMITTERS_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'emitters.json')


def load_emitters(path=None):
    with open(path or EMITTERS_JSON) as f:
        return json.load(f)


def emitter_for(arena, vp, path=None):
    """(x_frac, y_frac, radii, status) of the arena's protected floor emitter for a harness viewport
    ('desk' | 'phone'), from assets/emitters.json; (None, None, radii, status) when the arena has none or
    it is unlocated for that view. Raises KeyError for an arena the table does not know."""
    tab = load_emitters(path)['arenas']
    if arena not in tab:
        raise KeyError(f'arena {arena!r} not in emitters.json (known: {", ".join(sorted(tab))})')
    e = tab[arena]
    radii = e.get('radii_css_px') or [0, 100, 250]
    if isinstance(radii, dict):
        radii = radii.get(vp) or radii.get('desk') or [0, 100, 250]
    pos = e.get(vp) if e.get('emitter') else None
    if not pos:
        return None, None, radii, e.get('status', 'none')
    return float(pos[0]), float(pos[1]), radii, e.get('status', 'proposed')


def disc_mask(width, H, cx_frac, cy_frac, radius_css_px, css_scale, s):
    """Boolean (H, width) mask of the disc of `radius_css_px` CSS px around a frame-fraction centre, at the
    working scale `s` (working px per original px); css_scale = original px per CSS px."""
    yy, xx = np.mgrid[0:H, 0:width]
    cx, cy = cx_frac * width, cy_frac * H
    return np.hypot(xx - cx, yy - cy) <= radius_css_px * css_scale * s


def resolve_clean(raw_path):
    """<id>.png -> <id>.clean.png if it exists (canvas-only frame, no UI), else None."""
    if raw_path.endswith('.clean.png'):
        return None
    cand = raw_path[:-4] + '.clean.png' if raw_path.endswith('.png') else raw_path + '.clean.png'
    return cand if os.path.exists(cand) else None


def ui_mask_from_clean(raw_im, clean_im, thresh=24, grow=9):
    """Pixels where the UI changed the frame (raw vs canvas-only), grown a little to cover frames."""
    a = np.asarray(raw_im, np.int16)
    b = np.asarray(clean_im, np.int16)
    if a.shape != b.shape:
        raise ValueError(f'raw {a.shape} and clean {b.shape} differ in size')
    ui = (np.abs(a - b).max(-1) > thresh)
    return np.asarray(Image.fromarray(ui).filter(ImageFilter.MaxFilter(grow)))


def working_frame(im, width):
    """Box-resample a PIL image to the working width. Returns (float array HxWx3, scale)."""
    W0, H0 = im.size
    H = max(1, round(H0 * width / W0))
    return np.asarray(im.resize((width, H), Image.BOX), np.float64), width / W0


def palette_swatch(centres_lab, weights, cell=40):
    order = np.argsort(-np.asarray(weights))
    sw = Image.new('RGB', (cell * len(order), cell))
    for k, i in enumerate(order):
        rgb = tuple(int(v) for v in lab_to_srgb(np.asarray(centres_lab[i])))
        sw.paste(rgb, (cell * k, 0, cell * k + cell, cell))
    return sw


def hue_hist_image(hist, width=360, height=60):
    """12-bin hue histogram as coloured bars (hue of the bin, height = share)."""
    im = Image.new('RGB', (width, height), (24, 24, 24))
    d = ImageDraw.Draw(im)
    n = len(hist)
    bw = width / n
    mx = max(1e-6, max(hist))
    for i, h in enumerate(hist):
        hue = (i + 0.5) * 360 / n
        lab = np.array([60.0, 45 * np.cos(np.radians(hue)), 45 * np.sin(np.radians(hue))])
        col = tuple(int(v) for v in lab_to_srgb(lab))
        bh = int(round(h / mx * (height - 4)))
        d.rectangle([int(i * bw) + 1, height - 2 - bh, int((i + 1) * bw) - 2, height - 2], fill=col)
    return im


def compose_sheet(tiles, cols, pad=6, bg=(18, 18, 18), label_font=None):
    """tiles: list of (PIL image, caption). Scales every tile to the first tile's width."""
    w = tiles[0][0].width
    cells = []
    for im, cap in tiles:
        if im.width != w:
            im = im.resize((w, max(1, round(im.height * w / im.width))), Image.NEAREST)
        cells.append((im, cap))
    hs = [im.height for im, _ in cells]
    rows = (len(cells) + cols - 1) // cols
    row_h = [max(hs[i * cols:(i + 1) * cols]) + 16 for i in range(rows)]
    sheet = Image.new('RGB', (cols * (w + pad) + pad, sum(row_h) + pad * (rows + 1)), bg)
    d = ImageDraw.Draw(sheet)
    y = pad
    for ri in range(rows):
        for ci in range(cols):
            k = ri * cols + ci
            if k >= len(cells):
                break
            im, cap = cells[k]
            x = pad + ci * (w + pad)
            d.text((x + 2, y), cap, fill=(230, 230, 230))
            sheet.paste(im, (x, y + 14))
        y += row_h[ri] + pad
    return sheet


if __name__ == '__main__':
    # usage: python3 -I adlib.py  (library only; prints this docstring)
    print(__doc__)
