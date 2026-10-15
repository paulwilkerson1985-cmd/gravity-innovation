#!/usr/bin/env python3
"""degrade.py - synthetic CONTROL frames for the gate's instrument checks (floors + judge). Free, < 2 s per preset.

  python3 -I degrade.py SRC.png OUT_DIR [--presets soft,flat,blur,identical] [--run RUN]

Presets (the same recipes the owner kit uses for its golds, plus the two the pilot needed):
  soft       0.75x bilinear downscale, bilinear upscale back to native: the subtle softening a thumbnail hides.
             Expected: floor pass (hf_ratio stays above 0.30), judge worse.
  flat       values pulled 40 % toward the frame mean (v' = m + 0.6 (v - m)): the "fog / flat grade" defect.
             Expected: floor FAIL (value_range, squint_std), judge worse.
  blur       Gaussian blur radius 2.2 (owner-kit gold G1). Expected: floor FAIL (hf_ratio), judge worse.
  identical  byte copy. Expected: floor pass, judge no_difference (the identical early exit fires).
Writes OUT_DIR/<preset>.png and OUT_DIR/manifest.json {source, source_sha256, presets: {name: {path, sha256,
expect_floor, expect_judge}}}. Feed each to artgate_compare.py / visual_judge.py with
  --role control --expect <expected> so report.sh lists them under "Instrument checks" with pass/fail
instead of mixing their critique into the improvement signal. These are controls for the INSTRUMENT: they say
nothing about the game; never quote their critique as direction. Exit 0; 2 bad input.
"""
import argparse
import hashlib
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageFilter

PRESETS = {
    'soft': {'expect_floor': 'pass', 'expect_judge': 'worse', 'recipe': '0.75x bilinear down, bilinear up'},
    'flat': {'expect_floor': 'FAIL', 'expect_judge': 'worse', 'recipe': 'values 40% toward the frame mean'},
    'blur': {'expect_floor': 'FAIL', 'expect_judge': 'worse', 'recipe': 'gaussian blur r 2.2'},
    'identical': {'expect_floor': 'pass', 'expect_judge': 'no_difference', 'recipe': 'byte copy'},
}


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


def make(name, im, src, dst):
    if name == 'soft':
        w, h = im.size
        im.resize((round(w * 0.75), round(h * 0.75)), Image.BILINEAR).resize((w, h), Image.BILINEAR).save(dst)
    elif name == 'flat':
        a = np.asarray(im).astype(np.float32)
        m = a.mean()
        Image.fromarray(np.clip(m + 0.6 * (a - m), 0, 255).round().astype(np.uint8)).save(dst)
    elif name == 'blur':
        im.filter(ImageFilter.GaussianBlur(2.2)).save(dst)
    elif name == 'identical':
        shutil.copyfile(src, dst)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src'); ap.add_argument('out_dir')
    ap.add_argument('--presets', default='soft,flat,blur,identical')
    ap.add_argument('--run', help='RUN dir for relative paths in the manifest (default: out_dir\'s parent)')
    a = ap.parse_args()
    names = [n.strip() for n in a.presets.split(',') if n.strip()]
    bad = [n for n in names if n not in PRESETS]
    if bad or not os.path.isfile(a.src):
        print(f'error: {"unknown preset(s) " + str(bad) if bad else a.src + " not found"}; presets: {", ".join(PRESETS)}', file=sys.stderr); sys.exit(2)
    os.makedirs(a.out_dir, exist_ok=True)
    run = os.path.abspath(a.run or os.path.dirname(os.path.abspath(a.out_dir)))
    im = Image.open(a.src).convert('RGB')
    man = {'source': a.src, 'source_sha256': sha(a.src), 'run': run, 'presets': {}}
    for n in names:
        dst = os.path.join(a.out_dir, f'{n}.png')
        make(n, im, a.src, dst)
        rel = os.path.relpath(dst, run)
        man['presets'][n] = {'path': dst, 'path_rel': rel if not rel.startswith('..') else dst, 'sha256': sha(dst), **PRESETS[n]}
    man['next'] = ('python3 -I artgate_compare.py OUT/<p>.png SRC --role control --expect <expect_floor> --out RUN/floor-<p>.json; '
                   'python3 -I visual_judge.py --candidate OUT/<p>.png --baseline SRC --role control --expect <expect_judge> --no-critique --out RUN/verdict-<p>.json')
    json.dump(man, open(os.path.join(a.out_dir, 'manifest.json'), 'w'), indent=1)
    print(json.dumps(man, indent=1))


if __name__ == '__main__':
    main()
