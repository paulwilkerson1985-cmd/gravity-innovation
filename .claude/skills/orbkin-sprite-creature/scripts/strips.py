#!/usr/bin/env python3
"""Tile a captured action into a judge strip and lint the measured motion.

  python3 strips.py --capture cap/kin19-attack.json --out strips/kin19-attack.png [--facts facts.json --species kin19] [--cols 9]
Input: the JSON written by `capture.mjs strip` (frames every 2nd frame, per-frame log of the actor's
inner position / body scale). Output: a strip PNG (native nearest scale, frame number on each tile,
<= 2400 px wide) and <name>-lint.json next to it with the MEASURED lint (what actually played, in texels):
  anticipationFrames, backTexels (wind-up travel), strikeFrames, reachTexels, maxStretch, minSquash,
  overshootTexels, settleFrame, totalFrames, distinctCels (how many frames changed the pose).
Lunge flags: NO_ANTICIPATION (< 3 f or < 2 texels), TOO_FAST (anticipation + hold < 10 f), NO_STRETCH (< 1.25),
NO_SQUASH (> 0.85), NO_OVERSHOOT, FLOATY_STRIKE (> 8 f from the end of the hold to contact).
Hit flags (action hit/crit): WEAK_FIRST_CEL, HOLD (first cel 4-8 f), NO_RECOIL (< 2 texels), NO_SQUASH, SLOW.
Faint / idle / appear strips are tiled only. Exit 0 clean, 1 flags, 2 bad input.
"""
import argparse
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw


def lint(log, tx_per_unit, kind='lunge'):
    if not log:
        return {'flags': ['EMPTY log']}
    if kind == 'hit':
        return lint_hit(log, tx_per_unit)
    if kind not in ('lunge',):
        return {'flags': [], 'note': f'no lint rules for {kind}; strip tiled only'}
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
    # Hold: frames at the back extreme (within 0.2 texel of it); the strike starts when it ends.
    held = [i for i in range(len(fwd)) if i < reach_i and abs(fwd[i] - fwd[back_i]) * tx_per_unit < 0.2] if anticipation else []
    hold = len(held)
    hold_end = max(held) if held else back_i
    strike_frames = max(0, reach_i - hold_end)
    after = fwd[reach_i:]
    # Overshoot: most negative fwd after the reach (past rest).
    over = -min(after) if after else 0
    done = [i for i, s in enumerate(log) if s.get('done')]
    end = done[0] if done else len(log)
    moved = [i for i in range(1, end) if abs(fwd[i] - fwd[i - 1]) > 1e-4 or abs(sy[i] - sy[i - 1]) > 1e-3]
    settle = end if done else (moved[-1] + 1 if moved else 0)
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
        flags.append(f'FLOATY_STRIKE {strike_frames} f from the end of the hold to contact (> 8)')
    res['flags'] = flags
    return res


def lint_hit(log, tx_per_unit):
    z = [s['z'] for s in log]  # local z: + is toward the attacker, so recoil is negative
    sy = [s['sy'] for s in log]
    back_i = min(range(len(z)), key=lambda i: z[i])
    back_tx = -z[back_i] * tx_per_unit
    first_hold = 0
    for i in range(len(z)):
        if abs(z[i] - z[0]) < 1e-4 and abs(sy[i] - sy[0]) < 1e-3:
            first_hold += 1
        else:
            break
    done = [i for i, s in enumerate(log) if s.get('done')]
    end = done[0] if done else len(log)
    moved = [i for i in range(1, end) if abs(z[i] - z[i - 1]) > 1e-4 or abs(sy[i] - sy[i - 1]) > 1e-3]
    settle = end if done else (moved[-1] + 1 if moved else 0)
    hidden = sum(1 for s in log if not s['visible'])
    res = {'kind': 'hit', 'recoilTexels': round(back_tx, 2), 'recoilFrame': back_i, 'firstCelFrames': first_hold, 'minSquash': round(min(sy), 3), 'settleFrame': settle, 'hiddenFrames': hidden, 'distinctCels': len(moved) + 1, 'totalFrames': len(log)}
    flags = []
    if back_i > 1:
        flags.append(f'WEAK_FIRST_CEL strongest recoil at frame {back_i}, not the first cel (saint11: the first frame is the strongest)')
    if not 4 <= first_hold <= 8:
        flags.append(f'HOLD first cel held {first_hold} f (want 4-6, +2 on strong hits)')
    if back_tx < 2:
        flags.append(f'NO_RECOIL {back_tx:.1f} texels back (< 2)')
    if min(sy) > 0.85:
        flags.append(f'NO_SQUASH min sy {min(sy)} > 0.85')
    if settle > 36:
        flags.append(f'SLOW hit settles at frame {settle} (> 36; hurt is ~0.3 s)')
    res['flags'] = flags
    return res


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--capture', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--facts')
    p.add_argument('--species')
    p.add_argument('--cols', type=int, default=8)
    p.add_argument('--tiles', type=int, default=0, help='subsample to N evenly spaced tiles (e.g. 8 for the launch -> +1.2 s overview strip)')
    p.add_argument('--kind', default=None, choices=['lunge', 'hit', 'none'], help='lint rules (default from the capture action: lunge/hit; faint, idle, appear tile only)')
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
    if a.tiles and a.tiles < len(frames):
        step = (len(frames) - 1) / (a.tiles - 1)
        frames = [frames[round(i * step)] for i in range(a.tiles)]
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
        dr.text((x + 2, y - 11), f"f{int(frames[i].stem[1:])}", fill=(255, 240, 200))
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    strip.save(out)
    action = view.get('action') or 'lunge'
    kind = a.kind or ('lunge' if action == 'lunge' else 'hit' if action in ('hit', 'crit') else 'none')
    res = lint(view['log'], tx_per_unit, kind)
    res.update({'strip': str(out), 'frames': len(ims), 'every': view['every'], 'action': view.get('action')})
    s = json.dumps(res, indent=1)
    out.with_name(out.stem + '-lint.json').write_text(s)  # never the capture JSON's name
    print(s)
    sys.exit(1 if res.get('flags') else 0)


if __name__ == '__main__':
    main()
