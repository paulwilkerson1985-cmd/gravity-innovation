"""Mirror of Blender's mesh_is_manifold_consistent() (object_remesh.cc) to see WHY QuadriFlow refuses a mesh."""
import bpy
def qf_check(me):
    import numpy as np
    nE=len(me.edges); ef=[0]*nE; ev=[-1]*nE; flips=0; over=0
    for l in me.loops:
        e=l.edge_index; ef[e]+=1
        if ef[e]>2: over+=1
        if ev[e]==-1: ev[e]=l.vertex_index
        elif ev[e]==l.vertex_index: flips+=1
    wire=sum(1 for c in ef if c==0)
    co=[v.co for v in me.vertices]
    zero=sum(1 for e in me.edges if (co[e.vertices[0]]-co[e.vertices[1]]).length<=1e-4)
    return dict(over2=over, flips=flips, wire=wire, zero_len=zero)
if __name__=='__main__':
    bpy.ops.wm.open_mainfile(filepath='out/01_modeling_ops.blend')
    src=bpy.data.objects['skin_creature']
    o=src.copy(); o.data=src.data.copy(); bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True)
    o.data.remesh_voxel_size=0.02; bpy.ops.object.voxel_remesh()
    print('after voxel', len(o.data.vertices), qf_check(o.data))
    import bmesh
    bm=bmesh.new(); bm.from_mesh(o.data); bmesh.ops.dissolve_degenerate(bm, dist=2e-4, edges=bm.edges[:]); bm.to_mesh(o.data); bm.free()
    print('after dissolve_degenerate', len(o.data.vertices), qf_check(o.data))
    r=bpy.ops.object.quadriflow_remesh(target_faces=2000); print(r, len(o.data.vertices), len(o.data.polygons))
