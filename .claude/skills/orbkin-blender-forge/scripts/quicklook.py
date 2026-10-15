"""quicklook: 5-view contact sheet (front, side, 3/4, back 3/4, top) of objects in a .blend or a GLB.

  "$ORBKIN_BPY" -I quicklook.py -- in.blend --out sheet.png [--objects Low,Floor] [--engine WORKBENCH|CYCLES]
        [--res 320] [--image atlas.png] [--color MATERIAL|VERTEX|TEXTURE|SINGLE] [--samples 8] [--views front,side,q34,back34,top]
  "$ORBKIN_BPY" -I quicklook.py -- piece.glb --out sheet.png --engine CYCLES
--image applies a pixel atlas (nearest filtering) to the chosen objects' UVs before rendering, so you
see the composed texture on the form (Workbench --color TEXTURE, or Cycles). Other meshes are hidden
from render while shooting (they occlude the fitted camera). Workbench needs EGL (doctor says);
Cycles works everywhere (8 spp + OIDN at 320 px takes about 1 s per view). The sheet is a review
tool: look at it with the Read tool after every geometry or material change.
"""
import bpy, sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit, orbkin_compat as oc

VIEWS = {'front': (0, 0), 'side': (90, 0), 'q34': (45, 25), 'back34': (160, 20), 'top': (0, 89), 'game': (20, 30)}

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
import argparse
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('src'); ap.add_argument('--out', required=True); ap.add_argument('--objects', default='')
ap.add_argument('--engine', default='WORKBENCH'); ap.add_argument('--res', type=int, default=320); ap.add_argument('--image')
ap.add_argument('--color', default=None); ap.add_argument('--samples', type=int, default=8); ap.add_argument('--views', default='front,side,q34,back34,top')
a = ap.parse_args(argv)
t0 = time.perf_counter()
if a.src.lower().endswith(('.glb', '.gltf')):
    oc.fresh_scene()
    oc.ops_ok(bpy.ops.import_scene.gltf(filepath=os.path.abspath(a.src)), 'import gltf')
else:
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.src))
oc.deterministic_png()
sc = bpy.context.scene
names = [n for n in a.objects.split(',') if n]
targets = [bpy.data.objects[n] for n in names] if names else [o for o in sc.objects if o.type == 'MESH' and not o.hide_render]
color = a.color or ('TEXTURE' if a.image else 'MATERIAL')
if a.image:
    img = bpy.data.images.load(os.path.abspath(a.image))
    img.colorspace_settings.name = 'sRGB'
    for o in targets:
        m = kit.pbr(f'{o.name}_atlas', '#ffffff', image=img)
        o.data.materials.clear(); o.data.materials.append(m)
views = [VIEWS[v] for v in a.views.split(',')]
kit.contact_sheet(targets, a.out, views=views, res=a.res, engine=a.engine.upper(), color_type=color, samples=a.samples)
print(json.dumps({'out': a.out, 'objects': [o.name for o in targets], 'engine': a.engine, 'seconds': round(time.perf_counter() - t0, 2), 'load_avg': oc.loadavg()}))
