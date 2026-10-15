#!/usr/bin/env python3
"""artgate.py - image metrics of a game frame (numpy + Pillow only). DIAGNOSTICS, NOT TARGETS.

Run isolated:  python3 -I artgate.py IMG [IMG ...] [options]

Calibration (judge-calibration.md sections 2-3): none of these numbers tracks judged quality on its own
(best Spearman 0.65 over ~40 metrics), the fan-art reference fails 4 of 6 naive thresholds, and adding
noise RAISES edge energy. Use them to explain a frame and to catch gross defects (artgate_compare.py);
never raise them on purpose. Quality decisions belong to visual_judge.py.

Every image is first box-resampled to a working width (default 640 px = Orbkin's internal
HD-2D width), so numbers are comparable across 2000-px references and 1280-px captures.

Options
  --focal x0,y0,x1,y1      focal box (creatures); repeatable. Fractions (0..1) or pixels of the
                           ORIGINAL image. Several boxes are unioned.
  --mask  x0,y0,x1,y1      region excluded from all statistics (UI panels, letterbox); repeatable.
  --crop  x0,y0,x1,y1      crop before anything else (fractions or pixels).
  --clean PATH             UI-free version of the same frame; pixels that differ are masked
                           as UI and ui_* metrics are reported.
  --layout capture.json:ID take focal boxes (mine/foe) from an Orbkin harness capture.json.
  --width N                working width (default 640).
  --out PREFIX             also write PREFIX_notan.png, _squint.png, _saliency.png, _palette.png.
  --ref REF.json           JSON of reference metrics (from a previous run) -> adds "delta".
  --gate GATES.json        apply gates, print verdicts, exit 1 if any hard gate fails.
  --json                   print one JSON array (default: one JSON object per line).

Exit codes: 0 ok / all gates pass, 1 a hard gate failed, 2 bad input.
"""
import argparse, json, sys
import numpy as np
from PIL import Image, ImageFilter

# ----------------------------------------------------------------------------- colour
def srgb_to_linear(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def to_lab(rgb):
    lin = srgb_to_linear(rgb.astype(np.float64))
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = (lin @ M.T) / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)

def kmeans(X, k=8, it=25, seed=0):
    rng = np.random.default_rng(seed)
    C = X[rng.choice(len(X), k, replace=False)].copy()
    for _ in range(it):
        lab = ((X[:, None, :] - C[None]) ** 2).sum(-1).argmin(1)
        for j in range(k):
            m = X[lab == j]
            if len(m):
                C[j] = m.mean(0)
    return C, np.bincount(lab, minlength=k) / len(X)

# ----------------------------------------------------------------------------- helpers
def parse_box(s, W, H):
    v = [float(x) for x in s.split(',')]
    if all(0 <= x <= 1.0 for x in v):
        v = [v[0] * W, v[1] * H, v[2] * W, v[3] * H]
    return [int(round(x)) for x in v]

def box_mask(boxes, W, H, sx=1.0, sy=1.0):
    m = np.zeros((H, W), bool)
    for x0, y0, x1, y1 in boxes:
        m[max(0, int(y0 * sy)):min(H, int(np.ceil(y1 * sy))), max(0, int(x0 * sx)):min(W, int(np.ceil(x1 * sx)))] = True
    return m

def spectral_residual_saliency(gray):
    """Hou & Zhang 2007 on a 64-px-wide thumbnail, returned at full working size in 0..1."""
    h, w = gray.shape
    g = np.asarray(Image.fromarray(gray.astype(np.uint8)).resize((64, max(8, int(h * 64 / w))), Image.BILINEAR), float)
    F = np.fft.fft2(g); A = np.log(np.abs(F) + 1e-9); P = np.angle(F)
    Ap = np.pad(A, 1, mode='wrap')
    avg = sum(Ap[i:i + A.shape[0], j:j + A.shape[1]] for i in range(3) for j in range(3)) / 9
    sal = np.abs(np.fft.ifft2(np.exp(A - avg + 1j * P))) ** 2
    img = Image.fromarray((sal / sal.max() * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5))
    return np.asarray(img.resize((w, h), Image.BILINEAR), float) / 255

def r(x, n=3):
    return None if x is None or not np.isfinite(x) else round(float(x), n)

# ----------------------------------------------------------------------------- metrics
def measure(path, focal=(), masks=(), crop=None, clean=None, width=640, out=None):
    im = Image.open(path).convert('RGB')
    W0, H0 = im.size
    if crop:
        cb = parse_box(crop, W0, H0); im = im.crop(cb)
        W0, H0 = im.size
    ui = None
    if clean:
        cim = Image.open(clean).convert('RGB')
        if crop: cim = cim.crop(cb)
        a = np.asarray(im, np.int16); b = np.asarray(cim, np.int16)
        if a.shape == b.shape:
            ui = (np.abs(a - b).max(-1) > 24)
            ui = np.asarray(Image.fromarray(ui).filter(ImageFilter.MaxFilter(9)))
    H = max(1, round(H0 * width / W0)); s = width / W0
    rgb = np.asarray(im.resize((width, H), Image.BOX), np.float64)
    excl = box_mask([parse_box(m, W0, H0) for m in masks], width, H, s, s)
    res = {'file': path, 'size': [W0, H0], 'work': [width, H]}
    if ui is not None:
        uim = np.asarray(Image.fromarray(ui).resize((width, H), Image.NEAREST))
        res['ui_coverage'] = r(uim.mean())
        if uim.any():
            lab_ui = to_lab(rgb[uim]); res['ui_mean_chroma'] = r(np.hypot(lab_ui[:, 1], lab_ui[:, 2]).mean(), 1)
        # statistics of the WORLD use the clean frame
        rgb = np.asarray(cim.resize((width, H), Image.BOX), np.float64)
    keep = ~excl
    lab = to_lab(rgb); L = lab[..., 0]; A = lab[..., 1]; B = lab[..., 2]; C = np.hypot(A, B)
    Lk, Ck, Ak, Bk = L[keep], C[keep], A[keep], B[keep]
    # value structure
    pct = np.percentile(Lk, [1, 5, 25, 50, 75, 95, 99])
    res['L_pcts_1_5_25_50_75_95_99'] = [round(float(x), 1) for x in pct]
    res['value_range_p5_p95'] = r(pct[5] - pct[1], 1)
    notan = [float((Lk < 33).mean()), float(((Lk >= 33) & (Lk < 66)).mean()), float((Lk >= 66).mean())]
    res['notan_dark_mid_light'] = [r(x) for x in notan]
    res['notan_dominant'] = r(max(notan)); res['notan_minor'] = r(min(notan))
    # squint notan: blur ~1.5% of width first, then 3 bands at the frame's own terciles of L range
    sig = max(1.0, 0.015 * width)
    Lb = np.asarray(Image.fromarray(np.clip(L / 100 * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(sig)), float) / 255 * 100
    Lbk = Lb[keep]
    sq = [float((Lbk < 33).mean()), float(((Lbk >= 33) & (Lbk < 66)).mean()), float((Lbk >= 66).mean())]
    res['squint_notan'] = [r(x) for x in sq]
    res['squint_value_std'] = r(Lbk.std(), 2)              # big-mass value contrast
    # colour
    R_, G_, B_ = rgb[..., 0][keep], rgb[..., 1][keep], rgb[..., 2][keep]
    rg = R_ - G_; yb = 0.5 * (R_ + G_) - B_
    res['colorfulness_hasler'] = r(np.hypot(rg.std(), yb.std()) + 0.3 * np.hypot(rg.mean(), yb.mean()), 1)
    res['chroma_mean_p95'] = [r(Ck.mean(), 1), r(np.percentile(Ck, 95), 1)]
    hue = (np.degrees(np.arctan2(Bk, Ak)) + 360) % 360
    chromatic = Ck > 15
    hh = np.histogram(hue[chromatic], bins=12, range=(0, 360))[0].astype(float)
    hh = hh / max(1.0, hh.sum())
    res['hue_top2_share'] = r(np.sort(hh)[-2:].sum())
    nz = hh[hh > 0]
    res['hue_entropy_bits'] = r(-(nz * np.log2(nz)).sum(), 2)
    res['chromatic_share'] = r(chromatic.mean())
    # temperature: fixed thresholds (art-direction.md) and relative (darkest/brightest 20%)
    mb = lambda m: float(Bk[m].mean()) if m.any() else np.nan
    res['bstar_shadow_light_fixed'] = [r(mb(Lk < 30), 1), r(mb(Lk > 70), 1)]
    lo, hi = np.percentile(Lk, [20, 80])
    bs, bl = mb(Lk <= lo), mb(Lk >= hi)
    res['bstar_shadow_light_rel'] = [r(bs, 1), r(bl, 1)]
    res['delta_bstar_rel'] = r(bl - bs, 1)
    # detail distribution: L gradient energy on a 6x8 grid
    e = np.zeros_like(L)
    e[:-1, :-1] = np.abs(np.diff(L, axis=1))[:-1, :] + np.abs(np.diff(L, axis=0))[:, :-1]
    ek = np.where(keep, e, np.nan)
    th, tw = 6, 8
    tiles = []
    for i in range(th):
        for j in range(tw):
            t = ek[i * H // th:(i + 1) * H // th, j * width // tw:(j + 1) * width // tw]
            if np.isfinite(t).mean() > 0.3:
                tiles.append(np.nanmean(t))
    tiles = np.array(tiles)
    res['edge_energy_mean'] = r(np.nanmean(ek), 2)
    res['detail_cv'] = r(tiles.std() / tiles.mean())
    # high-frequency share (crispness): energy lost by a 1-px blur, relative to total gradient
    Lg = Image.fromarray(np.clip(L / 100 * 255, 0, 255).astype(np.uint8))
    Lbl = np.asarray(Lg.filter(ImageFilter.GaussianBlur(1.0)), float) / 255 * 100
    res['hf_ratio'] = r(np.abs(L - Lbl)[keep].mean() / max(1e-6, np.nanmean(ek)))
    # check.py-compatible numbers (160-px thumbnail)
    th_im = Image.fromarray(rgb.astype(np.uint8)).resize((160, max(1, round(H * 160 / width))), Image.BILINEAR)
    t = np.asarray(th_im, int); lum = 0.2126 * t[..., 0] + 0.7152 * t[..., 1] + 0.0722 * t[..., 2]
    q = (t[..., 0] >> 4) * 256 + (t[..., 1] >> 4) * 16 + (t[..., 2] >> 4)
    cnt = np.bincount(q.ravel()); p = cnt[cnt > 0] / q.size
    res['color_entropy_bits'] = r(-(p * np.log2(p)).sum(), 2)
    res['near_black_share'] = r((lum < 16).mean())
    # palette (Lab k-means on <= 40k samples of kept pixels)
    X = lab[keep]; X = X[::max(1, len(X) // 40000)]
    Cn, wts = kmeans(X, 8)
    order = np.argsort(-wts)
    res['palette_lab_w'] = [[round(float(v)) for v in Cn[i]] + [round(float(wts[i]), 3)] for i in order]
    big = Cn[wts >= 0.03]
    d = np.sqrt(((big[:, None] - big[None]) ** 2).sum(-1))
    res['palette_mean_dE'] = r(d[np.triu_indices(len(big), 1)].mean(), 1) if len(big) > 1 else None
    res['palette_L_span'] = r(big[:, 0].max() - big[:, 0].min(), 1)
    # saliency
    sal = spectral_residual_saliency(np.clip(L / 100 * 255, 0, 255))
    sal = np.where(keep, sal, 0)
    ys, xs = np.unravel_index(np.argsort(sal.ravel())[-max(1, int(sal.size * 0.02)):], sal.shape)
    res['saliency_peak_xy'] = [r(xs.mean() / width), r(ys.mean() / H)]
    # focal metrics
    if focal:
        fb = [parse_box(f, W0, H0) for f in focal]
        fm = box_mask(fb, width, H, s, s) & keep
        if fm.sum() >= 16:
            # ring = union of each box grown by 60% of its own size, minus the boxes
            grown = []
            for x0, y0, x1, y1 in fb:
                gx, gy = 0.6 * (x1 - x0), 0.6 * (y1 - y0)
                grown.append([x0 - gx, y0 - gy, x1 + gx, y1 + gy])
            ring = box_mask(grown, width, H, s, s) & ~box_mask(fb, width, H, s, s) & keep
            def ratio(a, b):
                return a / b if b > 1e-6 else np.nan
            Lstd = ratio(L[fm].std(), L[ring].std())
            edg = ratio(np.nanmean(np.where(fm, e, np.nan)), np.nanmean(np.where(ring, e, np.nan)))
            chr_ = ratio(C[fm].mean(), C[ring].mean())
            res['focal_Lstd_ratio'] = r(Lstd); res['focal_edge_ratio'] = r(edg); res['focal_chroma_ratio'] = r(chr_)
            vals = [v for v in (Lstd, edg, chr_) if np.isfinite(v) and v > 0]
            res['focal_contrast_gmean'] = r(float(np.exp(np.mean(np.log(vals))))) if vals else None
            res['focal_dL_vs_ring'] = r(L[fm].mean() - L[ring].mean(), 1)
            res['focal_saliency_ratio'] = r(ratio(sal[fm].mean(), sal[keep & ~fm].mean()))
            res['focal_area'] = r(fm.mean(), 4)
    if out:
        Image.fromarray(np.where(L < 33, 30, np.where(L < 66, 128, 230)).astype(np.uint8)).save(out + '_notan.png')
        Image.fromarray(np.clip(Lb / 100 * 255, 0, 255).astype(np.uint8)).save(out + '_squint.png')
        Image.fromarray((sal / max(1e-6, sal.max()) * 255).astype(np.uint8)).save(out + '_saliency.png')
        sw = Image.new('RGB', (40 * len(order), 40))
        for k, i in enumerate(order):
            Lc, ac, bc = Cn[i]
            fy = (Lc + 16) / 116; fx = fy + ac / 500; fz = fy - bc / 200
            xyz = np.array([fx, fy, fz]); xyz = np.where(xyz ** 3 > 0.008856, xyz ** 3, (xyz - 16 / 116) / 7.787) * np.array([0.95047, 1, 1.08883])
            Mi = np.linalg.inv(np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]))
            lin = np.clip(Mi @ xyz, 0, 1); srgb = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * lin ** (1 / 2.4) - 0.055)
            sw.paste(tuple(int(v * 255) for v in srgb), (40 * k, 0, 40 * k + 40, 40))
        sw.save(out + '_palette.png')
    return res

# ----------------------------------------------------------------------------- gates
def apply_gates(m, gates):
    """gates: {"metric": {"min": x, "max": y, "hard": bool}} ; list-valued metrics use index via 'metric[i]'."""
    verdicts, hard_fail = [], False
    for key, g in gates.items():
        name, idx = key, None
        if '[' in key:
            name, idx = key[:-1].split('['); idx = int(idx)
        v = m.get(name)
        if isinstance(v, list) and idx is not None: v = v[idx]
        if v is None:
            verdicts.append({'metric': key, 'value': None, 'pass': None, 'note': 'not measured'}); continue
        ok = (g.get('min') is None or v >= g['min']) and (g.get('max') is None or v <= g['max'])
        verdicts.append({'metric': key, 'value': v, 'pass': ok, 'hard': bool(g.get('hard'))})
        hard_fail |= (not ok and bool(g.get('hard')))
    return verdicts, hard_fail

def layout_boxes(spec):
    path, sid = spec.rsplit(':', 1)
    for sh in json.load(open(path))['shots']:
        if sh['id'] == sid:
            lay = sh.get('layout') or (sh.get('stats') or {}).get('layout') or []
            return ['%d,%d,%d,%d' % (b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h']) for b in lay if b['name'] in ('mine', 'foe')]
    return []

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('images', nargs='+')
    ap.add_argument('--focal', action='append', default=[])
    ap.add_argument('--mask', action='append', default=[])
    ap.add_argument('--crop'); ap.add_argument('--clean'); ap.add_argument('--layout')
    ap.add_argument('--width', type=int, default=640); ap.add_argument('--out')
    ap.add_argument('--ref'); ap.add_argument('--gate'); ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    focal = list(a.focal) + (layout_boxes(a.layout) if a.layout else [])
    ref = json.load(open(a.ref)) if a.ref else None
    gates = json.load(open(a.gate)) if a.gate else None
    outs, failed = [], False
    for p in a.images:
        try:
            m = measure(p, focal, a.mask, a.crop, a.clean, a.width, a.out)
        except (OSError, ValueError) as ex:
            print(f'error: {p}: {ex}', file=sys.stderr); sys.exit(2)
        if ref:
            m['delta'] = {k: r(m[k] - ref[k], 3) for k in m if isinstance(m.get(k), (int, float)) and isinstance(ref.get(k), (int, float)) and not isinstance(m[k], bool)}
        if gates:
            m['gates'], hf = apply_gates(m, gates); failed |= hf
        outs.append(m)
        if not a.json: print(json.dumps(m))
    if a.json: print(json.dumps(outs, indent=1))
    sys.exit(1 if failed else 0)

if __name__ == '__main__':
    main()
