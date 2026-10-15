#!/usr/bin/env python3
"""critique.py - derive the critique images and numbers for an Orbkin frame (numpy + Pillow only).

This is the S1 step of orbkin-art-direction: it turns a capture into the things a seasoned art
director looks at (squint, notan, 160-px thumbnail, palette, hue histogram, saliency) plus the
measured colour/light/value/focal numbers, and prints the look-bible RANGES next to them as
critique context. It never gates: the gate is orbkin-visual-gate's pairwise judge.

Run isolated:
  python3 -I critique.py FRAME.png [--layout capture.json:ID] [--clean FRAME.clean.png]
          [--focal x0,y0,x1,y1 ...] [--mask x0,y0,x1,y1 ...] [--preset battle-desk] [--crop box]
          [--width 640] [--out PREFIX] [--sheet] [--anchor sealed.json] [--json]

  --layout   take the focal boxes (mine/foe by default; --subjects to change) and the matching
             .clean.png from an orbkin-visual-gate / refine-harness capture.json. Recommended.
  --clean    UI-free version of the same frame: UI pixels are masked out of the scene statistics
             and ui_* numbers are reported. Auto-resolved from <frame>.clean.png when present.
  --preset   battle-desk: mask the three standard HUD regions when no clean frame exists.
  --out      write PREFIX_squint.png, _notan.png, _thumb160.png, _palette.png, _huehist.png,
             _saliency.png. --sheet also writes PREFIX_sheet.png (open it with the Read tool).
  --anchor   VERIFIER ONLY: a JSON of sealed anchor numbers (same keys as this output); adds a
             "delta_vs_anchor" block. Generator sessions must not be given that file.

Exit codes: 0 ok, 2 bad input. Prints one JSON object per image (or one array with --json).
Boxes: 4 numbers, fractions (0..1) or pixels of the ORIGINAL image; several --focal are unioned.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from PIL import Image, ImageFilter  # noqa: E402
import adlib as A  # noqa: E402

# Look-bible ranges (GRAPHICS_PLAYBOOK.md §3.3, reference-board-measurement.md §6). Critique context,
# never targets: the fan-art reference fails several of the earlier proposed gates and noise raises
# "edge energy". Each entry: metric key, (lo, hi) or None, note used when the value is outside.
RANGES = {
    'bstar_lights': {'range': (None, 28), 'unit': 'b*', 'note': 'lit pixels too yellow (Octopath median 16, max 29); cool the key or lower the warm split'},
    'chroma_p95': {'range': (None, 40), 'unit': 'C*', 'note': 'over-saturated (Octopath median 37); lower grade saturation or desaturate the lights'},
    'cool_share': {'range': (0.05, None), 'unit': 'frac', 'note': 'almost no cool pixels (Octopath median 0.14); plum/blue shadows and far plane, even in warm arenas'},
    'dark_share': {'range': (0.40, 0.60), 'unit': 'frac', 'note': 'HD-2D field frames are dark-dominant (Octopath median 0.51); light should be a minority pool'},
    'hue_top2_share': {'range': (None, 0.90), 'unit': 'frac', 'note': 'near-monochrome frame; reserve one hue family for kin + UI accents (the reference is 0.94, so this is weak)'},
    'focal_dL_vs_ring': {'range': (-6, None), 'unit': 'L*', 'note': 'subjects darker than their ring; judges rewarded lighter-than-ground subjects (rho +0.65)'},
    'focal_edge_ratio': {'range': (1.3, None), 'unit': 'x', 'note': 'subjects not crisper than their surroundings (Octopath 1.8-9.5)'},
    'squint_value_std': {'range': (12, None), 'unit': 'L*', 'note': 'big value masses too flat (defect floor 12; reference 19)'},
    'value_range_p5_p95': {'range': (55, None), 'unit': 'L*', 'note': 'values flattened (defect floor 55; reference 80)'},
    'hf_ratio': {'range': (0.30, None), 'unit': 'x', 'note': 'frame soft/blurred (defect floor 0.30; reference 0.34)'},
    'ui_coverage': {'range': (None, 0.25), 'unit': 'frac', 'note': 'UI covers more of the frame than the reference (0.195); desk target <= 0.20, portrait <= 0.42 -> 0.35'},
    'ui_minus_scene_luma': {'range': (None, 40), 'unit': 'Y', 'note': 'UI is the brightest mass on screen (cream panels Y~198 vs scene ~100); it outranks the kin'},
}


def hints(res):
    out = []
    for k, spec in RANGES.items():
        v = res.get(k)
        if v is None:
            continue
        lo, hi = spec['range']
        bad = (lo is not None and v < lo) or (hi is not None and v > hi)
        if bad:
            rng = f"{'' if lo is None else lo}..{'' if hi is None else hi}"
            out.append({'metric': k, 'value': v, 'range': rng, 'hint': spec['note']})
    return out


def measure(path, focal=(), masks=(), crop=None, clean=None, width=640, out=None, sheet=False, subject_boxes=None):
    im = Image.open(path).convert('RGB')
    W0, H0 = im.size
    cb = None
    if crop:
        cb = A.parse_box(crop, W0, H0)
        im = im.crop(cb)
        W0, H0 = im.size
    ui_full = None
    cim = None
    if clean:
        cim = Image.open(clean).convert('RGB')
        if cb:
            cim = cim.crop(cb)
        ui_full = A.ui_mask_from_clean(im, cim)
    rgb, s = A.working_frame(im, width)
    H = rgb.shape[0]
    res = {'file': path, 'size': [W0, H0], 'work': [width, H], 'clean': clean}
    excl = A.box_mask([A.parse_box(m, W0, H0) for m in masks], width, H, s, s)
    if ui_full is not None:
        uim = np.asarray(Image.fromarray(ui_full).resize((width, H), Image.NEAREST))
        res['ui_coverage'] = A.r(uim.mean())
        Y = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
        if uim.any():
            lab_ui = A.to_lab(rgb[uim])
            res['ui_mean_chroma'] = A.r(np.hypot(lab_ui[:, 1], lab_ui[:, 2]).mean(), 1)
            res['ui_mean_luma'] = A.r(Y[uim].mean(), 1)
            res['scene_mean_luma'] = A.r(Y[~uim].mean(), 1)
            res['ui_minus_scene_luma'] = A.r(Y[uim].mean() - Y[~uim].mean(), 1)
        # scene statistics use the clean frame
        rgb, _ = A.working_frame(cim, width)
    keep = ~excl
    lab = A.to_lab(rgb)
    L, a_, b_ = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a_, b_)
    Lk, Ck, Ak, Bk = L[keep], C[keep], a_[keep], b_[keep]

    # ---- value structure
    pct = np.percentile(Lk, [1, 5, 25, 50, 75, 95, 99])
    res['L_pcts_1_5_25_50_75_95_99'] = [round(float(x), 1) for x in pct]
    res['L_mean'] = A.r(Lk.mean(), 1)
    res['value_range_p5_p95'] = A.r(pct[5] - pct[1], 1)
    notan = [float((Lk < 33).mean()), float(((Lk >= 33) & (Lk < 66)).mean()), float((Lk >= 66).mean())]
    res['notan_dark_mid_light'] = [A.r(x) for x in notan]
    res['dark_share'] = A.r(notan[0])
    sig = max(1.0, 0.015 * width)
    Lb = np.asarray(Image.fromarray(np.clip(L / 100 * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(sig)), float) / 255 * 100
    Lbk = Lb[keep]
    res['squint_notan'] = [A.r(float((Lbk < 33).mean())), A.r(float(((Lbk >= 33) & (Lbk < 66)).mean())), A.r(float((Lbk >= 66).mean()))]
    res['squint_value_std'] = A.r(Lbk.std(), 2)

    # ---- colour and light
    R_, G_, B_ = rgb[..., 0][keep], rgb[..., 1][keep], rgb[..., 2][keep]
    rg = R_ - G_
    yb = 0.5 * (R_ + G_) - B_
    res['colorfulness_hasler'] = A.r(np.hypot(rg.std(), yb.std()) + 0.3 * np.hypot(rg.mean(), yb.mean()), 1)
    res['chroma_mean'] = A.r(Ck.mean(), 1)
    res['chroma_p95'] = A.r(np.percentile(Ck, 95), 1)
    hue = (np.degrees(np.arctan2(Bk, Ak)) + 360) % 360
    chromatic = Ck > 15
    hh = np.histogram(hue[chromatic], bins=12, range=(0, 360))[0].astype(float)
    hh = hh / max(1.0, hh.sum())
    res['hue_hist_12x30deg'] = [A.r(x) for x in hh]
    res['hue_top2_share'] = A.r(np.sort(hh)[-2:].sum())
    nz = hh[hh > 0]
    res['hue_entropy_bits'] = A.r(-(nz * np.log2(nz)).sum(), 2)
    res['chromatic_share'] = A.r(chromatic.mean())
    res['cool_share'] = A.r((Bk < 0).mean())
    lo, hi = np.percentile(Lk, [20, 80])
    mb = lambda m: float(Bk[m].mean()) if m.any() else np.nan
    res['bstar_shadows'] = A.r(mb(Lk <= lo), 1)      # darkest 20 %
    res['bstar_lights'] = A.r(mb(Lk >= hi), 1)       # brightest 20 %
    res['delta_bstar'] = A.r(mb(Lk >= hi) - mb(Lk <= lo), 1)
    res['bstar_fixed_L30_L70'] = [A.r(mb(Lk < 30), 1), A.r(mb(Lk > 70), 1)]

    # ---- detail distribution and crispness
    e = np.zeros_like(L)
    e[:-1, :-1] = np.abs(np.diff(L, axis=1))[:-1, :] + np.abs(np.diff(L, axis=0))[:, :-1]
    ek = np.where(keep, e, np.nan)
    tiles = []
    for i in range(6):
        for j in range(8):
            t = ek[i * H // 6:(i + 1) * H // 6, j * width // 8:(j + 1) * width // 8]
            if np.isfinite(t).mean() > 0.3:
                tiles.append(np.nanmean(t))
    tiles = np.array(tiles)
    res['edge_energy_mean'] = A.r(np.nanmean(ek), 2)
    res['detail_cv'] = A.r(tiles.std() / max(1e-6, tiles.mean()))
    Lg = Image.fromarray(np.clip(L / 100 * 255, 0, 255).astype(np.uint8))
    Lbl = np.asarray(Lg.filter(ImageFilter.GaussianBlur(1.0)), float) / 255 * 100
    res['hf_ratio'] = A.r(np.abs(L - Lbl)[keep].mean() / max(1e-6, np.nanmean(ek)))

    # ---- 160-px thumbnail (the first read)
    th_im = Image.fromarray(rgb.astype(np.uint8)).resize((160, max(1, round(H * 160 / width))), Image.BOX)
    t = np.asarray(th_im, int)
    lum = 0.2126 * t[..., 0] + 0.7152 * t[..., 1] + 0.0722 * t[..., 2]
    q = (t[..., 0] >> 4) * 256 + (t[..., 1] >> 4) * 16 + (t[..., 2] >> 4)
    cnt = np.bincount(q.ravel())
    p = cnt[cnt > 0] / q.size
    res['thumb_color_entropy_bits'] = A.r(-(p * np.log2(p)).sum(), 2)
    res['thumb_near_black_share'] = A.r((lum < 16).mean())

    # ---- palette
    X = lab[keep]
    X = X[::max(1, len(X) // 40000)]
    Cn, wts = A.kmeans(X, 8)
    order = np.argsort(-wts)
    res['palette'] = [{'lab': [round(float(v)) for v in Cn[i]], 'hex': A.rgb_to_hex(A.lab_to_srgb(Cn[i])), 'w': round(float(wts[i]), 3)} for i in order]
    big = Cn[wts >= 0.03]
    if len(big) > 1:
        d = np.sqrt(((big[:, None] - big[None]) ** 2).sum(-1))
        res['palette_mean_dE'] = A.r(d[np.triu_indices(len(big), 1)].mean(), 1)
    res['palette_L_span'] = A.r(big[:, 0].max() - big[:, 0].min(), 1) if len(big) else None

    # ---- saliency
    sal = A.spectral_residual_saliency(np.clip(L / 100 * 255, 0, 255))
    sal = np.where(keep, sal, 0)
    ys, xs = np.unravel_index(np.argsort(sal.ravel())[-max(1, int(sal.size * 0.02)):], sal.shape)
    res['saliency_peak_xy'] = [A.r(xs.mean() / width), A.r(ys.mean() / H)]

    # ---- focal boxes vs ring
    fb = [A.parse_box(f, W0, H0) for f in focal]
    if fb:
        fm = A.box_mask(fb, width, H, s, s) & keep
        if fm.sum() >= 16:
            grown = [[x0 - 0.6 * (x1 - x0), y0 - 0.6 * (y1 - y0), x1 + 0.6 * (x1 - x0), y1 + 0.6 * (y1 - y0)] for x0, y0, x1, y1 in fb]
            ring = A.box_mask(grown, width, H, s, s) & ~A.box_mask(fb, width, H, s, s) & keep
            ratio = lambda a, b: a / b if b > 1e-6 else np.nan
            Lstd = ratio(L[fm].std(), L[ring].std())
            edg = ratio(np.nanmean(np.where(fm, e, np.nan)), np.nanmean(np.where(ring, e, np.nan)))
            chr_ = ratio(C[fm].mean(), C[ring].mean())
            res['focal_Lstd_ratio'] = A.r(Lstd)
            res['focal_edge_ratio'] = A.r(edg)
            res['focal_chroma_ratio'] = A.r(chr_)
            vals = [v for v in (Lstd, edg, chr_) if np.isfinite(v) and v > 0]
            res['focal_contrast_gmean'] = A.r(float(np.exp(np.mean(np.log(vals))))) if vals else None
            res['focal_dL_vs_ring'] = A.r(L[fm].mean() - L[ring].mean(), 1)
            res['focal_mean_L_in_ring'] = [A.r(L[fm].mean(), 1), A.r(L[ring].mean(), 1)]
            res['focal_mean_bstar_in_ring'] = [A.r(b_[fm].mean(), 1), A.r(b_[ring].mean(), 1)]
            res['focal_saliency_ratio'] = A.r(ratio(sal[fm].mean(), sal[keep & ~fm].mean()))
            res['focal_area'] = A.r(fm.mean(), 4)
            res['focal_in_blur_band'] = None
        res['focal_boxes_px'] = fb
    if subject_boxes:
        res['subjects'] = [{'name': n, 'height_frac': A.r((y1 - y0) / H0), 'cx': A.r((x0 + x1) / 2 / W0), 'cy': A.r((y0 + y1) / 2 / H0)} for n, (x0, y0, x1, y1) in subject_boxes]

    res['hints'] = hints(res)
    res['note'] = 'ranges are critique context from the look bible, never gate thresholds; the gate is the pairwise judge'

    if out:
        notan_im = Image.fromarray(np.where(L < 33, 30, np.where(L < 66, 128, 230)).astype(np.uint8))
        squint_im = Image.fromarray(np.clip(Lb / 100 * 255, 0, 255).astype(np.uint8))
        sal_im = Image.fromarray((sal / max(1e-6, sal.max()) * 255).astype(np.uint8))
        thumb4 = th_im.resize((th_im.width * 4, th_im.height * 4), Image.NEAREST)
        pal_im = A.palette_swatch(Cn, wts)
        hue_im = A.hue_hist_image(hh)
        notan_im.save(out + '_notan.png')
        squint_im.save(out + '_squint.png')
        sal_im.save(out + '_saliency.png')
        th_im.save(out + '_thumb160.png')
        pal_im.save(out + '_palette.png')
        hue_im.save(out + '_huehist.png')
        res['debug_images'] = [out + x for x in ('_notan.png', '_squint.png', '_saliency.png', '_thumb160.png', '_palette.png', '_huehist.png')]
        if sheet:
            frame_im = Image.fromarray(rgb.astype(np.uint8))
            if fb:
                from PIL import ImageDraw
                frame_im = frame_im.copy()
                d = ImageDraw.Draw(frame_im)
                for x0, y0, x1, y1 in fb:
                    d.rectangle([x0 * s, y0 * s, x1 * s, y1 * s], outline=(0, 255, 255), width=1)
            pal_tall = Image.new('RGB', (width, 120), (18, 18, 18))
            pal_tall.paste(pal_im.resize((width, 50), Image.NEAREST), (0, 0))
            pal_tall.paste(hue_im.resize((width, 60), Image.NEAREST), (0, 58))
            tiles_ = [(frame_im, 'frame (scene stats exclude UI/masks)'), (squint_im.convert('RGB'), f'squint  notan D/M/L {res["squint_notan"]}  std {res["squint_value_std"]}'),
                      (notan_im.convert('RGB'), f'notan  dark {res["dark_share"]}  (bible 0.40-0.60)'),
                      (thumb4, f'160-px thumbnail x4: first read (<= 1 s)'), (sal_im.convert('RGB'), 'spectral saliency (crude: finds windows/beams)'),
                      (pal_tall, f'palette + hue hist  top2 {res["hue_top2_share"]}  C95 {res["chroma_p95"]}  b*lights {res["bstar_lights"]}  cool {res["cool_share"]}')]
            A.compose_sheet(tiles_, 3).save(out + '_sheet.png')
            res['sheet'] = out + '_sheet.png'
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('images', nargs='+')
    ap.add_argument('--layout', help='capture.json:ID (focal boxes + clean frame from the harness)')
    ap.add_argument('--subjects', default='mine,foe', help='layout names used as focal boxes (default mine,foe)')
    ap.add_argument('--focal', action='append', default=[])
    ap.add_argument('--mask', action='append', default=[])
    ap.add_argument('--preset', choices=['battle-desk', 'none'], default='none')
    ap.add_argument('--crop')
    ap.add_argument('--clean')
    ap.add_argument('--no-clean', action='store_true', help='do not auto-resolve <frame>.clean.png')
    ap.add_argument('--width', type=int, default=640)
    ap.add_argument('--out')
    ap.add_argument('--sheet', action='store_true')
    ap.add_argument('--anchor', help='VERIFIER ONLY: sealed anchor numbers JSON')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()

    focal = list(a.focal)
    subject_boxes = None
    masks = list(a.mask) + (A.BATTLE_DESK_MASKS if a.preset == 'battle-desk' else [])
    if a.layout:
        try:
            shot, _ = A.load_capture_shot(a.layout)
        except (OSError, ValueError, json.JSONDecodeError) as ex:
            print(f'error: --layout: {ex}', file=sys.stderr)
            sys.exit(2)
        names = tuple(a.subjects.split(','))
        with Image.open(a.images[0]) as im0:
            scale = A.layout_scale(shot, im0.width)
        focal += A.layout_boxes(shot, names, scale)
        subject_boxes = A.layout_entries(shot, scale)
        if not a.clean and shot.get('clean') and os.path.exists(shot['clean']):
            a.clean = shot['clean']
    anchor = None
    if a.anchor:
        with open(a.anchor) as f:
            anchor = json.load(f)
    outs = []
    for i, p in enumerate(a.images):
        clean = a.clean if (a.clean and len(a.images) == 1) else (None if a.no_clean else A.resolve_clean(p))
        out = a.out if (a.out and len(a.images) == 1) else (a.out + '_' + os.path.splitext(os.path.basename(p))[0] if a.out else None)
        try:
            m = measure(p, focal, masks, a.crop, clean, a.width, out, a.sheet, subject_boxes)
        except (OSError, ValueError) as ex:
            print(f'error: {p}: {ex}', file=sys.stderr)
            sys.exit(2)
        if anchor:
            m['delta_vs_anchor'] = {k: A.r(m[k] - anchor[k], 3) for k in m
                                    if isinstance(m.get(k), (int, float)) and not isinstance(m[k], bool) and isinstance(anchor.get(k), (int, float))}
            m['anchor_role'] = anchor.get('role')
        outs.append(m)
        if not a.json:
            print(json.dumps(m))
    if a.json:
        print(json.dumps(outs, indent=1))


if __name__ == '__main__':
    main()
