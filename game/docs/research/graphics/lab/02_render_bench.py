"""Lab 02 - render engines headless on 4 CPU cores, no GPU: Cycles / EEVEE / Workbench / Freestyle.

Run:  $BPY 02_render_bench.py [quick]
Needs: out/labkin.blend (from lab_creature.py game). For EEVEE/Workbench: apt mesa EGL
(libegl1 libegl-mesa0 libgl1-mesa-dri libgbm1) - Blender 5.x renders through EGL+llvmpipe.
Writes out/02_*.png, out/02_render_bench.json.
"""
import bpy, os, sys, time, json, math
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out')
QUICK = 'quick' in sys.argv
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, 'labkin.blend'))
sc = bpy.context.scene
kin = bpy.data.objects['LabKin']
res = []


def log(**kw):
    kw['load'] = round(os.getloadavg()[0], 2)
    res.append(kw); print(json.dumps(kw), flush=True)


# ---------- stage: rock pedestal + ground, three-point light, world
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1.0, location=(0, 0, -0.55))
rock = bpy.context.object; rock.name = 'Pedestal'; rock.scale = (1.5, 1.3, 0.62)
tex = bpy.data.textures.new('rockn', 'VORONOI'); tex.noise_scale = 0.5
d = rock.modifiers.new('d', 'DISPLACE'); d.texture = tex; d.strength = 0.12
rmat = bpy.data.materials.new('rock'); rmat.use_nodes = True
rb = rmat.node_tree.nodes['Principled BSDF']; rb.inputs['Base Color'].default_value = (0.32, 0.30, 0.28, 1); rb.inputs['Roughness'].default_value = 0.9
rock.data.materials.append(rmat)
bpy.ops.mesh.primitive_circle_add(vertices=64, radius=6, fill_type='NGON', location=(0, 0, -0.9))
gnd = bpy.context.object; gm = bpy.data.materials.new('gnd'); gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.25, 0.32, 0.2, 1)
gnd.data.materials.append(gm)
for o in (rock, gnd):
    o.color = (0.4, 0.4, 0.4, 1)


def area(name, loc, energy, size, color):
    L = bpy.data.lights.new(name, 'AREA'); L.energy = energy; L.size = size; L.color = color
    o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0.9)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o


area('Key', (3.5, -3.0, 4.0), 900, 2.5, (1.0, 0.92, 0.8))
area('Rim', (-3.0, 3.0, 3.0), 600, 1.5, (0.7, 0.8, 1.0))
area('Fill', (-2.5, -4.0, 1.5), 200, 4.0, (0.9, 0.85, 1.0))
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.18, 0.2, 0.26, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
cd = bpy.data.cameras.new('cam'); cd.lens = 70
cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (6.0, -7.0, 3.6)
cam.rotation_euler = (Vector((0.15, 0, 0.75)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast' if 'AgX - Medium High Contrast' in [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties['look'].enum_items] else 'None'

# pivot for turntable
piv = bpy.data.objects.new('pivot', None); sc.collection.objects.link(piv)
kin.parent = piv


def render(path, engine, size, **opts):
    sc.render.engine = engine
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    sc.render.filepath = os.path.join(OUT, path)
    t = time.perf_counter(); bpy.ops.render.render(write_still=True); dt = time.perf_counter() - t
    log(test=path, engine=engine, size=size, seconds=round(dt, 2), **opts)
    return dt


# ---------- Cycles
sc.cycles.device = 'CPU'
sc.render.threads_mode = 'AUTO'
sc.cycles.use_adaptive_sampling = True
sc.cycles.use_denoising = True
dn = [i.identifier for i in sc.cycles.bl_rna.properties['denoiser'].enum_items]
sc.cycles.denoiser = 'OPENIMAGEDENOISE'  # enum is dynamic (empty statically); OIDN is the CPU default
sc.cycles.max_bounces = 4
grid = [(512, 16), (512, 64), (1024, 32), (1024, 128)] if QUICK else [(512, 16), (512, 32), (512, 64), (512, 128), (1024, 32), (1024, 64), (1024, 128)]
for size, spp in grid:
    sc.cycles.samples = spp
    render(f'02_cycles_{size}_{spp}.png', 'CYCLES', size, spp=spp, denoise=sc.cycles.denoiser)
sc.cycles.use_denoising = False; sc.cycles.samples = 64
render('02_cycles_512_64_nodenoise.png', 'CYCLES', 512, spp=64, denoise='off')
sc.cycles.use_denoising = True

# turntable: 8 frames x 45deg at 512, 32 spp, with/without persistent data
sc.cycles.samples = 32
sc.frame_start, sc.frame_end = 1, 8
bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'
piv.rotation_euler = (0, 0, 0); piv.keyframe_insert('rotation_euler', index=2, frame=1)
piv.rotation_euler = (0, 0, math.radians(315)); piv.keyframe_insert('rotation_euler', index=2, frame=8)
for persist in (False, True):
    sc.render.use_persistent_data = persist
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.filepath = os.path.join(OUT, f'02_turn_p{int(persist)}_')
    sc.render.engine = 'CYCLES'
    t = time.perf_counter(); bpy.ops.render.render(animation=True); dt = time.perf_counter() - t
    log(test='turntable 8f 512 32spp', engine='CYCLES', persistent_data=persist, seconds=round(dt, 2), per_frame=round(dt / 8, 2))
sc.render.use_persistent_data = False
sc.frame_set(1)

# ---------- Freestyle on Cycles
sc.render.use_freestyle = True
vl = sc.view_layers[0]; vl.use_freestyle = True
fs = vl.freestyle_settings
ls = fs.linesets[0] if fs.linesets else fs.linesets.new('LS')
ls.select_by_visibility = True; ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True
if ls.linestyle is None:
    ls.linestyle = bpy.data.linestyles.new('LS')
ls.linestyle.thickness = 2.0; ls.linestyle.color = (0.08, 0.04, 0.05)
sc.render.line_thickness_mode = 'ABSOLUTE'
sc.cycles.samples = 32
render('02_cycles_512_32_freestyle.png', 'CYCLES', 512, spp=32, freestyle=True)
sc.render.use_freestyle = False

# ---------- Workbench
sh = sc.display.shading
sh.light = 'STUDIO'; sh.color_type = 'VERTEX'; sh.show_shadows = True; sh.show_cavity = True; sh.cavity_type = 'BOTH'
sh.show_object_outline = True
sc.display.render_aa = '8'
for size in (512, 1024):
    try:
        render(f'02_workbench_{size}.png', 'BLENDER_WORKBENCH', size, aa='8')
    except Exception as ex:
        log(test=f'workbench {size}', engine='BLENDER_WORKBENCH', error=repr(ex))

# ---------- EEVEE (Next)
eng = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
ev = sc.eevee
for size, samples in [(512, 16), (512, 16), (512, 64), (1024, 16)] if not QUICK else [(512, 16), (512, 16)]:
    try:
        ev.taa_render_samples = samples
        if hasattr(ev, 'use_shadows'):
            ev.use_shadows = True
        if hasattr(ev, 'use_raytracing'):
            ev.use_raytracing = False
        render(f'02_eevee_{size}_{samples}.png', eng, size, samples=samples)
    except Exception as ex:
        log(test=f'eevee {size}', engine=eng, error=repr(ex))
json.dump(res, open(os.path.join(OUT, '02_render_bench.json'), 'w'), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, '02_stage.blend'))
