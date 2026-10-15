#!/usr/bin/env python3
"""Readable facts about kin at sprite size, plus review sheets. The first thing to run (S0) and
the check after every geometry edit (S4).

  python3 read_sheet.py [--species kin19] [--game DIR] [--out DIR] [--no-render] [--battle URL]
Prints one line per species: tris / budget, draw calls, grounded, height in texels, eye size in
texels (the pupil box, L/R), colour blocks (shares >= 4%), and FLAGS:
  EYES  < 3x3 texels at battle size (the most violated rule in pilot runs)
  TRIS  over the unit-test budget (1800 for a stage 1 that evolves, else 2500)
  CALLS more than one mesh, GROUND lowest vertex off y = 0, BLOCKS not 2-4 colour blocks.
Renders (unless --no-render): DIR/sheet-<id>-{front,q3,side}.png from ?scene=model (frozen idle)
and DIR/proxy-<id>.png: the front view downscaled to the species' battle texel height and
blown up 4x nearest (what the player actually sees; look at it, not at the 420 px model).
--battle "scene=battle&...&foe=kin19": also a frozen desk + phone capture of the real battle with
2x subject crops (DIR/battle-<id>-{desk,phone}.png, -crop.png).
Exit 0 = no flags for --species (or none at all); 1 = flags; 2 = bad args.
"""
import argparse
import json
from pathlib import Path

from PIL import Image

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # works under python3 -I too
from common import capture, facts, game_dir, emit


def flags_for(d):
    fl = []
    e = d['eyes']['pupilTexels'] or (d['eyes']['R'] or {})
    if not e or e.get('w', 0) < 3 or e.get('h', 0) < 3:
        fl.append(f"EYES pupil {e.get('w') if e else None}x{e.get('h') if e else None} texels < 3x3 (raise `size` in eyes(); 3x3 at {d['texelHeight']} texels tall means size >= {round(1.5 / d['texelsPerUnit'], 3)} model units)")
    if d['tris'] > d['trisBudget']:
        fl.append(f"TRIS {d['tris']} > budget {d['trisBudget']}")
    if d['drawCalls'] != 1:
        fl.append(f"CALLS {d['drawCalls']} meshes besides the shadow (must be one merged mesh)")
    if not d['grounded']:
        fl.append('GROUND lowest vertex not on y = 0')
    if not 2 <= d['colours']['blocks'] <= 5:
        fl.append(f"BLOCKS {d['colours']['blocks']} colour blocks >= 4% (aim for 3: main, belly/mask, accent)")
    return fl


def proxy(src, texel_h, out):
    im = Image.open(src).convert('RGB')
    # The model sheet frames the kin at ~ (fit) height; crop the central column then scale to texel_h tall.
    w, h = im.size
    box = (int(w * 0.25), int(h * 0.05), int(w * 0.75), int(h * 0.97))
    c = im.crop(box)
    k = texel_h / (c.height * 0.9)
    small = c.resize((max(1, int(c.width * k)), max(1, int(c.height * k))), Image.BOX)
    small.resize((small.width * 4, small.height * 4), Image.NEAREST).save(out)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--species', help='comma list; default: the whole cast')
    p.add_argument('--game')
    p.add_argument('--out', default='out/sheet')
    p.add_argument('--no-render', action='store_true')
    p.add_argument('--battle', help='battle URL query to capture frozen (desk + phone + crops)')
    p.add_argument('--dist', help='built game dir to reuse (default <out>/../dist)')
    a = p.parse_args()
    game = game_dir(a.game)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    ids = a.species.split(',') if a.species else None
    f = facts(game, out / 'facts', ids, heights='32', views='front')
    res = {'species': {}, 'flags': {}}
    for sid, d in f['species'].items():
        fl = flags_for(d)
        e = d['eyes']['pupilTexels'] or {}
        res['species'][sid] = {k: d[k] for k in ('tris', 'trisBudget', 'drawCalls', 'grounded', 'texelHeight', 'worldHeight', 'stage', 'idle')}
        res['species'][sid]['eyeTexels'] = e
        res['species'][sid]['colourBlocks'] = d['colours']['blocks']
        res['species'][sid]['colourShares'] = d['colours']['shares']
        res['species'][sid]['bbox'] = d['bbox']
        if fl:
            res['flags'][sid] = fl
        print(f"{sid:12s} tris {d['tris']:4d}/{d['trisBudget']}  calls {d['drawCalls']}  ground {str(d['grounded']):5s}  {d['texelHeight']} tx tall  eye {e.get('w', '?')}x{e.get('h', '?')} tx  blocks {d['colours']['blocks']} {d['colours']['shares'][:4]}  {'; '.join(fl)}")
    if not a.no_render:
        for sid in (ids or list(f['species'].keys())):
            for view in ('front', 'q3', 'side'):
                r = capture(game, 'still', f'scene=model&species={sid}&view={view}&theme=meadow&freeze=1.3&seed=1', out, f'sheet-{sid}-{view}', ['--views', 'desk', '--frames', '60', '--settle', '0'], dist=a.dist)
                res['species'][sid].setdefault('sheets', []).append(r['views']['desk']['file'])
            proxy(out / f'sheet-{sid}-front-desk.png', f['species'][sid]['texelHeight'], out / f'proxy-{sid}.png')
            res['species'][sid]['proxy'] = str(out / f'proxy-{sid}.png')
        if a.battle:
            sid = (ids or ['kin'])[0]
            r = capture(game, 'still', a.battle, out, f'battle-{sid}', ['--views', 'desk,phone'], dist=a.dist)
            from judge import crop_subjects
            res['battle'] = {}
            for v, d in r['views'].items():
                c, box = crop_subjects(d['file'])
                res['battle'][v] = {'file': d['file'], 'crop': str(c), 'subjects': d['subjects'], 'drawCalls': d['drawCalls'], 'idle': d['idle']}
                foe = next((s for s in d['subjects'] if s['name'] == 'foe'), None)
                if foe:
                    res['battle'][v]['foePxHeight'] = foe['h'] * d['dpr']
    emit(res, out / 'sheet.json')
    want = ids or []
    raise SystemExit(1 if any(s in res['flags'] for s in want) else 0)


if __name__ == '__main__':
    main()
