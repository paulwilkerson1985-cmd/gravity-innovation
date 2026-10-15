#!/usr/bin/env python3
"""Hand-ruled impact key frames (saint11 explosion anatomy) as PNG frames for book_from_renders.py.

  python3 impact_book.py OUT_DIR --ramp spark [--size 32] [--blast 1]

Writes OUT_DIR/f00.png .. f03.png at --size x --size texels, already on the ramp's colours
(index 0 transparent, 1 = dark edge, top = hot/white):
  f00 contrast frame : a dark disc (ramp index 1) over the target, 1 frame; the frames after it read brighter
  f01 white flash    : a white disc (top index) with a 1-texel hot rim and 4 light lines, 1-2 frames
  f02 sharp blast    : 6 sharp rays, three value bands, dark edge band; "sharp angles, avoid noise"
  f03 broken blast   : the same rays with the centre blown out (a hole), shrinking; then the body/dissipation
Put these 4 frames FIRST in a book (then the element body from Blender or by hand), play the flash
frames in FRONT of the target (renderOrder >= 8) and the blast behind it. Ramps: the FX_RAMPS names
in game/src/render/hd2d/fx.ts (flame, water, leaf, spark, rock, dust, smoke, foam, wind, star) or
"#hex,#hex,..." dark -> light with index 0 = transparent.
"""
import math, os, sys
from PIL import Image

RAMPS = {
    'flame': ['#000000', '#6a1208', '#c42a10', '#f87418', '#ffc23a', '#fff4c0'],
    'water': ['#000000', '#16378a', '#2378d2', '#48c6f0', '#c4f2ff', '#ffffff'],
    'leaf': ['#000000', '#173f1c', '#2f7a2c', '#6cc23a', '#d2f27a', '#ff7ab0'],
    'spark': ['#000000', '#c0500c', '#ffa21e', '#ffe85a', '#ffffff'],
    'rock': ['#000000', '#33221a', '#5e4330', '#8e6c4c', '#bf9b72'],
    'dust': ['#000000', '#7d6a58', '#a99178', '#cfbb9e', '#ebe0ca'],
    'smoke': ['#000000', '#251c22', '#3e3238', '#5c4e50', '#7a6c68'],
    'foam': ['#000000', '#4f7fa8', '#9fd2ec', '#e6f7ff', '#ffffff'],
    'wind': ['#000000', '#4fa6cc', '#a6e2f4', '#ffffff'],
    'star': ['#000000', '#8c8c8c', '#d0d0d0', '#ffffff'],
}


def ramp_of(s):
    return RAMPS[s] if s in RAMPS else s.split(',')


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def frames(size, n):
    """Return 4 index grids (lists of lists) for a ramp of n entries (0 transparent)."""
    top = n - 1
    mid = max(2, top - 1)
    low = max(1, top - 2)
    c = (size - 1) / 2
    R = size / 2
    def grid():
        return [[0] * size for _ in range(size)]
    out = []
    # f00 contrast: dark disc
    g = grid()
    for y in range(size):
        for x in range(size):
            if math.hypot(x - c, y - c) <= R * 0.42:
                g[y][x] = 1
    out.append(g)
    # f01 white flash: white disc, hot rim, 4 light lines
    g = grid()
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - c, y - c)
            if d <= R * 0.6:
                g[y][x] = top if d <= R * 0.6 - 1.2 else mid
    for k in range(int(R * 0.62), int(R * 0.98)):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            x, y = int(math.floor(c + 0.5 + dx * k)), int(math.floor(c + 0.5 + dy * k))
            if 0 <= x < size and 0 <= y < size:
                g[y][x] = top
    out.append(g)
    # f02 sharp blast, f03 broken blast
    for hole in (0.0, 0.36):
        g = grid()
        for y in range(size):
            for x in range(size):
                dx, dy = x - c, y - c
                r = math.hypot(dx, dy) / R
                if r > 0.98 or r < hole:
                    continue
                a = math.atan2(dy, dx)
                tri = abs(((a * 6 / math.pi) % 2) - 1)  # 6 rays: 0 on a ray axis, 1 between rays
                reach = 0.3 + 0.68 * (1 - tri) ** 1.6
                if hole:
                    reach *= 0.92
                if r > reach:
                    continue
                k = r / reach
                g[y][x] = top if k < 0.45 and tri < 0.6 else mid if k < 0.8 else low
        # dark edge band on outer texels that are not hot
        edge = []
        for y in range(size):
            for x in range(size):
                v = g[y][x]
                if not v or v == top:
                    continue
                nb = [g[y + dy][x + dx] if 0 <= x + dx < size and 0 <= y + dy < size else 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
                if 0 in nb:
                    edge.append((x, y))
        for x, y in edge:
            g[y][x] = 1
        out.append(g)
    return out


def main(argv):
    if '--help' in argv:
        print(__doc__); return 0
    if not argv:
        print(__doc__); return 2
    out = argv[0]
    o = {argv[i]: argv[i + 1] for i in range(1, len(argv) - 1, 2)}
    ramp = ramp_of(o.get('--ramp', 'spark'))
    size = int(o.get('--size', '32'))
    os.makedirs(out, exist_ok=True)
    rgb = [hex_rgb(h) for h in ramp]
    for i, g in enumerate(frames(size, len(ramp))):
        im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        px = im.load()
        for y in range(size):
            for x in range(size):
                v = g[y][x]
                if v:
                    px[x, y] = (*rgb[v], 255)
        im.save(os.path.join(out, f'f{i:02d}.png'))
    print(f'impact_book: 4 frames of {size}x{size} on {len(ramp) - 1} colours -> {out} (contrast, white, blast, broken)')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
