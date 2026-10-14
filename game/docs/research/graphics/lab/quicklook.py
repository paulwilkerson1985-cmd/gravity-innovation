"""Quick Workbench look at a .blend's mesh objects: front, side, 3/4 (contact sheet). Usage: quicklook.py file.blend out.png"""
import bpy, sys, math, os
from mathutils import Vector
src, outp = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(src))
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'
sh=sc.display.shading; sh.light='STUDIO'; sh.color_type='VERTEX'; sh.show_cavity=True; sh.cavity_type='WORLD'; sh.show_object_outline=True
sc.display.render_aa='8'; sc.render.film_transparent=False
objs=[o for o in sc.objects if o.type=='MESH' and not o.hide_render]
pts=[o.matrix_world@Vector(c) for o in objs for c in o.bound_box]
lo=Vector((min(p.x for p in pts),min(p.y for p in pts),min(p.z for p in pts))); hi=Vector((max(p.x for p in pts),max(p.y for p in pts),max(p.z for p in pts)))
ctr=(lo+hi)/2; size=max(hi-lo)*1.25
cd=bpy.data.cameras.new('ql'); cd.type='ORTHO'; cd.ortho_scale=size
cam=bpy.data.objects.new('ql',cd); sc.collection.objects.link(cam); sc.camera=cam
sc.render.resolution_x=sc.render.resolution_y=360
import numpy as np
tiles=[]
for i,(az,el) in enumerate([(90,0),(0,0),(45,25),(160,20)]):
    d=Vector((math.cos(math.radians(az))*math.cos(math.radians(el)), -math.sin(math.radians(az))*math.cos(math.radians(el))*-1, math.sin(math.radians(el))))
    d=Vector((math.sin(math.radians(az))*math.cos(math.radians(el)), -math.cos(math.radians(az))*math.cos(math.radians(el)), math.sin(math.radians(el))))
    cam.location=ctr+d*10; cam.rotation_euler=(-d).to_track_quat('-Z','Y').to_euler()
    p=os.path.abspath(outp)+f'.{i}.png'; sc.render.filepath=p; bpy.ops.render.render(write_still=True); tiles.append(p)
img=[bpy.data.images.load(p) for p in tiles]
W=360; out=np.zeros((W, W*len(img), 4), np.float32)
for i,im in enumerate(img):
    a=np.array(im.pixels[:],np.float32).reshape(W,W,4); out[:, i*W:(i+1)*W]=a
o=bpy.data.images.new('sheet', W*len(img), W, alpha=True); o.pixels=out.ravel(); o.filepath_raw=os.path.abspath(outp); o.file_format='PNG'; o.save()
for p in tiles: os.remove(p)
print('saved', outp)
