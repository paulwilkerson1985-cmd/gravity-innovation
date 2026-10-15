"""pbr_to_masks: CC0 height + AO (+ optional normal) maps -> a masks PNG for compose.py (python3 + numpy + Pillow).

  python3 -I pbr_to_masks.py --height rock_wall_08_displacement_1k.png --ao rock_wall_08_ao_1k.jpg \
      --out masks.png [--size 1024] [--blur 12] [--cavity-gain 2.5]
Then: python3 -I compose.py masks.png --ramps assets/ramps.json --ramp boulder --factor 16 --out tile64.png
Measured (procedural-texturing.md 3.4): Poly Haven rock_wall_08 height+AO through the composer gave a
clean 64^2 pixel stone wall in about 1 s; the same asset's COLOUR map gave mush. Photo albedo is the
wrong input for pixel art; height/AO carry form. 16-bit PNG heights are read as 16-bit (PIL .convert('L')
would clip them). Channels written: R = value (0.15 + 0.85 * height), G = cavity ((0.75 - AO) * gain),
B = convexity (height minus its blur), A = 255 (one material). Tileable sources stay tileable (wrap blur).
"""
import sys; sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; keep __pycache__ out of the repo
import sys, os, json, argparse
import numpy as np
try:
    from PIL import Image
except ImportError:  # Blender python / hash-locked venv: PNG-only fallback
    import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__)))
    from pngio import Image


def load_gray(path, size=None):
    im = Image.open(path)
    if im.mode in ('I;16', 'I;16B', 'I'):
        a = np.asarray(im).astype(np.float32)
    else:
        a = np.asarray(im.convert('L')).astype(np.float32)
    if size:
        a = np.asarray(Image.fromarray(a).resize((size, size), Image.BILINEAR)).astype(np.float32)
    lo, hi = np.percentile(a, 1), np.percentile(a, 99)
    return np.clip((a - lo) / max(hi - lo, 1e-6), 0, 1)


def blur_wrap(a, r):
    """Box blur with wrap-around (keeps tiles tileable), radius r, separable."""
    k = 2 * r + 1
    out = a.copy()
    for axis in (0, 1):
        acc = np.zeros_like(out)
        for s in range(-r, r + 1):
            acc += np.roll(out, s, axis)
        out = acc / k
    return out


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--height', required=True); ap.add_argument('--ao'); ap.add_argument('--out', required=True)
    ap.add_argument('--size', type=int, default=1024); ap.add_argument('--blur', type=int, default=12); ap.add_argument('--cavity-gain', type=float, default=2.5)
    a = ap.parse_args(argv)
    H = load_gray(a.height, a.size)
    A = load_gray(a.ao, a.size) if a.ao else 1 - np.clip((blur_wrap(H, 3) - H) * 4, 0, 1)
    R = 0.15 + 0.85 * H
    G = np.clip((0.75 - A) * a.cavity_gain, 0, 1)
    B = np.clip((H - blur_wrap(H, a.blur) - 0.04) * 8, 0, 1)
    rgba = np.stack([R, G, B, np.ones_like(H)], -1)
    Image.fromarray((rgba * 255).astype(np.uint8)).save(a.out)
    print(json.dumps({'out': a.out, 'size': [a.size, a.size], 'height': a.height, 'ao': a.ao, 'cavity_share_gt_0.45': round(float((G > 0.45).mean()), 3), 'convex_share_gt_0.35': round(float((B > 0.35).mean()), 3)}))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
