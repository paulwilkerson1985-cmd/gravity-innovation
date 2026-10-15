#!/usr/bin/env python3
"""Black-fill silhouette lineup of the cast at play size, pairwise IoU and solidity.

  python3 lineup.py --species kin19 [--game DIR] [--out DIR] [--views front,side,q3]
      Flags the species under review when any cast member has IoU > 0.8 with it (same view,
      both scaled to 64 px tall, centred), or its previous stage > 0.85 ("a scale-up"), or its
      solidity (area / convex hull area) is not below the cast median (a blob).
      Writes DIR/lineup.json, DIR/lineup-64.png (3x nearest, one row per view), DIR/lineup-32.png and,
      with --species, DIR/lineup-<id>-64.png (that kin alone: use THIS for the ip check, the whole
      cast sheet carries the cast's known IP flags).
      Exit 0 = no flags for --species; 1 = flagged; 2 = bad args. Without --species: the whole
      cast matrix, exit 0.
Reads geometry straight from src/render/creatures/designs.ts through facts.ts (no browser).
"""
import argparse
import json
import statistics
from pathlib import Path

from PIL import Image, ImageDraw
import numpy as np

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # works under python3 -I too
from common import facts, game_dir, read_pgm, emit


def mask(path):
    w, h, b = read_pgm(path)
    return (np.frombuffer(b, dtype=np.uint8).reshape(h, w) < 128)


def centred(m, H, W):
    """Place a mask in an H x W canvas, centred on its bounding box."""
    ys, xs = np.nonzero(m)
    out = np.zeros((H, W), bool)
    if len(ys) == 0:
        return out
    sub = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    y0 = (H - sub.shape[0]) // 2
    x0 = (W - sub.shape[1]) // 2
    out[y0:y0 + sub.shape[0], x0:x0 + sub.shape[1]] = sub
    return out


def iou(a, b):
    inter = np.logical_and(a, b).sum()
    uni = np.logical_or(a, b).sum()
    return float(inter / uni) if uni else 0.0


def hull_area(m):
    ys, xs = np.nonzero(m)
    pts = sorted(set(zip(xs.tolist(), ys.tolist())))
    if len(pts) < 3:
        return float(len(pts))
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    hull = lower[:-1] + upper[:-1]
    area = 0.0
    for i in range(len(hull)):
        x0, y0 = hull[i]
        x1, y1 = hull[(i + 1) % len(hull)]
        area += x0 * y1 - x1 * y0
    return abs(area) / 2 + len(hull) / 2 + 1  # pixel-area correction


def sheet(ids, f, view_list, H, scale, path):
    cell = H + 6
    cols = len(ids)
    im = Image.new('RGB', (cols * (cell + 2) * scale, (len(view_list) * cell + 12) * scale), 'white')
    d = ImageDraw.Draw(im)
    for r, vn in enumerate(view_list):
        for c, sid in enumerate(ids):
            m = mask(f['species'][sid]['sil'][f'{vn}_{H}']['file'])
            tile = Image.fromarray(np.where(m, 0, 255).astype(np.uint8)).resize((m.shape[1] * scale, m.shape[0] * scale), Image.NEAREST)
            x = c * (cell + 2) * scale + max(0, (cell * scale - tile.width) // 2)
            y = (r * cell + 12) * scale + (cell * scale - tile.height)
            im.paste(tile, (x, y))
    for c, sid in enumerate(ids):
        d.text((c * (cell + 2) * scale + 2, 2), sid[:9], fill='black')
    im.save(path)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--species', help='the kin under review (flags apply to it)')
    p.add_argument('--game')
    p.add_argument('--out', default='out/lineup')
    p.add_argument('--views', default='front,side,q3')
    p.add_argument('--iou', type=float, default=0.8)
    p.add_argument('--stage-iou', type=float, default=0.85)
    a = p.parse_args()
    game = game_dir(a.game)
    out = Path(a.out)
    views = a.views.split(',')
    f = facts(game, out / 'facts', heights='32,64', views=a.views, extra=[a.species] if a.species else None)
    ids = list(f['species'].keys())
    H = 64
    raw = {vn: {sid: mask(f['species'][sid]['sil'][f'{vn}_{H}']['file']) for sid in ids} for vn in views}
    W = max(m.shape[1] for vm in raw.values() for m in vm.values()) + 8
    masks = {vn: {sid: centred(m, H + 8, W) for sid, m in vm.items()} for vn, vm in raw.items()}
    sol = {}
    for sid in ids:
        m = masks[views[0]][sid] if 'side' not in views else masks['side'][sid]
        sol[sid] = round(float(m.sum() / hull_area(m)), 3)
    pairs = {}
    for vn in views:
        for i, s1 in enumerate(ids):
            for s2 in ids[i + 1:]:
                pairs.setdefault(f'{s1}|{s2}', {})[vn] = round(iou(masks[vn][s1], masks[vn][s2]), 3)
    maxpair = {k: max(v.values()) for k, v in pairs.items()}
    prev = {s: pid for pid, s in [(pid, f['species'][pid]['evolvesTo']) for pid in ids] if s}
    median_sol = statistics.median(sol.values())
    sheet(ids, f, views, 64, 3, out / 'lineup-64.png')
    sheet(ids, f, views, 32, 4, out / 'lineup-32.png')
    res = {'species': ids, 'solidity': sol, 'solidityMedian': median_sol, 'maxIoU': {}, 'flags': [], 'sheets': [str(out / 'lineup-64.png'), str(out / 'lineup-32.png')]}
    if a.species:
        s = a.species
        if s not in f['species']:
            raise SystemExit(f'{s} is not in the dex / designs')
        rows = {}
        for o in ids:
            if o == s:
                continue
            k = f'{s}|{o}' if f'{s}|{o}' in pairs else f'{o}|{s}'
            rows[o] = pairs[k]
        res['maxIoU'] = {o: max(v.values()) for o, v in rows.items()}
        res['perView'] = rows
        worst = max(res['maxIoU'].items(), key=lambda kv: kv[1])
        res['worst'] = {'species': worst[0], 'iou': worst[1]}
        for o, v in res['maxIoU'].items():
            if v > a.iou:
                res['flags'].append(f'IoU {v} with {o} > {a.iou}: silhouettes confusable at play size')
        if s in prev and f'{prev[s]}' in rows and max(rows[prev[s]].values()) > a.stage_iou:
            res['flags'].append(f'IoU {max(rows[prev[s]].values())} with previous stage {prev[s]} > {a.stage_iou}: a scale-up, not an evolution')
        res['solidityOf'] = sol[s]
        sheet([s], f, views, 64, 4, out / f'lineup-{s}-64.png')
        res['speciesSheet'] = str(out / f'lineup-{s}-64.png')
        if sol[s] >= median_sol:
            res['flags'].append(f'solidity {sol[s]} >= cast median {median_sol}: reads as a blob; break the hull with a signature part')
    else:
        top = sorted(maxpair.items(), key=lambda kv: -kv[1])[:8]
        res['mostSimilarPairs'] = top
    emit(res, out / 'lineup.json')
    raise SystemExit(1 if res['flags'] else 0)


if __name__ == '__main__':
    main()
