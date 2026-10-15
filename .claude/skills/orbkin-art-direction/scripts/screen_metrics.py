#!/usr/bin/env python3
"""screen_metrics.py - per-screen depth-of-field profile, value structure and subject size.

The non-battle screens (title, starter, route map, evolution, catch, menus) fail on depth hierarchy
and value structure, not on texel density. This prints the numbers that showed it, next to the
per-screen expectations from references/screens.md, as critique context (never a gate).

Run isolated:
  python3 -I screen_metrics.py FRAME.png --screen title|starter|route|evolution|catch|battle|menu
          [--layout capture.json:ID] [--subject x0,y0,x1,y1 ...] [--mask box ...] [--clean F.clean.png]
          [--bands 12] [--width 640] [--out PREFIX] [--json]

DoF profile: the frame is split into N horizontal bands (top -> bottom); sharpness per band is
mean|L - blur1px| / mean|L - blur4px|, normalised to the sharpest band. A flat profile (every band
>= 0.7) means no depth band; Octopath field shots fall to 0.04-0.37 at the bottom and 0.14-0.64 at
the top with a focus band in the middle third (reference-board-measurement.md §3.5).
Subject boxes (from --layout or --subject) give subject height as a fraction of frame height and
the sharpness of the bands the subjects occupy: if that is < 0.8 of peak the blur reaches the
subject, which lost 0/4 on the route map ("mush").

Caveat: screens captured without a .clean.png (title, route, menus) include crisp DOM text and panels,
which inflate the sharpness of the bands they sit in; pass --mask x0,y0,x1,y1 for the logo and menu
boxes (fractions) or compare variants of the same screen rather than reading one profile absolutely.

Knob convention (src/render/hd2d/pipeline.ts): focusTop/focusBottom are fractions of height from
the BOTTOM of the frame (vUv.y); tiltTop/tiltBottom are blur radii in internal px. The expected
bands below are given top -> bottom fractions, so focusTop 0.60 = band top at 0.40.

Exit codes: 0 ok, 2 bad input.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402
import adlib as A  # noqa: E402

# Per-screen expectations (references/screens.md). band = focus band as top->bottom fractions of the
# frame height; top_max/bottom_max = outer-band sharpness relative to the peak that the winning
# variants measured (title ttilt .33/.30; Octopath fields .42-.65 / .26-.31); subject = height
# fraction of the main subject; L = mean L* aim; dark = dark notan share aim. None = no expectation.
SCREENS = {
    'title': {'band': (0.40, 0.64), 'top_max': 0.5, 'bottom_max': 0.5, 'subject': (0.18, 0.25), 'subject_name': 'the starter trio', 'primary': ('kin',), 'L': (24, 34), 'dark': (0.60, 0.75)},
    'starter': {'band': (0.34, 0.66), 'top_max': 0.6, 'bottom_max': 0.6, 'subject': (0.10, 0.14), 'subject_name': 'the three kin on their daises', 'primary': ('kin',), 'L': (36, 46), 'dark': (0.42, 0.60)},
    'route': {'band': (0.30, 0.84), 'top_max': 0.6, 'bottom_max': 0.5, 'subject': (0.08, 0.10), 'subject_name': 'the hero (Octopath field people are 10 %)', 'primary': ('you', 'hero', 'player'), 'L': (48, 58), 'dark': (0.25, 0.55)},
    'evolution': {'band': (0.34, 0.75), 'top_max': 0.6, 'bottom_max': 0.6, 'subject': (0.15, 0.20), 'subject_name': 'the evolving creature', 'primary': ('kin', 'mine', 'subject'), 'L': (14, 22), 'dark': (0.75, 0.90)},
    'catch': {'band': (0.33, 0.70), 'top_max': 0.7, 'bottom_max': 0.5, 'subject': (0.10, 0.24), 'subject_name': 'the orb / foe', 'primary': ('foe', 'orb', 'subject'), 'L': (30, 45), 'dark': (0.40, 0.60)},
    'battle': {'band': (0.33, 0.70), 'top_max': 0.7, 'bottom_max': 0.5, 'subject': (0.13, 0.24), 'subject_name': 'the two kin (Octopath battle sprites 15-24 %)', 'primary': ('mine', 'foe', 'subject'), 'L': (32, 46), 'dark': (0.40, 0.60)},
    'menu': {'band': (0.25, 0.80), 'top_max': None, 'bottom_max': None, 'subject': (0.15, 0.30), 'subject_name': 'the kin on the plinth', 'primary': ('kin', 'mine', 'subject'), 'L': (18, 34), 'dark': (0.55, 0.85)},
}


def dof_profile(G, bands, keep=None):
    """Per-band sharpness (top -> bottom), relative to the sharpest band. UI/masked pixels (keep=False)
    are left out of the band means; a band with < 30 % kept pixels inherits its neighbour."""
    g = Image.fromarray(np.clip(G, 0, 255).astype(np.uint8))
    g1 = np.asarray(g.filter(ImageFilter.GaussianBlur(1)), float)
    g4 = np.asarray(g.filter(ImageFilter.GaussianBlur(4)), float)
    hf = np.abs(G - g1)
    lf = np.abs(G - g4) + 1e-6
    if keep is None:
        keep = np.ones(G.shape, bool)
    rows = np.array_split(np.arange(G.shape[0]), bands)
    s = []
    for b in rows:
        k = keep[b]
        if k.mean() < 0.3:
            s.append(np.nan)
        else:
            s.append(hf[b][k].mean() / lf[b][k].mean())
    s = np.array(s)
    if np.isnan(s).all():
        return np.ones(bands), rows
    idx = np.arange(bands)
    s[np.isnan(s)] = np.interp(idx[np.isnan(s)], idx[~np.isnan(s)], s[~np.isnan(s)])
    return s / max(1e-9, s.max()), rows


def measure(path, screen, subjects, masks, clean, bands, width, out):
    im = Image.open(path).convert('RGB')
    W0, H0 = im.size
    ui = None
    if clean:
        cim = Image.open(clean).convert('RGB')
        ui = A.ui_mask_from_clean(im, cim)
        im = cim
    rgb, s = A.working_frame(im, width)
    H = rgb.shape[0]
    keep = ~A.box_mask([A.parse_box(m, W0, H0) for m in masks], width, H, s, s)
    if ui is not None:
        keep &= ~np.asarray(Image.fromarray(ui).resize((width, H), Image.NEAREST))
    G = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    prof, rows = dof_profile(G, bands, keep)
    lab = A.to_lab(rgb)
    L, B = lab[..., 0][keep], lab[..., 2][keep]
    C = np.hypot(lab[..., 1], lab[..., 2])[keep]
    res = {'file': path, 'screen': screen, 'size': [W0, H0], 'work': [width, H], 'clean': clean}
    res['dof_profile_top_to_bottom'] = [round(float(v), 2) for v in prof]
    res['dof_top_rel'] = round(float(prof[0]), 2)
    res['dof_bottom_rel'] = round(float(prof[-1]), 2)
    sharp = [i for i, v in enumerate(prof) if v >= 0.8]
    res['dof_focus_band_frac'] = [round(min(sharp) / bands, 2), round((max(sharp) + 1) / bands, 2)] if sharp else None
    res['dof_flat'] = bool(prof.min() >= 0.7)
    res['notan_dark_mid_light'] = [A.r((L < 33).mean()), A.r(((L >= 33) & (L < 66)).mean()), A.r((L >= 66).mean())]
    res['dark_share'] = A.r((L < 33).mean())
    res['L_mean'] = A.r(L.mean(), 1)
    res['chroma_p95'] = A.r(np.percentile(C, 95), 1)
    res['cool_share'] = A.r((B < 0).mean())
    lo, hi = np.percentile(L, [20, 80])
    res['bstar_lights'] = A.r(B[L >= hi].mean(), 1) if (L >= hi).any() else None
    subj = []
    for name, (x0, y0, x1, y1) in subjects:
        yb0, yb1 = int(y0 * s), int(np.ceil(y1 * s))
        bi = [i for i, rws in enumerate(rows) if rws[-1] >= yb0 and rws[0] <= yb1]
        band_sharp = float(prof[bi].mean()) if bi else None
        subj.append({'name': name, 'height_frac': A.r((y1 - y0) / H0), 'cy_frac': A.r((y0 + y1) / 2 / H0),
                     'bands': bi, 'band_sharpness_rel': A.r(band_sharp, 2),
                     'in_blur': (band_sharp is not None and band_sharp < 0.8)})
    res['subjects'] = subj
    exp = SCREENS.get(screen, {})
    res['expected'] = exp
    hints = []
    if res['dof_flat']:
        hints.append(f'DoF profile flat (min {prof.min():.2f}): no depth band; title/starter tilt bands won 4/4 (see references/screens.md)')
    if exp.get('top_max') is not None and prof[0] > exp['top_max']:
        hints.append(f'top band sharpness {prof[0]:.2f} > {exp["top_max"]}: the background competes with the subject')
    if exp.get('bottom_max') is not None and prof[-1] > exp['bottom_max']:
        hints.append(f'bottom band sharpness {prof[-1]:.2f} > {exp["bottom_max"]}: no foreground falloff (Octopath 0.04-0.37)')
    for sj in subj:
        if sj['in_blur']:
            hints.append(f"blur reaches {sj['name']} (band sharpness {sj['band_sharpness_rel']}): never blur the subject (route island trees lost 0/4)")
        primary = any(sj['name'].startswith(p) for p in exp.get('primary', ()))
        if primary and exp.get('subject') and sj['height_frac'] is not None:
            lo_, hi_ = exp['subject']
            if sj['height_frac'] < lo_:
                hints.append(f"{sj['name']} is {sj['height_frac']:.2f} of frame height; {exp['subject_name']} reads at {lo_}-{hi_}")
    if exp.get('L') and res['L_mean'] is not None and not (exp['L'][0] <= res['L_mean'] <= exp['L'][1]):
        hints.append(f"mean L* {res['L_mean']} outside {exp['L']}: " + ('light-dominant frame (Octopath fields L* ~36)' if res['L_mean'] > exp['L'][1] else 'too dark to read (Octopath demo complaint #1)'))
    if exp.get('dark') and res['dark_share'] is not None and res['dark_share'] < exp['dark'][0]:
        hints.append(f"dark share {res['dark_share']} < {exp['dark'][0]}: light is not a minority pool")
    res['hints'] = hints
    res['note'] = 'expectations are critique context (references/screens.md); the gate is screen_judge.py / orbkin-visual-gate'
    if clean is None and not masks:
        res['caveat'] = 'no .clean.png and no --mask: DOM text/panels inflate the sharpness of their bands; mask the UI boxes or compare variants'
    if out:
        thumb = Image.fromarray(rgb.astype(np.uint8))
        bar_w = 70
        sheet = Image.new('RGB', (width + bar_w, H), (18, 18, 18))
        sheet.paste(thumb, (0, 0))
        d = ImageDraw.Draw(sheet)
        for i, rws in enumerate(rows):
            y0, y1 = int(rws[0]), int(rws[-1])
            w = int(prof[i] * (bar_w - 6))
            col = (90, 200, 120) if prof[i] >= 0.8 else (200, 150, 70) if prof[i] >= 0.5 else (170, 80, 80)
            d.rectangle([width + 3, y0, width + 3 + w, y1], fill=col)
            d.text((width + 4, y0 + 1), f'{prof[i]:.2f}', fill=(240, 240, 240))
        if exp.get('band'):
            b0, b1 = exp['band']
            d.rectangle([0, int(b0 * H), width - 1, int(b1 * H)], outline=(0, 255, 255), width=1)
        for sj, (name, (x0, y0, x1, y1)) in zip(subj, subjects):
            d.rectangle([x0 * s, y0 * s, x1 * s, y1 * s], outline=(255, 80, 80) if sj['in_blur'] else (255, 255, 0), width=1)
        sheet.save(out + '_dof.png')
        res['debug_image'] = out + '_dof.png'
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('images', nargs='+')
    ap.add_argument('--screen', required=True, choices=sorted(SCREENS))
    ap.add_argument('--layout', help='capture.json:ID (subject boxes; clean frame when present)')
    ap.add_argument('--subject', action='append', default=[], help='subject box x0,y0,x1,y1 (fractions or pixels)')
    ap.add_argument('--mask', action='append', default=[])
    ap.add_argument('--clean')
    ap.add_argument('--no-clean', action='store_true')
    ap.add_argument('--bands', type=int, default=12)
    ap.add_argument('--width', type=int, default=640)
    ap.add_argument('--out')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    subjects = []
    shot = None
    if a.layout:
        try:
            shot, _ = A.load_capture_shot(a.layout)
        except (OSError, ValueError, json.JSONDecodeError) as ex:
            print(f'error: --layout: {ex}', file=sys.stderr)
            sys.exit(2)
    outs = []
    for p in a.images:
        try:
            with Image.open(p) as im0:
                W0, H0 = im0.size
            subs = list(subjects)
            if shot:
                subs += A.layout_entries(shot, A.layout_scale(shot, W0))
            subs += [(f'subject{i}', tuple(A.parse_box(b, W0, H0))) for i, b in enumerate(a.subject)]
            clean = a.clean or (None if a.no_clean else A.resolve_clean(p))
            if shot and not clean and shot.get('clean') and os.path.exists(shot['clean']):
                clean = shot['clean']
            out = a.out if (a.out and len(a.images) == 1) else (a.out + '_' + os.path.splitext(os.path.basename(p))[0] if a.out else None)
            m = measure(p, a.screen, subs, a.mask, clean, a.bands, a.width, out)
        except (OSError, ValueError) as ex:
            print(f'error: {p}: {ex}', file=sys.stderr)
            sys.exit(2)
        outs.append(m)
        if not a.json:
            print(json.dumps(m))
    if a.json:
        print(json.dumps(outs, indent=1))


if __name__ == '__main__':
    main()
