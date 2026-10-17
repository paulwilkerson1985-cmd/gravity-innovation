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
CLUMPS = [(-0.20, 0.0, 1.06, 0.20), (0.05, 0.28, 1.02, 0.17), (0.05, -0.30, 1.00, 0.17), (-0.36, 0.30, 0.84, 0.17),
          (-0.38, -0.32, 0.82, 0.17), (-0.50, 0.0, 0.70, 0.18), (-0.30, 0.42, 0.52, 0.15), (-0.30, -0.44, 0.50, 0.15),
          (0.18, 0.46, 0.80, 0.13), (0.18, -0.48, 0.78, 0.13)]
for (x, y, z, r) in CLUMPS:
    B.add((x, y, z), r, stiff=3.0)
body = B.mesh(voxel=0.016, smooth_iters=2)     # smoothing removes the shallow junction folds (stray crease ink)
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
mat_foot = toon_material('foot', MOSS_D, ink=INK)
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
# tiny feet: their own darker slot (body-coloured lumps read as a chin in 3/4), pushed forward, three toes each
for s in (-1, 1):
    parts.append(assign(ellipsoid(f'foot{s}', (0.34, 0.22 * s, 0.075), (0.13, 0.10, 0.075)), mat_foot))
    for k in (-1, 0, 1):
        parts.append(assign(ellipsoid(f'toe{s}{k}', (0.44 - 0.012 * abs(k), 0.22 * s + 0.055 * k, 0.045), (0.045, 0.036, 0.04)), mat_foot))
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
for j, dirn in enumerate(((-0.75, 0.25, 0.60), (-0.70, -0.45, 0.30))):
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
paint_zones(body, GRASS, [], mask=bm)


def sd_face(co, nm):      # pale face: a tight oval on the front (it bled past the oval and under the chin)
    k = np.sqrt((co[:, 1] / 0.38) ** 2 + ((co[:, 2] - 0.57) / 0.32) ** 2)
    return np.maximum((k - 1.0) * 0.32, 0.22 - co[:, 0])


def sd_cheeks(co, nm):
    k = np.sqrt(((np.abs(co[:, 1]) - 0.31) / 0.085) ** 2 + ((co[:, 2] - 0.56) / 0.058) ** 2)
    return np.maximum((k - 1.0) * 0.058, 0.30 - co[:, 0])


def cavity(o, iters=6):
    """Per-vertex concavity (umbrella Laplacian along the normal), smoothed: > 0 in the folds between moss clumps."""
    me = o.data
    co, nm = mesh_arrays(o)
    ek = np.empty(len(me.edges) * 2, dtype=np.int32); me.edges.foreach_get('vertices', ek); ek = ek.reshape(-1, 2)
    cnt = np.zeros(len(co)); np.add.at(cnt, ek[:, 0], 1); np.add.at(cnt, ek[:, 1], 1); cnt[cnt == 0] = 1

    def avg(v):
        acc = np.zeros_like(v); np.add.at(acc, ek[:, 0], v[ek[:, 1]]); np.add.at(acc, ek[:, 1], v[ek[:, 0]])
        return acc / (cnt[:, None] if v.ndim == 2 else cnt)
    c = ((avg(co) - co) * nm).sum(1)
    for _ in range(iters):
        c = 0.5 * c + 0.5 * avg(c)
    return c


CAV = cavity(body, iters=16)
moss_region = lambda co: (co[:, 0] < 0.02) | (co[:, 2] > 0.95)      # the folds read on the moss, not on the face


def sd_folds(co, nm):     # moss colour follows the lumps: the folds between clumps go dark (geometry, not noise)
    thr = np.percentile(CAV[bm & moss_region(co)], 84)
    return np.where(moss_region(co), (thr - CAV) / thr * 0.06, 9.0)


def sd_caps(co, nm):      # the upward-facing crowns of the top clumps catch the light
    d = np.full(len(co), 9.0)
    for (x, y, z, r) in CLUMPS:
        if z > 0.95:
            d = np.minimum(d, np.linalg.norm(co - np.array([x, y, z]), axis=1) - r * 1.18)
    return np.maximum(d, (0.55 - nm[:, 2]) * 0.1)


paint_soft(body, [(sd_folds, MOSS_D), (sd_caps, LEAF), (sd_face, PALE), (sd_cheeks, PINK)], mask=bm, edge=0.012)


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
setup_render(samples=SPP, ink_px=6.0 * SIZE / 1024, inner_px=3.2 * SIZE / 1024, crease_deg=120)    # lumpy body: 120 keeps the junction folds from drawing short floating arcs
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
