"""Lab 03 - texture baking by script (Cycles CPU): high-poly detail -> game mesh.

Run:  $BPY 03_bake.py [512|1024]
Builds LabKin twice (high = voxel 137k tris with surface detail, low = QuadriFlow ~5.8k tris),
unwraps the low (smart_project + pack), then bakes, timing each:
  NORMAL (tangent, selected->active, cage extrusion), AO (selected->active), DIFFUSE colour
  (vertex colours -> texture), ROUGHNESS, and a 'lit' COMBINED bake (lighting baked into albedo).
Writes out/03_bake_<res>/*.png and out/03_bake.json, then out/03_labkin_baked.blend.
"""
import bpy, os, sys, time, json, math
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out')
sys.path.insert(0, HERE)
from lab_creature import build_creature, _activate
RES = int(sys.argv[-1]) if sys.argv[-1].isdigit() else 1024
D = os.path.join(OUT, f'03_bake_{RES}'); os.makedirs(D, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
times = {}


def T(k, t0):
    times[k] = round(time.perf_counter() - t0, 2); print(k, times[k], 's', flush=True)


t0 = time.perf_counter()
high, ih = build_creature('high', name='High')
# surface detail only on the high: fine noise displacement (scales/fur clumps) -> shows up in normal bake
tex = bpy.data.textures.new('detail', 'VORONOI'); tex.noise_scale = 0.06; tex.distance_metric = 'DISTANCE'
dm = high.modifiers.new('detail', 'DISPLACE'); dm.texture = tex; dm.strength = 0.012; dm.texture_coords = 'OBJECT'
_activate(high); bpy.ops.object.modifier_apply(modifier='detail')
low, il = build_creature('game', name='Low')
T('build high+low', t0)

# ---- UV unwrap low
t0 = time.perf_counter()
_activate(low)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
bpy.ops.uv.pack_islands(margin=0.004, rotate=True)
bpy.ops.object.mode_set(mode='OBJECT')
T('uv smart_project+pack', t0)

# ---- bake target images + material on the LOW
imgs = {}
for k, non_color in [('normal', True), ('ao', True), ('albedo', False), ('lit', False)]:
    im = bpy.data.images.new(f'Low_{k}', RES, RES, alpha=False, float_buffer=False)
    if non_color:
        im.colorspace_settings.name = 'Non-Color'
    imgs[k] = im
mat = low.data.materials[0]
nt = mat.node_tree
tnode = nt.nodes.new('ShaderNodeTexImage')


def target(k):
    tnode.image = imgs[k]
    for n in nt.nodes:
        n.select = False
    tnode.select = True; nt.nodes.active = tnode


sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
bk = sc.render.bake
bk.margin = 8; bk.margin_type = 'EXTEND'


def bake(kind, key, sel2act=True, samples=1, **kw):
    target(key)
    sc.cycles.samples = samples
    bk.use_selected_to_active = sel2act
    bk.cage_extrusion = 0.03; bk.max_ray_distance = 0.08
    if sel2act:
        _activate(low); high.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active = low
    else:
        _activate(low)
    t0 = time.perf_counter()
    bpy.ops.object.bake(type=kind, **kw)
    T(f'bake {key} {kind} spp={samples}', t0)
    imgs[key].filepath_raw = os.path.join(D, f'{key}.png'); imgs[key].file_format = 'PNG'; imgs[key].save()


# high must be renderable & visible for selected->active
bake('NORMAL', 'normal', True, 1, normal_space='TANGENT')
bake('AO', 'ao', True, 64)
# diffuse colour from the HIGH's vertex colours (no lighting)
bk.use_pass_direct = False; bk.use_pass_indirect = False; bk.use_pass_color = True
bake('DIFFUSE', 'albedo', True, 1, pass_filter={'COLOR'})
# lit bake: add lights + world, bake COMBINED from the low itself (light baked into texture)
for nm, loc, e in [('Key', (3, -3, 4), 800), ('Rim', (-3, 3, 3), 400)]:
    L = bpy.data.lights.new(nm, 'AREA'); L.energy = e; L.size = 2
    o = bpy.data.objects.new(nm, L); sc.collection.objects.link(o); o.location = loc
    from mathutils import Vector
    o.rotation_euler = (Vector((0, 0, 1)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
w = bpy.data.worlds.new('w'); sc.world = w
w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
high.hide_render = True
# PITFALL: the DIFFUSE colour bake above turned direct/indirect off; COMBINED obeys the same pass
# toggles, so without this the lit bake is pure black.
bk.use_pass_direct = bk.use_pass_indirect = bk.use_pass_color = True
bake('COMBINED', 'lit', False, 32)
high.hide_render = False

# ---- wire baked maps into the low's material (glTF-friendly)
bsdf = nt.nodes['Principled BSDF']
for l in list(bsdf.inputs['Base Color'].links):
    nt.links.remove(l)
alb = nt.nodes.new('ShaderNodeTexImage'); alb.image = imgs['albedo']
nt.links.new(alb.outputs['Color'], bsdf.inputs['Base Color'])
nrm = nt.nodes.new('ShaderNodeTexImage'); nrm.image = imgs['normal']
nmap = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(nrm.outputs['Color'], nmap.inputs['Color'])
nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
nt.nodes.remove(tnode)
json.dump(dict(res=RES, times=times, high=ih, low=il), open(os.path.join(OUT, f'03_bake_{RES}.json'), 'w'), indent=1)
bpy.data.objects.remove(high)
for o in list(sc.objects):
    if o.type == 'LIGHT':
        bpy.data.objects.remove(o)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'03_labkin_baked_{RES}.blend'))
print(json.dumps(times))
