#!/usr/bin/env python3
"""make_strips.py - frame strips (for the judge) and a GIF (for humans only) from a strip.mjs capture dir.

  python3 -I make_strips.py CAPTURE_DIR [--every 2] [--window 72] [--scale 1] [--out DIR] [--gif] [--idle]
  python3 -I make_strips.py --canary blur|hitstop STRIP_DIR_OR_CAPTURE_DIR ... (see judge_motion.py)

From DIR/frames/fNNN.png + DIR/meta.json (strip.mjs) writes DIR/strips/:
  attacker.png   ATTACKER-ONLY crop (the "mine" box grown toward the target, the target excluded), every
                 --every-th 60 fps frame from launch-12 over --window frames, 9 tiles per row, frame index
                 above each tile. Repeated tiles = held frames. This is the view that judges the attack's
                 anticipation / strike / overshoot / settle (skill-pilot-ablation.md: a frozen mid-impact
                 frame judged a correct timing fix "worse" 8/8).
  sync.png       SYNC strip: a band holding attacker, target, the effect and the foe HP panel, every
                 --every-th frame from impact-6 to impact+18 (or from launch if no impact): judges hit
                 feedback timing (impact frame, flash, hit-stop, reaction, HP drain).
  idle.png       (--idle, needs DIR/idle/) the target's idle loop at 2x, every 2nd frame.
  motion.gif     (--gif) attacker crop at real timing (every 2nd frame, 33 ms), for a human to watch; the
                 judge never sees it (GIF timing is not frame-exact and the judge reads strips).
Prints one JSON line with the paths and the frame ranges. Exit 0; 2 bad input.
"""
import argparse
import glob
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

LABEL_H = 12
FG = (255, 230, 120)
BG = (16, 16, 20)


def frame_path(d, i):
    return os.path.join(d, 'frames', f'f{i:03d}.png')


def ev(v):
    return int(v) // 2 * 2  # even coordinates keep 2-px texels aligned in the crop


def attacker_box(meta, W, H):
    subs = {s['name']: s for s in meta['subjects']}
    a = subs.get(meta.get('attacker', 'mine')) or next(iter(subs.values()))
    t = subs.get(meta.get('target', 'foe'))
    # grow toward the target so the lunge stays in frame, leave the target out
    x0, y0, x1, y1 = a['x'] - 40, a['y'] - 50, a['x'] + a['w'] + 40, a['y'] + a['h'] + 30
    if t:
        if t['x'] > a['x']:
            x1 = min(x1 + 120, t['x'] - 4)
        else:
            x0 = max(x0 - 120, t['x'] + t['w'] + 4)
    return (ev(max(0, x0)), ev(max(0, y0)), ev(min(W, x1)), ev(min(H, y1)))


def sync_box(meta, W, H):
    subs = meta['subjects']
    x0 = min(s['x'] for s in subs) - 30; x1 = max(s['x'] + s['w'] for s in subs) + 30
    y0 = min(s['y'] for s in subs) - 40; y1 = max(s['y'] + s['h'] for s in subs) + 24
    # include the top-left foe HP panel (battle HUD layout) so HP drain is visible
    x0 = min(x0, int(W * 0.02)); y0 = min(y0, int(H * 0.03))
    return (ev(max(0, x0)), ev(max(0, y0)), ev(min(W, x1)), ev(min(H, y1)))


def strip(files, box, scale, cols, out, labels, title=''):
    ims = []
    for f in files:
        im = Image.open(f).convert('RGB').crop(box)
        if scale != 1:
            im = im.resize((round(im.width * scale), round(im.height * scale)), Image.NEAREST)
        ims.append(im)
    w, h = ims[0].size
    rows = (len(ims) + cols - 1) // cols
    th = 16 if title else 0
    sh = Image.new('RGB', (cols * (w + 3), th + rows * (h + LABEL_H + 3)), BG)
    d = ImageDraw.Draw(sh)
    if title:
        d.text((4, 2), title, fill=(255, 255, 255))
    for i, im in enumerate(ims):
        x = (i % cols) * (w + 3); y = th + (i // cols) * (h + LABEL_H + 3)
        sh.paste(im, (x, y + LABEL_H)); d.text((x + 2, y), str(labels[i]), fill=FG)
    sh.save(out)
    return sh.size


def make_canary(kind, src, out):
    """Degrade a strip for the motion canary: 'blur' softens every tile; 'hitstop' removes held (repeated)
    tiles by rebuilding from the frames when a capture dir is given, else blurs 2x harder."""
    if kind == 'blur':
        im = Image.open(src).convert('RGB')
        w, h = im.size
        im = im.resize((w // 2, h // 2), Image.NEAREST).resize((w, h), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.2))
        im.save(out)
        return {'canary': kind, 'out': out}
    raise ValueError('hitstop canary is built from the capture dir by main()')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('capture_dir'); ap.add_argument('--every', type=int, default=2); ap.add_argument('--window', type=int, default=72)
    ap.add_argument('--scale', type=float, default=1); ap.add_argument('--out'); ap.add_argument('--gif', action='store_true')
    ap.add_argument('--idle', action='store_true'); ap.add_argument('--canary', choices=['blur', 'hitstop'])
    ap.add_argument('--strip', help='with --canary blur: the strip PNG to degrade')
    a = ap.parse_args()
    if a.canary == 'blur':
        src = a.strip or os.path.join(a.capture_dir, 'strips', 'attacker.png')
        out = src.replace('.png', '.canary-blur.png')
        print(json.dumps(make_canary('blur', src, out))); return
    d = a.capture_dir
    mp = os.path.join(d, 'meta.json')
    if not os.path.isfile(mp):
        print(f'error: {mp} not found (run strip.mjs first)', file=sys.stderr); sys.exit(2)
    meta = json.load(open(mp))
    idx = sorted(int(os.path.basename(f)[1:4]) for f in glob.glob(os.path.join(d, 'frames', 'f*.png')))
    n = (idx[-1] + 1) if idx else 0
    first = idx[0] if idx else 0
    if n == 0:
        print('error: no frames', file=sys.stderr); sys.exit(2)
    W, H = meta.get('viewport', [1280, 720])
    outd = a.out or os.path.join(d, 'strips'); os.makedirs(outd, exist_ok=True)
    launch = meta.get('launch', -1); impact = meta.get('impact', -1)
    start = max(first, (launch if launch >= 0 else 0) - 12)
    res = {'capture': d, 'frames': n, 'launch': launch, 'impact': impact}
    abox = attacker_box(meta, W, H)
    if a.canary == 'hitstop':
        # drop held frames: keep only frames whose attacker POSE differs from the previous kept one
        # (pose signature from motionlint.py: ignores background motes; texel = 2 px at the desk camera)
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import motionlint
        subs = {s_['name']: s_ for s_ in meta['subjects']}
        att = subs.get(meta.get('attacker', 'mine')) or next(iter(subs.values())); tgt = subs.get(meta.get('target', 'foe'))
        sgn = 1.0 if (tgt is None or tgt['x'] >= att['x']) else -1.0
        rows = motionlint.pose_rows(d, abox, start, min(n, start + a.window), 2.0, att, sgn)
        kept = [r['i'] for r in rows if not r['same']]
        fr = kept[::a.every]
        out = os.path.join(outd, 'attacker.canary-hitstop.png')
        strip([frame_path(d, i) for i in fr], abox, a.scale, 9, out, fr)
        res.update({'canary': 'hitstop', 'out': out, 'dropped_held_frames': (min(n, start + a.window) - start) - len(kept)})
        print(json.dumps(res)); return
    fr = list(range(start, min(n, start + a.window), a.every))
    res['attacker'] = os.path.join(outd, 'attacker.png')
    res['attacker_size'] = strip([frame_path(d, i) for i in fr], abox, a.scale, 9, res['attacker'], fr)
    res['attacker_frames'] = [fr[0], fr[-1]]; res['attacker_box'] = abox
    sb = sync_box(meta, W, H)
    c = impact if impact >= 0 else (launch if launch >= 0 else 0)
    fs_ = list(range(max(first, c - 6), min(n, c + 18), a.every))
    res['sync'] = os.path.join(outd, 'sync.png')
    res['sync_size'] = strip([frame_path(d, i) for i in fs_], sb, 1, 6, res['sync'], fs_)
    res['sync_frames'] = [fs_[0], fs_[-1]]
    if a.idle and os.path.isdir(os.path.join(d, 'idle')):
        idle = sorted(glob.glob(os.path.join(d, 'idle', 'f*.png')))[::2]
        subs = {s['name']: s for s in meta['subjects']}; t = subs.get(meta.get('target', 'foe')) or subs.get('mine')
        ib = (ev(t['x'] - 10), ev(t['y'] - 24), ev(t['x'] + t['w'] + 10), ev(t['y'] + t['h'] + 10))
        res['idle'] = os.path.join(outd, 'idle.png')
        strip(idle, ib, 2, 12, res['idle'], [int(os.path.basename(f)[1:4]) for f in idle])
    if a.gif:
        ims = [Image.open(frame_path(d, i)).convert('RGB').crop(abox) for i in range(start, min(n, start + a.window), 2)]
        ims = [im.resize((im.width * 2, im.height * 2), Image.NEAREST) for im in ims]
        dur = [33] * len(ims); dur[-1] = 400
        res['gif'] = os.path.join(outd, 'motion.gif')
        ims[0].save(res['gif'], save_all=True, append_images=ims[1:], duration=dur, loop=0, optimize=False)
    res['note'] = 'judge motion on attacker.png (attack craft) and sync.png (hit feedback); the GIF is for humans'
    print(json.dumps(res))


if __name__ == '__main__':
    main()
