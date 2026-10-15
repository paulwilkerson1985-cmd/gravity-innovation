#!/usr/bin/env python3
"""pixdiff.py - where did the pixels change? Capture-validity check for frozen-clock A/B pairs. Free, < 1 s.

  python3 -I pixdiff.py CANDIDATE.png BASELINE.png [--inside x0,y0,x1,y1 ...] [--layout capture.json:ID]
                        [--tol 6] [--max-outside 0.0] [--diff out.png]

Prints JSON: changed % overall, inside the given boxes (the changed subsystem) and OUTSIDE them, plus the
bounding box of all changes. Rule it enforces (human-ground-truth.md 4.4, 5.2): pixels outside the changed
subsystem must be identical, or the capture is invalid (dressing rng reshuffled, sprite phase moved, dialog
state differs) and any judge verdict on it is about the confound, not the change. With --layout the creature
boxes from capture.json are the "inside" region (use for sprite / kin changes).
Exit 0 ok (outside <= --max-outside %), 1 outside region changed more than allowed, 2 bad input / size mismatch.
--diff writes a visualisation (changed pixels white, boxes outlined).
"""
import argparse
import json
import sys

import numpy as np
from PIL import Image, ImageDraw


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('candidate'); ap.add_argument('baseline')
    ap.add_argument('--inside', nargs='*', default=[]); ap.add_argument('--layout')
    ap.add_argument('--tol', type=int, default=6, help='per-channel difference that counts as a change (default 6)')
    ap.add_argument('--max-outside', type=float, default=0.0, help='allowed %% of changed pixels outside the boxes (default 0)')
    ap.add_argument('--diff')
    a = ap.parse_args()
    try:
        c = np.asarray(Image.open(a.candidate).convert('RGB'), np.int16)
        b = np.asarray(Image.open(a.baseline).convert('RGB'), np.int16)
    except OSError as e:
        print(f'error: {e}', file=sys.stderr); sys.exit(2)
    if c.shape != b.shape:
        print(json.dumps({'ok': False, 'error': f'size mismatch {c.shape[1]}x{c.shape[0]} vs {b.shape[1]}x{b.shape[0]}'})); sys.exit(2)
    H, W = c.shape[:2]
    boxes = [[int(float(v)) for v in s.split(',')] for s in a.inside]
    if a.layout:
        path, sid = a.layout.rsplit(':', 1)
        for sh in json.load(open(path))['shots']:
            if sh['id'] == sid:
                lay = sh.get('layout') or (sh.get('stats') or {}).get('layout') or []
                boxes += [[x['x'], x['y'], x['x'] + x['w'], x['y'] + x['h']] for x in lay if x['name'] in ('mine', 'foe')]
    changed = np.abs(c - b).max(-1) > a.tol
    inside = np.zeros((H, W), bool)
    for x0, y0, x1, y1 in boxes:
        inside[max(0, y0):min(H, y1), max(0, x0):min(W, x1)] = True
    tot = float(changed.mean() * 100)
    ins = float(changed[inside].mean() * 100) if inside.any() else None
    outs = float(changed[~inside].mean() * 100) if (~inside).any() else 0.0
    ys, xs = np.where(changed)
    bbox = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1] if len(xs) else None
    ok = outs <= a.max_outside
    out = {'ok': ok, 'size': [W, H], 'changed_pct': round(tot, 3), 'inside_pct': None if ins is None else round(ins, 3),
           'outside_pct': round(outs, 3), 'boxes': boxes, 'change_bbox': bbox, 'identical': tot == 0.0,
           'verdict': 'identical' if tot == 0.0 else ('changes confined to the boxes' if ok and boxes else
                      'changes outside the boxes: capture confounded (rng, phase or UI state) unless the change is frame-wide' if boxes else 'no boxes given: whole-frame change reported')}
    if a.diff:
        vis = Image.fromarray((changed * 255).astype(np.uint8)).convert('RGB')
        d = ImageDraw.Draw(vis)
        for x0, y0, x1, y1 in boxes:
            d.rectangle([x0, y0, x1 - 1, y1 - 1], outline=(255, 80, 80), width=2)
        vis.save(a.diff); out['diff'] = a.diff
    print(json.dumps(out))
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
