"""Shared test subject for the lab: an ORIGINAL small creature ("Lab kin") built 100% by script.

build_creature(detail='high'|'game') -> (obj, info)
  1. metaball blockout (smooth-blended body/head/snout/ears/limbs/tail) -> mesh
  2. voxel remesh (watertight, even) -> 'high' (~60-90k tris)
  3. 'game': QuadriFlow (prescale trick) to ~2.5k quads, else decimate fallback
  4. colour zones written as a CORNER colour attribute 'Col' (belly/back/accents from geometry)
  5. eyes (+ white glints) and a horn (bevelled curve) joined into the same mesh
  6. one Principled material that reads 'Col' (exports to glTF as COLOR_0 * baseColor)
Everything is deterministic; no external assets.
"""
import bpy, bmesh, math, os, sys, time
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def _activate(o):
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.selected_objects:
        x.select_set(False)
    o.select_set(True)


PALETTE = dict(
    back=(0.86, 0.36, 0.18),   # warm rust
    belly=(0.98, 0.86, 0.62),  # cream
    accent=(0.20, 0.55, 0.62),  # teal ear tips / tail tip
    dark=(0.10, 0.06, 0.08),
    horn=(0.95, 0.93, 0.85),
)


def _srgb_to_lin(c):
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


def build_creature(detail='game', target_faces=2600, name='LabKin'):
    t0 = time.perf_counter()
    sc = bpy.context.scene
    mb = bpy.data.metaballs.new(name + '_mb')
    mb.resolution = mb.render_resolution = 0.035
    mb.threshold = 0.5

    def ball(co, r, typ='BALL', size=None, stiff=2.0):
        e = mb.elements.new(type=typ)
        e.co = co; e.radius = r; e.stiffness = stiff
        if size:
            e.size_x, e.size_y, e.size_z = size
        return e

    # body (pear shape), chest, head, cheeks, snout
    ball((0.00, 0, 0.62), 0.60, 'ELLIPSOID', (1.15, 0.85, 0.85))
    ball((0.35, 0, 0.78), 0.45)
    ball((0.62, 0, 1.22), 0.52)                       # head
    for s in (-1, 1):
        ball((0.70, 0.26 * s, 1.08), 0.26)            # cheeks
    ball((0.98, 0, 1.10), 0.25, stiff=1.6)            # snout
    # ears: chains of shrinking balls swept back/up
    for s in (-1, 1):
        for i in range(5):
            f = i / 4
            ball((0.48 - 0.26 * f, (0.30 + 0.10 * f) * s, 1.55 + 0.36 * f), 0.20 - 0.07 * f, stiff=1.5)
    # legs: short chains
    for s in (-1, 1):
        for x in (-0.38, 0.42):
            for i in range(5):
                ball((x + 0.02 * i, 0.28 * s, 0.58 - 0.12 * i), 0.22 - 0.012 * i, stiff=1.6)
            ball((x + 0.09, 0.30 * s, 0.07), 0.17, 'ELLIPSOID', (1.4, 1.0, 0.7))  # paw
    # tail: curling chain
    for i in range(9):
        a = i / 8 * 2.6
        ball((-0.48 - 0.38 * math.sin(a) * 0.9, 0, 0.66 + 0.55 * (1 - math.cos(a)) * 0.6), 0.24 - 0.016 * i, stiff=1.6)

    mo = bpy.data.objects.new(name + '_mbobj', mb)
    sc.collection.objects.link(mo)
    _activate(mo)
    bpy.ops.object.convert(target='MESH')
    body = bpy.context.object
    body.name = name
    # watertight, even high poly
    body.data.remesh_voxel_size = 0.012
    bpy.ops.object.voxel_remesh()
    info = dict(high_tris=sum(len(p.vertices) - 2 for p in body.data.polygons))
    if detail == 'game':
        from qf_robust import quadriflow
        try:
            quadriflow(body, target_faces)
            info['retopo'] = 'quadriflow'
        except Exception as ex:  # fallback
            d = body.modifiers.new('d', 'DECIMATE'); d.ratio = target_faces * 2 / info['high_tris']
            bpy.ops.object.modifier_apply(modifier='d'); info['retopo'] = f'decimate ({ex})'
        sub = body.modifiers.new('ss', 'SUBSURF'); sub.levels = 0; sub.render_levels = 0  # keep slot, no cost
        body.modifiers.remove(sub)
    for p in body.data.polygons:
        p.use_smooth = True

    # ---- horn: bevelled bezier, converted and joined
    cu = bpy.data.curves.new(name + '_horn', 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(2)
    for p, co, r in zip(sp.bezier_points, [(0.74, 0, 1.48), (0.84, 0, 1.76), (0.70, 0, 1.94)], [1.0, 0.55, 0.05]):
        p.co = co; p.handle_left_type = p.handle_right_type = 'AUTO'; p.radius = r
    cu.bevel_depth = 0.075; cu.bevel_resolution = 2; cu.resolution_u = 6; cu.use_fill_caps = True
    horn = bpy.data.objects.new(name + '_horn', cu); sc.collection.objects.link(horn)
    _activate(horn); bpy.ops.object.convert(target='MESH'); horn = bpy.context.object

    # ---- eyes: dark ellipsoid + white glint, both sides
    parts = [horn]
    for s in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.11, location=(0.98, 0.25 * s, 1.30))
        e = bpy.context.object; e.scale = (0.55, 0.85, 1.15); e.name = 'eye'
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=0.035, location=(1.04, 0.22 * s, 1.36))
        g = bpy.context.object; g.name = 'glint'
        parts += [e, g]

    # ---- colour zones (corner colour attribute) on the body, from geometry.
    # Vectorised with numpy foreach_get/foreach_set: a per-loop Python loop over a 137k-tri mesh
    # takes >5 minutes (bpy element access is slow); this takes ~0.1 s.
    import numpy as np
    me = body.data
    col = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    nv, nl = len(me.vertices), len(me.loops)
    co = np.empty(nv * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    nrm = np.empty(nv * 3, np.float32); me.vertex_normals.foreach_get('vector', nrm); nrm = nrm.reshape(-1, 3)
    lv = np.empty(nl, np.int32); me.loops.foreach_get('vertex_index', lv)
    c, n = co[lv], nrm[lv]
    zmin = co[:, 2].min()
    out = np.tile(np.array([*PALETTE['back'], 1.0], np.float32), (nl, 1))
    belly = ((n[:, 2] < -0.25) & (c[:, 2] < 1.0)) | ((c[:, 0] > 0.55) & (c[:, 2] < 1.18) & (n[:, 0] > 0.2)) | (c[:, 2] < zmin + 0.10)
    accent = ((c[:, 2] > 1.72) & (np.abs(c[:, 1]) > 0.25)) | ((c[:, 0] < -0.85) & (c[:, 2] > 1.05))
    out[belly, :3] = PALETTE['belly']
    out[accent, :3] = PALETTE['accent']
    col.data.foreach_set('color_srgb', out.ravel())
    for part in parts:
        c = PALETTE['horn'] if 'horn' in part.name else (PALETTE['dark'] if part.name.startswith('eye') else (1, 1, 1))
        a = part.data.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        for d in a.data:
            d.color_srgb = (*c, 1.0)
        for p in part.data.polygons:
            p.use_smooth = True
    # join
    _activate(body)
    for p in parts:
        p.select_set(True)
    bpy.ops.object.join()
    body = bpy.context.object
    me = body.data
    me.color_attributes.active_color = me.color_attributes['Col']
    me.color_attributes.render_color_index = 0

    # ---- material: Principled with base colour = Col (glTF exporter maps to COLOR_0)
    mat = bpy.data.materials.new(name + '_mat')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.55
    me.materials.clear(); me.materials.append(mat)
    # put feet on the ground, origin at feet centre
    bpy.context.view_layer.update()
    zmin = min((body.matrix_world @ v.co).z for v in me.vertices)
    me.transform(Matrix.Translation((0, 0, -zmin)))
    info['tris'] = sum(len(p.vertices) - 2 for p in me.polygons)
    info['verts'] = len(me.vertices)
    info['seconds'] = round(time.perf_counter() - t0, 2)
    return body, info


if __name__ == '__main__':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    o, info = build_creature(sys.argv[-1] if sys.argv[-1] in ('high', 'game') else 'game')
    print('built', info)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'out', 'labkin.blend'))
