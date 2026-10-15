"""compose: baked masks -> ramp-index pixel atlas at TEXEL density (python3 or the Blender python; numpy, Pillow optional for PNG).

  python3 -I compose.py masks.png --ramps assets/ramps.json --ramp boulder --factor 2 --out atlas.png \
      [--mips] [--report atlas.json] [--levels 5] [--cavity 0.45] [--lip 0.35] [--dither 0]
  python3 -I compose.py --check atlas.png --ramps assets/ramps.json --ramp boulder   # audit an atlas

masks.png (from bake_masks.py, RGBA at factor x the final size): R = top-facing, G = cavity,
B = convexity, A > 0 = baked texel. Rules (procedural-texturing.md 3.1, each measured against
"naive pixelate = camouflage noise"):
  value   = auto-levelled (p3..p97) mix of top-facing and (1 - cavity) -> LEVELS mid shades
  cavity  darkest --cavity % (default 22) of texels -> 2 shades darker (dark seams, contact crevices;
          ramp[0] reserved for them); a value <= 1 is an absolute threshold instead
  convex  top --lip % (default 12) and not cavity -> 1 shade lighter (lit lip; ramp top reserved)
  orphan clean-up x2: a texel that differs from >= 3 of its 4 neighbours which agree -> their shade
  gutters: baked texels dilated 4 texels into unbaked ones (mip and bilinear safety)
  --mips: palette-preserving mode-halve chain (never averaged; mode of each 2x2) written as _mip1..N
Output: RGBA PNG where unbaked texels are transparent; distinct colours <= ramp length (+ transparent).
Exit 1 when --check finds off-palette colours or a size > 512.
"""
import sys, os, json, argparse
import numpy as np
try:
    from PIL import Image
except ImportError:  # Blender python / hash-locked venv: PNG-only fallback
    import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__)))
    from pngio import Image


def hex_rgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def box_down(a, f):
    h, w = a.shape[0] // f, a.shape[1] // f
    return a[:h * f, :w * f].reshape(h, f, w, f, -1).mean((1, 3))


def mode_halve(idx, cov):
    """Palette-preserving 2x downsample: each output texel = most common covered shade of its 2x2."""
    h, w = idx.shape[0] // 2, idx.shape[1] // 2
    blk = idx[:h * 2, :w * 2].reshape(h, 2, w, 2).transpose(0, 2, 1, 3).reshape(h, w, 4)
    cb = cov[:h * 2, :w * 2].reshape(h, 2, w, 2).transpose(0, 2, 1, 3).reshape(h, w, 4)
    out = np.full((h, w), -1, np.int32)
    for k in range(blk.max() + 1 if blk.size else 0):
        cnt = ((blk == k) & cb).sum(-1)
        best = np.where(out < 0, -1, ((blk == out[..., None]) & cb).sum(-1))
        out = np.where(cnt > best, k, out)
    return out, cb.sum(-1) >= 2


def dilate_into_gutters(idx, cov, n=4):
    out = idx.copy(); c = cov.copy()
    for _ in range(n):
        nxt = out.copy(); nc = c.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            s = np.roll(np.roll(out, dy, 0), dx, 1); sc = np.roll(np.roll(c, dy, 0), dx, 1)
            take = ~nc & sc
            nxt[take] = s[take]; nc |= sc
        out, c = nxt, nc
    return out, c


def compose(masks, ramp, factor=2, levels=5, cavity_t=0.45, lip_t=0.35, dither=0.0):
    m = masks.astype(np.float32) / 255.0
    baked = (masks[..., 3] > 0).astype(np.float32)[..., None]
    m[..., 3:4] = baked                                  # alpha carries the material id; coverage is alpha > 0
    avg = box_down(m * baked, factor) if factor > 1 else m   # mask-aware average: unbaked texels add nothing
    covf = box_down(baked, factor)[..., 0] if factor > 1 else baked[..., 0]
    cov = covf >= 0.5
    avg[..., :3] /= np.maximum(covf, 1e-6)[..., None]
    top, cav, edge = avg[..., 0], avg[..., 1], avg[..., 2]
    val = 0.65 * top + 0.35 * (1 - cav)
    v = val[cov]
    lo, hi = (np.percentile(v, 3), np.percentile(v, 97)) if v.size else (0, 1)
    val = np.clip((val - lo) / max(hi - lo, 1e-6), 0, 1) * levels
    n = len(ramp)
    # cavity / lip thresholds as SHARES of covered texels (percentiles) unless absolute thresholds were
    # given: absolute AO is scene-dependent (a floor under a piece makes 70 % of texels 'occluded')
    if cavity_t is not None and cavity_t > 1.0:
        cavity_t = float(np.percentile(cav[cov], 100 - cavity_t)) if cov.any() else 1.0   # e.g. 22 -> darkest 22 %
    if lip_t is not None and lip_t > 1.0:
        lip_t = float(np.percentile(edge[cov], 100 - lip_t)) if cov.any() else 1.0
    if dither > 0:
        bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) / 16
        yy, xx = np.mgrid[0:val.shape[0], 0:val.shape[1]]
        frac = val - np.floor(val)
        val = np.floor(val) + ((frac - 0.5) * dither + 0.5 > bayer[yy % 4, xx % 4])
    idx = np.clip(np.floor(val).astype(np.int32) + 1, 1, levels)        # ramp[0] = cavities, ramp[n-1] = lips
    idx = np.where(cav > cavity_t, np.maximum(idx - 2, 0), idx)
    idx = np.where((edge > lip_t) & (cav <= cavity_t), np.minimum(idx + 1, n - 1), idx)
    for _ in range(2):  # orphan cleanup
        for k in range(n):
            agree = sum(((np.roll(idx, s, a) == k) & np.roll(cov, s, a)).astype(np.int8) for s, a in ((1, 0), (-1, 0), (1, 1), (-1, 1)))
            idx = np.where((agree >= 3) & (idx != k) & cov, k, idx)
    idx, covd = dilate_into_gutters(idx, cov, 4)
    return idx, cov, covd


def to_rgba(idx, cov, ramp):
    pal = np.array([hex_rgb(c) for c in ramp], np.uint8)
    out = np.zeros((*idx.shape, 4), np.uint8)
    out[..., :3] = pal[np.clip(idx, 0, len(ramp) - 1)]
    out[..., 3] = np.where(cov, 255, 0)
    return out


def check_atlas(path, ramp):
    a = np.asarray(Image.open(path).convert('RGBA'))
    pal = {hex_rgb(c) for c in ramp}
    op = a[a[..., 3] > 0][:, :3]
    cols = {tuple(c) for c in np.unique(op, axis=0)}
    off = sorted(cols - pal)
    return {'file': path, 'size': list(a.shape[:2][::-1]), 'distinct_colours': len(cols), 'off_palette': ['#%02x%02x%02x' % c for c in off][:10],
            'opaque_share': round(float((a[..., 3] > 0).mean()), 3), 'pass': (not off) and max(a.shape[:2]) <= 512}


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('masks', nargs='?'); ap.add_argument('--ramps', required=True); ap.add_argument('--ramp', default='boulder')
    ap.add_argument('--factor', type=int, default=2); ap.add_argument('--out'); ap.add_argument('--mips', action='store_true')
    ap.add_argument('--levels', type=int, default=5)
    ap.add_argument('--cavity', type=float, default=22, help='<=1: absolute cavity threshold; >1: percent of covered texels that become seams (default 22)')
    ap.add_argument('--lip', type=float, default=12, help='<=1: absolute convexity threshold; >1: percent of covered texels that become lit lips (default 12)')
    ap.add_argument('--dither', type=float, default=0.0); ap.add_argument('--report'); ap.add_argument('--check')
    a = ap.parse_args(argv)
    ramps = json.load(open(a.ramps))['ramps']
    if a.ramp not in ramps:
        print(json.dumps({'error': f'unknown ramp {a.ramp}; have {sorted(ramps)}'})); return 2
    ramp = ramps[a.ramp]
    if a.check:
        rep = check_atlas(a.check, ramp); print(json.dumps(rep)); return 0 if rep['pass'] else 1
    if not a.masks or not a.out:
        ap.print_help(); return 64
    masks = np.asarray(Image.open(a.masks).convert('RGBA'))
    idx, cov, covd = compose(masks, ramp, a.factor, a.levels, a.cavity, a.lip, a.dither)
    rgba = to_rgba(idx, covd, ramp)
    Image.fromarray(rgba).save(a.out)
    rep = {'out': a.out, 'size': list(rgba.shape[:2][::-1]), 'ramp': a.ramp, 'factor': a.factor,
           'shade_histogram': [int((idx[cov] == k).sum()) for k in range(len(ramp))], 'covered_share': round(float(cov.mean()), 3)}
    rep.update({'check': check_atlas(a.out, ramp)})
    if a.mips:
        mi, mc = idx, covd; base, ext = os.path.splitext(a.out); lvl = 1; mips = []
        while min(mi.shape) > 4:
            mi, mc = mode_halve(mi, mc); mi = np.where(mi < 0, 0, mi)
            p = f'{base}_mip{lvl}{ext}'; Image.fromarray(to_rgba(mi, mc, ramp)).save(p); mips.append(p); lvl += 1
        rep['mips'] = mips
    if a.report:
        json.dump(rep, open(a.report, 'w'), indent=1)
    print(json.dumps(rep)); return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
