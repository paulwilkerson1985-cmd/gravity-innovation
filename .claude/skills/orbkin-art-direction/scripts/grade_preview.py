#!/usr/bin/env python3
"""grade_preview.py - offline preview of a post-grade change on a captured frame (numpy + Pillow only).

Why: under SwiftShader a desk+phone capture costs 4-9 minutes; the pilot paid for ~10 captures to
bracket one grade. The display-space half of `Hd2dGrade` (src/render/hd2d/pipeline.ts) is pure
per-pixel maths, so a grade can be previewed on `raw/<id>.clean.png` in a second: this script undoes
the CURRENT grade (--from) and applies the CANDIDATE grade (--to), then prints the look-bible numbers
for each result. Bracket 20 grades here, capture once, judge once.

What it reproduces exactly (in shader order, after tone mapping and sRGB):
  CDL lift/gain/gamma -> contrast S-curve on luminance -> saturation with shadowDesat ->
  luminance-preserving split tone (shadowTint / highTint / splitAmount) -> bottomShade.
What it CANNOT preview (they act in linear HDR before the tone map, or are not a grade at all):
  exposure, vignette, tilt-shift blur, bloom, toneHue, dither, and every LIGHT RIG change (key
  intensity/colour, hemisphere, fill) and every SpriteLight field. Those need a capture. Pixels that
  the current grade clipped (any channel >= 254) cannot be un-graded; their share is reported.

Run isolated:
  python3 -I grade_preview.py CLEAN.png --from cur.json --to cand.json --out PREFIX
          [--sweep saturation=0.8,0.86,0.92] [--sweep splitAmount=0.14,0.2] [--layout capture.json:ID]
          [--emitter x,y] [--sheet] [--json]
  python3 -I grade_preview.py --template            # prints a grade JSON with every field and its default
  python3 -I grade_preview.py CLEAN.png --from cur.json --verify [--layout ...] [--arena volcanic]
          # round trip only: un-grade with --from and re-grade with it; PASS when p99 error <= 4/255 and max
          # (excluding clipped pixels) <= 12/255, else exit 1 with the numbers. Run it once per arena before
          # trusting any preview, and quote its numbers in the report (measured on the volcanic base: see
          # look-bible §grade-doctrine e).
  --arena NAME   takes the protected floor emitter for the frame's viewport from assets/emitters.json
                 (needs --layout for the viewport, or --vp) and reports *_excl_emitter numbers too.

Grade JSON (sRGB hex for tints, numbers as in arenas/<arena>.ts; omitted fields take makeGrade's
defaults from arenas/localKit.ts + GRADE_DEFAULTS: lift 0, gamma 1, saturation 0.8, contrast 1.05,
splitAmount 0.12, shadowDesat 0.3, bottomShade 0, bottomShadeHeight 0.22. warmCaveGrade (cave) sets
all of them explicitly: copy its values):
  {"lift": [r,g,b], "gain": [r,g,b], "gamma": [r,g,b], "saturation": s, "contrast": c,
   "shadowDesat": d, "shadowTint": "#rrggbb", "highTint": "#rrggbb", "splitAmount": a,
   "bottomShade": b, "bottomShadeHeight": h}
--sweep KEY=v1,v2,...   one preview per value, applied on top of --to (several --sweep = several
                        1-D series, never a cartesian grid). Scalars only (saturation, contrast,
                        splitAmount, shadowDesat, bottomShade) or a vector as r:g:b.
Every variant's numbers are also written as PREFIX[_<variant>].json (PREFIX.json = the CURRENT frame), in
critique.py's key names, so `verdict_risk.py PREFIX.json PREFIX_<variant>.json --arena <a> --change grade`
predicts the judge BEFORE any capture (grade-only moves; a light-rig or SpriteLight change still needs a
capture: the volcanic key cut 70 -> 55 took near_bstar from 0.81x (preview, grade alone) to 0.65x captured).
Outputs: PREFIX.png (the --to preview), PREFIX_<key>=<v>.png per sweep value, PREFIX_sheet.png with
--sheet (frame + numbers per variant), and one JSON per preview on stdout with the critique numbers
(bstar_lights, chroma_p95, chroma_mean, chromatic_share, cool_share, dark_share, and the focal /
falloff numbers when --layout / --emitter are given). The round trip (--from == --to) is checked
first and its max error printed; > 3/255 means the frame was not graded with --from.

Exit codes: 0 ok, 2 bad input.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402
import adlib as A  # noqa: E402

LUMA = np.array([0.2126, 0.7152, 0.0722])
DEFAULTS = {'lift': [0.0, 0.0, 0.0], 'gain': [1.0, 1.0, 1.0], 'gamma': [1.0, 1.0, 1.0], 'saturation': 0.8, 'contrast': 1.05,
            'shadowDesat': 0.3, 'shadowTint': '#ffffff', 'highTint': '#ffffff', 'splitAmount': 0.12,
            'bottomShade': 0.0, 'bottomShadeHeight': 0.22}
DESAT_RANGE = (0.0, 0.36)   # uDesatRange


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def tint_vec(h):
    """lumaNormalized(): the sRGB tint divided by its own luminance (so the split tone keeps luminance)."""
    v = np.array(A.hex_to_rgb(h), float) / 255.0
    l = float(v @ LUMA)
    return v / l if l > 1e-4 else np.ones(3)


def load_grade(path):
    """A grade JSON: flat fields, or a retune file with the fields under "grade" (assets/retunes/*.json).
    Keys starting with "_" are comments; any other unknown key is an error (a typo would silently preview
    the defaults, which is exactly what happened with a nested file on 2026-10-15)."""
    with open(path) as f:
        g = json.load(f)
    if isinstance(g.get('grade'), dict):
        g = g['grade']
    g = {k: v for k, v in g.items() if not k.startswith('_')}
    unknown = sorted(k for k in g if k not in DEFAULTS)
    if unknown:
        raise ValueError(f'{path}: unknown grade field(s) {unknown}; fields: {sorted(DEFAULTS)} (or put them under "grade")')
    out = dict(DEFAULTS)
    out.update(g)
    for k in ('lift', 'gain', 'gamma'):
        v = out[k]
        out[k] = np.array([v] * 3 if np.isscalar(v) else v, float)
    return out


def sat_of(l, g):
    return g['saturation'] * (1.0 - g['shadowDesat'] * smoothstep(0.0, 0.04, l) * (1.0 - smoothstep(DESAT_RANGE[0], DESAT_RANGE[1], l)))


def contrast_fwd(l, k):
    return np.clip(l + (k - 1.0) * (l - 0.5) * 4.0 * l * (1.0 - l), 0.0, 1.0)


def contrast_inv(l2, k, it=12):
    """Newton on the cubic; the curve is monotone for 0.5 < k < 2 which covers every arena."""
    l = l2.copy()
    for _ in range(it):
        f = l + (k - 1.0) * (l - 0.5) * 4.0 * l * (1.0 - l) - l2
        df = 1.0 + (k - 1.0) * 4.0 * (l * (1.0 - l) + (l - 0.5) * (1.0 - 2.0 * l))
        l = np.clip(l - f / np.where(np.abs(df) < 1e-4, 1e-4, df), 0.0, 1.0)
    return l


def apply_grade(c, g, yfrac):
    """c: HxWx3 sRGB 0..1 (ungraded display values); yfrac: HxW fraction from the BOTTOM (vUv.y)."""
    c = np.maximum(0.0, c * g['gain'] + g['lift'] * (1.0 - c))
    c = np.power(np.clip(c, 0, 1), 1.0 / g['gamma'])
    l = np.maximum(c @ LUMA, 1e-5)
    l2 = contrast_fwd(l, g['contrast'])
    c = c * (l2 / l)[..., None]
    l = l2
    sat = sat_of(l, g)
    c = l[..., None] + (c - l[..., None]) * sat[..., None]
    ws = g['splitAmount'] * (1.0 - smoothstep(0.0, 0.45, l))
    c = c + (tint_vec(g['shadowTint'])[None, None] * l[..., None] - c) * ws[..., None]
    wh = g['splitAmount'] * smoothstep(0.5, 1.0, l)
    c = c + (tint_vec(g['highTint'])[None, None] * l[..., None] - c) * wh[..., None]
    c = c * (1.0 + g['bottomShade'] * (1.0 - smoothstep(0.0, g['bottomShadeHeight'], yfrac)))[..., None]
    return np.clip(c, 0.0, 1.0)


def invert_grade(c, g, yfrac):
    """Undo apply_grade (except where the forward pass clipped)."""
    c = c / (1.0 + g['bottomShade'] * (1.0 - smoothstep(0.0, g['bottomShadeHeight'], yfrac)))[..., None]
    l = np.maximum(c @ LUMA, 1e-5)
    wh = g['splitAmount'] * smoothstep(0.5, 1.0, l)
    c = (c - wh[..., None] * tint_vec(g['highTint'])[None, None] * l[..., None]) / np.maximum(1e-4, 1.0 - wh)[..., None]
    ws = g['splitAmount'] * (1.0 - smoothstep(0.0, 0.45, l))
    c = (c - ws[..., None] * tint_vec(g['shadowTint'])[None, None] * l[..., None]) / np.maximum(1e-4, 1.0 - ws)[..., None]
    sat = np.maximum(sat_of(l, g), 1e-3)
    c = l[..., None] + (c - l[..., None]) / sat[..., None]
    l0 = contrast_inv(l, g['contrast'])
    c = c * (l0 / l)[..., None]
    c = np.power(np.clip(c, 0, 1), g['gamma'])
    c = (c - g['lift']) / np.where(np.abs(g['gain'] - g['lift']) < 1e-4, 1e-4, g['gain'] - g['lift'])
    return np.clip(c, 0.0, 1.0)


def quick_numbers(rgb8, keep, focal_px=None, emitter=None, radii=(0, 100, 250), css_scale=1.0):
    """The critique numbers that a grade moves, on the full-resolution preview (same maths as critique.py)."""
    import critique as CR
    rgb, s = A.working_frame(Image.fromarray(rgb8), 640)
    H = rgb.shape[0]
    k = np.asarray(Image.fromarray(keep).resize((640, H), Image.NEAREST))
    lab = A.to_lab(rgb)
    L, a_, b_ = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a_, b_)
    Lk, Ck, Bk = L[k], C[k], b_[k]
    out = CR.colour_block(Lk, Ck, Bk)
    if emitter:
        W0, H0 = rgb8.shape[1], rgb8.shape[0]
        ex, ey = CR.emitter_px(emitter, W0, H0, css_scale)
        disc = A.disc_mask(640, H, ex / W0, ey / H0, max(radii), css_scale, s)
        kx = k & ~disc
        for kk, v in CR.colour_block(L[kx], C[kx], b_[kx]).items():
            out[kk + '_excl_emitter'] = v
    e = np.zeros_like(L)
    e[:-1, :-1] = np.abs(np.diff(L, axis=1))[:-1, :] + np.abs(np.diff(L, axis=0))[:, :-1]
    if focal_px:
        blk = CR.focal_block(L, b_, e, C, k, focal_px, 640, H, s)
        if blk:
            r_ = blk[0]
            out.update({'focal_dL_vs_ring': r_['dL_vs_ring'], 'focal_edge_ratio': r_['edge_ratio'], 'focal_mean_bstar_in_ring': r_['mean_bstar_in_ring'],
                        'focal_Lstd_ratio': r_['Lstd_ratio'], 'focal_warmth_coupling': r_['warmth_coupling']})
    if emitter:
        out['falloff'] = CR.falloff_block(L, b_, k, emitter, list(radii), 640, H, s, css_scale)
    out['hints'] = CR.hints(out)
    return out


def parse_sweep(spec):
    key, vals = spec.split('=', 1)
    out = []
    for v in vals.split(','):
        out.append(np.array([float(x) for x in v.split(':')]) if ':' in v else float(v))
    return key, out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('image', nargs='?')
    ap.add_argument('--from', dest='src', help='grade JSON the frame was captured with')
    ap.add_argument('--to', dest='dst', help='candidate grade JSON')
    ap.add_argument('--out', help='output prefix')
    ap.add_argument('--sweep', action='append', default=[], help='KEY=v1,v2,... on top of --to')
    ap.add_argument('--layout', help='capture.json:ID for focal boxes (foe by default) and the CSS scale')
    ap.add_argument('--subjects', default='auto')
    ap.add_argument('--emitter', help='x,y of the light source base (fractions or CSS px); overrides --arena')
    ap.add_argument('--arena', help='arena name: emitter from assets/emitters.json for the viewport (--layout or --vp)')
    ap.add_argument('--vp', choices=['desk', 'phone'])
    ap.add_argument('--radii', default='0,100,250')
    ap.add_argument('--verify', action='store_true', help='round trip --from only (no --to); exit 1 when the error bound is exceeded')
    ap.add_argument('--sheet', action='store_true')
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--template', action='store_true', help='print a grade JSON template and exit')
    a = ap.parse_args()
    if a.template:
        print(json.dumps(DEFAULTS, indent=1))
        return
    if a.verify:
        a.dst = a.dst or a.src
        a.out = a.out or '/dev/null'
    if not (a.image and a.src and a.dst and a.out):
        ap.error('IMAGE --from --to --out are required (or --template / --verify)')
    try:
        g0, g1 = load_grade(a.src), load_grade(a.dst)
        im = Image.open(a.image).convert('RGB')
    except (OSError, ValueError, json.JSONDecodeError) as ex:
        print(f'error: {ex}', file=sys.stderr)
        sys.exit(2)
    if not a.image.endswith('.clean.png'):
        print('note: not a .clean.png: UI pixels will be graded too (the real pipeline grades only the canvas)', file=sys.stderr)
    W0, H0 = im.size
    rgb8 = np.asarray(im)
    c = rgb8.astype(np.float64) / 255.0
    yfrac = 1.0 - (np.arange(H0)[:, None] + 0.5) / H0 * np.ones((1, W0))
    clipped = (rgb8 >= 254).any(-1) | (rgb8 <= 1).all(-1)
    base = invert_grade(c, g0, yfrac)
    rt = apply_grade(base, g0, yfrac)
    err = np.abs(rt - c).max(-1)[~clipped] * 255
    rt_p99 = float(np.percentile(err, 99)) if err.size else 0.0
    rt_max = float(err.max()) if err.size else 0.0
    keep = np.ones((H0, W0), bool)
    focal_px, css_scale, emitter = None, 1.0, None
    if a.layout:
        try:
            shot, _ = A.load_capture_shot(a.layout)
        except (OSError, ValueError, json.JSONDecodeError) as ex:
            print(f'error: --layout: {ex}', file=sys.stderr)
            sys.exit(2)
        css_scale = A.css_scale(shot, W0)
        box_scale = A.layout_scale(shot, W0)
        have = [n for n, _ in A.layout_entries(shot, box_scale)]
        names = (('foe',) if 'foe' in have else ('mine',) if 'mine' in have else tuple(have)) if a.subjects == 'auto' else \
            (('mine', 'foe') if a.subjects == 'both' else tuple(a.subjects.split(',')))
        focal_px = [A.parse_box(b, W0, H0) for b in A.layout_boxes(shot, names, box_scale)]
        if not focal_px:
            print(f'WARNING: --layout gives no boxes for {names} (have {have}); focal numbers skipped', file=sys.stderr)
    if a.vp == 'phone' and not a.layout:
        css_scale = 2.75
    if a.arena and not a.emitter:
        vp = (shot.get('vp') if a.layout else None) or a.vp
        if not vp:
            print('error: --arena needs --layout capture.json:ID or --vp desk|phone', file=sys.stderr)
            sys.exit(2)
        try:
            ex, ey, trad, status = A.emitter_for(a.arena, vp)
        except (KeyError, OSError) as ex_:
            print(f'error: --arena: {ex_}', file=sys.stderr)
            sys.exit(2)
        if ex is None:
            print(f'note: {a.arena} has no located {vp} emitter (status {status}); no falloff numbers', file=sys.stderr)
        else:
            emitter = [ex, ey]
            a.radii = ','.join(str(int(r)) for r in trad)
            if status != 'verified':
                print(f'WARNING: {a.arena} {vp} emitter is status {status}', file=sys.stderr)
    if a.emitter:
        emitter = [float(v) for v in a.emitter.split(',')]
    radii = [float(v) for v in a.radii.split(',')]
    if a.verify:
        ok = rt_p99 <= 4.0 and rt_max <= 12.0
        print(json.dumps({'verify': 'PASS' if ok else 'FAIL', 'image': a.image, 'grade': a.src, 'round_trip_err_255_p99': round(rt_p99, 2),
                          'round_trip_err_255_max': round(rt_max, 2), 'clipped_share_excluded': A.r(clipped.mean(), 4),
                          'bound': 'p99 <= 4/255 and max <= 12/255 on unclipped pixels (dither 2/255 + 8-bit quantisation through the inverse); FAIL = the frame was not captured with --from (wrong arena JSON, nograde, or a shader change)'}))
        sys.exit(0 if ok else 1)

    variants = [('to', g1)]
    for sp in a.sweep:
        key, vals = parse_sweep(sp)
        if key not in DEFAULTS:
            print(f'error: unknown grade field {key}; fields: {sorted(DEFAULTS)}', file=sys.stderr)
            sys.exit(2)
        for v in vals:
            gv = dict(g1)
            gv[key] = v
            variants.append((f'{key}={":".join(str(x) for x in v) if isinstance(v, np.ndarray) else v}', gv))
    results = [{'variant': 'round_trip', 'round_trip_err_255_p99': round(rt_p99, 2), 'round_trip_err_255_max': round(rt_max, 2), 'clipped_share': A.r(clipped.mean(), 4),
                'note': 'p99 <= 4/255 expected (dither + quantisation); more means the frame was not captured with --from. Clipped pixels (lava cores, crushed blacks) keep their captured value.'}]
    if rt_p99 > 4:
        print(f'WARNING: round trip p99 {rt_p99:.1f}/255: --from does not match the grade this frame was captured with', file=sys.stderr)
    q0 = quick_numbers(rgb8, keep, focal_px, emitter, radii, css_scale)
    q0.update({'variant': 'current', 'out': a.image, 'note': 'the frame as captured (numbers from the same maths as the previews; pass this JSON as BEFORE to verdict_risk.py)'})
    results.append(q0)
    tiles = []
    for name, g in variants:
        outp = a.out + ('.png' if name == 'to' else f'_{name}.png')
        pv = (apply_grade(base, g, yfrac) * 255 + 0.5).astype(np.uint8)
        pv[clipped] = rgb8[clipped]
        Image.fromarray(pv).save(outp)
        q = quick_numbers(pv, keep, focal_px, emitter, radii, css_scale)
        q.update({'variant': name, 'out': outp})
        results.append(q)
        if a.sheet:
            t = Image.fromarray(pv).resize((480, max(1, round(H0 * 480 / W0))), Image.BOX)
            cap = f"{name}  b*L {q.get('bstar_lights_excl_emitter', q['bstar_lights'])} C95 {q.get('chroma_p95_excl_emitter', q['chroma_p95'])} chrom {q['chromatic_share']} cool {q['cool_share']} dark {q['dark_share']}"
            if 'falloff' in q:
                cap += f" nearb* {q['falloff'].get('near_bstar')}"
            if 'focal_dL_vs_ring' in q:
                cap += f" dL {q['focal_dL_vs_ring']}"
            tiles.append((t, cap))
    if a.sheet:
        cur = Image.fromarray(rgb8).resize((480, max(1, round(H0 * 480 / W0))), Image.BOX)
        tiles.insert(0, (cur, f"CURRENT  b*L {q0['bstar_lights']} C95 {q0['chroma_p95']} chrom {q0['chromatic_share']} cool {q0['cool_share']} dark {q0['dark_share']}"))
        A.compose_sheet(tiles, 2).save(a.out + '_sheet.png')
        results[0]['sheet'] = a.out + '_sheet.png'
    if a.json:
        print(json.dumps(results, indent=1))
    else:
        for r in results:
            print(json.dumps(r))
    if a.out and a.out != '/dev/null':
        # one JSON per variant beside the previews, in critique.py shape, so verdict_risk.py BEFORE/AFTER can be run offline
        for r in results[1:]:
            with open(a.out + ('' if r['variant'] == 'current' else '_' + r['variant']) + '.json', 'w') as f:
                json.dump(r, f, indent=1)


if __name__ == '__main__':
    main()
