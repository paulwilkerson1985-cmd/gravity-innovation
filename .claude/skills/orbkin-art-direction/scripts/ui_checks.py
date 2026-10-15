#!/usr/bin/env python3
"""ui_checks.py - direction-independent UI checks: frame share, UI-vs-scene luma, legibility floors,
one-line labels and panel overlap. These are the defects every UI direction (cream handheld or dark
slab) must pass; the direction itself is an owner decision (references/ui.md).

Run isolated:
  python3 -I ui_checks.py coverage RAW.png [RAW2.png ...] [--clean RAW.clean.png] [--json]
      UI coverage = share of pixels the UI changes between the raw frame and the canvas-only
      frame (<id>.clean.png, auto-resolved). Reports UI mean luma vs scene mean luma, UI chroma
      p90 and scene show-through. Viewport is inferred from the aspect ratio.
  python3 -I ui_checks.py legibility LEGIB.json [--json]
      Applies the floors to the output of legibility.mjs (same folder):
        node ${CLAUDE_SKILL_DIR}/scripts/legibility.mjs --base http://127.0.0.1:PORT --out legib.json
      x-height >= 7 CSS px on desk and >= 18 device px on phone for any text a player must read;
      buttons >= 44x44 CSS px; name/move labels on one line; no overlapping panels; kin boxes
      not covered by panels.

Floors (ui-hud-typography.md §3.3, §7, §10): desk UI share <= 0.25 (target 0.20), portrait <= 0.42
(target 0.35); UI mean luma should not exceed the scene's by more than 40 (cream panels are
Y~198 vs scene ~100 today: the brightest mass on screen); x-height floors as above.

Exit codes: 0 all PASS (WARNs allowed), 1 a FAIL, 2 bad input.
"""
import argparse
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
import adlib as A  # noqa: E402

COVERAGE = {'desk': {'warn': 0.20, 'fail': 0.25}, 'land': {'warn': 0.30, 'fail': 0.40}, 'phone': {'warn': 0.35, 'fail': 0.42}}
LUMA_DELTA_WARN = 40        # UI mean Y minus scene mean Y
XHEIGHT_FLOOR = {'desk': ('xCss', 7.0), 'land': ('xDev', 18.0), 'phone': ('xDev', 18.0)}
MIN_TARGET = 44
# text roles a player must read (class substrings); anything else is decoration and only WARNs
MUST_READ = ('pname', 'mn', 'text', 'plevel', 'hpnums', 'btn', 'mmeta', 'hplabel', 'chip', 'minfo', 'mcount')


def viewport_of(w, h):
    if h > w:
        return 'phone'
    return 'land' if h < 500 or (w / h > 2.0) else 'desk'


def coverage(raw, clean):
    a = np.asarray(Image.open(raw).convert('RGB'), float)
    c = np.asarray(Image.open(clean).convert('RGB'), float)
    if a.shape != c.shape:
        raise ValueError(f'{raw} and {clean} differ in size')
    m = np.abs(a - c).sum(2) > 12
    Y = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    chroma = a.max(2) - a.min(2)
    ga = np.abs(np.diff(a.mean(2), axis=1))
    gc = np.abs(np.diff(c.mean(2), axis=1))
    mm = m[:, 1:]
    surv = float(np.corrcoef(ga[mm].ravel(), gc[mm].ravel())[0, 1]) if mm.sum() > 100 else 0.0
    vp = viewport_of(a.shape[1], a.shape[0])
    res = {'raw': raw, 'clean': clean, 'viewport': vp, 'size': [a.shape[1], a.shape[0]],
           'ui_coverage': A.r(m.mean()), 'ui_mean_luma': A.r(Y[m].mean(), 1) if m.any() else None,
           'scene_mean_luma': A.r(Y[~m].mean(), 1), 'ui_chroma_p90': A.r(np.percentile(chroma[m], 90), 1) if m.any() else None,
           'scene_show_through': A.r(surv, 2)}
    verdicts = []
    th = COVERAGE[vp]
    cov = res['ui_coverage']
    verdicts.append({'check': f'ui_coverage_{vp}', 'value': cov, 'floor': th, 'verdict': 'FAIL' if cov > th['fail'] else 'WARN' if cov > th['warn'] else 'PASS'})
    if res['ui_mean_luma'] is not None:
        d = res['ui_mean_luma'] - res['scene_mean_luma']
        verdicts.append({'check': 'ui_minus_scene_luma', 'value': A.r(d, 1), 'floor': LUMA_DELTA_WARN,
                         'verdict': 'WARN' if d > LUMA_DELTA_WARN else 'PASS',
                         'note': 'UI is the brightest mass on screen; it competes with the kin' if d > LUMA_DELTA_WARN else ''})
    res['verdicts'] = verdicts
    return res


def legibility(path):
    with open(path) as f:
        data = json.load(f)
    out = {'file': path, 'verdicts': [], 'states': {}}
    for vp, states in data.items():
        key, floor = XHEIGHT_FLOOR.get(vp, ('xCss', 7.0))
        for st, d in states.items():
            texts = d.get('texts', [])
            small = []
            for t in texts:
                v = t.get(key)
                if v is None:
                    continue
                must = any(c in (t.get('cls') or '') for c in MUST_READ)
                if v < floor:
                    small.append({'text': t.get('text'), 'cls': t.get('cls'), key: v, 'must_read': must})
            fails = [s for s in small if s['must_read']]
            out['verdicts'].append({'check': f'xheight_{vp}_{st}', 'floor': f'{key} >= {floor}', 'n_text': len(texts),
                                    'below_floor': small, 'verdict': 'FAIL' if fails else 'WARN' if small else 'PASS'})
            btn_small = [b for b in d.get('buttons', []) if b.get('w', 99) < MIN_TARGET or b.get('h', 99) < MIN_TARGET]
            out['verdicts'].append({'check': f'targets_{vp}_{st}', 'floor': f'>= {MIN_TARGET}x{MIN_TARGET} CSS px', 'small': btn_small,
                                    'verdict': 'FAIL' if btn_small else 'PASS'})
            multi = [t for t in texts if (t.get('lines') or 1) > 1 and any(c in (t.get('cls') or '') for c in ('pname', 'mn'))]
            out['verdicts'].append({'check': f'one_line_labels_{vp}_{st}', 'wrapped': multi, 'verdict': 'FAIL' if multi else 'PASS'})
            ov = d.get('panel_overlaps', [])
            out['verdicts'].append({'check': f'panel_overlap_{vp}_{st}', 'overlaps': ov, 'verdict': 'FAIL' if ov else 'PASS'})
            cov = d.get('subjects_covered', [])
            out['verdicts'].append({'check': f'subjects_uncovered_{vp}_{st}', 'covered': cov, 'verdict': 'FAIL' if cov else 'PASS'})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('coverage')
    c.add_argument('raw', nargs='+')
    c.add_argument('--clean')
    c.add_argument('--json', action='store_true')
    lg = sub.add_parser('legibility')
    lg.add_argument('legib')
    lg.add_argument('--json', action='store_true')
    a = ap.parse_args()
    results = []
    failed = False
    try:
        if a.cmd == 'coverage':
            raws = [p for g in a.raw for p in (sorted(glob.glob(g)) or [g])]
            raws = [p for p in raws if not p.endswith('.clean.png')]
            for p in raws:
                clean = a.clean if (a.clean and len(raws) == 1) else A.resolve_clean(p)
                if not clean:
                    print(f'error: no clean frame for {p} (expected {p[:-4]}.clean.png or --clean)', file=sys.stderr)
                    sys.exit(2)
                res = coverage(p, clean)
                results.append(res)
        else:
            results.append(legibility(a.legib))
    except (OSError, ValueError, json.JSONDecodeError) as ex:
        print(f'error: {ex}', file=sys.stderr)
        sys.exit(2)
    for res in results:
        failed |= any(v['verdict'] == 'FAIL' for v in res['verdicts'])
        if not a.json:
            print(json.dumps(res))
    if a.json:
        print(json.dumps(results, indent=1))
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
