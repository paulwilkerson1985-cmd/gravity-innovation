"""Lab 08c - render 12 consecutive Idle frames (native vs SS4) of the rigged LabKin as pixel-art sprite sources in Blender (headless).

Run:  $BPY 08_sprite_render.py           -> out/08/raw_*.png + out/08/sprite_times.json
Variants per target height H (48, 96 px):
  toon_native   EEVEE, emission toon (half-Lambert -> constant 4-tone ramp, hue-shifted), H px, no AA
  toon_ss4      same at 4H px (post: dominant-colour downsample, see 08_sprite_post.py)
  cycles_ss4    Cycles beauty (3-point light, 32 spp + OIDN) at 4H px (post: box downsample + palette)
  wb_native     Workbench flat + matcap-free studio light at H px, AA off
Camera: orthographic, 30 deg elevation, 3/4 yaw, frame fitted to the pose's bounding box (feet anchored).
Technique credits: pseudo-pixel (MIT, github.com/craigrusselltiu/pseudo-pixel) sprite.py/post.py;
Dead Cells 3D->2D pipeline (gamedeveloper.com art deep dive).
"""
import bpy, os, sys, math, time, json
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out', '08')
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'out', '04_labkin_rigged.blend'))
sc = bpy.context.scene
kin = bpy.data.objects['LabKin']; arm = bpy.data.objects['KinRig']
# pose: Idle at frame 13 (via NLA)
sc.frame_set(13)
times = {}

# ---------------------------------------------------------------- camera
YAW, ELEV = 35.0, 30.0
cd = bpy.data.cameras.new('spr'); cd.type = 'ORTHO'
cam = bpy.data.objects.new('spr', cd); sc.collection.objects.link(cam); sc.camera = cam
d = Vector((math.cos(math.radians(ELEV)) * math.sin(math.radians(YAW)),
            -math.cos(math.radians(ELEV)) * math.cos(math.radians(YAW)),
            math.sin(math.radians(ELEV))))
dg = bpy.context.evaluated_depsgraph_get()
ev = kin.evaluated_get(dg); me = ev.to_mesh()
pts = [kin.matrix_world @ v.co for v in me.vertices]
ev.to_mesh_clear()
rot = (-d).to_track_quat('-Z', 'Y')
right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
xs = [p.dot(right) for p in pts]; ys = [p.dot(up) for p in pts]
ctr = sum(pts, Vector()) / len(pts)
span_x, span_y = max(xs) - min(xs), max(ys) - min(ys)
cd.ortho_scale = max(span_x, span_y) * 1.12
mid = right * ((max(xs) + min(xs)) / 2) + up * ((max(ys) + min(ys)) / 2)
cam.location = mid + d * 20 - d * d.dot(mid) + d * d.dot(ctr)
cam.rotation_euler = rot.to_euler()
cd.clip_end = 60

# ---------------------------------------------------------------- toon material (emission, no lights needed)
L = Vector((-0.5, -0.6, 0.8)).normalized()   # world-space key direction (upper left, toward camera)
toon = bpy.data.materials.new('toon'); nt = toon.node_tree; nt.nodes.clear()
N = nt.nodes.new
geo = N('ShaderNodeNewGeometry')
dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; dot.inputs[1].default_value = L
half = N('ShaderNodeMath'); half.operation = 'MULTIPLY_ADD'; half.inputs[1].default_value = 0.5; half.inputs[2].default_value = 0.5
ramp = N('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
els = ramp.color_ramp.elements
# 4 shade tones: cool purple shadow -> neutral -> lit -> warm highlight (multiplied onto base colour)
tones = [(0.00, (0.42, 0.36, 0.55)), (0.38, (0.70, 0.66, 0.78)), (0.58, (1.0, 0.98, 0.96)), (0.86, (1.18, 1.10, 0.95))]
while len(els) < len(tones):
    els.new(0.5)
for e, (pos, c) in zip(els, tones):
    e.position = pos; e.color = (*c, 1)
col = N('ShaderNodeVertexColor'); col.layer_name = 'Col'
mul = N('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
emit = N('ShaderNodeEmission'); outn = N('ShaderNodeOutputMaterial')
lk = nt.links.new
lk(geo.outputs['Normal'], dot.inputs[0]); lk(dot.outputs['Value'], half.inputs[0]); lk(half.outputs[0], ramp.inputs['Fac'])
lk(col.outputs['Color'], mul.inputs[6]); lk(ramp.outputs['Color'], mul.inputs[7])
lk(mul.outputs[2], emit.inputs['Color']); lk(emit.outputs[0], outn.inputs['Surface'])
orig_mat = kin.data.materials[0]

r = sc.render
r.film_transparent = True
r.filter_size = 0.0
r.dither_intensity = 0.0
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
w = bpy.data.worlds.new('w'); sc.world = w
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0


def shot(name, engine, h):
    r.engine = engine
    r.resolution_x = r.resolution_y = h
    r.filepath = os.path.join(OUT, f'raw_{name}.png')
    t0 = time.perf_counter(); bpy.ops.render.render(write_still=True)
    times[name] = round(time.perf_counter() - t0, 2); print(name, times[name], flush=True)


eng = 'BLENDER_EEVEE'
sc.eevee.taa_render_samples = 1
kin.data.materials[0] = toon
H = 48
os.makedirs(os.path.join(OUT, 'flicker'), exist_ok=True)
t0 = time.perf_counter()
for f in range(1, 13):
    sc.frame_set(f)
    for nm, hh in (('native', H), ('ss4', H * 4)):
        r.engine = eng; r.resolution_x = r.resolution_y = hh
        r.filepath = os.path.join(OUT, 'flicker', f'{nm}_{f:02d}.png')
        bpy.ops.render.render(write_still=True)
print('flicker renders', round(time.perf_counter() - t0, 2), 's for 24 frames', flush=True)
