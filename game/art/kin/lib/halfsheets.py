"""halfsheets.py [SHEETS_DIR ...] -> the half-resolution sheet set next to each full set (`<sheets>/half/`).

The game plays the half set while a kin is drawn up to ~1.3x its half rest height on screen (phones, the
default battle camera) and the full set above that. Each atlas is padded to even dimensions with transparent
texels and resized x0.5 with LANCZOS, so every pixel number in the JSON halves exactly: frame rects, anchor,
rest height, root offsets, opaque extents, atlas/source size, cell offset and the camera's px per unit.

Colour: the atlases are straight alpha with edge colours bled into the transparent texels; the game uploads
them premultiplied (kinsheet.ts) and unpremultiplies after filtering. Pillow resizes RGBA in premultiplied
space too, so a plain resize keeps the edges free of dark fringes; the colour of fully transparent texels is
irrelevant once premultiplied.

usage: python3 -I halfsheets.py            (every kin: ../<kin>/sheets and ../../ashkit/sheets)
       python3 -I halfsheets.py DIR ...     (only these full-set folders)
"""
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
NAME = re.compile(r'^[a-z]+_(idle|attack|hit|faint)_(front|back)\.json$')
K = 0.5


def half(v):
    """Half of a pixel number, as an int when it is whole (keeps the JSON tidy)."""
    h = v * K
    return int(h) if float(h).is_integer() else round(h, 3)


def half_sheet(src_dir, name, out_dir):
    j = json.load(open(os.path.join(src_dir, name)))
    im = Image.open(os.path.join(src_dir, j['image'])).convert('RGBA')
    w, h = im.size
    assert (w, h) == (j['atlasSize']['w'], j['atlasSize']['h']), f'{name}: atlas size mismatch'
    ew, eh = w + (w & 1), h + (h & 1)
    if (ew, eh) != (w, h):
        pad = Image.new('RGBA', (ew, eh), (0, 0, 0, 0))
        pad.paste(im, (0, 0))
        im = pad
    im = im.resize((ew // 2, eh // 2), Image.LANCZOS)
    im.save(os.path.join(out_dir, j['image']), 'WEBP', lossless=True, quality=100, method=6, exact=True)

    o = dict(j)
    o['scale'] = K
    o['camera'] = dict(j['camera'], pxPerUnit=round(j['camera']['pxPerUnit'] * K, 3))
    o['atlasSize'] = dict(w=ew // 2, h=eh // 2)
    o['sourceSize'] = {k: half(v) for k, v in j['sourceSize'].items()}
    o['cellOffset'] = {k: half(v) for k, v in j['cellOffset'].items()}
    o['anchor'] = dict(j['anchor'], x=half(j['anchor']['x']), y=half(j['anchor']['y']))
    o['anchorSource'] = {k: half(v) for k, v in j['anchorSource'].items()}
    o['restHeightPx'] = half(j['restHeightPx'])
    o['rootOffsetPx'] = [[half(a), half(b)] for a, b in j['rootOffsetPx']]
    o['opaqueExt'] = [[half(v) for v in e] for e in j['opaqueExt']]
    o['frames'] = [{k: half(v) for k, v in f.items()} for f in j['frames']]
    json.dump(o, open(os.path.join(out_dir, name), 'w'), indent=1)
    return os.path.getsize(os.path.join(out_dir, j['image']))


def main():
    dirs = sys.argv[1:]
    if not dirs:
        dirs = [os.path.join(HERE, '..', '..', 'ashkit', 'sheets')]
        dirs += [os.path.join(HERE, '..', k, 'sheets') for k in sorted(os.listdir(os.path.join(HERE, '..')))
                 if os.path.exists(os.path.join(HERE, '..', k, 'model.py'))]
    for d in dirs:
        d = os.path.normpath(d)
        names = sorted(n for n in os.listdir(d) if NAME.match(n))
        if not names:
            print('no sheets in', d)
            continue
        out = os.path.join(d, 'half')
        os.makedirs(out, exist_ok=True)
        total = sum(half_sheet(d, n, out) for n in names)
        print(f'{d}: {len(names)} sheets -> {out} ({total / 2 ** 20:.2f} MB)')


if __name__ == '__main__':
    main()
