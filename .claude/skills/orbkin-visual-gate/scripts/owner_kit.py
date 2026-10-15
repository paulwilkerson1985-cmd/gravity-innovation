#!/usr/bin/env python3
"""owner_kit.py - build the owner's BLIND A/B kit (offline rating page + private key) from gate pairs.

  python3 -I owner_kit.py OUT_DIR --spec pairs.json [--inline] [--no-controls] [--judge] [--sealed DIR]
  python3 -I owner_kit.py OUT_DIR --from-verdicts DIR [--family F] [--device desk] ...   (same options)

pairs.json: {"set": "name", "pairs": [{"id": "P01", "kind": "main", "family": "density", "arena": "cave",
  "device": "desk|phone", "x": {"label": "...", "src": "a.png"}, "y": {"label": "...", "src": "b.png"}}, ...],
  "glance": ["frame.png", ...], "repeats": ["P01", ...]}      (kind: main | gold(expect x|y) | null | probe)
--from-verdicts DIR: every visual_judge --out JSON in DIR becomes a main pair (x = baseline = last accepted,
  y = candidate); family from the JSON's "family" key or --family; device from the frame's aspect.
Controls added unless --no-controls (human-ground-truth.md 1.8): two EASY golds (Gaussian blur r 2.2 and
values pulled 40 % toward the mean, from the first main pairs' x frames), one identical pair under two ids,
and 3 repeats shown late with sides swapped. --judge: Opus pairwise verdicts for every main pair (no
reference, both orders x 2, no canary) stored in key.json for agree.py.
Writes OUT_DIR/kit/{index.html, pairs.js, img/*.webp, README.txt} (blind: random image ids, no labels),
OUT_DIR/key.json (PRIVATE: pair -> conditions, sources, expected answers; never ship it), and with --inline
OUT_DIR/kit-inline.html (one file, images embedded; phone-friendly). Prints JSON incl. owner_minutes
(~25 s per trial + 2 min). The fan-art reference never goes into a kit; only Orbkin frames.
Exit 0; 2 bad input (missing source image, no main pairs).
"""
import argparse
import base64
import hashlib
import json
import os
import random
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
README = """Orbkin blind A/B kit
====================
A page that shows pairs of screenshots and asks which one looks more polished and professional.
No network, no tracking. Your picks stay in this browser until you export them.

Desktop: unzip, keep index.html, pairs.js and img/ together, double-click index.html, rate all pairs,
press "Download JSON" (or "Copy JSON"). kit-inline.html works the same as a single file.
Phone: open kit-inline.html with Chrome on Android, or serve the folder on your computer with
  python3 -m http.server 8765 --bind 0.0.0.0   and open http://<computer LAN IP>:8765/ on the phone.
Rules: one sitting if you can; do not zoom the browser (the "1:1 pixels" button is fine); pick
"No difference" when you honestly cannot tell. Some pairs repeat and some are identical on purpose.
Send back the downloaded orbkin-ab-*.json file. Nothing else is collected.
"""


def degrade(kind, src, dst):
    im = Image.open(src).convert('RGB')
    if kind == 'blur':
        im = im.filter(ImageFilter.GaussianBlur(2.2))
    elif kind == 'flat':
        a = np.asarray(im, np.float32)
        m = a.mean(axis=(0, 1), keepdims=True)
        im = Image.fromarray(np.clip(a + (m - a) * 0.4, 0, 255).astype(np.uint8))
    im.save(dst)


def img_id(path, salt):
    return hashlib.sha1((salt + open(path, 'rb').read().hex()[:4096] + path).encode()).hexdigest()[:10]


def device_of(path):
    w, h = Image.open(path).size
    return 'phone' if h > w else 'desk'


def pairs_from_verdicts(d, family, device):
    pairs = []
    files = sorted(f for f in os.listdir(d) if f.endswith('.json'))
    for k, f in enumerate(files):
        try:
            v = json.load(open(os.path.join(d, f)))
        except (OSError, json.JSONDecodeError):
            continue
        if not v.get('decision') or not (v.get('candidate') and v.get('baseline') and os.path.isfile(v['candidate']) and os.path.isfile(v['baseline'])):
            continue  # only judge verdicts (floor / ip / lint JSONs also sit in the run dir)
        if v.get('role', 'target') != 'target' or v.get('decision') == 'invalid':
            continue  # controls (synthetic degradations, identical pairs) and invalid runs are never owner pairs; the kit adds its own golds
        pid = f'P{k + 1:02d}'
        p = {'id': pid, 'kind': 'main', 'family': v.get('family') or family or 'unassigned', 'arena': v.get('arena'),
             'device': device or device_of(v['candidate']), 'verdict_file': f,
             'x': {'label': 'accepted', 'src': v['baseline']}, 'y': {'label': 'candidate', 'src': v['candidate']}}
        dec = v.get('decision')
        if dec in ('better', 'worse', 'no_difference'):
            rate = (v.get('main') or {}).get('candidate_win_rate')
            p['opus'] = {'verdict': 'y' if dec == 'better' else 'x' if dec == 'worse' else 'same',
                         'x_share': None if rate is None else round(1 - rate, 3), 'view': v.get('view')}
        pairs.append(p)
    return pairs


def add_controls(spec, work):
    mains = [p for p in spec['pairs'] if p['kind'] == 'main']
    ids = {p['id'] for p in spec['pairs']}
    os.makedirs(work, exist_ok=True)
    srcs = [p['x']['src'] for p in mains]
    if srcs and 'G1' not in ids:
        dst = os.path.join(work, 'g1-blur.png'); degrade('blur', srcs[0], dst)
        spec['pairs'].append({'id': 'G1', 'kind': 'gold', 'family': 'gold_blur', 'device': mains[0]['device'], 'expect': 'x',
                              'x': {'label': 'original', 'src': srcs[0]}, 'y': {'label': 'blurred', 'src': dst}})
    if srcs and 'G2' not in ids:
        s = srcs[1 % len(srcs)]; dst = os.path.join(work, 'g2-flat.png'); degrade('flat', s, dst)
        spec['pairs'].append({'id': 'G2', 'kind': 'gold', 'family': 'gold_flat', 'device': mains[1 % len(mains)]['device'], 'expect': 'x',
                              'x': {'label': 'original', 'src': s}, 'y': {'label': 'value_flattened', 'src': dst}})
    if srcs and 'N1' not in ids:
        s = srcs[2 % len(srcs)]
        spec['pairs'].append({'id': 'N1', 'kind': 'null', 'family': 'identical', 'device': mains[2 % len(mains)]['device'], 'expect': 'same',
                              'x': {'label': 'original', 'src': s}, 'y': {'label': 'original_copy', 'src': s}})
    if not spec.get('repeats'):
        rnd = random.Random(7)
        spec['repeats'] = [p['id'] for p in rnd.sample(mains, min(3, len(mains)))]
    if not spec.get('glance'):
        spec['glance'] = srcs[:3]


def build(spec, out, inline, judge_pairs, model):
    salt = os.urandom(8).hex()
    kit = os.path.join(out, 'kit'); img = os.path.join(kit, 'img')
    os.makedirs(img, exist_ok=True)
    key = {'version': 2, 'set': spec.get('set', 'orbkin-batch'), 'pairs': {}, 'repeats': spec.get('repeats', []), 'images': {}}
    blind, seen = [], {}
    for p in spec['pairs']:
        ids = {}
        for side in ('x', 'y'):
            src = p[side]['src']
            if not os.path.exists(src):
                raise SystemExit(f'missing {src}')
            k = (src, p['id'], side) if p['kind'] == 'null' else src   # identical controls still get two ids
            if k not in seen:
                iid = img_id(src, salt + str(k))
                im = Image.open(src).convert('RGB')
                im.save(os.path.join(img, iid + '.webp'), 'WEBP', lossless=True, quality=100, method=4)
                seen[k] = (iid, im.size)
                key['images'][iid] = {'src': src, 'label': p[side]['label'], 'size': im.size}
            ids[side] = seen[k][0]
        w, h = seen[(p['x']['src'], p['id'], 'x') if p['kind'] == 'null' else p['x']['src']][1]
        blind.append({'id': p['id'], 'x': ids['x'], 'y': ids['y'], 'w': w, 'h': h, 'device': p.get('device', 'desk')})
        key['pairs'][p['id']] = {k: v for k, v in p.items() if k not in ('x', 'y')} | {
            'x': {'label': p['x']['label'], 'img': ids['x'], 'src': p['x']['src']},
            'y': {'label': p['y']['label'], 'img': ids['y'], 'src': p['y']['src']}}
    glance = []
    for g in spec.get('glance', []):
        if not os.path.exists(g):
            continue
        if g not in seen:
            iid = img_id(g, salt + g); im = Image.open(g).convert('RGB')
            im.save(os.path.join(img, iid + '.webp'), 'WEBP', lossless=True, quality=100, method=4)
            seen[g] = (iid, im.size); key['images'][iid] = {'src': g, 'label': 'glance', 'size': im.size}
        glance.append(seen[g][0])
    key['glance'] = glance
    random.Random(salt).shuffle(blind)
    with open(os.path.join(kit, 'pairs.js'), 'w') as fh:
        fh.write('// Blind pair list. Image ids are opaque on purpose. Do not rename files.\n')
        fh.write('window.ORBKIN_PAIRS = ' + json.dumps({'set': key['set'], 'repeats': key['repeats'], 'glance': glance, 'pairs': blind}) + ';\n')
    shutil.copy(os.path.join(ASSETS, 'rate.html'), os.path.join(kit, 'index.html'))
    with open(os.path.join(kit, 'README.txt'), 'w') as fh:
        fh.write(README)
    if judge_pairs:
        for p in spec['pairs']:
            if p['kind'] != 'main' or p.get('opus'):
                continue
            r = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'visual_judge.py'), '--candidate', p['y']['src'], '--baseline', p['x']['src'],
                                '--no-ref', '--no-canary', '--no-critique', '--votes', '2', '--model', model], capture_output=True, text=True)
            try:
                v = json.loads(r.stdout)
                rate = (v.get('main') or {}).get('candidate_win_rate')
                key['pairs'][p['id']]['opus'] = {'verdict': {'better': 'y', 'worse': 'x'}.get(v.get('decision'), 'same'),
                                                 'x_share': None if rate is None else round(1 - rate, 3), 'cost': v.get('cost_usd')}
            except json.JSONDecodeError:
                key['pairs'][p['id']]['opus'] = {'verdict': None, 'error': r.stderr[-200:]}
    with open(os.path.join(out, 'key.json'), 'w') as fh:
        json.dump(key, fh, indent=1)
    if inline:
        html = open(os.path.join(ASSETS, 'rate.html')).read()
        data = {iid: 'data:image/webp;base64,' + base64.b64encode(open(os.path.join(img, iid + '.webp'), 'rb').read()).decode() for iid in key['images']}
        js = open(os.path.join(kit, 'pairs.js')).read() + 'window.ORBKIN_IMAGES = ' + json.dumps(data) + ';\n'
        with open(os.path.join(out, 'kit-inline.html'), 'w') as fh:
            fh.write(html.replace('<script src="pairs.js"></script>', '<script>\n' + js + '</script>'))
    trials = len(blind) + len(key['repeats'])
    tot = sum(os.path.getsize(os.path.join(img, f)) for f in os.listdir(img))
    return {'kit': kit, 'key': os.path.join(out, 'key.json'), 'inline': os.path.join(out, 'kit-inline.html') if inline else None,
            'pairs': len(blind), 'main_pairs': sum(1 for p in spec['pairs'] if p['kind'] == 'main'), 'trials': trials,
            'owner_minutes': round(trials * 25 / 60 + 2, 1), 'img_mb': round(tot / 1e6, 1),
            'families': sorted({p.get('family') for p in spec['pairs'] if p['kind'] == 'main'}),
            'next': 'send kit/ (zip) or kit-inline.html to the owner; score the export with agree.py --key key.json picks.json'}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('out'); ap.add_argument('--spec'); ap.add_argument('--from-verdicts')
    ap.add_argument('--family'); ap.add_argument('--device', choices=['desk', 'phone'])
    ap.add_argument('--inline', action='store_true'); ap.add_argument('--no-controls', action='store_true')
    ap.add_argument('--judge', action='store_true'); ap.add_argument('--model', default='opus'); ap.add_argument('--sealed')
    a = ap.parse_args()
    if not a.spec and not a.from_verdicts:
        ap.error('need --spec pairs.json or --from-verdicts DIR')
    spec = {'set': 'orbkin-batch', 'pairs': []}
    if a.spec:
        try:
            spec = json.load(open(a.spec))
        except (OSError, json.JSONDecodeError) as e:
            print(f'error: {e}', file=sys.stderr); sys.exit(2)
    if a.from_verdicts:
        spec['pairs'] += pairs_from_verdicts(a.from_verdicts, a.family, a.device)
    for p in spec['pairs']:
        p.setdefault('kind', 'main'); p.setdefault('device', device_of(p['x']['src']) if os.path.exists(p['x']['src']) else 'desk')
    if not any(p['kind'] == 'main' for p in spec['pairs']):
        print('error: no main pairs', file=sys.stderr); sys.exit(2)
    os.makedirs(a.out, exist_ok=True)
    if not a.no_controls:
        add_controls(spec, os.path.join(a.out, 'controls'))
    try:
        res = build(spec, a.out, a.inline, a.judge, a.model)
    except SystemExit as e:
        print(f'error: {e}', file=sys.stderr); sys.exit(2)
    print(json.dumps(res))


if __name__ == '__main__':
    main()
