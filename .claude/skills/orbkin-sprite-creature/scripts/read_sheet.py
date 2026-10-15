#!/usr/bin/env python3
"""Readable facts about kin at sprite size, plus review sheets. The first thing to run (S0) and
the check after every geometry edit (S4).

  python3 read_sheet.py [--species kin19] [--game DIR] [--out DIR] [--no-render] [--battle URL]
Prints one line per species: tris / budget, draw calls, grounded, height in texels, eye size in
texels (the pupil box, L/R), colour blocks (shares >= 4%), and FLAGS:
  EYES  < 3x3 texels at battle size (the most violated rule in pilot runs)
  TRIS  over the unit-test budget (1800 for a stage 1 that evolves, else 2500)
  CALLS more than one mesh, GROUND lowest vertex off y = 0. Colour blocks (shares >= 4%) are printed
  as information (aim 3-4 on the model; 11 of the 18 kin count more because of detail tones).
Renders (unless --no-render): DIR/sheet-<id>-{front,q3,side}.png from ?scene=model (frozen idle)
and DIR/proxy-<id>.png: the front view downscaled to the species' battle texel height and
blown up 4x nearest (what the player actually sees; look at it, not at the 420 px model).
--battle "scene=battle&...&foe=kin19": also a frozen desk + phone capture of the real battle with
2x subject crops (DIR/battle-<foe>-{desk,phone}.png, -crop.png; <foe> is the foe= in the URL), the
FLOOR colour under the foe (hex + luminance: what the kin must separate from) and the BAKED FACE
read (near-eye pupil tone vs the 2-texel ring; FACE flag < 0.15, > 50% of the ring in the pupil tone,
or fewer than 2 texels of dark pupil inside the eye box).
These are cheap pre-checks; the real face gate is `judge.py read` on the battle crop.
The game is rebuilt automatically when src/ is newer than the dist (no stale captures).
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
        k = round(3 / max(0.01, min(e.get('w', 0.01), e.get('h', 0.01))), 2) if e else None
        fl.append(f"EYES pupil {e.get('w') if e else None}x{e.get('h') if e else None} texels < 3x3 (multiply `size` in eyes() by >= {k or '?'}; yaw foreshortens the width, so measure again)")
    if d['tris'] > d['trisBudget']:
        fl.append(f"TRIS {d['tris']} > budget {d['trisBudget']}")
    if d['drawCalls'] != 1:
        fl.append(f"CALLS {d['drawCalls']} meshes besides the shadow (must be one merged mesh)")
    if not d['grounded']:
        fl.append('GROUND lowest vertex not on y = 0')
    return fl


def baked_face(png, sub, dpr, texel_h):
    """Face read in the BAKED sprite: the near eye's box (projected blink-rig vertices) against a
    2-texel ring around it. contrast = |pupil tone (10th or 90th percentile inside, whichever is
    farther from the ring) - ring median| / 255; ringSameToneFraction = share of the ring within
    25 levels of that pupil tone (knuckles, paws, a dark head fusing with 1-tone dark eyes)."""
    import numpy as np
    eyes = sub.get('eyes')
    if not eyes or eyes['w'] < 1 or eyes['h'] < 1:
        return None
    im = np.asarray(Image.open(png).convert('L'), dtype=np.float32)
    px_per_texel = max(1.0, sub['h'] * dpr / texel_h)
    ring = int(round(2 * px_per_texel))
    x0, y0 = int(eyes['x'] * dpr), int(eyes['y'] * dpr)
    x1, y1 = int((eyes['x'] + eyes['w']) * dpr) + 1, int((eyes['y'] + eyes['h']) * dpr) + 1
    inner = im[max(0, y0):y1, max(0, x0):x1]
    outer = im[max(0, y0 - ring):y1 + ring, max(0, x0 - ring):x1 + ring].copy()
    if inner.size == 0 or outer.size <= inner.size:
        return None
    mask = np.ones_like(outer, bool)
    oy, ox = max(0, y0) - max(0, y0 - ring), max(0, x0) - max(0, x0 - ring)
    mask[oy:oy + inner.shape[0], ox:ox + inner.shape[1]] = False
    ringpx = outer[mask]
    ring_med = float(np.median(ringpx))
    lo, hi = float(np.percentile(inner, 10)), float(np.percentile(inner, 90))
    pupil = lo if abs(lo - ring_med) >= abs(hi - ring_med) else hi
    same = float((np.abs(ringpx - pupil) < 25).mean())
    # The dark pupil on its own (the sclera carries contrast, the pupil carries the gaze): pixels
    # inside the box darker than ring - 40, counted in texels.
    dark = inner < min(ring_med - 40, 90)
    dark_tx = round(float(dark.sum()) / (px_per_texel ** 2), 2)
    return {'eyeBoxPx': eyes, 'pupilTone': round(pupil, 1), 'scleraTone': round(hi, 1), 'ringMedian': round(ring_med, 1), 'contrast': round(abs(pupil - ring_med) / 255, 3),
            'ringSameToneFraction': round(same, 3), 'darkPupilTexels': dark_tx, 'eyeBoxTexels': [round(eyes['w'] * dpr / px_per_texel, 1), round(eyes['h'] * dpr / px_per_texel, 1)]}


def floor_sample(png, sub, dpr):
    """Median colour of the floor just below the subject's feet (the value the kin must separate from)."""
    import numpy as np
    im = np.asarray(Image.open(png).convert('RGB'))
    y0 = int((sub['y'] + sub['h']) * dpr) + 2
    y1 = min(im.shape[0], y0 + max(4, int(sub['h'] * dpr * 0.15)))
    x0, x1 = max(0, int(sub['x'] * dpr)), min(im.shape[1], int((sub['x'] + sub['w']) * dpr))
    patch = im[y0:y1, x0:x1].reshape(-1, 3)
    if patch.size == 0:
        return None
    med = np.median(patch, axis=0).astype(int)
    lum = int(0.2126 * med[0] + 0.7152 * med[1] + 0.0722 * med[2])
    return {'hex': '#%02x%02x%02x' % tuple(int(v) for v in med), 'luminance': lum, 'note': 'median colour of the floor under the foe; separate the kin from it by value AND hue'}


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
        import re
        m = re.search(r'foe=([a-z0-9_-]+)', a.battle)
        sid = m.group(1) if m else (ids or ['kin'])[0]
        r = capture(game, 'still', a.battle, out, f'battle-{sid}', ['--views', 'desk,phone'], dist=a.dist)
        from judge import crop_subjects
        res['battle'] = {}
        for v, d in r['views'].items():
            c, box = crop_subjects(d['file'])
            res['battle'][v] = {'file': d['file'], 'crop': str(c), 'subjects': d['subjects'], 'drawCalls': d['drawCalls'], 'idle': d['idle']}
            foe = next((s for s in d['subjects'] if s['name'] == 'foe'), None)
            if foe:
                res['battle'][v]['foePxHeight'] = foe['h'] * d['dpr']
                res['battle'][v]['floor'] = floor_sample(d['file'], foe, d['dpr'])
                th = f['species'][sid]['texelHeight'] if sid in f['species'] else 34
                face = baked_face(d['file'], foe, d['dpr'], th)
                res['battle'][v]['face'] = face
                if face and sid in f['species']:
                    if face['contrast'] < 0.15:
                        res['flags'].setdefault(sid, []).append(f"FACE ({v}) near-eye pupil tone differs {face['contrast']:.2f} < 0.15 in value from the 2-texel ring around it: the face is lost in the sprite (two-tone eyes: sclera or iris; nothing in the eye's own tone next to it)")
                    if face['darkPupilTexels'] < 2:
                        res['flags'].setdefault(sid, []).append(f"FACE ({v}) only {face['darkPupilTexels']} texels of dark pupil inside the baked eye box (want >= 2: a visible dark pupil; a white sclera alone is not a face, and eyes shut on this frame count too)")
                    if face['ringSameToneFraction'] > 0.5:
                        res['flags'].setdefault(sid, []).append(f"FACE ({v}) {face['ringSameToneFraction']:.0%} of the ring around the eyes is in the eyes' own tone: eyes fuse with knuckles / paws / a dark head; move dark parts below the chin line or lighten the head")
    emit(res, out / 'sheet.json')
    want = ids or []
    raise SystemExit(1 if any(s in res['flags'] for s in want) else 0)


if __name__ == '__main__':
    main()
