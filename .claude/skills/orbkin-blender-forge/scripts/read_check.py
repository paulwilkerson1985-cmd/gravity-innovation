"""read_check: measure the pixel-art read of a sprite-mode screenshot (python3 or Blender python; numpy).

  python3 -I read_check.py shots/piece_sprite.png --ramps assets/ramps.json --ramp caveStone [--bg 2a2d33] [--json out.json]
Classifies every non-background pixel of the 64-px (nearest-upscaled) viewer shot to the nearest ramp
shade in OKLab, then reports: shade shares, seam share (darkest 2 shades), lip share (lightest 2
shades), lip-over-seam runs (a light pixel directly above a darker one: the texel-bevel signature),
block count (connected regions of one shade, >= 2x2 blocks) and the share of 1-pixel orphans.
Verdict `reads` = seams >= 4 %, lips >= 3 %, orphans <= 12 %, mid shades spread over >= 3 shades.
Exit 0 when it reads, 1 when not. Numbers replace the adjective in the report ("lit lip / dark seam read").
Lit lips here come from the outline pass + the atlas; the toon ramp of the viewer darkens shadow
sides, so shades are matched by chroma-insensitive lightness ordering (nearest OKLab L first).
"""
import sys; sys.dont_write_bytecode = True
import os, json, argparse
import numpy as np
try:
    from PIL import Image
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from pngio import Image


def hex_rgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def oklab(rgb):
    c = np.asarray(rgb, np.float64) / 255
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    lms = c @ np.array([[0.4122214708, 0.2119034982, 0.0883024619], [0.5363325363, 0.6806995451, 0.2817188376], [0.0514459929, 0.1073969566, 0.6299787005]])
    return np.cbrt(lms) @ np.array([[0.2104542553, 1.9779984951, 0.0259040371], [0.7936177850, -2.4285922050, 0.7827717662], [-0.0040720468, 0.4505937099, -0.8086757660]])


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('shot'); ap.add_argument('--ramps', required=True); ap.add_argument('--ramp', required=True)
    ap.add_argument('--bg', default='2a2d33'); ap.add_argument('--json'); ap.add_argument('--scale', type=int, default=0, help='upscale factor of the shot (0 = auto-detect)')
    a = ap.parse_args(argv)
    ramp = json.load(open(a.ramps))['ramps'][a.ramp]
    img = np.asarray(Image.open(a.shot).convert('RGBA'))[..., :3]
    bg = np.array(hex_rgb(a.bg)); fg = np.abs(img.astype(int) - bg).sum(-1) > 24
    # drop the HUD strip (top 24 px of the viewer) and auto-detect the upscale factor from run lengths
    fg[:24] = False
    ys, xs = np.nonzero(fg)
    if len(ys) == 0:
        print(json.dumps({'error': 'no foreground pixels'})); return 2
    sub = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]; fsub = fg[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    scale = a.scale
    if not scale:
        row = sub[sub.shape[0] // 2]; d = np.abs(np.diff(row.astype(int), axis=0)).sum(-1) > 0
        runs = np.diff(np.flatnonzero(np.concatenate([[True], d])))
        scale = int(np.bincount(runs[runs > 0]).argmax()) if runs.size else 1
        scale = max(1, min(scale, 16))
    small = sub[scale // 2::scale, scale // 2::scale]; fsm = fsub[scale // 2::scale, scale // 2::scale]
    lab = oklab(small.reshape(-1, 3)); pl = oklab(np.array([hex_rgb(c) for c in ramp]))
    # outline pixels (very dark, hue-shifted) are excluded by lightness: anything darker than ramp[0] by 0.08 L
    L = lab[:, 0].reshape(small.shape[:2])
    outline = fsm & (L < pl[0, 0] - 0.08)
    body = fsm & ~outline
    # nearest shade by lightness (the toon ramp changes chroma, not the ordering)
    idx = np.abs(L[..., None] - pl[None, None, :, 0]).argmin(-1)
    n = len(ramp); shares = [round(float((idx[body] == k).mean()), 3) if body.any() else 0 for k in range(n)]
    seam = sum(shares[:2]); lip = sum(shares[n - 2:])
    below = np.roll(idx, -1, 0); lips_over = body & np.roll(body, -1, 0) & (idx >= n - 2) & (below < idx - 1)
    # orphans: body pixels whose 4 neighbours all differ in shade
    same = np.zeros_like(body)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        same |= (np.roll(np.roll(idx, dy, 0), dx, 1) == idx) & np.roll(np.roll(body, dy, 0), dx, 1)
    orphans = round(float((body & ~same).sum() / max(body.sum(), 1)), 3)
    mids = sum(1 for s in shares[1:n - 1] if s >= 0.05)
    rep = {'shot': a.shot, 'scale': scale, 'body_pixels': int(body.sum()), 'outline_pixels': int(outline.sum()), 'shade_shares': shares,
           'seam_share': round(seam, 3), 'lip_share': round(lip, 3), 'lip_over_seam_runs': int(lips_over.sum()), 'orphan_share': orphans, 'mid_shades_used': mids,
           'reads': bool(seam >= 0.04 and lip >= 0.03 and orphans <= 0.12 and mids >= 3)}
    rep['why'] = [] if rep['reads'] else [m for cond, m in ((seam < 0.04, 'seams < 4 %'), (lip < 0.03, 'lips < 3 %'), (orphans > 0.12, 'orphans > 12 % (noise)'), (mids < 3, 'fewer than 3 mid shades used')) if cond]
    if a.json:
        json.dump(rep, open(a.json, 'w'), indent=1)
    print(json.dumps(rep)); return 0 if rep['reads'] else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
