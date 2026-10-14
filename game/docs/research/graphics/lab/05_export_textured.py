"""Export the baked LabKin (albedo + normal maps, 1024) as a GLB for the compression lab."""
import bpy, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out')
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, '03_labkin_baked_1024.blend'))
o = bpy.data.objects['Low']
for im in bpy.data.images:
    if im.name.startswith('Low_'):
        im.filepath_raw = os.path.join(OUT, '03_bake_1024', im.name[4:] + '.png'); im.source = 'FILE'; im.reload()
# remove the vertex colour so the exporter does not emit COLOR_0 (texture carries the colour now)
while o.data.color_attributes:
    o.data.color_attributes.remove(o.data.color_attributes[0])
o.data.materials[0].use_backface_culling = True   # -> glTF doubleSided:false
bpy.context.view_layer.objects.active = o
for x in bpy.context.selected_objects: x.select_set(False)
o.select_set(True)
t = time.time()
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, '05_labkin_tex.glb'), export_format='GLB', use_selection=True,
                          export_image_format='AUTO', export_apply=True)
print('export', round(time.time() - t, 2), 's', os.path.getsize(os.path.join(OUT, '05_labkin_tex.glb')) // 1024, 'KB')
