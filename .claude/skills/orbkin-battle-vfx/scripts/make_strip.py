#!/usr/bin/env python3
"""Build the motion strip the gate judges from a timeline run (the ONLY view for timing work).

  python3 make_strip.py RUN_DIR OUT.png [--crop x0,y0,x1,y1] [--scale 1] [--cols 4] [--label "after"]
  python3 make_strip.py RUN_DIR OUT.png --pair OTHER_RUN_DIR      # two rows, same crop (A over B)
  python3 make_strip.py RUN_DIR OUT.png --impact                  # the impact strip instead

Two strips, both gated: the MOTION strip (launch, +10 .. +70 f: does the whole hit read and settle)
and the IMPACT strip (--impact: impact-2, impact, +1, +2, +4, +8, +16, +32 f: contrast frame, flash,
hit-stop, blast, dissipation; an effect of 30 f fills only two frames of the motion strip).

RUN_DIR is a timeline.mjs output dir (strip-frames.json + frames/*.png). The strip is the 8 frames
from the launch frame every 10 frames (launch -> +70 f = 1.17 s), cropped around the target with the
crop recorded by the BASELINE run (pass --crop to reuse it exactly for the after run), laid out in
--cols columns (4 = two rows, reading order), scaled with NEAREST (never bilinear; keep the long
edge <= 2576 px, the judge's native-size limit) and labelled +0f .. +70f. Also writes OUT.mid.png: the frozen mid-impact
frame (impact + 2) full size, for the record only (frozen frames penalise correct timing).
Requires Pillow. Exit 2 on missing frames.
"""
import json, os, sys
from PIL import Image, ImageDraw


def load_run(d):
    with open(os.path.join(d, 'strip-frames.json')) as f:
        sf = json.load(f)
    with open(os.path.join(d, 'timeline.json')) as f:
        tl = json.load(f)
    return sf, tl


def row(sf, tl, crop, scale, label, cols, impact=False):
    frames = sf['frames']
    labels = [f'+{i * sf["every"]}f' for i in range(len(frames))]
    if impact:
        frames = [x['file'] for x in sf.get('impactStrip', [])]
        labels = [f"i{x['d']:+d}" for x in sf.get('impactStrip', [])]
        if not frames:
            sys.exit('make_strip: no impact strip in this run (no impact found); re-run timeline.mjs')
    missing = [i for i, p in enumerate(frames) if not p or not os.path.exists(p)]
    if missing:
        sys.exit(f'make_strip: frames missing in strip (indices {missing}); re-run timeline.mjs')
    tiles = []
    for i, p in enumerate(frames):
        im = Image.open(p).convert('RGB').crop(crop)
        im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        d = ImageDraw.Draw(im)
        t = labels[i]
        d.rectangle([0, 0, 8 + 7 * len(t), 14], fill=(0, 0, 0))
        d.text((4, 2), t, fill=(255, 255, 255))
        tiles.append(im)
    tw, th = tiles[0].width, tiles[0].height
    nrows = (len(tiles) + cols - 1) // cols
    w = cols * tw + 2 * (cols - 1)
    h = nrows * th + 2 * (nrows - 1)
    out = Image.new('RGB', (w, h + 14), (24, 24, 24))
    for i, t in enumerate(tiles):
        out.paste(t, ((i % cols) * (tw + 2), 14 + (i // cols) * (th + 2)))
    ImageDraw.Draw(out).text((4, 1), label, fill=(255, 255, 255))
    return out


def main(argv):
    if '--help' in argv:
        print(__doc__); return 0
    if len(argv) < 2:
        print(__doc__); return 2
    run, outp = argv[0], argv[1]
    argv = [a for a in argv if a != '--impact'] + (['--impact'] if '--impact' in argv else [])
    opts = {argv[i]: argv[i + 1] for i in range(2, len(argv) - 1) if argv[i].startswith('--') and not argv[i + 1].startswith('--')}
    sf, tl = load_run(run)
    crop = [int(v) for v in opts['--crop'].split(',')] if '--crop' in opts else tl['crop']
    scale = int(opts.get('--scale', '1'))
    cols = int(opts.get('--cols', '4'))
    impact = '--impact' in argv
    rows = [row(sf, tl, crop, scale, opts.get('--label', os.path.basename(os.path.normpath(run))), cols, impact)]
    if '--pair' in opts:
        sf2, tl2 = load_run(opts['--pair'])
        rows.append(row(sf2, tl2, crop, scale, os.path.basename(os.path.normpath(opts['--pair'])), cols, impact))
    w = max(r.width for r in rows); h = sum(r.height for r in rows) + 4 * (len(rows) - 1)
    out = Image.new('RGB', (w, h), (24, 24, 24))
    y = 0
    for r in rows:
        out.paste(r, (0, y)); y += r.height + 4
    out.save(outp)
    mid = sf.get('midImpact')
    if mid and os.path.exists(mid):
        Image.open(mid).save(os.path.splitext(outp)[0] + '.mid.png')
    print(json.dumps({'strip': outp, 'view': 'impact' if impact else 'motion', 'crop': crop, 'launch': sf['launch'], 'impact': sf.get('impact'), 'size': out.size}))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
