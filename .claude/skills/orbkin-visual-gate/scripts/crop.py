#!/usr/bin/env python3
"""crop.py - 2x nearest creature crops for a capture dir, and the before/after diff against a baseline dir.

  python3 -I crop.py CAPTURE_DIR [--compare BASELINE_DIR] [--pad 24] [--grow 1.25]

For every ok shot in CAPTURE_DIR/capture.json that has creature boxes (layout mine/foe), writes
CAPTURE_DIR/raw/<id>.crop.png: the union of the creature boxes, grown by --grow, at least 480 px wide,
16:9, enlarged 2x with NEAREST (the same crop visual_judge.py uses for its focal votes), and records
"crop" and "cropBox" on the shot. Element crops for one box: pass --box x0,y0,x1,y1 --id SHOT.
--compare BASELINE_DIR: runs pixdiff per id (inside = creature boxes) and writes CAPTURE_DIR/compare.json
{changed: {id: pct}, identical: [ids], outside_changed: [ids whose pixels moved outside the creature
boxes], frame_mismatch: [ids captured at a different absolute frame than the baseline]}.
Exit 0; 2 bad input. Prints one JSON line (the compare result when --compare, else the crop list).
"""
import argparse
import json
import os
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def union_crop(im, boxes, grow=1.25, min_w=480):
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w = max(min_w, (x1 - x0) * grow); h = max(w * 9 / 16, (y1 - y0) * grow); w = max(w, h * 16 / 9)
    w, h = min(w, im.width), min(h, im.height)
    l = min(max(0, cx - w / 2), im.width - w); t = min(max(0, cy - h / 2), im.height - h)
    box = (round(l), round(t), round(l + w), round(t + h))
    c = im.crop(box)
    return c.resize((c.width * 2, c.height * 2), Image.NEAREST), box


def boxes_of(shot):
    lay = shot.get('layout') or (shot.get('stats') or {}).get('layout') or []
    return [[b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h']] for b in lay if b['name'] in ('mine', 'foe')]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('capture_dir'); ap.add_argument('--compare'); ap.add_argument('--grow', type=float, default=1.25)
    ap.add_argument('--box'); ap.add_argument('--id'); ap.add_argument('--pad', type=int, default=8)
    a = ap.parse_args()
    cj = os.path.join(a.capture_dir, 'capture.json')
    if not os.path.isfile(cj):
        print(f'error: {cj} not found', file=sys.stderr); sys.exit(2)
    cap = json.load(open(cj))
    shots = {s['id']: s for s in cap['shots']}
    if a.box:
        if not a.id or a.id not in shots or not shots[a.id].get('raw'):
            print('error: --box needs --id of an ok shot', file=sys.stderr); sys.exit(2)
        x0, y0, x1, y1 = [int(float(v)) for v in a.box.split(',')]
        im = Image.open(shots[a.id]['raw']).convert('RGB')
        c = im.crop((max(0, x0 - a.pad), max(0, y0 - a.pad), min(im.width, x1 + a.pad), min(im.height, y1 + a.pad)))
        c = c.resize((c.width * 2, c.height * 2), Image.NEAREST)
        out = os.path.join(a.capture_dir, 'raw', f"{a.id}.element.png"); c.save(out)
        print(json.dumps({'element_crop': out, 'box': [x0, y0, x1, y1]})); return
    if a.compare:
        bj = os.path.join(a.compare, 'capture.json')
        if not os.path.isfile(bj):
            print(f'error: {bj} not found', file=sys.stderr); sys.exit(2)
        base = {s['id']: s for s in json.load(open(bj))['shots']}
        res = {'baseline': a.compare, 'changed': {}, 'identical': [], 'outside_changed': [], 'frame_mismatch': [], 'missing_in_baseline': []}
        for sid, s in shots.items():
            if not s.get('ok'):
                continue
            b = base.get(sid)
            if not b or not b.get('ok'):
                res['missing_in_baseline'].append(sid); continue
            if s.get('frame') is not None and b.get('frame') is not None and s['frame'] != b['frame']:
                res['frame_mismatch'].append({'id': sid, 'candidate_frame': s['frame'], 'baseline_frame': b['frame']})
            cmd = [sys.executable, '-I', os.path.join(HERE, 'pixdiff.py'), s['raw'], b['raw']]
            bx = boxes_of(s)
            if bx:
                cmd += ['--inside'] + [','.join(map(str, x)) for x in bx]
            d = subprocess.run(cmd, capture_output=True, text=True)
            try:
                j = json.loads(d.stdout.strip().splitlines()[-1])
            except (json.JSONDecodeError, IndexError):
                res['changed'][sid] = None; continue
            if j.get('identical'):
                res['identical'].append(sid)
            else:
                res['changed'][sid] = j['changed_pct']
                if bx and (j.get('outside_pct') or 0) > 0:
                    res['outside_changed'].append({'id': sid, 'outside_pct': j['outside_pct'], 'inside_pct': j['inside_pct']})
        res['note'] = 'outside_changed matters only for sprite/kin changes (pixels outside the creature boxes must be identical); frame_mismatch = variants not at the same absolute frame'
        json.dump(res, open(os.path.join(a.capture_dir, 'compare.json'), 'w'), indent=1)
        print(json.dumps(res)); return
    done = []
    for sid, s in shots.items():
        if not s.get('ok') or not s.get('raw'):
            continue
        bx = boxes_of(s)
        if not bx:
            continue
        im = Image.open(s['raw']).convert('RGB')
        c, box = union_crop(im, bx, a.grow)
        out = os.path.join(a.capture_dir, 'raw', f'{sid}.crop.png'); c.save(out)
        s['crop'] = out; s['cropBox'] = list(box); done.append(sid)
    json.dump(cap, open(cj, 'w'), indent=1)
    print(json.dumps({'crops': done}))


if __name__ == '__main__':
    main()
