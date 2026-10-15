#!/usr/bin/env python3
"""Generate a 33³ `.cube` colour-grade LUT (display-referred: apply AFTER tone mapping + sRGB with
three's `LUTPass` / `LUTCubeLoader`, as `webgl_postprocessing_3dlut` does).

  python3 -I ${CLAUDE_SKILL_DIR}/scripts/make_cube.py OUT.cube [--size 33] [--shadow '#3a1f40'] [--high '#ffd090']
      [--split 0.14] [--sat 1.0] [--contrast 1.0] [--lift 0,0,0] [--gain 1,1,1] [--gamma 1,1,1] [--warm 0.0] [--title NAME]

Pipeline per LUT entry (sRGB in → sRGB out, all 0..1): lift/gain → gamma → contrast S-curve around
mid grey on luminance (never clips a channel) → saturation → luminance-preserving split tone
(shadows toward --shadow, highlights toward --high at the pixel's own luminance, strength --split)
→ a warm/cool bias on b* (--warm, ±0.1 ≈ ±6 b*). Defaults reproduce the pipeline's cave grade
(`warmCaveGrade`) so a LUT can replace the per-arena CDL block one-for-one.
Why a LUT: grading becomes data (one file per arena, diffable, A/B-able by file swap) and the
grade pass loses its CDL/split-tone math. Keep tone mapping and the tilt/DoF in the shader.
Loading (three r180):  new LUTCubeLoader().load('arena.cube', (r) => composer.addPass(new LUTPass({ lut: r.texture3D, intensity: 1 })))
"""
import argparse, sys
import numpy as np

LUMA = np.array([0.2126, 0.7152, 0.0722])

def hexc(s):
    s = s.lstrip('#')
    return np.array([int(s[i:i + 2], 16) / 255 for i in (0, 2, 4)])

def luma_normalized(c):
    l = float(c @ LUMA)
    return c / l if l > 1e-4 else np.ones(3)

def vec(s):
    return np.array([float(v) for v in s.split(',')])

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('out'); ap.add_argument('--size', type=int, default=33)
    ap.add_argument('--shadow', default='#3a1f2e'); ap.add_argument('--high', default='#ffe2a8'); ap.add_argument('--split', type=float, default=0.14)
    ap.add_argument('--sat', type=float, default=0.92); ap.add_argument('--contrast', type=float, default=1.06)
    ap.add_argument('--lift', default='0.015,0.008,0'); ap.add_argument('--gain', default='1.03,1.0,0.93'); ap.add_argument('--gamma', default='1,1,1.02')
    ap.add_argument('--warm', type=float, default=0.0); ap.add_argument('--title', default='orbkin grade')
    a = ap.parse_args()
    n = a.size
    if not 2 <= n <= 256:
        sys.exit('--size must be 2..256')
    g = np.linspace(0, 1, n)
    # .cube order: red fastest, then green, then blue.
    b, gr, r = np.meshgrid(g, g, g, indexing='ij')
    c = np.stack([r, gr, b], axis=-1).reshape(-1, 3)
    lift, gain, gamma = vec(a.lift), vec(a.gain), vec(a.gamma)
    c = np.clip(c * gain + lift * (1 - c), 0, 1)
    c = c ** (1 / gamma)
    l = np.clip(c @ LUMA, 1e-5, 1)
    l2 = np.clip(l + (a.contrast - 1) * (l - 0.5) * 4 * l * (1 - l), 0, 1)
    c = c * (l2 / l)[:, None]
    l = l2
    c = l[:, None] + (c - l[:, None]) * a.sat
    sh, hi = luma_normalized(hexc(a.shadow)), luma_normalized(hexc(a.high))
    ks = a.split * (1 - np.clip(l / 0.45, 0, 1) ** 2 * (3 - 2 * np.clip(l / 0.45, 0, 1)))
    kh = a.split * (np.clip((l - 0.5) / 0.5, 0, 1) ** 2 * (3 - 2 * np.clip((l - 0.5) / 0.5, 0, 1)))
    c = c * (1 - ks)[:, None] + (sh[None, :] * l[:, None]) * ks[:, None]
    c = c * (1 - kh)[:, None] + (hi[None, :] * l[:, None]) * kh[:, None]
    if a.warm:
        c = c + np.array([a.warm * 0.5, a.warm * 0.15, -a.warm * 0.6]) * (l * (1 - l) * 4)[:, None]
    c = np.clip(c, 0, 1)
    with open(a.out, 'w') as f:
        f.write(f'TITLE "{a.title}"\nLUT_3D_SIZE {n}\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n')
        for row in c:
            f.write(f'{row[0]:.6f} {row[1]:.6f} {row[2]:.6f}\n')
    print(f'{a.out}: {n}^3 entries, identity error {float(np.abs(c - np.stack([r, gr, b], axis=-1).reshape(-1, 3)).mean()):.4f} mean |Δ| (0 = identity)')

if __name__ == '__main__':
    main()
