#!/usr/bin/env python3
"""Temporal-stability metrics for a frame clip from cam_capture.mjs (camera moves, drifts, shakes).

  python3 -I ${CLAUDE_SKILL_DIR}/scripts/cam_analyze.py CLIP_DIR [--max-rigid 0.05] [--max-flick 0.02] [--max-bad 0.5]
      [--mp4 OUT.mp4] [--json OUT.json] [--baseline IDLE_CLIP_DIR [--relative]]

Frames are reduced to the INTERNAL pixel grid first (one sample per device-px block, exact for the
nearest upscale), then per consecutive pair:
  raw       mean |F_t − F_{t−1}| per pixel (includes the intended motion)
  flick %   % of pixel-frames whose luma reverses direction across 3 frames with steps > 12/255
            (A B A): shimmer/crawl. Clean pixel-art translation is monotonic. Saturates ≈ 3.4 % at
            ≥ 1 px/frame, so it is only meaningful for slow moves (< 0.5 px/frame).
  rigid     block-rigid residual: per 16×16 block the best whole-pixel shift (±3) between frames,
            mean |residual| after it. 0 = the frame moved as one rigid pixel image.
  rigid_bad % of blocks with residual > 4 (visibly deforming: parallax crawl, re-rasterised texels).
Gate (camera-transitions §8): translations rigid_bad ≤ 0.5 % and flick = 0; anything slower than
12 frames flick ≤ 0.05 %. Defaults here: rigid ≤ 0.05, flick ≤ 0.02 %, rigid_bad ≤ 0.5 % → exit 0/1.
Measured anchors on the cave battle: whole-px view-offset pan + locks 0.013 / 0.000 / 0.00;
3D truck snapped + locks 0.247 / 0.000 / 0.79; sub-pixel pan 2.005 / 0.207 / 11.4; slow orbit/dolly
flick 0.19–0.31 %. A LIVE world (foliage sway, sprite bakes at 8–10 fps) has its own floor
(idle battle: rigid 0.063, rigid_bad 0.41 %): capture an idle clip of the same screen with the camera
move disabled and pass it as --baseline --relative so the gate measures what the move ADDS. --mp4 writes a 2× nearest review clip with ffmpeg when it is installed (owner review:
never judge stability from stills or strips).
"""
import argparse, json, os, shutil, subprocess, sys
import numpy as np
from PIL import Image

def load_internal(path, scale, internal):
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float64)
    s = max(1, int(scale))
    h, w = im.shape[0] // s, im.shape[1] // s
    if internal:
        w, h = min(w, internal[0]), min(h, internal[1])
    off = s // 2
    return im[off:off + h * s:s, off:off + w * s:s]

def luma(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]

def rigid(prev, cur, block=16, rng=3):
    h, w = prev.shape[:2]
    res, bad, n = 0.0, 0, 0
    for y in range(0, h - block + 1, block):
        for x in range(0, w - block + 1, block):
            c = cur[y:y + block, x:x + block]
            best = None
            for dy in range(-rng, rng + 1):
                for dx in range(-rng, rng + 1):
                    yy, xx = y + dy, x + dx
                    if yy < 0 or xx < 0 or yy + block > h or xx + block > w:
                        continue
                    r = np.abs(prev[yy:yy + block, xx:xx + block] - c).mean()
                    if best is None or r < best:
                        best = r
            if best is None:
                continue
            res += best; n += 1
            if best > 4:
                bad += 1
    return (res / max(1, n), 100.0 * bad / max(1, n))

def analyze(d):
    meta = json.load(open(os.path.join(d, 'clip.json')))
    frames = [load_internal(os.path.join(d, f), meta.get('scale', 1), meta.get('internal')) for f in meta['frames']]
    L = [luma(f) for f in frames]
    raws, rig, bad, flick = [], [], [], []
    for i in range(1, len(frames)):
        raws.append(float(np.abs(frames[i] - frames[i - 1]).mean()))
        r, b = rigid(L[i - 1], L[i])
        rig.append(r); bad.append(b)
        if i >= 2:
            d1, d2 = L[i - 1] - L[i - 2], L[i] - L[i - 1]
            rev = (np.abs(d1) > 12) & (np.abs(d2) > 12) & (np.sign(d1) != np.sign(d2))
            flick.append(100.0 * float(rev.mean()))
    return meta, {'frames': len(frames), 'internal': [frames[0].shape[1], frames[0].shape[0]] if frames else None,
                  'raw': round(float(np.mean(raws)), 4) if raws else None, 'rigid': round(float(np.mean(rig)), 4) if rig else None,
                  'rigid_max': round(float(np.max(rig)), 4) if rig else None, 'rigid_bad_pct': round(float(np.mean(bad)), 3) if bad else None,
                  'flick_pct': round(float(np.mean(flick)), 4) if flick else None, 'flick_max_pct': round(float(np.max(flick)), 4) if flick else None,
                  'moving_frames_pct': round(100.0 * float(np.mean([r > 0.01 for r in raws])), 1) if raws else None}

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('clip'); ap.add_argument('--baseline'); ap.add_argument('--max-rigid', type=float, default=0.05)
    ap.add_argument('--max-flick', type=float, default=0.02); ap.add_argument('--max-bad', type=float, default=0.5)
    ap.add_argument('--mp4'); ap.add_argument('--json'); ap.add_argument('--relative', action='store_true', help='check the thresholds on (clip − baseline): the excess the camera move adds over an idle clip of the same screen and frames')
    a = ap.parse_args()
    meta, m = analyze(a.clip)
    out = {'clip': a.clip, 'screen': meta.get('screen'), 'view': meta.get('view'), **m}
    g = dict(m)
    if a.baseline:
        _, b = analyze(a.baseline)
        out['baseline'] = b
        out['excess'] = {k: round(m[k] - b[k], 4) for k in ('raw', 'rigid', 'rigid_bad_pct', 'flick_pct') if m.get(k) is not None and b.get(k) is not None}
        if a.relative:
            g = {**m, 'rigid': max(0.0, out['excess']['rigid']), 'flick_pct': max(0.0, out['excess']['flick_pct']), 'rigid_bad_pct': max(0.0, out['excess']['rigid_bad_pct'])}
            out['gatedOn'] = 'excess over baseline'
    out['checks'] = {'rigid': g['rigid'] is not None and g['rigid'] <= a.max_rigid, 'flick': g['flick_pct'] is not None and g['flick_pct'] <= a.max_flick, 'rigid_bad': g['rigid_bad_pct'] is not None and g['rigid_bad_pct'] <= a.max_bad}
    out['pass'] = all(out['checks'].values())
    if a.mp4:
        ff = shutil.which('ffmpeg')
        if ff:
            s = max(1, int(meta.get('scale', 1)))
            subprocess.run([ff, '-y', '-loglevel', 'error', '-framerate', '60', '-i', os.path.join(a.clip, 'f%04d.png'), '-vf', f'scale=iw/{s}*2:ih/{s}*2:flags=neighbor', '-pix_fmt', 'yuv420p', '-crf', '14', a.mp4], check=False)
            out['mp4'] = a.mp4 if os.path.exists(a.mp4) else None
        else:
            out['mp4'] = None; out['mp4_note'] = 'ffmpeg not installed; review the PNGs at 2× nearest'
    txt = json.dumps(out, indent=1)
    if a.json:
        open(a.json, 'w').write(txt)
    print(txt)
    sys.exit(0 if out['pass'] else 1)

if __name__ == '__main__':
    main()
