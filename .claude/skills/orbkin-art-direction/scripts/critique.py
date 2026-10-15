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

  --layout   take the focal boxes and the matching .clean.png from an orbkin-visual-gate /
             refine-harness capture.json (capture.mjs writes shot.layout; the old harness wrote
             shot.stats.layout; both are read). Recommended. The focal_* numbers then describe ONE
             subject set, named in "focal_subjects": --subjects foe (default for battle frames: the
             wild/enemy kin is the one that must read off the lit floor), mine, player, both (mine+foe
             union) or any comma list of layout names. Every layout entry also gets its own row in
             "focal_by_subject", so the critique can name the kin a number refers to.
             If --layout yields no boxes the script prints a WARNING and exits 3 (never silently
             measures a frame without focal numbers).
  --emitter  x,y of the light source's base on the floor (fractions or ORIGINAL px; phone boxes in
             CSS px are scaled like the layout). Reports the emitter-local falloff: median floor L*
             and b* in rings at 0 / 100 / 250 CSS px (--radii to change), UI and subjects excluded.
             The warm radial falloff is a protected feature of every emitter-lit arena: compare
             falloff_gradient_L before/after (keep >= 0.8 of the baseline; look-bible §colour-light).
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
    'focal_dL_vs_ring': {'range': (-25, 10), 'unit': 'L*', 'note': 'DIAGNOSTIC ONLY (never a target): far below = the kin is a hole in the lit floor, fix with edge/rim/temperature, never by lifting the body; above +8 = bleached (pilot H: +2.6 dL*, 0/4 "washed out, pasted on")'},
    'focal_warmth_coupling': {'range': (-12, 12), 'unit': 'b*', 'note': 'subject b* minus ring b*: a cool kin on a warm floor (or the reverse) reads as "lit by another light / pasted on" unless the key-side rim carries the floor colour'},
    'focal_edge_ratio': {'range': (1.8, 9.5), 'unit': 'x', 'note': 'subject/ground separation lives here (Octopath 1.8-9.5): below = the kin is not crisper than its ring (outline, rim, calm floor patch); above = noise or a magnified texel'},
    'chromatic_share': {'range': (0.40, None), 'unit': 'frac', 'note': '"washed out" signature: fewer than 40 % of scene pixels have chroma > 15 (pilot H/J 0.30-0.36 -> 0/4; baseline 0.57-0.67)'},
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


def focal_block(L, b_, e, C, keep, boxes, width, H, s):
    """Subject boxes vs a ring (each box grown by 60 %): the numbers behind look-bible rows 2 and 6."""
    fm = A.box_mask(boxes, width, H, s, s) & keep
    if fm.sum() < 16:
        return None
    grown = [[x0 - 0.6 * (x1 - x0), y0 - 0.6 * (y1 - y0), x1 + 0.6 * (x1 - x0), y1 + 0.6 * (y1 - y0)] for x0, y0, x1, y1 in boxes]
    ring = A.box_mask(grown, width, H, s, s) & ~A.box_mask(boxes, width, H, s, s) & keep
    if ring.sum() < 16:
        return None
    ratio = lambda a, b: a / b if b > 1e-6 else np.nan
    r = {'dL_vs_ring': A.r(L[fm].mean() - L[ring].mean(), 1),
         'mean_L_in_ring': [A.r(L[fm].mean(), 1), A.r(L[ring].mean(), 1)],
         'mean_bstar_in_ring': [A.r(b_[fm].mean(), 1), A.r(b_[ring].mean(), 1)],
         'edge_ratio': A.r(ratio(np.nanmean(np.where(fm, e, np.nan)), np.nanmean(np.where(ring, e, np.nan)))),
         'Lstd_ratio': A.r(ratio(L[fm].std(), L[ring].std())),
         'chroma_ratio': A.r(ratio(C[fm].mean(), C[ring].mean()))}
    r['warmth_coupling'] = A.r(b_[fm].mean() - b_[ring].mean(), 1)   # subject b* minus ring b*: a jump toward negative = "lit by another light"
    return r, fm, ring


def falloff_block(L, b_, keep, emitter, radii, width, H, s, css_scale):
    """Median floor L* / b* in rings around the emitter base (CSS px radii, +-25 px), UI/subjects excluded."""
    ex, ey = emitter
    W0 = width / s
    H0 = H / s
    if 0 <= ex <= 1 and 0 <= ey <= 1:
        ex, ey = ex * W0, ey * H0
    else:
        ex, ey = ex * css_scale, ey * css_scale
    yy, xx = np.mgrid[0:H, 0:width]
    d = np.hypot(xx - ex * s, yy - ey * s) / (s * css_scale)   # distance in CSS px
    Ls, Bs, ns = [], [], []
    for rad in radii:
        m = keep & (np.abs(d - rad) <= 25) if rad > 0 else keep & (d <= 40)
        ns.append(int(m.sum()))
        Ls.append(A.r(np.median(L[m]), 1) if m.sum() >= 16 else None)
        Bs.append(A.r(np.median(b_[m]), 1) if m.sum() >= 16 else None)
    out = {'emitter_css_px': [A.r(ex, 1), A.r(ey, 1)], 'radii_css_px': radii, 'L': Ls, 'bstar': Bs, 'n': ns}
    # The ring at radius 0 usually contains the emitter geometry itself (pier, pool rim); the falloff
    # that the judge reads is between the NEAR ring (second radius) and the FAR ring (last radius).
    i0 = 1 if len(radii) >= 3 else 0
    out['near_radius'] = radii[i0]
    out['near_L'], out['far_L'] = Ls[i0], Ls[-1]
    out['near_bstar'], out['far_bstar'] = Bs[i0], Bs[-1]
    if Ls[i0] is not None and Ls[-1] is not None:
        out['gradient_L'] = A.r(Ls[i0] - Ls[-1], 1)
    if Bs[i0] is not None and Bs[-1] is not None:
        out['gradient_bstar'] = A.r(Bs[i0] - Bs[-1], 1)
    out['note'] = 'protected feature: near_bstar >= 0.75x and gradient_L >= 0.8x the accepted baseline (pilot J lost 41 % of near_bstar -> "light source pasted on")'
    return out


def measure(path, focal=(), masks=(), crop=None, clean=None, width=640, out=None, sheet=False, subject_boxes=None,
            emitter=None, radii=(0, 100, 250), css_scale=1.0):
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

    # ---- focal boxes vs ring (the named subject set), plus one row per layout entry
    fb = [A.parse_box(f, W0, H0) for f in focal]
    if fb:
        blk = focal_block(L, b_, e, C, keep, fb, width, H, s)
        if blk:
            r_, fm, _ = blk
            res['focal_Lstd_ratio'] = r_['Lstd_ratio']
            res['focal_edge_ratio'] = r_['edge_ratio']
            res['focal_chroma_ratio'] = r_['chroma_ratio']
            vals = [v for v in (r_['Lstd_ratio'], r_['edge_ratio'], r_['chroma_ratio']) if v is not None and np.isfinite(v) and v > 0]
            res['focal_contrast_gmean'] = A.r(float(np.exp(np.mean(np.log(vals))))) if vals else None
            res['focal_dL_vs_ring'] = r_['dL_vs_ring']
            res['focal_mean_L_in_ring'] = r_['mean_L_in_ring']
            res['focal_mean_bstar_in_ring'] = r_['mean_bstar_in_ring']
            res['focal_warmth_coupling'] = r_['warmth_coupling']
            res['focal_saliency_ratio'] = A.r(sal[fm].mean() / sal[keep & ~fm].mean() if sal[keep & ~fm].mean() > 1e-6 else np.nan)
            res['focal_area'] = A.r(fm.mean(), 4)
        res['focal_boxes_px'] = fb
    if subject_boxes:
        res['subjects'] = [{'name': n, 'height_frac': A.r((y1 - y0) / H0), 'cx': A.r((x0 + x1) / 2 / W0), 'cy': A.r((y0 + y1) / 2 / H0)} for n, (x0, y0, x1, y1) in subject_boxes]
        by = {}
        for n, box in subject_boxes:
            blk = focal_block(L, b_, e, C, keep, [list(box)], width, H, s)
            if blk:
                by[n] = blk[0]
        res['focal_by_subject'] = by
    if emitter:
        res['falloff'] = falloff_block(L, b_, keep, emitter, list(radii), width, H, s, css_scale)

    res['hints'] = hints(res)
    if (res.get('value_range_p5_p95') or 0) < 15 or (res.get('thumb_near_black_share') or 0) > 0.9:
        res['hints'].append({'metric': 'frame_blank', 'value': [res.get('value_range_p5_p95'), res.get('thumb_near_black_share')], 'range': 'none',
                             'hint': 'the frame is (nearly) blank or black: a failed capture reported ok (seen in the pilot when / was full); do not measure or judge it'})
        print(f'WARNING: {path} looks blank/black (value range {res.get("value_range_p5_p95")}, near-black {res.get("thumb_near_black_share")})', file=sys.stderr)
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
    ap.add_argument('--subjects', default='auto', help="layout names used as the focal set: foe | mine | player | both | a,b,c (default auto = foe when the layout has one, else mine, else every entry)")
    ap.add_argument('--emitter', help='x,y of the light source base (fractions or original/CSS px): emitter-local floor falloff')
    ap.add_argument('--radii', default='0,100,250', help='ring radii in CSS px for --emitter (default 0,100,250; each ring is +-25 px)')
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
    focal_subjects = ['--focal boxes'] if a.focal else []
    sanity = []
    emitter = None
    if a.emitter:
        emitter = [float(v) for v in a.emitter.split(',')]
        if len(emitter) != 2:
            print('error: --emitter needs x,y', file=sys.stderr)
            sys.exit(2)
    masks = list(a.mask) + (A.BATTLE_DESK_MASKS if a.preset == 'battle-desk' else [])
    if a.layout:
        try:
            shot, _ = A.load_capture_shot(a.layout)
        except (OSError, ValueError, json.JSONDecodeError) as ex:
            print(f'error: --layout: {ex}', file=sys.stderr)
            sys.exit(2)
        with Image.open(a.images[0]) as im0:
            scale = A.layout_scale(shot, im0.width)
        subject_boxes = A.layout_entries(shot, scale)
        have = [n for n, _ in subject_boxes]
        if a.subjects == 'auto':
            names = ('foe',) if 'foe' in have else ('mine',) if 'mine' in have else tuple(have)
        elif a.subjects == 'both':
            names = ('mine', 'foe')
        else:
            names = tuple(a.subjects.split(','))
        lay_boxes = A.layout_boxes(shot, names, scale)
        sanity = A.capture_sanity(shot)
        if not lay_boxes and not a.focal:
            print(f'WARNING: --layout {a.layout}: no focal boxes for subjects {list(names)} (layout entries: {have or "none"}). '
                  f'focal_* numbers would be missing; pass --subjects or --focal. capture sanity: {sanity or "ok"}', file=sys.stderr)
            sys.exit(3)
        focal += lay_boxes
        focal_subjects = list(names)
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
            with Image.open(p) as im0:
                em_scale = A.layout_scale(shot, im0.width) if a.layout else 1.0
            m = measure(p, focal, masks, a.crop, clean, a.width, out, a.sheet, subject_boxes,
                        emitter=emitter, radii=[float(v) for v in a.radii.split(',')], css_scale=em_scale)
            m['focal_subjects'] = focal_subjects
            if sanity:
                m['capture_sanity'] = sanity
                m['hints'].append({'metric': 'capture_sanity', 'value': sanity, 'range': 'none', 'hint': 'the capture itself is suspect: open the PNG with Read before trusting any number'})
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
