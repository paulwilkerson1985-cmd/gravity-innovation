"""uv_blocks: block-local, texel-aligned UVs at a fixed texel density (Orbkin TEXEL = 1/16 unit).

Importable (from a build script) or CLI:
  "$ORBKIN_BPY" -I uv_blocks.py -- in.blend Low --atlas 256 --texels-per-unit 16 --angle 16 --out out.blend --report uv.json

What it does (why: world triplanar smears tiles across stones and mip LODs; smart_project islands
drift in scale; Orbkin's kit wins because every block's texels are world-sized and start on a whole
texel):
  1. groups faces into islands by region-growing while the face normal stays within --angle of the
     island's SEED normal (default 18 deg: density stays >= 16*sqrt(cos 18deg) = 15.6 texels/unit, inside
     the 16 +/- 0.5 gate; 20 deg is the limit);
  2. projects each island onto its seed-normal plane with a world-aligned frame (u follows world X or
     Y, v follows world Z for walls / world Y for tops), so texture rows run level like a painted course;
  3. scales so 1 world unit = texels_per_unit texels of the atlas and snaps each island's origin to a
     whole texel; shelf-packs the islands on the texel grid with a --gutter texel gap (bake margin
     EXTEND and compose.py's 4-texel dilation fill the gaps);
  4. fails loudly if the atlas is too small (prints the needed size). Organic low polys fragment into
     hundreds of islands (every bump is its own facet): a 3 x 1.4 unit piece at 5k tris needs a 512 atlas.
     Fewer, bigger islands come from a smoother low poly (coarser --low-voxel), not from a looser angle.
Afterwards run uv_check.py: it measures sqrt(uv_area * atlas^2 / world_area) per face.
"""
import bpy, bmesh, math, sys, os, json
import numpy as np
from mathutils import Vector


def _frame(n):
    """World-aligned tangent frame for a mean normal n: v points 'up the wall' (world Z) when the
    face is a wall, else along world +Y; u completes the right-handed frame."""
    n = Vector(n).normalized()
    up = Vector((0, 0, 1)) if abs(n.z) < 0.85 else Vector((0, 1, 0))
    u = up.cross(n).normalized()
    v = n.cross(u).normalized()
    return u, v


def block_uvs(obj, atlas=256, texels_per_unit=16.0, angle_deg=18.0, gutter=1, uv_name='UVMap', min_island_faces=1):
    me = obj.data
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table(); bm.normal_update()
    uv_layer = bm.loops.layers.uv.get(uv_name) or bm.loops.layers.uv.new(uv_name)
    cos_lim = math.cos(math.radians(angle_deg))
    # ---- 1. islands by normal similarity (region growing, seeds in area-descending order)
    faces = sorted(bm.faces, key=lambda f: -f.calc_area())
    assigned = {}
    islands = []
    for seed in faces:
        if seed.index in assigned:
            continue
        mean = seed.normal.copy(); members = [seed]; assigned[seed.index] = len(islands)
        frontier = [seed]
        while frontier:
            f = frontier.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if g.index in assigned:
                        continue
                    if g.normal.dot(mean.normalized()) >= cos_lim and g.normal.dot(seed.normal) >= cos_lim:
                        assigned[g.index] = len(islands); members.append(g); frontier.append(g)
                        mean = mean + g.normal  # running mean (unnormalised) keeps the seed's orientation
        islands.append((seed.normal.copy(), members))  # project onto the SEED normal: every member is within angle of it
    # ---- 2. project each island (world-aligned frame), 3. texel scale + snap, pack
    tex = texels_per_unit
    boxes = []
    for idx, (n, members) in enumerate(islands):
        u, v = _frame(n)
        pts = []
        for f in members:
            for l in f.loops:
                co = obj.matrix_world @ l.vert.co
                pts.append((co.dot(u) * tex, co.dot(v) * tex))
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        x0, y0 = math.floor(min(xs)), math.floor(min(ys))      # whole-texel origin
        w, h = max(1, math.ceil(max(xs)) - x0), max(1, math.ceil(max(ys)) - y0)
        boxes.append([idx, w + gutter, h + gutter, x0, y0, u, v])
    # shelf packing, tallest first
    order = sorted(range(len(boxes)), key=lambda i: (-boxes[i][2], -boxes[i][1]))
    px = py = shelf_h = 0
    place = {}
    for i in order:
        _, w, h, *_ = boxes[i]
        if w > atlas:
            raise RuntimeError(f'island {i} is {w} texels wide > atlas {atlas}: raise --atlas or lower --texels-per-unit')
        if px + w > atlas:
            px = 0; py += shelf_h; shelf_h = 0
        place[i] = (px, py); px += w; shelf_h = max(shelf_h, h)
    used_h = py + shelf_h
    if used_h > atlas:
        need = 1 << math.ceil(math.log2(max(atlas, used_h)))
        raise RuntimeError(f'islands need {atlas}x{used_h} texels; atlas {atlas} is too small (try --atlas {need})')
    for i, (idx, w, h, x0, y0, u, v) in enumerate(boxes):
        ox, oy = place[i]
        for f in islands[idx][1]:
            for l in f.loops:
                co = obj.matrix_world @ l.vert.co
                l[uv_layer].uv = ((co.dot(u) * tex - x0 + ox + gutter * 0.5) / atlas, (co.dot(v) * tex - y0 + oy + gutter * 0.5) / atlas)
    bm.to_mesh(me); bm.free()
    me.uv_layers.active = me.uv_layers[uv_name]
    fill = sum(b[1] * b[2] for b in boxes) / (atlas * atlas)
    return {'islands': len(islands), 'atlas': atlas, 'texels_per_unit': tex, 'angle_deg': angle_deg, 'rows_used': used_h, 'fill': round(fill, 3)}


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('blend'); ap.add_argument('object')
    ap.add_argument('--atlas', type=int, default=256); ap.add_argument('--texels-per-unit', type=float, default=16.0)
    ap.add_argument('--angle', type=float, default=18.0); ap.add_argument('--gutter', type=int, default=1)
    ap.add_argument('--out'); ap.add_argument('--report')
    a = ap.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend))
    obj = bpy.data.objects[a.object]
    rep = block_uvs(obj, a.atlas, a.texels_per_unit, a.angle, a.gutter)
    if a.out:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a.out))
    if a.report:
        json.dump(rep, open(a.report, 'w'), indent=1)
    print(json.dumps(rep))
