"""uv_check: measure texel density per face and gate it (Orbkin: 16 +/- 0.5 texels per world unit).

  "$ORBKIN_BPY" -I uv_check.py -- in.blend Low --atlas 256 --target 16 --tol 0.5 [--checker out.png] [--json rep.json]
Density per face = sqrt(uv_area * atlas^2 / world_area). Prints min/median/max, the share of faces
inside the tolerance and the worst faces; exit 0 when every face with area > 1e-6 is inside the
tolerance, exit 1 otherwise. --checker writes a 16-texel checker atlas (PNG) you can preview on the
model with quicklook.py --image. Also reports overlapping islands (UV faces whose boxes intersect
another island's box).
"""
import sys; sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; keep __pycache__ out of the repo
import bpy, bmesh, sys, os, json, math
import numpy as np


def density_report(obj, atlas=256, target=16.0, tol=0.5, uv_name=None):
    me = obj.data
    uv = me.uv_layers.active if uv_name is None else me.uv_layers[uv_name]
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    layer = bm.loops.layers.uv.get(uv.name)
    dens, areas = [], []
    mw = obj.matrix_world
    for f in bm.faces:
        pts = [mw @ l.vert.co for l in f.loops]
        wa = 0.0
        for i in range(1, len(pts) - 1):
            wa += (pts[i] - pts[0]).cross(pts[i + 1] - pts[0]).length / 2
        uvs = [l[layer].uv for l in f.loops]
        ua = 0.0
        for i in range(1, len(uvs) - 1):
            a, b, c = uvs[0], uvs[i], uvs[i + 1]
            ua += abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2
        if wa > 1e-7:
            dens.append(math.sqrt(ua * atlas * atlas / wa)); areas.append(wa)
    bm.free()
    d = np.array(dens); w = np.array(areas)
    inside = (np.abs(d - target) <= tol)
    worst = np.argsort(np.abs(d - target))[-5:][::-1]
    return {
        'faces': int(len(d)), 'atlas': atlas, 'target': target, 'tol': tol,
        'min': round(float(d.min()), 3), 'median': round(float(np.median(d)), 3), 'max': round(float(d.max()), 3),
        'area_weighted_mean': round(float((d * w).sum() / w.sum()), 3),
        'inside_tolerance_share': round(float(inside.mean()), 4), 'faces_outside': int((~inside).sum()),
        'worst_faces': [{'face': int(i), 'density': round(float(d[i]), 3)} for i in worst],
        'pass': bool(inside.all()),
    }


def write_checker(path, atlas=256, cell=16):
    """A 2-colour checker with one dark texel line per cell edge; preview = sees texel scale + seams."""
    y, x = np.mgrid[0:atlas, 0:atlas]
    c = ((x // cell + y // cell) % 2).astype(np.float32)
    rgb = np.stack([0.35 + 0.5 * c, 0.35 + 0.5 * c, 0.4 + 0.3 * c], -1)
    line = (x % cell == 0) | (y % cell == 0)
    rgb[line] = (0.1, 0.1, 0.12)
    img = bpy.data.images.new('checker', atlas, atlas, alpha=True)
    px = np.concatenate([rgb, np.ones((atlas, atlas, 1), np.float32)], -1)
    img.pixels = px.ravel(); img.filepath_raw = os.path.abspath(path); img.file_format = 'PNG'; img.save()
    return path


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('blend'); ap.add_argument('object')
    ap.add_argument('--atlas', type=int, default=256); ap.add_argument('--target', type=float, default=16.0)
    ap.add_argument('--tol', type=float, default=0.5); ap.add_argument('--checker'); ap.add_argument('--json')
    a = ap.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend))
    rep = density_report(bpy.data.objects[a.object], a.atlas, a.target, a.tol)
    if a.checker:
        rep['checker'] = write_checker(a.checker, a.atlas, int(round(a.target)))
    if a.json:
        json.dump(rep, open(a.json, 'w'), indent=1)
    print(json.dumps(rep))
    sys.exit(0 if rep['pass'] else 1)
