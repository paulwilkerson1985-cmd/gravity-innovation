"""Approach D - headless Blender (bpy 5.2) toon pipeline shared by the three kin scripts.

Pipeline per kin:
  metaball blockout -> mesh -> voxel remesh (watertight) -> smooth shading
  + hard parts (ears, wings, crystals, eyes) built with bmesh/primitives
  -> Boolean UNION (MANIFOLD solver, EXACT fallback) into one mesh so part junctions become
     real creases (Freestyle draws them)   -> vertex-colour zones by numpy predicates
  -> emission toon material (half-Lambert -> 3-band ramp, soft edges, cel AO)
  -> Freestyle ink: thick external contour + thinner silhouettes/creases, per-material ink colour
  -> Cycles CPU, emission only (max_bounces=0), 1024 PNG, transparent film, ortho 3/4 camera.
"""
import bpy, bmesh, math, os, time
import numpy as np
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)


def srgb(hexstr, mul=1.0):
    h = hexstr.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c]
    return tuple(min(1.0, v * mul) for v in lin)


def activate(o):
    for x in bpy.context.selected_objects:
        x.select_set(False)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    return sc


def link(o):
    bpy.context.scene.collection.objects.link(o)
    return o


# ----------------------------------------------------------------------------- building blocks
class Blob:
    """Metaball blockout. add(co, r, size=None, stiff) ; mesh(voxel) -> watertight mesh object."""

    def __init__(self, name, resolution=0.04, threshold=0.5):
        self.mb = bpy.data.metaballs.new(name)
        self.mb.resolution = self.mb.render_resolution = resolution
        self.mb.threshold = threshold
        self.name = name

    def add(self, co, r, size=None, stiff=2.0, neg=False):
        # r is the VISIBLE radius of an isolated ball: field = stiff*(1-(d/R)^2)^3 = threshold
        k = math.sqrt(1 - (self.mb.threshold / stiff) ** (1 / 3))
        e = self.mb.elements.new(type='ELLIPSOID' if size else 'BALL')
        e.co = co; e.radius = r / k; e.stiffness = stiff; e.use_negative = neg
        if size:
            e.size_x, e.size_y, e.size_z = size
        return e

    def chain(self, a, b, r0, r1, n=6, stiff=1.8):
        a, b = Vector(a), Vector(b)
        for i in range(n):
            t = i / max(1, n - 1)
            self.add(a.lerp(b, t), r0 + (r1 - r0) * t, stiff=stiff)

    def mesh(self, voxel=0.02, smooth_iters=0):
        o = link(bpy.data.objects.new(self.name, self.mb))
        activate(o)
        bpy.ops.object.convert(target='MESH')
        o = bpy.context.object
        o.name = self.name
        o.data.remesh_voxel_size = voxel
        o.data.remesh_voxel_adaptivity = 0.0
        bpy.ops.object.voxel_remesh()
        if smooth_iters:
            m = o.modifiers.new('sm', 'SMOOTH'); m.iterations = smooth_iters; m.factor = 0.5
            bpy.ops.object.modifier_apply(modifier='sm')
        set_smooth(o)
        return o


def set_smooth(o, angle=None):
    me = o.data
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), dtype=bool))
    if angle is not None:
        activate(o)
        try:
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle), keep_sharp_edges=False)
        except Exception as ex:
            print('shade_smooth_by_angle failed', ex)
    me.update()


def ellipsoid(name, loc, scale, rot=(0, 0, 0), segs=32, rings=16, taper=None, taper_axis=2, track=None, roll=0.0):
    """UV sphere scaled; optional taper: (k) shrinks the cross-section toward +axis -> egg/point."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1.0, location=(0, 0, 0))
    o = bpy.context.object; o.name = name
    if taper is not None:
        me = o.data
        co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
        t = (co[:, taper_axis] + 1) / 2  # 0 at -axis, 1 at +axis
        f = 1 - taper * t ** 1.6
        for ax in range(3):
            if ax != taper_axis:
                co[:, ax] *= f
        me.vertices.foreach_set('co', co.ravel()); me.update()
    o.scale = scale; o.location = loc
    if track is not None:   # local +Z -> track direction (eyes/glints sit on a surface normal)
        q = Vector(track).normalized().to_track_quat('Z', 'Y') @ Euler((0, 0, math.radians(roll))).to_quaternion()
        o.rotation_euler = q.to_euler()
    else:
        o.rotation_euler = Euler([math.radians(a) for a in rot], 'XYZ')
    apply_xform(o)
    set_smooth(o)
    return o


def apply_xform(o):
    activate(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def crystal(name, loc, r, h, rot=(0, 0, 0), sides=6, tip=0.45, tip_r=0.35):
    """Hexagonal prism with a pointed cap, base at loc pointing along local +Z."""
    bm = bmesh.new()
    base = [bm.verts.new((r * math.cos(2 * math.pi * i / sides), r * math.sin(2 * math.pi * i / sides), 0)) for i in range(sides)]
    bm.faces.new(base)
    shoulder = [bm.verts.new((v.co.x, v.co.y, h * (1 - tip))) for v in base]
    ring2 = [bm.verts.new((v.co.x * tip_r, v.co.y * tip_r, h * (1 - tip * 0.35))) for v in base]
    apex = bm.verts.new((0, 0, h))
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((base[i], base[j], shoulder[j], shoulder[i]))
        bm.faces.new((shoulder[i], shoulder[j], ring2[j], ring2[i]))
        bm.faces.new((ring2[i], ring2[j], apex))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me))
    o.location = loc; o.rotation_euler = Euler([math.radians(a) for a in rot], 'XYZ')
    apply_xform(o)
    return o


def slab(name, pts2d, thickness, loc=(0, 0, 0), rot=(0, 0, 0), plane='XZ', bevel=0.0, scale=1.0, bulge=0.0):
    """Filled closed outline (2-D points) solidified to a slab. plane 'XZ' => points are (x, z), normal along Y.
    bulge > 0 pushes the centre of the slab outwards (lens profile) using distance to outline."""
    bm = bmesh.new()
    verts = []
    for (a, b) in pts2d:
        if plane == 'XZ':
            co = (a * scale, 0, b * scale)
        elif plane == 'XY':
            co = (a * scale, b * scale, 0)
        else:
            co = (0, a * scale, b * scale)
        verts.append(bm.verts.new(co))
    f = bm.faces.new(verts)
    bmesh.ops.triangulate(bm, faces=[f])
    # subdivide the fill a little so the solidify/bevel/bulge has geometry to work with
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me))
    activate(o)
    if bulge:
        # move interior verts along the normal by bulge * (distance to boundary)
        bm = bmesh.new(); bm.from_mesh(me)
        boundary = [v for v in bm.verts if v.is_boundary]
        n = Vector((0, 1, 0)) if plane == 'XZ' else Vector((0, 0, 1)) if plane == 'XY' else Vector((1, 0, 0))
        for v in bm.verts:
            if not v.is_boundary:
                d = min((v.co - b.co).length for b in boundary)
                v.co += n * (math.sqrt(d) * bulge)
        bm.to_mesh(me); bm.free()
    so = o.modifiers.new('so', 'SOLIDIFY'); so.thickness = thickness; so.offset = 0.0; so.use_even_offset = True
    bpy.ops.object.modifier_apply(modifier='so')
    if bevel:
        bv = o.modifiers.new('bv', 'BEVEL'); bv.width = bevel; bv.segments = 3; bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(40)
        bpy.ops.object.modifier_apply(modifier='bv')
    o.location = loc; o.rotation_euler = Euler([math.radians(a) for a in rot], 'XYZ')
    apply_xform(o)
    set_smooth(o, angle=45)
    return o


def smooth_closed(pts, subdiv=6, tension=0.5):
    """Catmull-Rom interpolation through a closed polygon's control points -> organic outline."""
    P = [np.array(p, dtype=float) for p in pts]
    n = len(P); out = []
    for i in range(n):
        p0, p1, p2, p3 = P[(i - 1) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]
        for k in range(subdiv):
            t = k / subdiv
            a = 2 * p1; b = p2 - p0; c = 2 * p0 - 5 * p1 + 4 * p2 - p3; d = -p0 + 3 * p1 - 3 * p2 + p3
            out.append(tuple(tension * (a + b * t + c * t * t + d * t ** 3)))
    return out


def tube(name, points, radii, loc=(0, 0, 0), res=8, bevel_res=3):
    """Bezier tube with per-point radius (curves -> mesh)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(points) - 1)
    for p, co, r in zip(sp.bezier_points, points, radii):
        p.co = co; p.handle_left_type = p.handle_right_type = 'AUTO'; p.radius = r
    cu.bevel_depth = 1.0; cu.bevel_resolution = bevel_res; cu.resolution_u = res; cu.use_fill_caps = True
    o = link(bpy.data.objects.new(name, cu)); o.location = loc
    activate(o); bpy.ops.object.convert(target='MESH'); o = bpy.context.object
    apply_xform(o); set_smooth(o)
    return o


def displace(o, strength, scale, tex_type='CLOUDS', depth=1, seed=0, mid=0.5):
    tex = bpy.data.textures.new(o.name + '_dsp', tex_type)
    tex.noise_scale = scale
    if tex_type == 'CLOUDS':
        tex.noise_depth = depth
    if tex_type == 'VORONOI':
        tex.distance_metric = 'DISTANCE'
    m = o.modifiers.new('dsp', 'DISPLACE'); m.texture = tex; m.strength = strength; m.mid_level = mid
    m.texture_coords = 'LOCAL'
    activate(o); bpy.ops.object.modifier_apply(modifier='dsp')


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


# ----------------------------------------------------------------------------- materials
_RAMP_GROUP = None


def toon_group():
    """Node group: Base colour -> cel-shaded emission colour. Light dir from a scene property."""
    global _RAMP_GROUP
    if _RAMP_GROUP and _RAMP_GROUP.name in bpy.data.node_groups:
        return _RAMP_GROUP
    g = bpy.data.node_groups.new('ToonShade', 'ShaderNodeTree')
    g.interface.new_socket('Base', in_out='INPUT', socket_type='NodeSocketColor')
    g.interface.new_socket('Glow', in_out='INPUT', socket_type='NodeSocketFloat')
    g.interface.new_socket('Color', in_out='OUTPUT', socket_type='NodeSocketColor')
    N = g.nodes.new; L = g.links.new
    gi = N('NodeGroupInput'); go = N('NodeGroupOutput')
    geo = N('ShaderNodeNewGeometry')
    ldir = N('ShaderNodeCombineXYZ'); ldir.name = 'LightDir'
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    L(geo.outputs['Normal'], dot.inputs[0]); L(ldir.outputs[0], dot.inputs[1])
    half = N('ShaderNodeMath'); half.operation = 'MULTIPLY_ADD'; half.inputs[1].default_value = 0.5; half.inputs[2].default_value = 0.5
    L(dot.outputs['Value'], half.inputs[0])
    # cel AO: darken crevices (contact shadow look) - folded into the light term
    ao = N('ShaderNodeAmbientOcclusion'); ao.samples = 8; ao.inputs['Distance'].default_value = 0.35; ao.only_local = False
    aomix = N('ShaderNodeMath'); aomix.operation = 'MULTIPLY_ADD'  # fac * (ao*0.55 + 0.45)
    aok = N('ShaderNodeMath'); aok.operation = 'MULTIPLY_ADD'; aok.inputs[1].default_value = 0.55; aok.inputs[2].default_value = 0.45
    L(ao.outputs['AO'], aok.inputs[0])
    fac = N('ShaderNodeMath'); fac.operation = 'MULTIPLY'
    L(half.outputs[0], fac.inputs[0]); L(aok.outputs[0], fac.inputs[1])
    ramp = N('ShaderNodeValToRGB'); ramp.name = 'Ramp'; ramp.color_ramp.interpolation = 'LINEAR'
    els = ramp.color_ramp.elements
    # (pos, multiplier rgb): core shadow (cool), soft edge, mid, lit, highlight
    tones = [(0.00, (0.50, 0.46, 0.60)), (0.33, (0.50, 0.46, 0.60)), (0.37, (0.78, 0.76, 0.84)),
             (0.50, (0.78, 0.76, 0.84)), (0.54, (1.0, 1.0, 1.0)), (0.80, (1.0, 1.0, 1.0)), (0.83, (1.12, 1.10, 1.06))]
    while len(els) < len(tones):
        els.new(0.5)
    for e, (p, c) in zip(els, tones):
        e.position = p; e.color = (*c, 1)
    L(fac.outputs[0], ramp.inputs['Fac'])
    # glow: lerp the ramp toward flat white (unshaded) by Glow
    one = N('ShaderNodeRGB'); one.outputs[0].default_value = (1.0, 1.0, 1.0, 1)
    gmix = N('ShaderNodeMix'); gmix.data_type = 'RGBA'; gmix.blend_type = 'MIX'
    L(gi.outputs['Glow'], gmix.inputs['Factor']); L(ramp.outputs['Color'], gmix.inputs[6]); L(one.outputs[0], gmix.inputs[7])
    mul = N('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    L(gi.outputs['Base'], mul.inputs[6]); L(gmix.outputs[2], mul.inputs[7])
    L(mul.outputs[2], go.inputs['Color'])
    _RAMP_GROUP = g
    return g


def set_light_dir(v):
    g = toon_group(); n = g.nodes['LightDir']
    n.inputs[0].default_value, n.inputs[1].default_value, n.inputs[2].default_value = v


def toon_material(name, base=None, attr=None, glow=0.0, ink='#1d1016', boost=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    N = nt.nodes.new; L = nt.links.new
    grp = N('ShaderNodeGroup'); grp.node_tree = toon_group(); grp.inputs['Glow'].default_value = glow
    if attr:
        ca = N('ShaderNodeVertexColor'); ca.layer_name = attr; L(ca.outputs['Color'], grp.inputs['Base'])
    else:
        grp.inputs['Base'].default_value = (*base, 1)
    emit = N('ShaderNodeEmission'); emit.inputs['Strength'].default_value = boost
    out = N('ShaderNodeOutputMaterial')
    L(grp.outputs['Color'], emit.inputs['Color']); L(emit.outputs[0], out.inputs['Surface'])
    m.line_color = (*srgb(ink), 1.0)
    return m


def assign(o, mat):
    o.data.materials.clear(); o.data.materials.append(mat)
    return o


# ----------------------------------------------------------------------------- union + zones
def union(target, parts, solver='MANIFOLD'):
    """Boolean-union parts into target (materials carried over), delete parts.
    MANIFOLD solver first (fast); a part it refuses (non-manifold operand -> modifier disabled, or
    no geometry change) is retried with EXACT. A failed apply leaves the modifier behind, so it is removed."""
    t0 = time.perf_counter()

    def try_solver(p, sv):
        before = tri_count(target)
        activate(target)
        b = target.modifiers.new('u', 'BOOLEAN'); b.operation = 'UNION'; b.object = p; b.solver = sv
        b.material_mode = 'TRANSFER'
        name = b.name          # read before apply: the modifier struct is freed by a successful apply
        ok = True
        try:
            bpy.ops.object.modifier_apply(modifier=name)
        except Exception as ex:
            print(f'  union {p.name} [{sv}] failed: {ex}')
            ok = False
        if name in target.modifiers:
            target.modifiers.remove(target.modifiers[name])
        after = tri_count(target)
        return ok and after != before and after > before * 0.5

    for p in parts:
        if p.type != 'MESH':
            continue
        keep = target.data.copy()          # guard: a broken boolean must never eat the body
        n0 = tri_count(target)
        ok = try_solver(p, solver)
        if not ok and solver != 'EXACT':
            print(f'  union {p.name}: retry EXACT')
            target.data = keep.copy() if tri_count(target) < 0.9 * n0 else target.data
            ok = try_solver(p, 'EXACT')
        if not ok or tri_count(target) < 0.9 * n0:
            print(f'  union {p.name}: FAILED -> joined without boolean')
            target.data = keep
            activate(target); p.select_set(True); bpy.ops.object.join()
            continue
        bpy.data.objects.remove(p, do_unlink=True)
    print(f'  union of {len(parts)} parts: {time.perf_counter() - t0:.1f}s, {tri_count(target)} tris')
    return target


def join(target, parts):
    """Plain join (no boolean) for parts that must not be cut (e.g. glow shells)."""
    activate(target)
    for p in parts:
        p.select_set(True)
    bpy.ops.object.join()
    return bpy.context.object


def mesh_arrays(o):
    me = o.data
    n = len(me.vertices)
    co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    nm = np.empty(n * 3); me.vertex_normals.foreach_get('vector', nm); nm = nm.reshape(-1, 3)
    return co, nm


def vertex_slot_mask(o, slot_names):
    """Boolean per-vertex mask: vertex belongs to a face whose material slot name is in slot_names."""
    me = o.data
    idx = {i for i, m in enumerate(me.materials) if m and m.name in slot_names}
    pm = np.empty(len(me.polygons), dtype=np.int32); me.polygons.foreach_get('material_index', pm)
    lt = np.empty(len(me.polygons), dtype=np.int32); me.polygons.foreach_get('loop_total', lt)
    ls = np.empty(len(me.polygons), dtype=np.int32); me.polygons.foreach_get('loop_start', ls)
    lv = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get('vertex_index', lv)
    mask = np.zeros(len(me.vertices), dtype=bool)
    sel = np.isin(pm, list(idx))
    for s, t in zip(ls[sel], lt[sel]):
        mask[lv[s:s + t]] = True
    return mask


def paint_zones(o, base_rgb, zones, attr='Col', mask=None):
    """zones: list of (predicate(co, nm) -> bool array, rgb). Applied in order (later wins).
    Writes a POINT colour attribute and returns it. With mask, the base colour is only written to
    masked vertices and other vertices keep the colour they already have (parts painted earlier)."""
    me = o.data
    co, nm = mesh_arrays(o)
    a = me.color_attributes.get(attr)
    if a is not None and mask is not None:
        col = np.empty(len(me.vertices) * 4); a.data.foreach_get('color', col); col = col.reshape(-1, 4)
        col[mask, :3] = base_rgb
    else:
        col = np.tile(np.array(base_rgb + (1.0,)), (len(me.vertices), 1))
    if a is None:
        a = me.color_attributes.new(attr, 'FLOAT_COLOR', 'POINT')
    for pred, rgb in zones:
        m = pred(co, nm)
        col[m, :3] = rgb
    a.data.foreach_set('color', col.ravel())
    me.update()
    return a


def smoothstep_blend(o, attr, iters=2):
    """Average vertex colours with neighbours a few times -> softer zone edges (anti-jaggy)."""
    me = o.data
    a = me.color_attributes[attr]
    col = np.empty(len(me.vertices) * 4); a.data.foreach_get('color', col); col = col.reshape(-1, 4)
    ek = np.empty(len(me.edges) * 2, dtype=np.int32); me.edges.foreach_get('vertices', ek); ek = ek.reshape(-1, 2)
    for _ in range(iters):
        acc = np.zeros_like(col); cnt = np.zeros(len(col))
        np.add.at(acc, ek[:, 0], col[ek[:, 1]]); np.add.at(acc, ek[:, 1], col[ek[:, 0]])
        np.add.at(cnt, ek[:, 0], 1); np.add.at(cnt, ek[:, 1], 1)
        cnt[cnt == 0] = 1
        col = 0.5 * col + 0.5 * acc / cnt[:, None]
    a.data.foreach_set('color', col.ravel())


# ----------------------------------------------------------------------------- camera / render
def camera_basis(yaw=35.0, elev=12.0):
    d = Vector((math.cos(math.radians(elev)) * math.sin(math.radians(yaw)),
                -math.cos(math.radians(elev)) * math.cos(math.radians(yaw)),
                math.sin(math.radians(elev)))).normalized()   # creature -> camera
    rot = (-d).to_track_quat('-Z', 'Y')
    right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    return d, rot, right, up


def frame_camera(objs, yaw=35.0, elev=12.0, height_frac=0.80, ground_px=900, size=1024, width_max=0.92):
    sc = bpy.context.scene
    d, rot, right, up = camera_basis(yaw, elev)
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
        M = np.array(o.matrix_world)
        w = co @ M[:3, :3].T + M[:3, 3]
        pts.append(w); ev.to_mesh_clear()
    P = np.vstack(pts)
    R, U = np.array(right), np.array(up)
    xs, ys = P @ R, P @ U
    span_x, span_y = xs.max() - xs.min(), ys.max() - ys.min()
    ortho = max(span_y / height_frac, span_x / width_max)
    cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cd.ortho_scale = ortho; cd.clip_end = 100
    cam = link(bpy.data.objects.new('cam', cd)); sc.camera = cam
    cx = (xs.max() + xs.min()) / 2
    ground_v = 1 - ground_px / size                     # 0..1 from bottom
    cy = ys.min() - (ground_v - 0.5) * ortho
    centre = right * cx + up * cy
    cam.location = centre + d * 30
    cam.rotation_euler = rot.to_euler()
    # light from the upper-left of the image, slightly toward the camera
    Lw = (-0.55 * right + 0.72 * up + 0.42 * d).normalized()
    set_light_dir(Lw)
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    return cam, dict(ortho=ortho, span_x=span_x, span_y=span_y, height_px=span_y / ortho * size)


def setup_render(samples=24, ink_px=6.0, inner_px=3.0, crease_deg=105, bezier=0.0):
    sc = bpy.context.scene
    r = sc.render
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = False
    sc.cycles.max_bounces = 0
    sc.cycles.use_denoising = False
    r.film_transparent = True
    r.filter_size = 1.5
    r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'; r.image_settings.color_depth = '8'
    r.image_settings.compression = 60
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0; sc.view_settings.gamma = 1.0
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
    # Freestyle ink
    r.use_freestyle = True
    r.line_thickness_mode = 'ABSOLUTE'
    r.line_thickness = 1.0
    vl = sc.view_layers[0]; vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(crease_deg)
    fs.use_culling = True
    fs.use_smoothness = True
    for ls in list(fs.linesets):
        fs.linesets.remove(ls)

    def lineset(name, thick, **flags):
        ls = fs.linesets.new(name)
        ls.select_by_visibility = True; ls.visibility = 'VISIBLE'
        ls.select_by_edge_types = True
        for f in ('select_silhouette', 'select_border', 'select_crease', 'select_external_contour', 'select_contour', 'select_material_boundary', 'select_edge_mark'):
            setattr(ls, f, flags.get(f, False))
        st = bpy.data.linestyles.new(name); ls.linestyle = st
        st.thickness = thick; st.color = srgb('#1d1016'); st.caps = 'ROUND'
        st.use_chaining = True; st.chaining = 'PLAIN'; st.rounds = 3
        cm = st.color_modifiers.new('mat', 'MATERIAL'); cm.material_attribute = 'LINE'; cm.blend = 'MIX'; cm.influence = 1.0
        tm = st.thickness_modifiers.new('cal', 'CALLIGRAPHY'); tm.thickness_min = thick * 0.7; tm.thickness_max = thick * 1.25; tm.orientation = 45.0
        if bezier:
            gm = st.geometry_modifiers.new('bz', 'BEZIER_CURVE'); gm.error = bezier
        return st

    lineset('outer', ink_px, select_external_contour=True)
    lineset('inner', inner_px, select_silhouette=True, select_border=True, select_crease=True)
    return sc


def render(path, label=''):
    sc = bpy.context.scene
    sc.render.filepath = path
    t = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    dt = time.perf_counter() - t
    print(f'  render {label} {os.path.basename(path)}: {dt:.1f}s')
    return dt


def save_blend(path):
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
