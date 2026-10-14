"""Retopology lab on a WATERTIGHT blockout (metaball creature).
Compares: voxel high -> QuadriFlow (prescale trick) | Instant Meshes (pynanoinstantmeshes) | MeshLab quadric | Blender decimate.
Output: out/01_retopo_compare.png + stats printed."""
import bpy, bmesh, math, os, sys, time, numpy as np
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qf_robust import quadriflow
from qf_check import qf_check
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
def activate(o):
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True)
def stats(o):
    bm = bmesh.new(); bm.from_mesh(o.data)
    r = dict(faces=len(o.data.polygons), quads=sum(1 for f in bm.faces if len(f.verts) == 4),
             boundary=sum(1 for e in bm.edges if e.is_boundary), nonmanifold=sum(1 for e in bm.edges if not e.is_manifold))
    bm.free(); return r
# --- metaball creature: body, head, snout, ears, 4 legs, tail (capsules)
mb = bpy.data.metaballs.new('kin'); mb.resolution = mb.render_resolution = 0.04; mb.threshold = 0.6
def ball(co, r, typ='BALL', size=None, rot=None):
    e = mb.elements.new(type=typ); e.co = co; e.radius = r
    if size: e.size_x, e.size_y, e.size_z = size
    if rot: e.rotation = rot
ball((0, 0, .75), .62, 'ELLIPSOID', (1.25, .85, .8))           # body
ball((.75, 0, 1.25), .5)                                       # head
ball((1.05, 0, 1.12), .28)                                     # snout
for s in (-1, 1):
    ball((.62, .25 * s, 1.62), .2, 'ELLIPSOID', (.6, .4, 1.4))  # ears
    for x in (-.45, .45):
        ball((x, .3 * s, .3), .2, 'CAPSULE', (.0, 1, 1), None)  # legs (capsule along x by default)
ball((-.9, 0, .95), .18, 'CAPSULE', (.35, 1, 1))               # tail
mo = bpy.data.objects.new('kin_mb', mb); sc.collection.objects.link(mo); activate(mo)
t = time.time(); bpy.ops.object.convert(target='MESH'); base = bpy.context.object; base.name = 'blockout'
print('metaball->mesh', round(time.time() - t, 2), stats(base), qf_check(base.data))
activate(base); base.data.remesh_voxel_size = 0.015; t = time.time(); bpy.ops.object.voxel_remesh()
print('voxel high', round(time.time() - t, 2), stats(base), qf_check(base.data))
def dup(name):
    o = base.copy(); o.data = base.data.copy(); o.name = name; sc.collection.objects.link(o); activate(o); return o
rows = []
# QuadriFlow
o = dup('quadriflow'); t = time.time()
try:
    quadriflow(o, 2000); rows.append(('QuadriFlow 2000', o, time.time() - t))
except Exception as ex: print('qf fail', ex)
# Instant Meshes
import pynanoinstantmeshes as pim
base.data.calc_loop_triangles()
V = np.array([v.co[:] for v in base.data.vertices], np.float32); F = np.array([tr.vertices[:] for tr in base.data.loop_triangles], np.uint32)
t = time.time(); Vq, Fq = pim.remesh(V, F, -1, face_count=2000, deterministic=True); dt = time.time() - t
m = bpy.data.meshes.new('im'); m.from_pydata(np.asarray(Vq).tolist(), [], np.asarray(Fq).tolist()); m.validate(); m.update()
o = bpy.data.objects.new('instantmeshes', m); sc.collection.objects.link(o); rows.append(('Instant Meshes 2000', o, dt))
# MeshLab quadric
import pymeshlab
ms = pymeshlab.MeshSet(); ms.add_mesh(pymeshlab.Mesh(V.astype(np.float64), F.astype(np.int32)))
t = time.time(); ms.meshing_decimation_quadric_edge_collapse(targetfacenum=2500, preservenormal=True, preservetopology=True, qualitythr=0.6); dt = time.time() - t
mm = ms.current_mesh(); m = bpy.data.meshes.new('ml'); m.from_pydata(mm.vertex_matrix().tolist(), [], mm.face_matrix().tolist()); m.update()
o = bpy.data.objects.new('meshlab_qec', m); sc.collection.objects.link(o); rows.append(('MeshLab quadric 2500 tris', o, dt))
# Blender decimate
o = dup('decimate'); d = o.modifiers.new('d', 'DECIMATE'); d.ratio = 2500 / sum(len(p.vertices) - 2 for p in o.data.polygons)
t = time.time(); bpy.ops.object.modifier_apply(modifier='d'); rows.append(('Blender decimate 2500 tris', o, time.time() - t))
for label, o, dt in rows: print(f'{label:28s} {dt:6.2f}s', stats(o))
# --- sheet
show = [('voxel high', base)] + [(l, o) for l, o, _ in rows]
sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading
sh.light = 'STUDIO'; sh.color_type = 'OBJECT'; sc.display.render_aa = '8'
for i, (l, o) in enumerate(show):
    bpy.context.view_layer.update()
    o.location.x += i * 3.0; o.color = (.85, .75, .6, 1)
    if o is not base:
        w = o.copy(); w.data = o.data.copy(); sc.collection.objects.link(w); w.color = (.12, .1, .1, 1)
        m = w.modifiers.new('wf', 'WIREFRAME'); m.thickness = 0.008; m.use_even_offset = False
cam_d = bpy.data.cameras.new('c'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = len(show) * 3.0
cam = bpy.data.objects.new('c', cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam.location = ((len(show) - 1) * 1.5, -12, 4.0); cam.rotation_euler = (math.radians(76), 0, math.radians(0))
sc.render.resolution_x = 1800; sc.render.resolution_y = 420
sc.render.filepath = os.path.abspath('out/01_retopo_compare.png'); bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('out/retopo_lab.blend'))
