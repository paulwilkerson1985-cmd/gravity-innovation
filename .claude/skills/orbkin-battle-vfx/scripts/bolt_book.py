#!/usr/bin/env python3
"""Deterministic texel-grid lightning bolt book (electric "on twos" sequence) as PNG frames.

  python3 bolt_book.py OUT_DIR [--ramp spark] [--w 24 --h 48] [--from-sky] [--seed 7] [--branches 2]
                       [--strike x,y] [--sparks 10]

Frames (saint11 electricity + the Spark signature in references/elements.md), all on the ramp
colours at texel size, ready for `book_from_renders.py --passthrough`:
  f0 first shock   : main bolt from the top edge (--from-sky: straight down, else from the upper
                     left) to the strike point, straight segments 4-9 texels long with 60-120 degree
                     corners (no curves), 1-texel yellow core with a 1-texel orange glow and a dark
                     edge, a 2-texel WHITE core on the last 25 % before the strike, 1-2 branches
  f1 second shock  : a re-seeded different path, white core along its whole length, a strike flare
  f2 blank         : (electric reads through alternation)
  f3 fade          : the first path as its orange/dark edge only (no core)
  f4 blank
  f5..f7 sparks    : sparks leaving the strike point with 2-texel heads and 3-texel trails, falling on
                     gravity, fewer and dimmer each frame
Tall books (24x48 .. 32x96) are projectile bolts: --from-sky draws the full height. Writes
OUT_DIR/f00.png .. f07.png and OUT_DIR/sheet-x4.png. Needs Pillow. Exit 2 on usage errors.
"""
import math, os, random, sys
from PIL import Image

RAMPS = {
    'spark': ['#000000', '#c0500c', '#ffa21e', '#ffe85a', '#ffffff'],
    'water': ['#000000', '#16378a', '#2378d2', '#48c6f0', '#c4f2ff', '#ffffff'],
    'wind': ['#000000', '#4fa6cc', '#a6e2f4', '#ffffff'],
    'star': ['#000000', '#8c8c8c', '#d0d0d0', '#ffffff'],
}


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


class Grid:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.g = [[0] * w for _ in range(h)]

    def put(self, x, y, v, keep_brighter=True):
        if 0 <= x < self.w and 0 <= y < self.h:
            if not keep_brighter or v > self.g[y][x]:
                self.g[y][x] = v

    def line(self, x0, y0, x1, y1, v, width=1):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        x, y = x0, y0
        while True:
            self.put(x, y, v)
            if width > 1:
                self.put(x + 1, y, v)
            if (x, y) == (x1, y1):
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy; x += sx
            if e2 <= dx:
                err += dx; y += sy

    def outline(self, v, below=None):
        """Texels touching a filled texel (4-neighbour) become v if empty."""
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < self.w and 0 <= ny < self.h and self.g[ny][nx] and (below is None or self.g[ny][nx] <= below):
                        add.append((x, y)); break
        for x, y in add:
            self.g[y][x] = v


def bolt_path(rng, w, h, strike, from_sky):
    """Vertices from the top edge to the strike point: straight runs, sharp alternating corners."""
    sx, sy = strike
    x = sx if from_sky else rng.randint(1, max(1, w // 3))
    x = min(max(x + (rng.randint(-5, 5) if from_sky else 0), 1), w - 2)
    pts = [(x, 0)]
    y = 0
    side = rng.choice((-1, 1))
    while y < sy - 4:
        run = rng.randint(4, 9)
        y = min(sy - 3, y + run)
        jump = rng.randint(3, 7) * side
        side = -side
        # pull toward the strike as we get close
        x = x + jump + round((sx - x) * (y / sy) * 0.5)
        x = min(max(x, 1), w - 2)
        pts.append((x, y))
    pts.append((sx, sy))
    return pts


def dilate(g, src_min, v):
    """Empty texels 4-adjacent to a texel >= src_min become v (glow ring, then the dark edge)."""
    add = []
    for y in range(g.h):
        for x in range(g.w):
            if g.g[y][x]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < g.w and 0 <= ny < g.h and g.g[ny][nx] >= src_min:
                    add.append((x, y)); break
    for x, y in add:
        g.g[y][x] = v


def draw_bolt(g, pts, core, glow, white_tail, branches, rng, core_width=1):
    n = len(pts)
    for i in range(n - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        near_strike = i >= n - 1 - max(1, round((n - 1) * 0.25))
        v = 4 if (white_tail and near_strike) or core == 4 else core
        g.line(x0, y0, x1, y1, v, 2 if (near_strike and white_tail) or core_width == 2 else 1)
    for _ in range(branches):
        i = rng.randint(1, max(1, n - 3))
        bx, by = pts[i]
        length = rng.randint(4, 8)
        side = rng.choice((-1, 1))
        ex, ey = bx + side * length, by + rng.randint(2, 6)
        mx, my = bx + side * (length // 2), by + rng.randint(0, 2)
        g.line(bx, by, mx, my, core, 1)
        g.line(mx, my, ex, ey, core, 1)


def frames(w, h, ramp, seed, from_sky, branches, strike, n_sparks):
    rng = random.Random(seed)
    top = len(ramp) - 1
    core, glow, edge = min(3, top), min(2, top), 1
    sx, sy = strike
    out = []
    p0 = bolt_path(rng, w, h, strike, from_sky)
    p1 = bolt_path(rng, w, h, strike, from_sky)
    # f0 first shock
    g = Grid(w, h); draw_bolt(g, p0, core, glow, True, branches, rng); dilate(g, core, glow); dilate(g, glow, edge)
    out.append(g)
    # f1 second shock: white along the whole length, strike flare
    g = Grid(w, h); draw_bolt(g, p1, top, glow, True, branches, rng, core_width=2)
    for dx, dy in ((-2, 0), (2, 0), (0, -2), (-1, -1), (1, -1)):
        g.put(sx + dx, sy + dy, top, False)
    dilate(g, top, glow); dilate(g, glow, edge)
    out.append(g)
    # f2 blank
    out.append(Grid(w, h))
    # f3 fade: edge/glow only
    g = Grid(w, h)
    for i in range(len(p0) - 1):
        (x0, y0), (x1, y1) = p0[i], p0[i + 1]
        g.line(x0, y0, x1, y1, glow, 1)
    dilate(g, glow, edge)
    out.append(g)
    # f4 blank
    out.append(Grid(w, h))
    # f5..f7 sparks: heads + trails leaving the strike, gravity
    sparks = [(rng.uniform(-3.2, 3.2), rng.uniform(-3.5, -0.5), rng.uniform(0.6, 1.0)) for _ in range(n_sparks)]
    for k in range(3):
        g = Grid(w, h)
        t = k + 1
        for j, (vx, vy, life) in enumerate(sparks):
            if t > life * 3.2 + (j % 3):
                continue
            x = sx + vx * t
            y = sy + vy * t + 0.9 * t * t
            hx, hy = round(x), round(y)
            tx, ty = round(x - vx * 0.8), round(y - (vy + 1.8 * t) * 0.8)
            g.line(tx, ty, hx, hy, glow if k < 2 else edge, 1)
            g.put(hx, hy, core if k < 2 else glow, False)
            g.put(hx + 1, hy, core if k < 1 else glow, False)
        out.append(g)
    return out


def main(argv):
    if not argv or '--help' in argv:
        print(__doc__); return 2
    out = argv[0]
    o = {argv[i]: argv[i + 1] for i in range(1, len(argv) - 1) if argv[i].startswith('--') and not argv[i + 1].startswith('--')}
    rname = o.get('--ramp', 'spark')
    ramp = RAMPS[rname] if rname in RAMPS else rname.split(',')
    w, h = int(o.get('--w', '24')), int(o.get('--h', '48'))
    seed = int(o.get('--seed', '7')); branches = int(o.get('--branches', '2')); n_sparks = int(o.get('--sparks', '10'))
    strike = tuple(int(v) for v in o['--strike'].split(',')) if '--strike' in o else (w // 2, h - 6)
    from_sky = '--from-sky' in argv
    os.makedirs(out, exist_ok=True)
    rgb = [hex_rgb(c) for c in ramp]
    fr = frames(w, h, ramp, seed, from_sky, branches, strike, n_sparks)
    tiles = []
    for i, g in enumerate(fr):
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); px = im.load()
        for y in range(h):
            for x in range(w):
                v = g.g[y][x]
                if v:
                    px[x, y] = (*rgb[v], 255)
        im.save(os.path.join(out, f'f{i:02d}.png'))
        tiles.append(im)
    sheet = Image.new('RGBA', ((w + 2) * len(tiles) * 4, h * 4), (40, 36, 48, 255))
    for i, t in enumerate(tiles):
        sheet.alpha_composite(t.resize((w * 4, h * 4), Image.NEAREST), (i * (w + 2) * 4, 0))
    sheet.convert('RGB').save(os.path.join(out, 'sheet-x4.png'))
    print(f'bolt_book: {len(fr)} frames of {w}x{h} on {len(ramp) - 1} colours -> {out} (strike {strike}, seed {seed}); next: book_from_renders.py --passthrough')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
