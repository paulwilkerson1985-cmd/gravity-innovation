"""Mossling - Flora line stage 1 (docs/CREATURES.md): a round mossy puffball with lumpy moss clumps and tiny feet.

Signature: a swaying two-leaf sprout on top, pink cheeks, a tiny pink blossom in the moss. Palette: grass green,
pale green face, pink. Built with the Ashkit recipe; 'battle' key turns the whole body toward the camera.
Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(eye_y=0.21, eye_z=0.70, eye_w=0.12, eye_h=0.145, eye_d=0.048, eye_out=0.016, eye_fwd=0.10, turn=16.0)

GRASS = srgb('#4cbf3a'); MOSS_D = srgb('#2f8f2c'); PALE = srgb('#dff7b8'); PINK = srgb('#ff8fb8'); PINK_D = srgb('#e8508e')
YELLOW = srgb('#ffe36a'); LEAF = srgb('#5fd64a'); STEM = srgb('#3a9a34'); EYE = srgb('#1c2a18'); WHITE = srgb('#ffffff')
INK = '#132414'

C = Vector((0.0, 0.0, 0.60))
B = Blob('mossling', resolution=0.03)
B.add(C, 0.60, size=(1.0, 1.0, 0.95))                          # the puff
B.add((0.0, 0, 0.28), 0.50, size=(1.05, 1.05, 0.55))           # a wide, flat base
# lumpy moss clumps over the back, top and sides (not the face)
for (x, y, z, r) in [(-0.20, 0.0, 1.06, 0.20), (0.05, 0.28, 1.02, 0.17), (0.05, -0.30, 1.00, 0.17), (-0.36, 0.30, 0.84, 0.17),
                     (-0.38, -0.32, 0.82, 0.17), (-0.50, 0.0, 0.70, 0.18), (-0.30, 0.42, 0.52, 0.15), (-0.30, -0.44, 0.50, 0.15),
                     (0.18, 0.46, 0.80, 0.13), (0.18, -0.48, 0.78, 0.13)]:
    B.add((x, y, z), r, stiff=3.0)
for s in (-1, 1):
    B.add((0.26, 0.22 * s, 0.06), 0.10, size=(1.35, 1.0, 0.7), stiff=2.5)   # tiny feet
body = B.mesh(voxel=0.016)
co, nm = mesh_arrays(body)
co[:, 2] = np.maximum(co[:, 2], 0.0)
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(body, dg)


def snap(target, origin):
    target, origin = Vector(target), Vector(origin)
    d = (target - origin).normalized()
    hit, n, _, _ = bvh.ray_cast(origin, d, 5.0)
    if hit is None:
        raise RuntimeError(f'no hit {target}')
    return hit, n.normalized()


mat_body = toon_material('body', attr='Col', ink=INK)
mat_eye = toon_material('eye', EYE, ink=INK)
mat_glint = toon_material('glint', WHITE, glow=1.0, ink='#ffffff')
mat_mouth = toon_material('mouth', srgb('#2a4a20'), ink=INK)
mat_leaf = toon_material('leaf', LEAF, ink=INK)
mat_stem = toon_material('stem', STEM, ink=INK)
mat_petal = toon_material('petal', PINK, glow=0.1, ink='#8a2050')
mat_centre = toon_material('centre', YELLOW, glow=0.2, ink='#8a6a10')
assign(body, mat_body)
parts = []
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

for s in (-1, 1):
    p, n = snap((1.0, P['eye_y'] * s, P['eye_z']), (0, P['eye_y'] * s, P['eye_z']))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f), mat_eye))
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.45, 0.042), (-0.55, 0.02))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u = abs(off)
        loc = ec + dirv * (u * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u * u)) - 0.004)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.014), track=f), mat_glint))
mz = 0.50
pts = [snap((1.0, y, mz + 0.028 * (abs(y) / 0.12) ** 2), (0, y, mz + 0.028 * (abs(y) / 0.12) ** 2))[0] for y in (-0.12, -0.06, 0.0, 0.06, 0.12)]
parts.append(assign(tube('mouth', [tuple(p) for p in pts], [0.008, 0.012, 0.013, 0.012, 0.008], res=8), mat_mouth))
# the sprout: a short stem with two leaves
top, tn = snap((-0.06, 0, 3.0), (-0.06, 0, 0.6))
stem = [tuple(top - Vector((0, 0, 0.04))), (top.x + 0.01, 0, top.z + 0.12), (top.x + 0.03, 0, top.z + 0.22)]
parts.append(assign(tube('stem', stem, [0.035, 0.03, 0.026], res=8), mat_stem))
tip = Vector(stem[-1])
for s in (-1, 1):
    parts.append(assign(ellipsoid(f'leaf{s}', tip + Vector((0.02, 0.16 * s, 0.05)), (0.08, 0.18, 0.03), rot=(-26 * s, -8, 12 * s), taper=0.55, taper_axis=1 if s > 0 else 1), mat_leaf))
# a tiny pink blossom tucked in the moss, upper left (toward the key light)
bp, bn = snap(Vector(C) + Vector((0.35, 0.55, 0.62)) * 3, Vector(C))
parts.append(assign(ellipsoid('bloom_c', bp + bn * 0.02, (0.04, 0.04, 0.025), track=bn), mat_centre))
u = bn.orthogonal().normalized(); v = bn.cross(u)
for i in range(5):
    a = i * math.tau / 5
    q = bp + bn * 0.01 + (u * math.cos(a) + v * math.sin(a)) * 0.06
    parts.append(assign(ellipsoid(f'petal{i}', q, (0.045, 0.03, 0.015), track=bn, roll=math.degrees(a)), mat_petal))
# back marking (Fable review 1: flat backs): two more small blossoms in the moss on the back
for j, dirn in enumerate(((-0.75, 0.35, 0.55), (-0.70, -0.45, 0.30))):
    bp2, bn2 = snap(Vector(C) + Vector(dirn) * 3, Vector(C))
    parts.append(assign(ellipsoid(f'bloomb_c{j}', bp2 + bn2 * 0.02, (0.035, 0.035, 0.022), track=bn2), mat_centre))
    u2 = bn2.orthogonal().normalized(); v2 = bn2.cross(u2)
    for i in range(5):
        a = i * math.tau / 5 + 0.4 * j
        q = bp2 + bn2 * 0.01 + (u2 * math.cos(a) + v2 * math.sin(a)) * 0.052
        parts.append(assign(ellipsoid(f'petalb{j}{i}', q, (0.04, 0.027, 0.014), track=bn2, roll=math.degrees(a)), mat_petal))

body = union(body, parts)
set_smooth(body, angle=50)

bm = vertex_slot_mask(body, {'body'})
zones = [
    (lambda co, nm: bm & (co[:, 0] > 0.22) & ((co[:, 1] / 0.42) ** 2 + ((co[:, 2] - 0.56) / 0.36) ** 2 < 1), PALE),   # pale face
    (lambda co, nm: bm & (co[:, 0] > 0.30) & (((np.abs(co[:, 1]) - 0.33) / 0.09) ** 2 + ((co[:, 2] - 0.57) / 0.06) ** 2 < 1), PINK),   # cheeks
    (lambda co, nm: bm & (co[:, 0] < 0.10) & (nm[:, 2] > 0.35) & (co[:, 2] > 0.75), MOSS_D),                          # darker moss on top
    (lambda co, nm: bm & (co[:, 2] < 0.10) & (co[:, 0] > 0.10), MOSS_D),                                              # feet
    (lambda co, nm: bm & (co[:, 0] < -0.25) & (np.sin(co[:, 1] * 11.0 + 0.5) * np.sin(co[:, 2] * 10.0) > 0.45), MOSS_D),   # mottled moss on the back
]
paint_zones(body, GRASS, zones, mask=bm)
smoothstep_blend(body, 'Col', iters=3)


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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'mossling_final.blend')))
print(f'MOSSLING total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
