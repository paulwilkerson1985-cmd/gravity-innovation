"""Maelstrode - Tide line stage 3 (docs/CREATURES.md): one continuous body, a whirlpool coil on the ground rising into a
proud S-neck.

Signature: the spiral coil (the whirlpool), white fin frills and crest, thick barbels, dorsal fins, a tail fluke rising
from the coil's centre. Palette: deep blue, aqua belly, white fins, gold eyes. Built with the Ashkit recipe, except
the body: a tube along shape.path() joined with the head and voxel-remeshed (the touching coil turns fuse into one
clean surface, which a boolean union of a self-touching tube cannot do). 'battle' key turns the whole body toward the
camera. Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
sys.path.insert(0, HERE)
from common import *
from mathutils.bvhtree import BVHTree
from shape import path, HEAD_C

T0 = time.perf_counter()
sc = reset_scene()
P = dict(eye_y=0.095, eye_z=HEAD_C[2] + 0.05, eye_w=0.085, eye_h=0.095, eye_d=0.036, eye_out=0.013, eye_fwd=0.15, turn=16.0)

BLUE = srgb('#1e64c8'); BLUE_D = srgb('#164a9a'); AQUA = srgb('#8fe8f0'); WHITE_F = srgb('#f4faff'); GOLD = srgb('#ffc832')
PUPIL = srgb('#141a30'); WHITE = srgb('#ffffff')
INK = '#0a1a40'

PTS, i_coil, i_neck, i_head = path()
body = tube('maelstrode', [p for p, r in PTS], [r for p, r in PTS], res=6, bevel_res=4)
head = ellipsoid('head', HEAD_C, (0.23, 0.175, 0.16), rot=(0, 4, 0))
snout = ellipsoid('snout', (HEAD_C[0] + 0.17, 0, HEAD_C[2] - 0.04), (0.12, 0.12, 0.095))
body = join(body, [head, snout])
activate(body)
body.data.remesh_voxel_size = 0.014; bpy.ops.object.voxel_remesh()
m = body.modifiers.new('sm', 'SMOOTH'); m.factor = 0.5; m.iterations = 4
bpy.ops.object.modifier_apply(modifier='sm')
co, nm = mesh_arrays(body)
co[:, 2] -= co[:, 2].min()
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(body, dg)
HC = Vector(HEAD_C)


def snap(target, origin):
    target, origin = Vector(target), Vector(origin)
    d = (target - origin).normalized()
    hit, n, _, _ = bvh.ray_cast(origin, d, 5.0)
    if hit is None:
        raise RuntimeError(f'no hit {target}')
    return hit, n.normalized()


mat_body = toon_material('body', attr='Col', ink=INK)
mat_eye = toon_material('eye', GOLD, glow=0.2, ink=INK)
mat_pupil = toon_material('pupil', PUPIL, ink=INK)
mat_glint = toon_material('glint', WHITE, glow=1.0, ink='#ffffff')
mat_mouth = toon_material('mouth', srgb('#0a1a50'), ink=INK)
mat_fin = toon_material('fin', WHITE_F, ink=INK)
mat_barbel = toon_material('barbel', BLUE_D, ink=INK)
assign(body, mat_body)
parts = []
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

# gold eyes with round dark pupils and glints
for s in (-1, 1):
    p, n = snap((2.0, P['eye_y'] * s * 2.2, P['eye_z']), (HC.x, P['eye_y'] * s, P['eye_z']))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f), mat_eye))
    pc = ec + f * (P['eye_d'] * 0.55)
    parts.append(assign(ellipsoid(f'pupil{s}', pc, (P['eye_w'] * 0.62, P['eye_h'] * 0.66, P['eye_d'] * 0.6), track=f), mat_pupil))
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.40, 0.024), (-0.50, 0.012))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        loc = pc + dirv * (abs(off) * P['eye_w'] * 0.62) + f * (P['eye_d'] * 0.62)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.010), track=f), mat_glint))
# a wide, calm mouth line along the snout
mz = HC.z - 0.07
pts = [snap((2.0, y, mz + 0.012 * (abs(y) / 0.08) ** 2), (HC.x + 0.1, y, mz + 0.012 * (abs(y) / 0.08) ** 2))[0] for y in (-0.08, -0.04, 0.0, 0.04, 0.08)]
parts.append(assign(tube('mouth', [tuple(p) for p in pts], [0.006, 0.008, 0.009, 0.008, 0.006], res=8), mat_mouth))
# thick barbels from the sides of the snout, drooping and curling forward at the ends
for s in (-1, 1):
    b0, _ = snap((HC.x + 0.16, 0.6 * s, HC.z - 0.04), (HC.x + 0.16, 0, HC.z - 0.04))
    bar = [tuple(b0 - Vector((0, 0.02 * s, 0))), tuple(b0 + Vector((0.02, 0.08 * s, -0.06))), tuple(b0 + Vector((0.03, 0.12 * s, -0.17))),
           tuple(b0 + Vector((0.08, 0.13 * s, -0.24)))]
    parts.append(assign(tube(f'barbel{s}', bar, [0.032, 0.026, 0.018, 0.010], res=8), mat_barbel))
# the crest: a scalloped white fin along the top of the head, sweeping back
CREST = smooth_closed([(0.10, 0.0), (0.04, 0.10), (-0.04, 0.16), (-0.10, 0.13), (-0.16, 0.20), (-0.24, 0.12), (-0.30, 0.02), (-0.20, -0.04), (0.0, -0.04)], subdiv=5)
ct, _ = snap((HC.x - 0.02, 0, 3.0), (HC.x - 0.02, 0, HC.z))
parts.append(assign(slab('crest', CREST, 0.03, loc=tuple(ct + Vector((0, 0, -0.03))), plane='XZ', bevel=0.004), mat_fin))
# frills: fanned white fins behind the jaw on each side
FRILL = smooth_closed([(0.0, 0.0), (-0.05, 0.12), (-0.14, 0.18), (-0.20, 0.10), (-0.24, 0.0), (-0.20, -0.08), (-0.10, -0.08)], subdiv=5)
for s in (-1, 1):
    fp, _ = snap((HC.x - 0.10, 3.0 * s, HC.z - 0.02), (HC.x - 0.10, 0, HC.z - 0.02))
    parts.append(assign(slab(f'frill{s}', [(x * 1.3, z * 1.3) for x, z in FRILL], 0.024, loc=tuple(fp + Vector((-0.02, 0.02 * s, 0))), rot=(0, 0, 34 * s), plane='XZ', bevel=0.004), mat_fin))
# dorsal fins down the back of the neck: each placed by a frame (base along the neck, standing out of the back)
FIN = [(0.0, 0.0), (0.05, 0.08), (0.14, 0.12), (0.14, 0.0)]
neck = [Vector(p) for p, r in PTS[i_neck:i_head]]
for j, (u, sc_) in enumerate(((0.22, 0.8), (0.48, 1.0), (0.74, 0.85))):
    k = int(u * (len(neck) - 1)); a, b = neck[k], neck[min(k + 1, len(neck) - 1)]
    c = a.lerp(b, u * (len(neck) - 1) - k)
    T = (b - a).normalized()
    hit, n = snap(c + Vector((-1.0, 0, 0)), c)
    Nb = (n - T * n.dot(T)); Nb.y = 0; Nb.normalize()
    fin = slab(f'dorsal{j}', [(x * sc_ * 1.3, z * sc_ * 1.3) for x, z in FIN], 0.024, plane='XZ', bevel=0.003)
    M = Matrix((-T, Nb.cross(-T).normalized(), Nb)).transposed().to_4x4(); M.translation = hit - Nb * 0.02
    fin.matrix_world = M; apply_xform(fin)
    parts.append(assign(fin, mat_fin))
# the tail fluke: two white lobes at the tip rising from the centre
FLUKE = smooth_closed([(0.0, 0.0), (0.10, 0.08), (0.16, 0.18), (0.06, 0.12), (0.0, 0.06), (-0.06, 0.12), (-0.16, 0.18), (-0.10, 0.08)], subdiv=4)
tip = Vector(PTS[0][0])
parts.append(assign(slab('fluke', FLUKE, 0.028, loc=tuple(tip + Vector((0, 0, -0.04))), rot=(0, 0, 70), plane='XZ', bevel=0.004), mat_fin))

body = union(body, parts)
set_smooth(body, angle=50)

bm = vertex_slot_mask(body, {'body'})
zones = [
    # the aqua belly: the front of the neck and the throat (facing +X), and the inner side of the coil on top
    (lambda co, nm: bm & (co[:, 2] > 0.30) & (nm[:, 0] > 0.35) & (co[:, 2] < HC.z - 0.06), AQUA),
    (lambda co, nm: bm & (co[:, 2] < 0.30) & (nm[:, 2] > 0.6), BLUE_D),       # the coil's top, a deeper blue (the whirlpool)
]
paint_zones(body, BLUE, zones, mask=bm)
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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'maelstrode_final.blend')))
co, _ = mesh_arrays(body)
print(f'MAELSTRODE total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}, zmin {co[:, 2].min():.3f} zmax {co[:, 2].max():.3f}')
