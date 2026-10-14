"""Lab 01 - which bpy modelling operations work headless here, and how fast.

Run:  $BPY 01_modeling_ops.py           (BPY = scratchpad/bpyenv/bin/python)
Writes: out/01_modeling_ops.json (timings + poly counts) and out/01_ops_sheet.png (Workbench sheet)

Each test builds one object from scratch, applies its modifiers (so the timing includes
evaluation) and records verts/tris. Everything is plain bpy/bmesh, no add-ons.
"""
import bpy, bmesh, time, json, math, os, sys, traceback
from mathutils import Vector, Matrix

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
results = []


def tri_count(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    m = obj.evaluated_get(dg).to_mesh()
    t = sum(len(p.vertices) - 2 for p in m.polygons)
    v = len(m.vertices)
    obj.evaluated_get(dg).to_mesh_clear()
    return v, t


def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def test(name):
    def deco(fn):
        t0 = time.perf_counter()
        try:
            obj = fn()
            if obj is not None:
                apply_all(obj)
                v, t = tri_count(obj)
            else:
                v = t = 0
            dt = time.perf_counter() - t0
            results.append(dict(name=name, ok=True, seconds=round(dt, 3), verts=v, tris=t,
                                obj=obj.name if obj else None))
            print(f"OK   {name:38s} {dt:7.3f}s  v={v} t={t}")
        except Exception as e:
            dt = time.perf_counter() - t0
            results.append(dict(name=name, ok=False, seconds=round(dt, 3), error=repr(e)))
            print(f"FAIL {name:38s} {e!r}")
            traceback.print_exc()
        return fn
    return deco


def new_obj(name, me):
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


# ---------------------------------------------------------------- bmesh
@test("bmesh: icosphere+extrude+inset+bevel")
def _():
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    # extrude every 4th face outward as spikes
    faces = [f for i, f in enumerate(bm.faces) if i % 4 == 0]
    r = bmesh.ops.extrude_discrete_faces(bm, faces=faces)
    for f in r['faces']:
        bmesh.ops.translate(bm, vec=f.normal * 0.25, verts=f.verts)
        bmesh.ops.scale(bm, vec=(0.6, 0.6, 0.6), space=Matrix.Translation(-f.calc_center_median()), verts=f.verts)
    bmesh.ops.inset_region(bm, faces=list(bm.faces)[:40], thickness=0.03, depth=0.02)
    edges = [e for e in bm.edges if e.calc_face_angle(0) > 0.6]
    bmesh.ops.bevel(bm, geom=edges, offset=0.02, segments=2, affect='EDGES', profile=0.5)
    me = bpy.data.meshes.new("bm"); bm.to_mesh(me); bm.free()
    return new_obj("bmesh_spiky", me)


# ---------------------------------------------------------------- modifiers
@test("mod: bevel (3 seg, angle, harden) + weighted normal")
def _():
    bpy.ops.mesh.primitive_cube_add(size=1.6)
    o = bpy.context.object; o.name = "bevel_box"
    b = o.modifiers.new("bev", 'BEVEL'); b.width = 0.08; b.segments = 3; b.limit_method = 'ANGLE'
    b.harden_normals = True
    o.modifiers.new("wn", 'WEIGHTED_NORMAL').keep_sharp = True
    return o


@test("mod: subsurf L3 on cube (apply)")
def _():
    bpy.ops.mesh.primitive_cube_add(size=1.4)
    o = bpy.context.object; o.name = "subsurf"
    s = o.modifiers.new("ss", 'SUBSURF'); s.levels = 3; s.render_levels = 3
    return o


@test("mod: boolean EXACT (3 cylinders diff)")
def _():
    bpy.ops.mesh.primitive_cube_add(size=1.6)
    o = bpy.context.object; o.name = "bool_exact"
    cutters = []
    for ax in range(3):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.5, depth=3)
        c = bpy.context.object; c.rotation_euler[(ax + 1) % 3] = math.pi / 2 if ax else 0
        c.display_type = 'WIRE'; c.hide_render = True; cutters.append(c)
    for c in cutters:
        m = o.modifiers.new("b", 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = c; m.solver = 'EXACT'
    apply_all(o)
    for c in cutters: bpy.data.objects.remove(c)
    return o


@test("mod: boolean FLOAT/fast (same)")
def _():
    bpy.ops.mesh.primitive_cube_add(size=1.6)
    o = bpy.context.object; o.name = "bool_fast"
    cutters = []
    for ax in range(3):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.5, depth=3)
        c = bpy.context.object; c.rotation_euler[(ax + 1) % 3] = math.pi / 2 if ax else 0
        c.hide_render = True; cutters.append(c)
    solvers = [i.identifier for i in bpy.types.BooleanModifier.bl_rna.properties['solver'].enum_items]
    for c in cutters:
        m = o.modifiers.new("b", 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = c
        m.solver = 'FLOAT' if 'FLOAT' in solvers else 'FAST'
    apply_all(o)
    for c in cutters: bpy.data.objects.remove(c)
    print("   boolean solvers:", solvers)
    return o


@test("mod: boolean MANIFOLD solver (5.x)")
def _():
    solvers = [i.identifier for i in bpy.types.BooleanModifier.bl_rna.properties['solver'].enum_items]
    if 'MANIFOLD' not in solvers:
        raise RuntimeError(f"no MANIFOLD solver: {solvers}")
    bpy.ops.mesh.primitive_cube_add(size=1.6)
    o = bpy.context.object; o.name = "bool_manifold"
    cutters = []
    for ax in range(3):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.5, depth=3)
        c = bpy.context.object; c.rotation_euler[(ax + 1) % 3] = math.pi / 2 if ax else 0
        c.hide_render = True; cutters.append(c)
    for c in cutters:
        m = o.modifiers.new("b", 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = c; m.solver = 'MANIFOLD'
    apply_all(o)
    for c in cutters: bpy.data.objects.remove(c)
    return o


@test("mod: skin (creature skeleton) + subsurf L2")
def _():
    # a quadruped-ish skeleton: spine + neck/head + 4 legs + tail
    pts = [(0, 0, 0.8), (0.5, 0, 0.85), (1.0, 0, 0.8), (1.25, 0, 1.15), (1.45, 0, 1.25),  # 0-4 spine/neck/head
           (-0.45, 0, 0.9), (-0.85, 0, 1.1),                                                 # 5-6 tail
           (0.05, 0.3, 0.4), (0.05, 0.32, 0.0), (0.05, -0.3, 0.4), (0.05, -0.32, 0.0),      # 7-10 back legs
           (0.95, 0.3, 0.4), (0.95, 0.32, 0.0), (0.95, -0.3, 0.4), (0.95, -0.32, 0.0)]      # 11-14 front legs
    edges = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (0, 7), (7, 8), (0, 9), (9, 10),
             (2, 11), (11, 12), (2, 13), (13, 14)]
    me = bpy.data.meshes.new("skel"); me.from_pydata(pts, edges, []); me.update()
    o = new_obj("skin_creature", me)
    sk = o.modifiers.new("skin", 'SKIN'); sk.use_smooth_shade = True
    radii = {0: .38, 1: .42, 2: .36, 3: .22, 4: .3, 5: .18, 6: .08, 7: .14, 8: .1, 9: .14, 10: .1,
             11: .13, 12: .09, 13: .13, 14: .09}
    for i, r in radii.items():
        o.data.skin_vertices[0].data[i].radius = (r, r)
    o.data.skin_vertices[0].data[0].use_root = True
    ss = o.modifiers.new("ss", 'SUBSURF'); ss.levels = 2
    return o


@test("mod: REMESH modifier VOXEL 0.02 on skin creature (pitfall)")
def _():
    # PITFALL: the Remesh MODIFIER (use_remove_disconnected=True by default) keeps only one
    # piece of the non-manifold skin output -> 606 verts. The voxel_remesh OPERATOR below works.
    src = bpy.data.objects["skin_creature"]
    o = src.copy(); o.data = src.data.copy(); o.name = "voxel_mod_creature"
    bpy.context.scene.collection.objects.link(o)
    r = o.modifiers.new("rm", 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = 0.02; r.use_smooth_shade = True
    return o


@test("op: voxel_remesh 0.02 on skin creature")
def _():
    src = bpy.data.objects["skin_creature"]
    o = src.copy(); o.data = src.data.copy(); o.name = "voxel_creature"
    bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.data.remesh_voxel_size = 0.02
    bpy.ops.object.voxel_remesh()
    return o


@test("mod: decimate collapse 0.1 on voxel creature")
def _():
    src = bpy.data.objects["voxel_creature"]
    o = src.copy(); o.data = src.data.copy(); o.name = "decimated_creature"
    bpy.context.scene.collection.objects.link(o)
    d = o.modifiers.new("dec", 'DECIMATE'); d.ratio = 0.1
    return o


@test("mod: displace (procedural noise) on subdiv ico")
def _():
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=6, radius=0.9)
    o = bpy.context.object; o.name = "displaced_rock"
    tex = bpy.data.textures.new("n", 'VORONOI'); tex.noise_scale = 0.45
    d = o.modifiers.new("disp", 'DISPLACE'); d.texture = tex; d.strength = 0.25
    tex2 = bpy.data.textures.new("c", 'CLOUDS'); tex2.noise_scale = 0.2
    d2 = o.modifiers.new("disp2", 'DISPLACE'); d2.texture = tex2; d2.strength = 0.06
    dc = o.modifiers.new("dec", 'DECIMATE'); dc.ratio = 0.08
    return o


# ---------------------------------------------------------------- geometry nodes
def gn_tree(name):
    t = bpy.data.node_groups.new(name, 'GeometryNodeTree')
    t.interface.new_socket("Geometry", in_out='INPUT', socket_type='NodeSocketGeometry')
    t.interface.new_socket("Geometry", in_out='OUTPUT', socket_type='NodeSocketGeometry')
    return t, t.nodes.new('NodeGroupInput'), t.nodes.new('NodeGroupOutput')


@test("GN: scatter instances (grid->distribute->instance->realize)")
def _():
    t, gi, go = gn_tree("scatter")
    N = t.nodes.new
    grid = N('GeometryNodeMeshGrid'); grid.inputs['Size X'].default_value = 3; grid.inputs['Size Y'].default_value = 3
    grid.inputs['Vertices X'].default_value = 20; grid.inputs['Vertices Y'].default_value = 20
    dist = N('GeometryNodeDistributePointsOnFaces'); dist.distribute_method = 'POISSON'
    dist.inputs['Distance Min'].default_value = 0.12; dist.inputs['Density Max'].default_value = 60
    ico = N('GeometryNodeMeshIcoSphere'); ico.inputs['Radius'].default_value = 0.05; ico.inputs['Subdivisions'].default_value = 1
    inst = N('GeometryNodeInstanceOnPoints')
    rnd = N('FunctionNodeRandomValue'); rnd.data_type = 'FLOAT_VECTOR'
    rnd.inputs['Min'].default_value = (0.6, 0.6, 0.4); rnd.inputs['Max'].default_value = (1.4, 1.4, 1.2)
    real = N('GeometryNodeRealizeInstances')
    join = N('GeometryNodeJoinGeometry')
    L = t.links.new
    L(grid.outputs['Mesh'], dist.inputs['Mesh'])
    L(dist.outputs['Points'], inst.inputs['Points'])
    L(ico.outputs['Mesh'], inst.inputs['Instance'])
    L(rnd.outputs['Value'], inst.inputs['Scale'])
    L(inst.outputs['Instances'], real.inputs['Geometry'])
    L(real.outputs['Geometry'], join.inputs['Geometry'])
    L(grid.outputs['Mesh'], join.inputs['Geometry'])
    L(join.outputs['Geometry'], go.inputs[0])
    me = bpy.data.meshes.new("gn_host"); o = new_obj("gn_scatter", me)
    o.modifiers.new("gn", 'NODES').node_group = t
    return o


@test("GN: SDF blobs (points->SDF grid->fillet->mesh)")
def _():
    names = {n.bl_rna.identifier for n in bpy.types.GeometryNode.__subclasses__()}
    t, gi, go = gn_tree("sdf")
    N = t.nodes.new
    # points: a short chain of spheres = creature body blob
    pts = N('GeometryNodePoints'); pts.inputs['Count'].default_value = 6
    idx = N('GeometryNodeInputIndex')
    # position = (index*0.22, 0, sin(index)*0.1)
    comb = N('ShaderNodeCombineXYZ')
    m1 = N('ShaderNodeMath'); m1.operation = 'MULTIPLY'; m1.inputs[1].default_value = 0.22
    m2 = N('ShaderNodeMath'); m2.operation = 'SINE'
    m3 = N('ShaderNodeMath'); m3.operation = 'MULTIPLY'; m3.inputs[1].default_value = 0.12
    rad = N('ShaderNodeMath'); rad.operation = 'MULTIPLY_ADD'; rad.inputs[1].default_value = -0.03; rad.inputs[2].default_value = 0.32
    L = t.links.new
    L(idx.outputs[0], m1.inputs[0]); L(m1.outputs[0], comb.inputs['X'])
    L(idx.outputs[0], m2.inputs[0]); L(m2.outputs[0], m3.inputs[0]); L(m3.outputs[0], comb.inputs['Z'])
    L(comb.outputs[0], pts.inputs['Position'])
    L(idx.outputs[0], rad.inputs[0]); L(rad.outputs[0], pts.inputs['Radius'])
    p2s = N('GeometryNodePointsToSDFGrid'); p2s.inputs['Voxel Size'].default_value = 0.02
    L(pts.outputs['Points'], p2s.inputs['Points'])
    fil = N('GeometryNodeSDFGridFillet')
    L(p2s.outputs[0], fil.inputs[0])
    g2m = N('GeometryNodeGridToMesh'); g2m.inputs['Threshold'].default_value = 0.0
    L(fil.outputs[0], g2m.inputs['Grid'])
    L(g2m.outputs['Mesh'], go.inputs[0])
    me = bpy.data.meshes.new("sdf_host"); o = new_obj("gn_sdf", me)
    o.modifiers.new("gn", 'NODES').node_group = t
    return o


@test("GN: count node types available")
def _():
    gn = sorted(n for n in dir(bpy.types) if n.startswith('GeometryNode'))
    sdf = [i for i in gn if 'SDF' in i or 'Grid' in i or 'Volume' in i]
    results.append(dict(name="GN node inventory", count=len(gn), sdf_grid_volume_nodes=sdf))
    print("   GN node types:", len(gn), "SDF/Grid/Volume:", len(sdf))
    return None


# ---------------------------------------------------------------- other ops
@test("op: metaball -> mesh convert")
def _():
    mb = bpy.data.metaballs.new("mb"); mb.resolution = 0.05; mb.render_resolution = 0.05
    o = new_obj("mball", mb)
    for i, (x, z, r) in enumerate([(0, 0, .5), (.45, .15, .35), (-.35, .1, .3), (.7, .45, .25)]):
        e = mb.elements.new(); e.co = (x, 0, z); e.radius = r * 1.6
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


@test("op: voxel 0.02 + quadriflow 2000 on metaball blob (prescale x100 trick)")
def _():
    # QuadriFlow needs a WATERTIGHT single shell: on the skin-modifier output (non-manifold at
    # branch points) the voxel result is fragmented and QuadriFlow ran out of memory (13 GB, OOM-kill).
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from qf_robust import quadriflow
    src = bpy.data.objects[[r for r in results if r['name'].startswith('op: metaball')][0]['obj']]
    o = src.copy(); o.data = src.data.copy(); o.name = "quadriflow_blob"
    bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.data.remesh_voxel_size = 0.02
    bpy.ops.object.voxel_remesh()
    quadriflow(o, 2000)
    return o


@test("op: curve -> mesh (bevelled tube, horn)")
def _():
    cu = bpy.data.curves.new("horn", 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(2)
    for p, co, r in zip(sp.bezier_points, [(0, 0, 0), (0.2, 0, 0.4), (0.05, 0, 0.8)], [1.0, 0.6, 0.05]):
        p.co = co; p.handle_left_type = p.handle_right_type = 'AUTO'; p.radius = r
    cu.bevel_depth = 0.12; cu.bevel_resolution = 3; cu.resolution_u = 8; cu.use_fill_caps = True
    o = new_obj("horn", cu)
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


@test("op: sculpt-like: multires+displace bake to mesh")
def _():
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.8)
    o = bpy.context.object; o.name = "multires"
    m = o.modifiers.new("mr", 'MULTIRES')
    bpy.context.view_layer.objects.active = o
    for _ in range(2):
        bpy.ops.object.multires_subdivide(modifier="mr", mode='CATMULL_CLARK')
    return o


@test("op: sculpt brush stroke (expected to fail headless)")
def _():
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.8)
    o = bpy.context.object; o.name = "sculpt_try"
    try:
        bpy.ops.object.mode_set(mode='SCULPT')
        ok = bpy.ops.sculpt.brush_stroke.poll()
        bpy.ops.object.mode_set(mode='OBJECT')
        if not ok:
            raise RuntimeError("sculpt.brush_stroke poll() False without a window (not attempting: segfaults per earlier notes)")
    except RuntimeError:
        bpy.ops.object.mode_set(mode='OBJECT')
        raise
    return o


@test("op: uv smart_project + pack on quadriflow blob")
def _():
    o = bpy.data.objects["quadriflow_blob"]
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01)
    bpy.ops.uv.pack_islands(margin=0.01)
    bpy.ops.object.mode_set(mode='OBJECT')
    return None


json.dump(results, open(os.path.join(OUT, '01_modeling_ops.json'), 'w'), indent=1)

# --------------------------------------------------------------- contact sheet (Workbench)
show = [r['obj'] for r in results if r.get('ok') and r.get('obj')]
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading
sh.light = 'STUDIO'; sh.color_type = 'OBJECT'; sh.show_cavity = True; sh.cavity_type = 'BOTH'
sh.show_object_outline = True; sh.show_shadows = False
sc.display.render_aa = '8'
cols = 4
pal = [(.85, .55, .35), (.45, .7, .85), (.6, .8, .45), (.85, .75, .4), (.75, .5, .8), (.5, .8, .75)]
for i, n in enumerate(show):
    o = bpy.data.objects[n]
    # normalise size to fit 2 units and lay out on a grid
    dims = max(o.dimensions) or 1
    s = 1.8 / dims
    o.scale = (o.scale[0] * s, o.scale[1] * s, o.scale[2] * s)
    bpy.context.view_layer.update()
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    ctr = sum(bb, Vector()) / 8
    o.location -= ctr
    o.location += Vector(((i % cols) * 2.4, 0, -(i // cols) * 2.4))
    o.color = (*pal[i % len(pal)], 1)
    o.rotation_euler[2] += 0.5
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name not in show:
        o.hide_render = True
rows = (len(show) + cols - 1) // cols
cam_d = bpy.data.cameras.new("cam"); cam_d.type = 'ORTHO'; cam_d.ortho_scale = max(cols, rows) * 2.4
cam = new_obj("cam", cam_d)
cam.location = ((cols - 1) * 1.2, -20, -(rows - 1) * 1.2)
cam.rotation_euler = (math.radians(90), 0, 0)
sc.camera = cam
sc.render.resolution_x = int(1024 * cols / max(cols, rows)); sc.render.resolution_y = int(1024 * rows / max(cols, rows))
sc.render.filepath = os.path.join(OUT, '01_ops_sheet.png')
t0 = time.perf_counter(); bpy.ops.render.render(write_still=True)
print("sheet render", round(time.perf_counter() - t0, 2), "s ->", sc.render.filepath)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, '01_modeling_ops.blend'))
