#!/usr/bin/env python3
"""motionlint.py - deterministic attack-motion checks from a strip.mjs capture (60 fps frames + engine probe).

  python3 -I motionlint.py CAPTURE_DIR [--texel 2] [--window 72] [--out lint.json]

Image side (attacker crop, texels = --texel screen px; 2 = the desk battle camera at 1x sprite density):
  travel curve      centroid of pixels that changed vs the pre-launch frame, projected on the attacker->target axis
  pose signature    (travel, centroid y, changed-region height, changed-pixel count) quantised to half texels,
                    so background motes do not count as a new pose; "held" = same signature as the previous frame
  antic_frames/depth frames moving AWAY from the target before the strike, and how far (texels)
  hold_frames       held frames at the wind-up extreme (the pose held before the strike)
  strike_frames     from leaving the wind-up to the peak of the travel
  overshoot_texels  travel past the rest point on the way back
  amplitude_texels  peak travel
  squash/stretch    min / max changed-region height relative to the rest height
  distinct_pose_share  distinct signatures / frames (1.0 = a new pose every frame = clock-sampled 3D, not keyed cels)
Timeline side (meta.json beats): text_to_launch, launch_to_impact, impact_to_reaction, impact_to_hp, launch_to_settle.
Flags, with the playbook numbers they come from (GRAPHICS_PLAYBOOK.md 3.6; review thresholds, not calibrated
gates): NO_ANTICIPATION (< 3 f or < 1.5 texels), NO_HOLD (< 2 held frames at the wind-up), TOO_FAST (antic +
strike < 8 f), FLOATY_STRIKE (strike > 20 f; travel 6-20 f), NO_OVERSHOOT, SUB_TEXEL_ATTACK (amplitude < 2
texels; the 1.3-texel lunge was a diagnosed defect), SMOOTH_60 (> 90 % distinct poses; keyed cels beat smooth
44/48), LATE_REACTION (impact -> reaction > 2 f), SLOW_LAUNCH (text -> launch > 30 f), LONG_SETTLE (launch ->
settle > 60 f), NO_IMPACT_DETECTED.
Caveat: the travel curve follows whatever changes inside the attacker crop. For a LUNGE it is the body; for a
PROJECTILE move it is the projectile's flight, so the body beats (anticipation, hold, overshoot) are about the
cast pose and FLOATY_STRIKE measures the flight. Read the attacker strip alongside the numbers.
Prints one JSON object. Exit 0 no flags, 1 flags present, 2 bad input. Advisory: the strip judge decides.
"""
import argparse
import glob
import json
import os
import sys

import numpy as np
from PIL import Image


def ev(v):
    return int(v) // 2 * 2


def attacker_box(meta, W, H):
    subs = {s['name']: s for s in meta['subjects']}
    a = subs.get(meta.get('attacker', 'mine')) or next(iter(subs.values()))
    t = subs.get(meta.get('target', 'foe'))
    x0, y0, x1, y1 = a['x'] - 40, a['y'] - 50, a['x'] + a['w'] + 40, a['y'] + a['h'] + 30
    if t:
        if t['x'] > a['x']:
            x1 = min(x1 + 120, t['x'] - 4)
        else:
            x0 = max(x0 - 120, t['x'] + t['w'] + 4)
    return (ev(max(0, x0)), ev(max(0, y0)), ev(min(W, x1)), ev(min(H, y1))), a, t


def pose_rows(d, box, start, end, texel, att, sgn):
    """Per frame: travel dx (texels, + toward the target), centroid y, changed-region height, changed-pixel
    count and a POSE SIGNATURE that ignores background motion (quantised to half texels)."""
    ref = np.asarray(Image.open(os.path.join(d, 'frames', f'f{start:03d}.png')).convert('RGB').crop(box), np.int16)
    rest_cx = (att['x'] + att['w'] / 2) - box[0]
    rows = []
    for i in range(start, end):
        im = np.asarray(Image.open(os.path.join(d, 'frames', f'f{i:03d}.png')).convert('RGB').crop(box), np.int16)
        ch = np.abs(im - ref).max(-1) > 12
        n = int(ch.sum())
        if n < 20:
            rows.append({'i': i, 'dx': 0.0, 'dy': 0.0, 'h': float(att['h']), 'n': n, 'sig': (0, 0, 0, 0)})
            continue
        ys, xs = np.where(ch)
        dx = float((xs.mean() - rest_cx) * sgn / texel)
        dy = float(ys.mean() / texel)
        h = float(ys.max() - ys.min())
        sig = (round(dx * 2) / 2, round(dy * 2) / 2, round(h / texel), round(n / (texel * texel * 25)))
        rows.append({'i': i, 'dx': dx, 'dy': dy, 'h': h, 'n': n, 'sig': sig})
    for k, r in enumerate(rows):
        r['same'] = k > 0 and r['sig'] == rows[k - 1]['sig']
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('capture_dir'); ap.add_argument('--texel', type=float, default=2.0)
    ap.add_argument('--window', type=int, default=72); ap.add_argument('--out')
    a = ap.parse_args()
    d = a.capture_dir
    try:
        meta = json.load(open(os.path.join(d, 'meta.json')))
    except (OSError, json.JSONDecodeError) as e:
        print(f'error: {e}', file=sys.stderr); sys.exit(2)
    idx = sorted(int(os.path.basename(f)[1:4]) for f in glob.glob(os.path.join(d, 'frames', 'f*.png')))
    n = (idx[-1] + 1) if idx else 0
    first = idx[0] if idx else 0
    if n < 4:
        print('error: fewer than 4 frames', file=sys.stderr); sys.exit(2)
    W, H = meta.get('viewport', [1280, 720])
    box, att, tgt = attacker_box(meta, W, H)
    launch = meta.get('launch', -1)
    start = max(first, (launch if launch >= 0 else 0) - 12)
    end = min(n, start + a.window)
    sgn = 1.0 if (tgt is None or tgt['x'] >= att['x']) else -1.0
    rows = pose_rows(d, box, start, end, a.texel, att, sgn)
    rest_h = att['h']
    distinct = len({r['sig'] for r in rows})
    dx = [r['dx'] for r in rows]
    peak_i = int(np.argmax(dx)) if dx else 0
    amplitude = max(dx) if dx else 0.0
    # first committed forward move: dx rises by > 1 texel in one frame, before the peak
    first_fwd = next((k for k in range(1, peak_i + 1) if dx[k] - dx[k - 1] > 1.0), None)
    pre = dx[:first_fwd] if first_fwd else dx[:peak_i]
    antic_frames = sum(1 for v in pre if v < -0.75)
    antic_depth = -min(pre) if pre else 0.0
    hold = 0
    if first_fwd:
        for k in range(first_fwd - 1, 0, -1):
            if rows[k]['same'] and dx[k] < -0.75:
                hold += 1
            else:
                break
    strike = (peak_i - (first_fwd - 1)) if first_fwd else None
    after = dx[peak_i:]
    overshoot = -min(after) if after and min(after) < -0.75 else 0.0
    moving = [k for k in range(1, len(dx)) if abs(dx[k] - dx[k - 1]) > 0.25 or abs(rows[k]['h'] - rows[k - 1]['h']) > 1.5]
    settle_rel = moving[-1] if moving else 0
    hs = [r['h'] for r in rows if r['h'] > 0]
    squash = min(hs) / rest_h if hs and rest_h else 1.0
    stretch = max(hs) / rest_h if hs and rest_h else 1.0
    beats = meta.get('beats', {})
    flags = []
    if antic_frames < 3 or antic_depth < 1.5: flags.append('NO_ANTICIPATION')
    if antic_frames >= 3 and hold < 2: flags.append('NO_HOLD')
    if strike is not None and antic_frames + strike < 8: flags.append('TOO_FAST')
    if strike is not None and strike > 20: flags.append('FLOATY_STRIKE')
    if overshoot < 0.75: flags.append('NO_OVERSHOOT')
    if amplitude < 2.0: flags.append('SUB_TEXEL_ATTACK')
    if rows and distinct / len(rows) > 0.9: flags.append('SMOOTH_60')
    if meta.get('impact', -1) < 0: flags.append('NO_IMPACT_DETECTED')
    if (beats.get('impact_to_reaction_f') or 0) > 2: flags.append('LATE_REACTION')
    if (beats.get('text_to_launch_f') or 0) > 30: flags.append('SLOW_LAUNCH')
    if (beats.get('launch_to_settle_f') or 0) > 60: flags.append('LONG_SETTLE')
    out = {'capture': d, 'move': meta.get('move'), 'frames_analysed': [start, end - 1], 'texel_px': a.texel,
           'antic_frames': antic_frames, 'antic_depth_texels': round(antic_depth, 2), 'hold_frames': hold,
           'strike_frames': strike, 'amplitude_texels': round(amplitude, 2), 'overshoot_texels': round(overshoot, 2),
           'squash': round(squash, 3), 'stretch': round(stretch, 3), 'settle_frame_rel': settle_rel,
           'distinct_pose_share': round(distinct / max(1, len(rows)), 3), 'held_frames_total': sum(1 for r in rows if r['same']),
           'beats': beats, 'flags': flags,
           'note': 'advisory review numbers (playbook 3.6); the strip judge decides better/worse'}
    s = json.dumps(out, indent=1)
    print(s)
    if a.out:
        open(a.out, 'w').write(s)
    sys.exit(1 if flags else 0)


if __name__ == '__main__':
    main()
