"""compose: baked masks -> ramp-index pixel atlas at TEXEL density, painted in world-space CELLS
(python3 or the Blender python; numpy; Pillow optional for PNG).

  python3 -I compose.py masks_dir --ramps assets/ramps.json --ramp caveStone --factor 2 --out atlas.png \
      [--cell 6] [--mips] [--report atlas.json] [--cavity 12] [--contact 15] [--seed 0]
  python3 -I compose.py --check atlas.png --ramps assets/ramps.json --ramp caveStone      # audit an atlas
masks_dir holds bake_masks.py's masks.png (R top-facing, G crack cavity, B convexity, A id),
form.png (R top, G key-facing), pos.png (world position), contact.png (soft AO) and bake.json. A
single masks.png path also works (then cells are keyed on UV space, not world position).

Why cells (pilot 1, judged 4/10): per-texel rules on 1,600 small UV islands gave salt-and-pepper
noise; the game's painters work in 3-6-texel cells with one flat tone per cell, a 1-texel lit top
edge and a dark bottom edge (the texel bevel). --cells uv (default) grids each island into 6-texel
cells: on a chisel-faceted low every facet is a block and the cells sub-divide it crisply (pilot 2).
--cells world keys jittered cells on the baked world position so they cross island borders
(blotchier on faceted lows; use it on smooth lows).
Rules:
  tone     per cell = mean(0.45 top + 0.35 key-facing + 0.2 (1 - crack)), auto-levelled (p3..p97) over
           ramp[2 .. n-2]; whole-cell offsets: upward cells (top > 0.75) +1, downward (< 0.3) -1
  bevel    the top texel row of each cell (the row above belongs to another cell) +1 = lit lip; the
           bottom row -2 = dark seam (v runs world-up on walls, world +y on tops: uv_blocks' frame)
  cracks   crack cavity in the darkest --cavity % of texels -> max(idx - 2, 0), per texel (1-2-texel lines)
  contact  cells whose mean contact AO is in the darkest --contact % -> -1 (never more)
  cleanup  orphan clean-up x2 (a texel differing from >= 3 agreeing 4-neighbours takes their shade);
           gutters dilated 4 texels; --mips writes palette-preserving mode-halved levels
--check reports distinct colours, off-palette colours, shade shares, orphan share and the median
same-shade blob area (report only: clean pixel tiles score low too); it fails on off-palette colours
or size > 512. The compose run itself exits 1 when its own output fails that check.
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


def load(path):
    return np.asarray(Image.open(path).convert('RGBA')).astype(np.float32) / 255.0


def box_down(a, f):
    if f <= 1:
        return a
    h, w = a.shape[0] // f, a.shape[1] // f
    return a[:h * f, :w * f].reshape(h, f, w, f, -1).mean((1, 3))


def masked_down(a, baked, f):
    if f <= 1:
        return a, baked
    num = box_down(a * baked[..., None], f); den = box_down(baked[..., None].astype(np.float32), f)[..., 0]
    return num / np.maximum(den, 1e-6)[..., None], den >= 0.5


def mode_halve(idx, cov):
    h, w = idx.shape[0] // 2, idx.shape[1] // 2
    blk = idx[:h * 2, :w * 2].reshape(h, 2, w, 2).transpose(0, 2, 1, 3).reshape(h, w, 4)
    cb = cov[:h * 2, :w * 2].reshape(h, 2, w, 2).transpose(0, 2, 1, 3).reshape(h, w, 4)
    out = np.full((h, w), -1, np.int32); best = np.zeros((h, w), np.int32)
    for k in range(int(blk.max()) + 1 if blk.size else 0):
        cnt = ((blk == k) & cb).sum(-1)
        out = np.where(cnt > best, k, out); best = np.maximum(best, cnt)
    return np.where(out < 0, 0, out), cb.sum(-1) >= 2


def dilate(idx, cov, n=4):
    out = idx.copy(); c = cov.copy()
    for _ in range(n):
        nxt = out.copy(); nc = c.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            s = np.roll(np.roll(out, dy, 0), dx, 1); sc = np.roll(np.roll(c, dy, 0), dx, 1)
            take = ~nc & sc; nxt[take] = s[take]; nc |= sc
        out, c = nxt, nc
    return out, c


def cell_ids(pos, cov, size_tex, texels_per_unit, bbox_size, seed=0):
    """Jittered-grid (Worley-like) cell id per texel from world position in units; cells ~size_tex texels."""
    cell = size_tex / texels_per_unit
    p = pos[..., :3] * np.asarray(bbox_size, np.float32)[None, None, :]
    g = np.floor(p / cell).astype(np.int64)

    def h3(ix, iy, iz, salt):
        v = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (salt * 2654435761)
        return ((v & 0xFFFFFFFF) % 1000) / 1000.0
    best = np.full(p.shape[:2], np.inf, np.float32); ids = np.zeros(p.shape[:2], np.int64)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                gx, gy, gz = g[..., 0] + dx, g[..., 1] + dy, g[..., 2] + dz
                cx = (gx + 0.2 + 0.6 * h3(gx, gy, gz, 1 + seed)) * cell
                cy = (gy + 0.2 + 0.6 * h3(gx, gy, gz, 2 + seed)) * cell
                cz = (gz + 0.2 + 0.6 * h3(gx, gy, gz, 3 + seed)) * cell
                d = (p[..., 0] - cx) ** 2 + (p[..., 1] - cy) ** 2 + (p[..., 2] - cz) ** 2
                better = d < best
                best = np.where(better, d, best)
                ids = np.where(better, (gx * 1000003 + gy * 1009 + gz) & 0x7FFFFFFF, ids)
    ids[~cov] = -1
    return ids


def cell_mean(values, ids, cov):
    flat_ids = ids[cov]; uniq, inv = np.unique(flat_ids, return_inverse=True)
    out = np.zeros_like(values)
    sums = np.bincount(inv, weights=values[cov]); cnt = np.bincount(inv)
    out[cov] = (sums / np.maximum(cnt, 1))[inv]
    return out


def compose(md, ramp, factor=2, cell_tex=6, cavity_pct=12.0, contact_pct=15.0, texels_per_unit=16.0, seed=0, cells='uv'):
    masks = load(md['masks']); baked = masks[..., 3] > 0
    n = len(ramp)
    m, cov = masked_down(masks, baked, factor)
    top_hi, crack, convex = m[..., 0], m[..., 1], m[..., 2]
    have_form = md.get('form') and os.path.exists(md['form'])
    if have_form:
        form, _ = masked_down(load(md['form']), baked, factor); top, keyf = form[..., 0], form[..., 1]
    else:
        top, keyf = top_hi, np.full_like(top_hi, 0.5)
    have_pos = cells == 'world' and md.get('pos') and os.path.exists(md['pos']) and md.get('bbox_size')
    if have_pos:
        pos, _ = masked_down(load(md['pos']), baked, factor)
        ids = cell_ids(pos, cov, cell_tex, texels_per_unit, md['bbox_size'], seed)
    else:
        yy, xx = np.mgrid[0:cov.shape[0], 0:cov.shape[1]]
        ids = np.where(cov, (yy // int(cell_tex)) * 100003 + (xx // int(cell_tex)), -1)
    contact = masked_down(load(md['contact']), baked, factor)[0][..., 0] if md.get('contact') and os.path.exists(md['contact']) else np.ones_like(top)
    tone = cell_mean(0.45 * top + 0.35 * keyf + 0.2 * (1 - crack), ids, cov)
    v = tone[cov]; lo, hi = (np.percentile(v, 3), np.percentile(v, 97)) if v.size else (0, 1)
    levels = n - 3                                     # ramp[2 .. n-2]: 4 levels for a 7-shade ramp
    t = np.clip((tone - lo) / max(hi - lo, 1e-6), 0, 0.999) * levels
    idx = np.floor(t).astype(np.int32) + 2
    topc = cell_mean(top, ids, cov)
    idx = np.where(topc > 0.75, idx + 1, idx); idx = np.where(topc < 0.3, idx - 1, idx)
    # texel bevel: PNG row 0 is the top of the image (v = 1), so the +v neighbour is the row above
    above = np.roll(ids, 1, 0); below = np.roll(ids, -1, 0)
    cov_above = np.roll(cov, 1, 0); cov_below = np.roll(cov, -1, 0)      # island borders are not cell edges
    lip = cov & cov_above & (above != ids); seam = cov & cov_below & (below != ids) & ~lip
    idx = np.where(lip, idx + 1, idx); idx = np.where(seam, idx - 2, idx)   # the kit's bevel: lip +1, seam two shades down
    cc = cell_mean(1 - contact, ids, cov)
    if cov.any():
        thr = np.percentile(cc[cov], 100 - contact_pct); idx = np.where(cov & (cc >= thr) & (cc > 0.05), idx - 1, idx)
        cthr = np.percentile(crack[cov], 100 - cavity_pct); idx = np.where(cov & (crack >= cthr) & (crack > 0.2), np.maximum(idx - 2, 0), idx)
    idx = np.clip(idx, 0, n - 1)
    for _ in range(2):
        for k in range(n):
            agree = sum(((np.roll(idx, s, a) == k) & np.roll(cov, s, a)).astype(np.int8) for s, a in ((1, 0), (-1, 0), (1, 1), (-1, 1)))
            idx = np.where((agree >= 3) & (idx != k) & cov, k, idx)
    idx, covd = dilate(idx, cov, 4)
    stats = {'cells': int(len(np.unique(ids[cov]))) if cov.any() else 0, 'cells_from': 'world position' if have_pos else 'uv grid', 'lip_texels': int(lip.sum()), 'seam_texels': int(seam.sum())}
    return idx, cov, covd, stats


def to_rgba(idx, cov, ramp):
    pal = np.array([hex_rgb(c) for c in ramp], np.uint8)
    out = np.zeros((*idx.shape, 4), np.uint8); out[..., :3] = pal[np.clip(idx, 0, len(ramp) - 1)]; out[..., 3] = np.where(cov, 255, 0)
    return out


def blob_stats(idx, cov):
    """Median area of connected same-shade regions and the share of 1-texel orphans (4-connectivity)."""
    h, w = idx.shape; lab = -np.ones((h, w), np.int64); areas = []; nxt = 0
    for y in range(h):
        for x in range(w):
            if not cov[y, x] or lab[y, x] >= 0:
                continue
            k = idx[y, x]; stack = [(y, x)]; lab[y, x] = nxt; a = 0
            while stack:
                cy, cx = stack.pop(); a += 1
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < h and 0 <= nx < w and cov[ny, nx] and lab[ny, nx] < 0 and idx[ny, nx] == k:
                        lab[ny, nx] = nxt; stack.append((ny, nx))
            areas.append(a); nxt += 1
    areas = np.array(areas) if areas else np.array([0])
    return {'blobs': int(len(areas)), 'median_blob_area': float(np.median(areas)), 'orphan_share': round(float((areas == 1).sum() / max(cov.sum(), 1)), 4)}


def check_atlas(path, ramp):
    a = np.asarray(Image.open(path).convert('RGBA'))
    pal = [hex_rgb(c) for c in ramp]; pset = set(pal)
    cov = a[..., 3] > 0
    op = a[cov][:, :3]
    cols = {tuple(c) for c in np.unique(op, axis=0)} if len(op) else set()
    off = sorted(cols - pset)
    lut = np.zeros((256, 256, 256), np.int32) if False else None
    idx = np.zeros(a.shape[:2], np.int32)
    for i, c in enumerate(pal):
        idx[(a[..., 0] == c[0]) & (a[..., 1] == c[1]) & (a[..., 2] == c[2])] = i
    bs = blob_stats(idx, cov) if cov.any() else {'blobs': 0, 'median_blob_area': 0, 'orphan_share': 0}
    rep = {'file': path, 'size': list(a.shape[:2][::-1]), 'distinct_colours': len(cols), 'off_palette': ['#%02x%02x%02x' % c for c in off][:10],
           'opaque_share': round(float(cov.mean()), 3), 'shade_shares': [round(float((idx[cov] == k).mean()), 3) if cov.any() else 0 for k in range(len(ramp))], **bs}
    # blob/orphan numbers are REPORTED, not gated: a clean 64-texel CC0 stone tile has median blob 1 and 10 % orphans too
    rep['why'] = [m for c, m in ((bool(off), 'off-palette colours'), (max(a.shape[:2]) > 512, 'larger than 512')) if c]
    rep['pass'] = not rep['why']
    return rep


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('masks', nargs='?', help='bake_masks.py output DIR (or a masks.png)'); ap.add_argument('--ramps', required=True); ap.add_argument('--ramp', default='boulder')
    ap.add_argument('--factor', type=int, default=2); ap.add_argument('--out'); ap.add_argument('--mips', action='store_true')
    ap.add_argument('--cell', type=float, default=6.0, help='cell size in texels (5-8: a kit course is 14 texels wide, its stone cells 3-5)'); ap.add_argument('--cavity', type=float, default=12.0, help='percent of texels that become crack seams')
    ap.add_argument('--contact', type=float, default=15.0, help='percent of cells darkened by contact AO'); ap.add_argument('--texels-per-unit', type=float, default=16.0)
    ap.add_argument('--seed', type=int, default=0); ap.add_argument('--report'); ap.add_argument('--check')
    ap.add_argument('--cells', default='uv', choices=['uv', 'world'], help='uv: 6-texel grid cells inside each island (crisp on chisel facets, pilot 2 preferred it); world: cells keyed on baked world position (continuous across islands)')
    a = ap.parse_args(argv)
    ramps = json.load(open(a.ramps))['ramps']
    if a.ramp not in ramps:
        print(json.dumps({'error': f'unknown ramp {a.ramp}; have {sorted(ramps)}'})); return 2
    ramp = ramps[a.ramp]
    if a.check:
        rep = check_atlas(a.check, ramp); print(json.dumps(rep)); return 0 if rep['pass'] else 1
    if not a.masks or not a.out:
        ap.print_help(); return 64
    if os.path.isdir(a.masks):
        d = a.masks; md = {k: os.path.join(d, k + '.png') for k in ('masks', 'form', 'pos', 'contact')}
        bj = os.path.join(d, 'bake.json')
        if os.path.exists(bj):
            b = json.load(open(bj)); md['bbox_size'] = b.get('bbox_size'); md['bbox_min'] = b.get('bbox_min')
    else:
        md = {'masks': a.masks}
    idx, cov, covd, stats = compose(md, ramp, a.factor, a.cell, a.cavity, a.contact, a.texels_per_unit, a.seed, a.cells)
    rgba = to_rgba(idx, covd, ramp); Image.fromarray(rgba).save(a.out)
    rep = {'out': a.out, 'size': list(rgba.shape[:2][::-1]), 'ramp': a.ramp, 'factor': a.factor, 'cell_texels': a.cell, **stats,
           'shade_histogram': [int((idx[cov] == k).sum()) for k in range(len(ramp))], 'covered_share': round(float(cov.mean()), 3)}
    rep['check'] = check_atlas(a.out, ramp)
    if a.mips:
        mi, mc = idx, covd; base, ext = os.path.splitext(a.out); lvl = 1; mips = []
        while min(mi.shape) > 4:
            mi, mc = mode_halve(mi, mc); p = f'{base}_mip{lvl}{ext}'; Image.fromarray(to_rgba(mi, mc, ramp)).save(p); mips.append(p); lvl += 1
        rep['mips'] = mips
    if a.report:
        json.dump(rep, open(a.report, 'w'), indent=1)
    print(json.dumps(rep)); return 0 if rep['check']['pass'] else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
