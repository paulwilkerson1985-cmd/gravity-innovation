"""Robust QuadriFlow for voxel-remeshed meshes (Blender 5.2).

Why: QuadriFlow refuses meshes with any edge whose endpoints are within 1e-4 PER COMPONENT
(object_remesh.cc mesh_is_manifold_consistent, compare_v3v3(...,1e-4f)); OpenVDB voxel remesh
almost always leaves a few such slivers. The threshold is absolute, so temporarily scaling the
mesh data x100 makes the check pass without touching topology.
"""
import bpy
from mathutils import Matrix

def quadriflow(obj, target_faces=2000, prescale=100.0, **kw):
    me = obj.data
    me.transform(Matrix.Scale(prescale, 4))
    bpy.context.view_layer.objects.active = obj
    for x in bpy.context.selected_objects: x.select_set(False)
    obj.select_set(True)
    kw.setdefault('use_mesh_symmetry', False)
    kw.setdefault('seed', 0)
    res = bpy.ops.object.quadriflow_remesh(target_faces=target_faces, **kw)
    obj.data.transform(Matrix.Scale(1.0 / prescale, 4))
    obj.data.update(); bpy.context.view_layer.update()  # else obj.dimensions stays stale
    if 'FINISHED' not in res:
        raise RuntimeError(f"QuadriFlow failed: {res}")
    return obj

if __name__ == '__main__':
    import time
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5)
    o = bpy.context.object; o.data.remesh_voxel_size = 0.03; bpy.ops.object.voxel_remesh()
    t = time.time(); quadriflow(o, 500); print('sphere ok', len(o.data.polygons), tuple(round(d, 2) for d in o.dimensions), round(time.time() - t, 2))
    bpy.ops.wm.open_mainfile(filepath='out/01_modeling_ops.blend')
    src = bpy.data.objects['skin_creature']
    for tf in (1000, 2000, 4000):
        p = src.copy(); p.data = src.data.copy(); bpy.context.scene.collection.objects.link(p)
        bpy.context.view_layer.objects.active = p
        p.data.remesh_voxel_size = 0.02; bpy.ops.object.voxel_remesh()
        t = time.time(); quadriflow(p, tf); print('creature', tf, '->', len(p.data.polygons), 'quads', tuple(round(d, 2) for d in p.dimensions), round(time.time() - t, 2), 's')
