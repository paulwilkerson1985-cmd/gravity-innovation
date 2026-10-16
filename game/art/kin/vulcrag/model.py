"""Vulcrag - rare Flame/Terra single (docs/CREATURES.md): a squat volcano-cone golem, upright, wide base, crater top.

Signature: an erupting crater with a lava pool, glowing magma veins, molten fists, glowing eyes and mouth. Palette:
basalt, magma orange, lava yellow. Built with the Ashkit recipe (a stacked-ball cone chipped into rock facets as
Pebblet); 'battle' key turns the whole body toward the camera. Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(eye_y=0.16, eye_z=0.84, turn=16.0)

BASALT = srgb('#4a4040'); BASALT_D = srgb('#2e2828'); BASALT_L = srgb('#655858'); MAGMA = srgb('#ff6a1a'); LAVA = srgb('#ffd23a')
INK = '#140a08'

# ------------------------------------------------------------------ the cone: a lathed volcano profile (flared base,
# concave flanks, a raised rim around a sunken crater), remeshed, then chipped into rock facets as Pebblet
PROFILE = [(0.0, 0.0), (0.80, 0.0), (0.80, 0.07), (0.70, 0.19), (0.58, 0.37), (0.49, 0.58), (0.43, 0.80), (0.39, 1.00),
           (0.38, 1.10), (0.35, 1.17), (0.29, 1.16), (0.25, 1.07), (0.0, 1.04)]
bmo = bmesh.new(); SEG = 40
rings = [[bmo.verts.new((r * math.cos(2 * math.pi * i / SEG), r * math.sin(2 * math.pi * i / SEG), z)) for i in range(SEG)] if r > 0 else
         [bmo.verts.new((0, 0, z))] for r, z in PROFILE]
for ra, rb in zip(rings, rings[1:]):
    for i in range(SEG):
        j = (i + 1) % SEG
        if len(ra) == 1:
            bmo.faces.new((ra[0], rb[j], rb[i]))
        elif len(rb) == 1:
            bmo.faces.new((ra[i], ra[j], rb[0]))
        else:
            bmo.faces.new((ra[i], ra[j], rb[j], rb[i]))
bmesh.ops.recalc_face_normals(bmo, faces=bmo.faces)
me = bpy.data.meshes.new('vulcrag'); bmo.to_mesh(me); bmo.free()
body = link(bpy.data.objects.new('vulcrag', me))
activate(body)
body.data.remesh_voxel_size = 0.03; bpy.ops.object.voxel_remesh()
displace(body, strength=0.05, scale=0.45, tex_type='VORONOI')
m = body.modifiers.new('chip', 'DECIMATE'); m.decimate_type = 'DISSOLVE'; m.angle_limit = math.radians(8)
activate(body); bpy.ops.object.modifier_apply(modifier='chip')
m = body.modifiers.new('tri', 'TRIANGULATE'); bpy.ops.object.modifier_apply(modifier='tri')
m = body.modifiers.new('cut', 'SUBSURF'); m.subdivision_type = 'SIMPLE'; m.levels = 2
bpy.ops.object.modifier_apply(modifier='cut')
co, nm = mesh_arrays(body)
co[:, 2] = np.maximum(co[:, 2], 0.0)
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(body, dg)
ztop = co[:, 2].max()


def snap(target, origin):
    target, origin = Vector(target), Vector(origin)
    d = (target - origin).normalized()
    hit, n, _, _ = bvh.ray_cast(origin, d, 5.0)
    if hit is None:
        raise RuntimeError(f'no hit {target}')
    return hit, n.normalized()


mat_body = toon_material('body', attr='Col', ink=INK)
mat_glow = toon_material('glow', LAVA, glow=1.0, ink='#7a2a00')
mat_magma = toon_material('magma', MAGMA, glow=0.85, ink='#5a1a00')
mat_rock = toon_material('rock', BASALT, ink=INK)
mat_eye = toon_material('eye', LAVA, glow=1.0, ink='#7a2a00')        # own slot: the rig's blink finds it
# per-side arm and fist materials so the rig can claim each arm exactly (they hang too close to the body for capsules)
mat_arm = {s: toon_material(f'arm{"L" if s > 0 else "R"}', BASALT, ink=INK) for s in (-1, 1)}
mat_fist = {s: toon_material(f'fist{"L" if s > 0 else "R"}', MAGMA, glow=0.85, ink='#5a1a00') for s in (-1, 1)}
assign(body, mat_body)
parts = []

# glowing slanted eyes (no brow: dark ovals read as a second pair of eyes) and a glowing jagged mouth
for s in (-1, 1):
    p, n = snap((1.0, P['eye_y'] * s, P['eye_z']), (0, P['eye_y'] * s, P['eye_z']))
    parts.append(assign(ellipsoid(f'eye{s}', p + n * 0.012, (0.11, 0.06, 0.04), track=n, roll=90 + 22 * s, taper=0.35, taper_axis=0), mat_eye))
mouth = [snap((1.0, y, 0.62 + dz), (0, y, 0.62 + dz)) for y, dz in ((-0.16, 0.03), (-0.10, -0.01), (-0.05, 0.02), (0.0, -0.02), (0.05, 0.02), (0.10, -0.01), (0.16, 0.03))]
parts.append(assign(tube('mouth', [tuple(p + n * 0.01) for p, n in mouth], [0.02, 0.034, 0.03, 0.036, 0.03, 0.034, 0.02], res=2), mat_glow))
# the lava pool in the crater, a bubbling dome rising out of it and two spits of lava above
parts.append(assign(ellipsoid('pool', (0, 0, 1.08), (0.27, 0.27, 0.07)), mat_glow))
parts.append(assign(ellipsoid('plume', (0.02, 0.0, 1.14), (0.15, 0.15, 0.17)), mat_glow))
parts.append(assign(ellipsoid('spit0', (-0.05, 0.07, 1.40), (0.055, 0.055, 0.065)), mat_glow))
parts.append(assign(ellipsoid('spit1', (0.06, -0.06, 1.50), (0.035, 0.035, 0.04)), mat_glow))
# magma veins: jagged glowing cracks running down from the crater rim (sides and back; the face stays clear)
for i, a0 in enumerate((68, 112, 158, 202, 248, 292)):
    pts = []
    for j, z in enumerate(np.linspace(1.12, 0.40 + 0.08 * (i % 3), 7)):
        a = math.radians(a0 + (9 if j % 2 else -9) * (1 if i % 2 else -1) + 3 * j)
        hit, n = snap((3 * math.cos(a), 3 * math.sin(a), z), (0, 0, z))
        pts.append(tuple(hit - n * 0.004))
    parts.append(assign(tube(f'vein{i}', pts, [0.024, 0.026, 0.024, 0.02, 0.016, 0.011, 0.006], res=1), mat_magma))
# stubby arms ending in molten fists, held low at the sides
for s in (-1, 1):
    sh, _ = snap((0.0, 3.0 * s, 0.66), (0, 0, 0.66))
    arm = [tuple(sh - Vector((0.02, 0.06 * s, 0))), (0.06, (abs(sh.y) + 0.14) * s, 0.52), (0.14, (abs(sh.y) + 0.20) * s, 0.34)]
    parts.append(assign(tube(f'arm{s}', arm, [0.13, 0.12, 0.11], res=8), mat_arm[s]))
    parts.append(assign(ellipsoid(f'fist{s}', (0.18, (abs(sh.y) + 0.23) * s, 0.24), (0.19, 0.17, 0.16)), mat_fist[s]))

body = union(body, parts)
set_smooth(body, angle=14)

bm = vertex_slot_mask(body, {'body'})
zones = [
    (lambda co, nm: bm & (co[:, 2] > 1.06), BASALT_L),                                   # the rim catches light
    (lambda co, nm: bm & (co[:, 2] < 0.16), BASALT_D),                                 # a darker, ashy base
]
paint_zones(body, BASALT, zones, mask=bm)
smoothstep_blend(body, 'Col', iters=2)


def add_battle_key(o, turn_deg):
    o.shape_key_add(name='Basis')
    k = o.shape_key_add(name='battle')
    co, _ = mesh_arrays(o)
    a = math.radians(-turn_deg)
    out = co.copy()
    out[:, 0] = co[:, 0] * math.cos(a) - co[:, 1] * math.sin(a)
    out[:, 1] = co[:, 0] * math.sin(a) + co[:, 1] * math.cos(a)
    k.data.foreach_set('co', out.ravel())
    return k


key = add_battle_key(body, P['turn'])
OUTDIR = os.environ.get('OUTDIR', os.path.join(HERE, 'rounds', 'r1'))
os.makedirs(OUTDIR, exist_ok=True)
SPP = int(os.environ.get('SPP', 12)); SIZE = int(os.environ.get('SIZE', 768)); MODE = os.environ.get('MODE', 'both')
setup_render(samples=SPP, ink_px=6.0 * SIZE / 1024, inner_px=3.2 * SIZE / 1024, crease_deg=100)
sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
if MODE in ('turn', 'both'):
    from turn import turnaround
    key.value = 0.0
    turnaround(body, OUTDIR, size=SIZE, spp=SPP, ground_px=int(SIZE * 0.9))
if MODE in ('battle', 'both'):
    key.value = 1.0
    cam, info = frame_camera([body], yaw=35, elev=12, size=SIZE, ground_px=int(SIZE * 900 / 1024))
    render(os.path.join(OUTDIR, 'battle.png'), 'battle')
    key.value = 0.0
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'vulcrag_final.blend')))
print(f'VULCRAG total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)} ztop {ztop:.3f}')
