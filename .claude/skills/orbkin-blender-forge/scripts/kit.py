"""kit: the tested headless-Blender helpers of the orbkin-blender-forge skill (Blender 5.2.2, CPU).

Import in a script that sits anywhere:
    import sys, os; sys.path.insert(0, '<skill>/scripts'); import kit, orbkin_compat as oc
    sc = oc.fresh_scene()

Contents (every function was run in the cloud container; timings in references/modelling.md):
  activate, select_only, tri_count, bbox, components      selection and measurement
  srgb_to_lin, pbr                                        colours and Principled materials
  box, ellipsoid, capsule, cone, join, apply_transforms   blockout primitives
  voxel_remesh, quadriflow, decimate, bevel_normals       forms and retopo
  zones_numpy                                             vertex-colour zones (numpy foreach)
  islands, rebind_islands                                 rig hygiene for separate parts
  three_point, camera_fit, render, workbench, contact_sheet, stitch   review renders
  bake                                                    Cycles bake with toggle reset
  export_glb (from orbkin_compat)                         raw GLB with verified flags
Standing rules this module enforces: bpy.ops CANCELLED raises; numpy for per-element data;
materials assigned before booleans/GN; transforms (incl. location) applied after join.
"""
import bpy, bmesh, math, os, time
import numpy as np
from mathutils import Vector, Matrix
import orbkin_compat as oc

ops_ok = oc.ops_ok
export_glb = oc.export_glb


# ---------------------------------------------------------------- selection / measurement
def activate(o):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for x in bpy.context.view_layer.objects:
        x.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    return o


select_only = activate


def tri_count(obj, evaluated=False):
    if evaluated:
        dg = bpy.context.evaluated_depsgraph_get(); ev = obj.evaluated_get(dg); me = ev.to_mesh()
        t = sum(len(p.vertices) - 2 for p in me.polygons); ev.to_mesh_clear(); return t
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def bbox(obj):
    """World-space (min, max, size) of an object's bounding box."""
    bpy.context.view_layer.update()
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi, hi - lo


def components(obj):
    """Number of connected shells (a fused blockout must be 1 before voxel/QuadriFlow)."""
    return len(islands(obj))


def mesh_manifold_report(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data)
    nonman = sum(1 for e in bm.edges if not e.is_manifold); bound = sum(1 for e in bm.edges if e.is_boundary)
    bm.free()
    return {'non_manifold_edges': nonman, 'boundary_edges': bound}


# ---------------------------------------------------------------- colour / materials
def srgb_to_lin(c):
    """'#rrggbb' or 0..1 sRGB tuple -> linear RGB tuple (Principled inputs are linear)."""
    if isinstance(c, str):
        c = c.lstrip('#'); c = tuple(int(c[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c[:3])


def pbr(name, color='#888888', roughness=0.85, metallic=0.0, vertex_color=None, image=None):
    """Principled material. color = hex or linear tuple; vertex_color='Col' wires a Color Attribute
    node; image = bpy image wired to Base Color (nearest interpolation for pixel atlases)."""
    m = oc.new_material(name, srgb_to_lin(color) if isinstance(color, str) else color, roughness, metallic)
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    if vertex_color:
        a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = vertex_color
        nt.links.new(a.outputs['Color'], b.inputs['Base Color'])
    if image is not None:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = image; t.interpolation = 'Closest'
        nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    return m


def assign(obj, mat):
    obj.data.materials.clear(); obj.data.materials.append(mat)
    return obj


# ---------------------------------------------------------------- blockout primitives
def _new(name, me):
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o


def box(name, size, loc=(0, 0, 0), rot=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = _new(name, me); o.scale = size; o.location = loc; o.rotation_euler = rot
    return o


def ellipsoid(name, radii, loc=(0, 0, 0), rot=(0, 0, 0), segments=24, rings=16):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = _new(name, me); o.scale = radii; o.location = loc; o.rotation_euler = rot
    return o


def capsule(name, radius, length, loc=(0, 0, 0), rot=(0, 0, 0), segments=16):
    """Capsule along local Z (cylinder + hemispheres), as one mesh."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=segments // 2 * 2, radius=radius)
    for v in bm.verts:
        v.co.z += (length / 2) if v.co.z > 0 else (-length / 2)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = _new(name, me); o.location = loc; o.rotation_euler = rot
    return o


def cone(name, r1, r2, depth, loc=(0, 0, 0), rot=(0, 0, 0), segments=12):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r1, radius2=r2, depth=depth)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = _new(name, me); o.location = loc; o.rotation_euler = rot
    return o


def apply_transforms(obj):
    """Apply location + rotation + scale so mesh coords == world coords (zone masks, bakes, export)."""
    activate(obj); ops_ok(bpy.ops.object.transform_apply(location=True, rotation=True, scale=True), 'transform_apply')
    return obj


def join(objects, name=None):
    """Join into objects[0], apply transforms (incl. location!), return the joined object."""
    objects = list(objects)
    for o in objects:
        activate(o); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    activate(objects[0])
    for o in objects[1:]:
        o.select_set(True)
    if len(objects) > 1:
        ops_ok(bpy.ops.object.join(), 'join')
    o = bpy.context.object
    if name:
        o.name = name; o.data.name = name
    return apply_transforms(o)


def boolean(obj, cutter, op='DIFFERENCE', solver=None, apply=True):
    """Boolean modifier. Assign obj's material BEFORE calling (5.2.2 empty-slot bug)."""
    m = obj.modifiers.new('bool', 'BOOLEAN'); m.operation = op; m.object = cutter; m.solver = solver or oc.boolean_solver()
    if apply:
        activate(obj); ops_ok(bpy.ops.object.modifier_apply(modifier='bool'), 'boolean apply')
        oc.drop_empty_material_slots(obj)
    return obj


# ---------------------------------------------------------------- forms / retopo
def voxel_remesh(obj, voxel=0.02, smooth=True):
    """bpy.ops.object.voxel_remesh (NOT the Remesh modifier: on non-manifold input it keeps one
    fragment). Input should be a single fused shell."""
    activate(obj); obj.data.remesh_voxel_size = voxel; obj.data.remesh_voxel_adaptivity = 0.0
    obj.data.use_remesh_fix_poles = True; obj.data.use_remesh_preserve_volume = True
    ops_ok(bpy.ops.object.voxel_remesh(), 'voxel_remesh')
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def quadriflow(obj, target_faces=2000, prescale=100.0, seed=0, bbox_tol=0.02, mem_limit_gb=8, **kw):
    """Robust QuadriFlow (lab/qf_robust.py): prescale x100 so voxel slivers pass the 1e-4 per-component
    manifold check, raise on CANCELLED, restore scale, assert the bounding box within bbox_tol.
    Runs under RLIMIT_AS (mem_limit_gb) because fragmented shells made QuadriFlow balloon to 13 GB."""
    import resource
    lo0, hi0, size0 = bbox(obj)
    soft, hard = resource.getrlimit(resource.RLIMIT_AS)
    try:
        if mem_limit_gb:
            resource.setrlimit(resource.RLIMIT_AS, (int(mem_limit_gb * 2 ** 30), hard))
        obj.data.transform(Matrix.Scale(prescale, 4))
        activate(obj)
        kw.setdefault('use_mesh_symmetry', False)
        res = bpy.ops.object.quadriflow_remesh(target_faces=int(target_faces), seed=seed, **kw)
        obj.data.transform(Matrix.Scale(1.0 / prescale, 4))
        obj.data.update(); bpy.context.view_layer.update()
    finally:
        resource.setrlimit(resource.RLIMIT_AS, (soft, hard))
    if 'FINISHED' not in res:
        raise RuntimeError(f'QuadriFlow failed: {res} (non-manifold or inconsistent normals? check components()==1)')
    lo1, hi1, size1 = bbox(obj)
    dev = max(abs(size1[i] - size0[i]) / max(size0[i], 1e-6) for i in range(3))
    if dev > bbox_tol:
        raise RuntimeError(f'QuadriFlow output bbox deviates {dev:.1%} > {bbox_tol:.0%} (spike?); input {tuple(round(x,3) for x in size0)} output {tuple(round(x,3) for x in size1)}')
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def decimate(obj, target_tris, mode='COLLAPSE', bbox_tol=0.02):
    """Decimate to about target_tris (collapse keeps the shape of static props; triangle soup is fine
    for rocks). Asserts the bounding box like quadriflow()."""
    lo0, hi0, size0 = bbox(obj)
    t = tri_count(obj)
    m = obj.modifiers.new('dec', 'DECIMATE'); m.decimate_type = mode
    if mode == 'COLLAPSE':
        m.ratio = min(1.0, target_tris / max(t, 1)); m.use_collapse_triangulate = True
    activate(obj); ops_ok(bpy.ops.object.modifier_apply(modifier='dec'), 'decimate apply')
    lo1, hi1, size1 = bbox(obj)
    dev = max(abs(size1[i] - size0[i]) / max(size0[i], 1e-6) for i in range(3))
    if dev > bbox_tol:
        raise RuntimeError(f'decimate bbox deviates {dev:.1%}')
    return obj


def chisel(obj, angle_deg=14.0):
    """Faceted-rubble look: planar dissolve + triangulate + flat shading (blender-llm.md 3.3)."""
    m = obj.modifiers.new('chisel', 'DECIMATE'); m.decimate_type = 'DISSOLVE'; m.angle_limit = math.radians(angle_deg)
    activate(obj); ops_ok(bpy.ops.object.modifier_apply(modifier='chisel'), 'dissolve apply')
    t = obj.modifiers.new('tri', 'TRIANGULATE'); ops_ok(bpy.ops.object.modifier_apply(modifier='tri'), 'triangulate apply')
    for p in obj.data.polygons:
        p.use_smooth = False
    return obj


def bevel_normals(obj, width=0.01, segments=2, angle_deg=30.0):
    """Hard-surface edge treatment: Bevel (angle limit, harden normals) + Weighted Normal, applied."""
    b = obj.modifiers.new('bev', 'BEVEL'); b.width = width; b.segments = segments; b.limit_method = 'ANGLE'
    b.angle_limit = math.radians(angle_deg); b.harden_normals = True
    w = obj.modifiers.new('wn', 'WEIGHTED_NORMAL'); w.keep_sharp = True
    activate(obj)
    ops_ok(bpy.ops.object.modifier_apply(modifier='bev'), 'bevel apply'); ops_ok(bpy.ops.object.modifier_apply(modifier='wn'), 'weighted normal apply')
    return obj


def mesh_arrays(obj):
    """(positions[nv,3], normals[nv,3], loop_vertex[nl]) via foreach_get (a Python loop over a 137k-tri
    mesh never finished)."""
    me = obj.data; nv, nl = len(me.vertices), len(me.loops)
    co = np.empty(nv * 3, np.float32); me.vertices.foreach_get('co', co)
    nr = np.empty(nv * 3, np.float32); me.vertex_normals.foreach_get('vector', nr)
    lv = np.empty(nl, np.int32); me.loops.foreach_get('vertex_index', lv)
    return co.reshape(-1, 3), nr.reshape(-1, 3), lv


def zones_numpy(obj, base, rules, attr='Col'):
    """Vertex-colour zones. base = sRGB hex/tuple; rules = [(mask_fn(co, nrm) -> bool[nv], colour)].
    mask_fn receives per-VERTEX arrays; the colour is written per corner as BYTE_COLOR (hard edges,
    pixel-art crisp). Paint BEFORE decimating or bake to a texture afterwards."""
    me = obj.data
    col = me.color_attributes.get(attr) or me.color_attributes.new(attr, 'BYTE_COLOR', 'CORNER')
    co, nr, lv = mesh_arrays(obj)
    def rgb(c):
        if isinstance(c, str):
            c = c.lstrip('#'); c = tuple(int(c[i:i + 2], 16) / 255 for i in (0, 2, 4))
        return c[:3]
    out = np.tile(np.array([*rgb(base), 1.0], np.float32), (len(co), 1))
    for fn, colour in rules:
        m = np.asarray(fn(co, nr), bool)
        out[m, :3] = rgb(colour)
    col.data.foreach_set('color_srgb', out[lv].ravel())
    me.color_attributes.active_color = col
    return col


# ---------------------------------------------------------------- islands / rig hygiene
def islands(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
    seen, out = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, isl = [v], []; seen.add(v.index)
        while stack:
            x = stack.pop(); isl.append(x.index)
            for e in x.link_edges:
                o = e.other_vert(x)
                if o.index not in seen:
                    seen.add(o.index); stack.append(o)
        out.append(isl)
    bm.free()
    return out


def rebind_islands(obj, bone='head', keep_largest=True):
    """Automatic (heat) weights only bind the connected surface: separate islands (eyes, glints,
    horns) float away in motion. Rebind every island except the largest 100% to `bone`."""
    isl = islands(obj)
    big = max(isl, key=len)
    small = [i for s in isl if (s is not big or not keep_largest) for i in s]
    for g in obj.vertex_groups:
        g.remove(small)
    obj.vertex_groups[bone].add(small, 1.0, 'REPLACE')
    return len(isl), len(small)


def weight_hygiene(obj):
    """glTF: <= 4 influences, normalised (heat weights sum to 1.0000004 and fail mesh.validate)."""
    activate(obj); bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.vertex_group_clean(group_select_mode='ALL', limit=0.01)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


# ---------------------------------------------------------------- review renders
def three_point(target_size=2.0, key=(3, -3, 4), key_energy=320, fill_scale=0.35, rim_scale=0.5):
    """Three area lights scaled by target size^2 (energy is per area), aimed at the origin. 320 W at
    size 2 reads correctly exposed with view_transform Standard (900 W washed the ramp's lights out)."""
    out = []
    s = target_size
    for nm, loc, e in (('Key', Vector(key) * s / 2, key_energy), ('Fill', Vector((-3, -2, 2)) * s / 2, key_energy * fill_scale), ('Rim', Vector((-1, 4, 3)) * s / 2, key_energy * rim_scale)):
        L = bpy.data.lights.new(nm, 'AREA'); L.energy = e * s * s / 4; L.size = 1.5 * s
        o = bpy.data.objects.new(nm, L); bpy.context.scene.collection.objects.link(o); o.location = loc
        o.rotation_euler = (-loc).to_track_quat('-Z', 'Y').to_euler(); out.append(o)
    return out


def camera_fit(objects, azimuth_deg=35.0, elevation_deg=25.0, ortho=True, margin=1.12, res=512):
    """Fit a camera to the PROJECTED bounding-box corners of objects (not the bounding sphere)."""
    sc = bpy.context.scene
    cam = sc.camera
    if cam is None or cam.name != 'orbkin_cam':
        cd = bpy.data.cameras.new('orbkin_cam'); cam = bpy.data.objects.new('orbkin_cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    cd = cam.data; cd.type = 'ORTHO' if ortho else 'PERSP'; cd.clip_end = 200
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))  # camera -> subject
    rot = (-d).to_track_quat('-Z', 'Y')
    right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    xs = [p.dot(right) for p in pts]; ys = [p.dot(up) for p in pts]; zs = [p.dot(d) for p in pts]
    span = max(max(xs) - min(xs), max(ys) - min(ys)) * margin
    mid = right * ((max(xs) + min(xs)) / 2) + up * ((max(ys) + min(ys)) / 2) + d * ((max(zs) + min(zs)) / 2)
    dist = max(span * 2.5, 5.0)
    cam.location = mid + d * dist; cam.rotation_euler = rot.to_euler()  # d points subject -> camera
    if ortho:
        cd.ortho_scale = span
    else:
        cd.angle = 2 * math.atan((span / 2) / dist)
    sc.render.resolution_x = sc.render.resolution_y = res
    return cam


def render(path, samples=16, denoise=True, res=None, transparent=False, filter_width=1.5):
    """Cycles CPU still (512^2 at 16 spp + OIDN takes 4-6 s on a quiet 4-core box)."""
    sc = bpy.context.scene; r = sc.render
    r.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples
    sc.cycles.use_denoising = denoise
    if denoise:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.cycles.filter_width = filter_width
    r.film_transparent = transparent
    if res:
        r.resolution_x = r.resolution_y = res
    r.filepath = os.path.abspath(path); t = time.perf_counter()
    ops_ok(bpy.ops.render.render(write_still=True), 'render')
    return round(time.perf_counter() - t, 2)


def workbench(path, res=None, color_type='MATERIAL', cavity=True, outline=True, aa='8'):
    """Workbench review still (0.1-1.4 s). Needs EGL (doctor says). color_type: MATERIAL|VERTEX|SINGLE."""
    sc = bpy.context.scene; r = sc.render
    r.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading
    sh.light = 'STUDIO'; sh.color_type = color_type; sh.show_cavity = cavity; sh.cavity_type = 'BOTH'
    sh.cavity_ridge_factor = sh.cavity_valley_factor = 1.5; sh.show_object_outline = outline; sh.show_shadows = True
    sc.display.render_aa = aa; r.film_transparent = False
    if res:
        r.resolution_x = r.resolution_y = res
    r.filepath = os.path.abspath(path); t = time.perf_counter()
    ops_ok(bpy.ops.render.render(write_still=True), 'workbench render')
    return round(time.perf_counter() - t, 2)


def stitch(paths, out, cols=None, tile=None, labels=None):
    """Stitch PNG tiles into one sheet (numpy, via bpy images; no Pillow in desktop Blender)."""
    imgs = [bpy.data.images.load(os.path.abspath(p)) for p in paths]
    w, h = imgs[0].size
    cols = cols or len(imgs); rows = math.ceil(len(imgs) / cols)
    sheet = np.zeros((rows * h, cols * w, 4), np.float32); sheet[..., 3] = 1
    for i, im in enumerate(imgs):
        a = np.array(im.pixels[:], np.float32).reshape(im.size[1], im.size[0], 4)
        if a.shape[:2] != (h, w):
            a = a[:h, :w]
        r_, c_ = divmod(i, cols)
        y0 = (rows - 1 - r_) * h
        sheet[y0:y0 + h, c_ * w:c_ * w + w] = a
        bpy.data.images.remove(im)
    o = bpy.data.images.new('sheet', cols * w, rows * h, alpha=True); o.pixels = sheet.ravel()
    o.filepath_raw = os.path.abspath(out); o.file_format = 'PNG'; o.save(); bpy.data.images.remove(o)
    return out


def contact_sheet(targets, out, views=((90, 0), (0, 0), (45, 25), (160, 20), (0, 89)), res=320, engine='WORKBENCH', color_type='MATERIAL', samples=8):
    """Front / side / 3-4 / back-3-4 / top sheet of `targets` with every OTHER mesh hidden from render
    (otherwise neighbours occlude the fitted view). engine WORKBENCH (needs EGL) or CYCLES (any box)."""
    sc = bpy.context.scene
    others = [o for o in sc.objects if o.type == 'MESH' and o not in targets]
    hidden = [(o, o.hide_render) for o in others]
    for o in others:
        o.hide_render = True
    tiles = []
    base, ext = os.path.splitext(os.path.abspath(out))
    try:
        for i, (az, el) in enumerate(views):
            camera_fit(targets, az, el, ortho=True, res=res)
            p = f'{base}.{i}.png'
            if engine == 'WORKBENCH':
                workbench(p, res=res, color_type=color_type)
            else:
                if not any(o.type == 'LIGHT' for o in sc.objects):
                    three_point(max(bbox(targets[0])[2]))
                render(p, samples=samples, res=res)
            tiles.append(p)
        stitch(tiles, out)
    finally:
        for o, hv in hidden:
            o.hide_render = hv
        for p in tiles:
            try:
                os.remove(p)
            except OSError:
                pass
    return out


# ---------------------------------------------------------------- baking
def new_image(name, size, non_color=True, float_buffer=False):
    im = bpy.data.images.new(name, size, size, alpha=True, float_buffer=float_buffer)
    if non_color:
        im.colorspace_settings.name = 'Non-Color'
    return im


def set_bake_target(mat, image):
    """The bake writes into the ACTIVE Image Texture node of the active object's material."""
    nt = mat.node_tree
    t = nt.nodes.get('bake_target') or nt.nodes.new('ShaderNodeTexImage'); t.name = 'bake_target'; t.image = image
    for n in nt.nodes:
        n.select = False
    t.select = True; nt.nodes.active = t
    return t


def bake(kind, low, image, high=None, samples=16, cage=0.08, max_ray=0.3, margin=4, ao_distance=0.7, pass_filter=None, **kw):
    """Cycles bake to `image` on `low` (selected-to-active from `high` when given).
    Resets the pass toggles first (a DIFFUSE colour bake leaves direct/indirect off and the next
    COMBINED bake is pure black). Rays are world space: high and low must overlap. Returns seconds."""
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples
    bk = sc.render.bake
    bk.use_pass_direct = bk.use_pass_indirect = bk.use_pass_color = True
    bk.margin = margin; bk.margin_type = 'EXTEND'
    bk.use_selected_to_active = high is not None
    bk.cage_extrusion = cage; bk.max_ray_distance = max_ray; bk.use_cage = False
    if sc.world is None:
        oc.new_world(1.0, (1, 1, 1))
    sc.world.light_settings.distance = ao_distance
    set_bake_target(low.data.materials[0], image)
    activate(low)
    if high is not None:
        for h in (high if isinstance(high, (list, tuple)) else [high]):
            h.select_set(True)
        bpy.context.view_layer.objects.active = low
    t = time.perf_counter()
    args = dict(type=kind, **kw)
    if pass_filter:
        args['pass_filter'] = set(pass_filter)
    ops_ok(bpy.ops.object.bake(**args), f'bake {kind}')
    return round(time.perf_counter() - t, 2)


def save_image(image, path):
    """Bakes are NOT saved automatically."""
    image.filepath_raw = os.path.abspath(path); image.file_format = 'PNG'; image.save()
    return path


def bake_vertex_ao(obj, samples=32, ao_distance=0.7, attr='AO'):
    """AO into a CORNER BYTE_COLOR attribute: no UVs, no texture (rocks, props)."""
    me = obj.data
    col = me.color_attributes.get(attr) or me.color_attributes.new(attr, 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = col
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = samples
    bk = sc.render.bake; bk.target = 'VERTEX_COLORS'; bk.use_selected_to_active = False
    if sc.world is None:
        oc.new_world(1.0, (1, 1, 1))
    sc.world.light_settings.distance = ao_distance
    activate(obj); ops_ok(bpy.ops.object.bake(type='AO'), 'bake AO vertex')
    bk.target = 'IMAGE_TEXTURES'
    return col


def denoise_image(image, out_path):
    """OIDN through the 5.x compositor (Image -> Denoise -> output) for AO bakes."""
    sc = bpy.context.scene
    nt = oc.compositor_tree(sc)
    nt.nodes.clear()
    i = nt.nodes.new('CompositorNodeImage'); i.image = image
    d = nt.nodes.new('CompositorNodeDenoise')
    if 'HDR' in d.inputs:  # 5.2: HDR/Prefilter/Quality are sockets, not properties (api.py node CompositorNodeDenoise)
        d.inputs['HDR'].default_value = False
    o = nt.nodes.new('NodeGroupOutput') if nt.bl_idname == 'CompositorNodeTree' and hasattr(nt, 'interface') and not nt.nodes.get('Composite') else nt.nodes.new('CompositorNodeComposite')
    nt.links.new(i.outputs[0], d.inputs['Image'])
    try:
        nt.links.new(d.outputs[0], o.inputs[0])
    except Exception:
        pass
    r = sc.render; r.use_compositing = True
    rx, ry = r.resolution_x, r.resolution_y
    r.resolution_x, r.resolution_y = image.size; r.resolution_percentage = 100
    old_engine = r.engine; r.engine = 'BLENDER_WORKBENCH'
    r.filepath = os.path.abspath(out_path)
    vt = sc.view_settings.view_transform; sc.view_settings.view_transform = 'Standard'
    ops_ok(bpy.ops.render.render(write_still=True), 'compositor denoise')
    sc.view_settings.view_transform = vt; r.engine = old_engine; r.resolution_x, r.resolution_y = rx, ry; r.use_compositing = False
    return out_path
