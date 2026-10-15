"""Capability probe for the Blender python. Prints one line: ORBKIN_SMOKE {json}.

Run:  "$ORBKIN_BPY" -I bpy_smoke.py [--full]
Checks: bpy version, Cycles CPU render (64 px), Workbench render (needs EGL), SDF geometry nodes,
glTF export, OIDN denoiser, numpy. --full also times a 256 px Cycles render at 16 spp + OIDN.
Exit 0 when Cycles + glTF work (the minimum the skill needs), 1 otherwise.
"""
import sys; sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; keep __pycache__ out of the repo
import json, sys, time, os, tempfile
try:
    import bpy, numpy
except Exception as e:  # pragma: no cover
    print('ORBKIN_SMOKE', json.dumps({'ok': False, 'error': f'import failed: {e}'})); sys.exit(1)
full = '--full' in sys.argv
r = {'blender': bpy.app.version_string, 'numpy': numpy.__version__}
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.mesh.primitive_cube_add()
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
cam.location = (4, -4, 3); cam.rotation_euler = (1.1, 0, 0.78); sc.camera = cam
tmp = tempfile.mkdtemp(prefix='orbkin-smoke-')
sc.render.resolution_x = sc.render.resolution_y = 256 if full else 64
for eng, key in (('CYCLES', 'cycles'), ('BLENDER_WORKBENCH', 'workbench')):
    sc.render.engine = eng
    if eng == 'CYCLES':
        sc.cycles.device = 'CPU'; sc.cycles.samples = 16 if full else 2
        sc.cycles.use_denoising = full
        if full:
            sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    t = time.perf_counter()
    try:
        sc.render.filepath = os.path.join(tmp, key + '.png')
        bpy.ops.render.render(write_still=True)
        r[key] = {'ok': True, 'seconds': round(time.perf_counter() - t, 2)}
    except Exception as e:
        r[key] = {'ok': False, 'error': str(e)[:160]}
r['gpu_backend'] = 'unknown'
try:
    import gpu
    r['gpu_backend'] = f"{gpu.platform.backend_type_get()} {gpu.platform.renderer_get()}"
except Exception as e:
    r['gpu_backend'] = f'none ({str(e)[:60]})'
gn = [t for t in dir(bpy.types) if t.startswith('GeometryNode')]
r['geometry_nodes'] = len(gn); r['sdf_nodes'] = sum('SDF' in t for t in gn)
try:
    r['gltf'] = {'ok': bpy.ops.export_scene.gltf(filepath=os.path.join(tmp, 'cube.glb'), export_format='GLB') == {'FINISHED'}}
except Exception as e:
    r['gltf'] = {'ok': False, 'error': str(e)[:160]}
r['exporter_meshopt'] = os.path.exists(os.path.join(os.path.dirname(bpy.__file__), 'lib', 'libbf_intern_meshopt_bridge.so'))
r['ok'] = bool(r.get('cycles', {}).get('ok') and r.get('gltf', {}).get('ok'))
try:
    r['load_avg'] = [round(x, 2) for x in os.getloadavg()]
except Exception:
    pass
print('ORBKIN_SMOKE', json.dumps(r))
sys.exit(0 if r['ok'] else 1)
