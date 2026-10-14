"""Lab 09 - Grease Pencil Line Art (GPv3, Blender 4.3+) as an alternative to Freestyle, headless.
Run: $BPY 09_lineart.py  -> out/09/lineart_<engine>.png"""
import bpy, os, time
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out', '09'); os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'out', '02_stage.blend'))
sc = bpy.context.scene
sc.frame_set(1)
t0 = time.perf_counter()
ops = [o for o in dir(bpy.ops.object) if 'grease' in o]
print('gp ops', ops)
bpy.ops.object.grease_pencil_add(type='LINEART_SCENE')
gp = bpy.context.object
print('gp object', gp.type, [m.type for m in gp.modifiers])
la = gp.modifiers[0]
# GPv3: line width is 'radius' in WORLD units (default 0.0025 = sub-pixel here); thickness no longer exists
for attr, val in (('radius', 0.012), ('use_intersection', True), ('use_crease', True), ('crease_threshold', 2.3)):
    if hasattr(la, attr):
        setattr(la, attr, val)
print('setup', round(time.perf_counter() - t0, 2))
for eng in ('BLENDER_WORKBENCH', 'BLENDER_EEVEE', 'CYCLES'):
    sc.render.engine = eng
    sc.render.resolution_x = sc.render.resolution_y = 512
    if eng == 'CYCLES':
        sc.cycles.samples = 16
    sc.render.filepath = os.path.join(OUT, f'lineart_{eng}.png')
    t0 = time.perf_counter()
    try:
        bpy.ops.render.render(write_still=True); print(eng, 'ok', round(time.perf_counter() - t0, 2), 's', flush=True)
    except Exception as e:
        print(eng, 'FAIL', e)
