#!/usr/bin/env python3
"""Tile a captured action into a judge strip and lint the measured motion.

  python3 strips.py --capture cap/kin19-attack.json --out strips/kin19-attack.png [--facts facts.json --species kin19] [--cols 9]
Input: the JSON written by `capture.mjs strip` (frames every 2nd frame, per-frame log of the actor's
inner position / body scale). Output: a strip PNG (native nearest scale, frame number on each tile,
<= 2400 px wide) and a JSON next to it with the MEASURED lint (what actually played, in texels):
  anticipationFrames, backTexels (wind-up travel), strikeFrames, reachTexels, maxStretch, minSquash,
  overshootTexels, settleFrame, totalFrames, distinctCels (how many frames changed the pose).
Flags: NO_ANTICIPATION (< 3 f or < 2 texels), TOO_FAST (anticipation + hold < 10 f), NO_STRETCH (< 1.25),
NO_SQUASH (> 0.85), NO_OVERSHOOT, FLOATY_STRIKE (> 8 f). Exit 0 clean, 1 flags, 2 bad input.
"""
import argparse
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw


def lint(log, tx_per_unit):
    if not log:
        return {'flags': ['EMPTY log']}
    d = [math.hypot(s['x'], s['z']) * (1 if (s['x'] != 0 or s['z'] != 0) else 0) for s in log]
    # Direction sign: toward the target is the direction of the largest displacement.
    big = max(range(len(log)), key=lambda i: d[i])
    ux, uz = (log[big]['x'], log[big]['z'])
    n = math.hypot(ux, uz) or 1
    ux, uz = ux / n, uz / n
    fwd = [(s['x'] * ux + s['z'] * uz) for s in log]  # + toward target
    sy = [s['sy'] for s in log]
    back_i = min(range(len(fwd)), key=lambda i: fwd[i])
    reach_i = max(range(len(fwd)), key=lambda i: fwd[i])
    anticipation = back_i + 1 if fwd[back_i] < -1e-4 else 0
    # Hold: frames around the back extreme within 0.2 texel of it.
    hold = sum(1 for i in range(len(fwd)) if i < reach_i and abs(fwd[i] - fwd[back_i]) * tx_per_unit < 0.2) if anticipation else 0
    strike_frames = max(0, reach_i - back_i)
    after = fwd[reach_i:]
    # Overshoot: most negative fwd after the reach (past rest).
    over = -min(after) if after else 0
    moved = [i for i in range(1, len(log)) if abs(fwd[i] - fwd[i - 1]) > 1e-4 or abs(sy[i] - sy[i - 1]) > 1e-3]
    settle = (moved[-1] + 1) if moved else 0
    res = {
        'anticipationFrames': anticipation, 'holdFrames': hold, 'backTexels': round(-fwd[back_i] * tx_per_unit, 2),
        'strikeFrames': strike_frames, 'reachTexels': round(fwd[reach_i] * tx_per_unit, 2), 'maxStretch': round(max(sy), 3), 'minSquash': round(min(sy), 3),
        'overshootTexels': round(over * tx_per_unit, 2), 'settleFrame': settle, 'totalFrames': len(log), 'distinctCels': len(moved) + 1,
        'impactFrame': reach_i,
    }
    flags = []
    if anticipation < 3 or res['backTexels'] < 2:
        flags.append(f"NO_ANTICIPATION {anticipation} f / {res['backTexels']} texels back (want >= 3 f and >= 10% H)")
    if anticipation + hold < 10:
        flags.append(f'TOO_FAST wind-up {anticipation} f + hold {hold} f < 10 f')
    if res['maxStretch'] < 1.25:
        flags.append(f"NO_STRETCH max sy {res['maxStretch']} < 1.25")
    if res['minSquash'] > 0.85:
        flags.append(f"NO_SQUASH min sy {res['minSquash']} > 0.85")
    if res['overshootTexels'] < 1 and max(sy[reach_i + 4:] or [1]) < 1.05:
        flags.append('NO_OVERSHOOT recovery never passes rest by >= 1 texel and no settle ring')
    if strike_frames > 8:
        flags.append(f'FLOATY_STRIKE {strike_frames} f from wind-up extreme to contact (> 8)')
    res['flags'] = flags
    return res


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--capture', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--facts')
    p.add_argument('--species')
    p.add_argument('--cols', type=int, default=8)
    p.add_argument('--max-width', type=int, default=2400)
    a = p.parse_args()
    d = json.loads(Path(a.capture).read_text())
    view = next(iter(d['views'].values()))
    frames = sorted(Path(view['framesDir']).glob('f*.png'))
    if not frames:
        sys.exit(f'error: no frames in {view["framesDir"]}')
    tx_per_unit = None
    if a.facts and a.species:
        f = json.loads(Path(a.facts).read_text())['species'][a.species]
        tx_per_unit = f['texelHeight'] / (f['bbox']['y'] * f['baseScale'])  # inner units -> texels
    if tx_per_unit is None:
        # Fall back to the sprite's on-screen height: texels = px / (px per texel); assume 2 px per texel on desk.
        sub = view['subject']
        tx_per_unit = 34 / 1.2
        print('warning: no --facts/--species; texel conversion is approximate', file=sys.stderr)
    ims = [Image.open(x) for x in frames]
    w, h = ims[0].size
    cols = min(a.cols, len(ims))
    scale = max(1, min(2, a.max_width // (cols * (w + 2))))
    rows = math.ceil(len(ims) / cols)
    strip = Image.new('RGB', (cols * (w * scale + 2), rows * (h * scale + 14)), (30, 26, 36))
    dr = ImageDraw.Draw(strip)
    for i, im in enumerate(ims):
        x = (i % cols) * (w * scale + 2)
        y = (i // cols) * (h * scale + 14) + 12
        strip.paste(im.resize((w * scale, h * scale), Image.NEAREST), (x, y))
        dr.text((x + 2, y - 11), f"f{i * view['every']}", fill=(255, 240, 200))
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    strip.save(out)
    res = lint(view['log'], tx_per_unit)
    res.update({'strip': str(out), 'frames': len(ims), 'every': view['every'], 'action': view.get('action')})
    s = json.dumps(res, indent=1)
    out.with_suffix('.json').write_text(s)
    print(s)
    sys.exit(1 if res.get('flags') else 0)


if __name__ == '__main__':
    main()
