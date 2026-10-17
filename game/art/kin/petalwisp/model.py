"""Petalwisp - rare Flora/Gale single (docs/CREATURES.md): a floating flower spirit (no bird parts): a face in a blossom
crown, a petal skirt, leaf arms. It hovers (the wisp tail's point is its lowest point, HOVER above the floor).

Signature: a wind-wisp tail spiralling to a point; a six-petal crown. Palette: pink, blush face, magenta undersides,
leaf green. Built with the Ashkit recipe; the head is its own mesh joined by a boolean; each leaf arm has its own
material so the rig claims it exactly; 'battle' key turns the whole body toward the camera. Env: SPP, SIZE, OUTDIR,
MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
HOVER = 0.14
T = Vector((0.0, 0.0, HOVER + 0.40))           # torso
H = Vector((0.02, 0.0, HOVER + 0.76))          # head
P = dict(eye_y=0.10, eye_z=H.z + 0.02, eye_w=0.085, eye_h=0.105, eye_d=0.04, eye_out=0.014, eye_fwd=0.10, turn=16.0)

PINK = srgb('#ff8fc4'); MAGENTA = srgb('#d03a8e'); FACE = srgb('#ffe6ee'); BLUSH = srgb('#ff9ab8'); LEAF = srgb('#5cc84a')
STEM = srgb('#3f9a3a'); WISP = srgb('#bdeeff'); EYE = srgb('#2a1430'); WHITE = srgb('#ffffff')
INK = '#3a1030'

B = Blob('petalwisp', resolution=0.03)
B.add(T, 0.15, size=(1.0, 1.0, 1.3))                              # a small green torso under the skirt
B.add((T.x, 0, T.z + 0.18), 0.09)                                 # the neck
body = B.mesh(voxel=0.014)
HB = Blob('head', resolution=0.03)
HB.add(H, 0.23)
head = HB.mesh(voxel=0.014)
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(head, dg)


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
mat_mouth = toon_material('mouth', srgb('#8a2a50'), ink=INK)
mat_petal = toon_material('petal', PINK, ink=INK)
mat_under = toon_material('under', MAGENTA, ink='#1a0414')     # the plum ink vanished on magenta
mat_wisp = toon_material('wisp', WISP, glow=0.2, ink='#5a7aa0')
mat_leaf = {s: toon_material(f'leaf{"L" if s > 0 else "R"}', LEAF, ink='#1a4a14') for s in (-1, 1)}
assign(body, mat_body)
parts = [assign(head, mat_body)]
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

for s in (-1, 1):
    p, n = snap((1.0, P['eye_y'] * s, P['eye_z']), (H.x - 0.05, P['eye_y'] * s, P['eye_z']))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f), mat_eye))
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.45, 0.032), (-0.55, 0.015))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u = abs(off)
        loc = ec + dirv * (u * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u * u)) - 0.004)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.011), track=f), mat_glint))
mz = H.z - 0.08
pts = [snap((1.0, y, mz + 0.02 * (abs(y) / 0.07) ** 2), (H.x - 0.05, y, mz + 0.02 * (abs(y) / 0.07) ** 2))[0] for y in (-0.07, -0.035, 0.0, 0.035, 0.07)]
parts.append(assign(tube('mouth', [tuple(p) for p in pts], [0.006, 0.009, 0.010, 0.009, 0.006], res=8), mat_mouth))

# the petal skirt: pink petals hanging down and out round the torso, magenta ones inside; each petal is placed by an
# explicit frame (long axis down and out, thin axis radial) so every one shows its face. cup > 0 curls the petal's
# sides toward +thin (a spoon, not a paper cutout)
def petal(name, centre, long_dir, thin_dir, sc3, cup=0.0):
    o = ellipsoid(name, (0, 0, 0), sc3)
    if cup:
        me = o.data
        co_ = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co_); co_ = co_.reshape(-1, 3)
        co_[:, 1] += cup * ((co_[:, 0] / sc3[0]) ** 2 + 0.5 * (co_[:, 2] / sc3[2]) ** 2)
        me.vertices.foreach_set('co', co_.ravel()); me.update()
    zl = long_dir.normalized(); yl = (thin_dir - zl * thin_dir.dot(zl)).normalized(); xl = yl.cross(zl)
    M = Matrix((xl, yl, zl)).transposed().to_4x4(); M.translation = centre
    o.matrix_world = M; apply_xform(o)
    return o


# the six-petal crown around the face (review 2 #2): each petal tilted 28 deg forward about its own tangent and cupped,
# pink in front with its magenta twin just 0.02 behind, so the side view shows a cup, not a paper cutout behind a ball
for i in range(6):
    a = math.radians(90 + 60 * i)
    d = Vector((0, math.cos(a), math.sin(a)))
    tl = math.radians(28)
    ld = d * math.cos(tl) + Vector((1, 0, 0)) * math.sin(tl)            # long axis: out and forward
    th_ = Vector((1, 0, 0)) * math.cos(tl) - d * math.sin(tl)           # face normal: forward and in
    c0 = H + Vector((-0.035, 0, 0)) + d * 0.29
    parts.append(assign(petal(f'crown{i}', c0, ld, th_, (0.12, 0.035, 0.17), cup=0.03), mat_petal))
    parts.append(assign(petal(f'crownu{i}', c0 - th_ * 0.02 + d * 0.012, ld, th_, (0.13, 0.03, 0.18), cup=0.03), mat_under))
for i in range(7):
    b = i * math.tau / 7 + 0.2
    out = Vector((math.cos(b), math.sin(b), 0))
    dirv = (out * 0.55 + Vector((0, 0, -0.85))).normalized()
    parts.append(assign(petal(f'skirt{i}', T + out * 0.15 + dirv * 0.12 + Vector((0, 0, 0.04)), dirv, out, (0.11, 0.03, 0.17)), mat_petal))
    parts.append(assign(petal(f'skirtu{i}', T + out * 0.11 + dirv * 0.10 + Vector((0, 0, 0.04)), dirv, out, (0.10, 0.03, 0.15)), mat_under))
# leaf arms
for s in (-1, 1):
    # mirrored (review 2 #1): the 180 deg about Z already mirrors the tilt, so the X tilt is not multiplied by s
    parts.append(assign(ellipsoid(f'leaf{s}', (0.03, 0.32 * s, T.z + 0.07), (0.085, 0.24, 0.03), rot=(-24, 0, 14 * s + (0 if s > 0 else 180)), taper=0.6, taper_axis=1), mat_leaf[s]))
# the wind-wisp tail: a spiral narrowing to a point, down and back from under the skirt
wisp = []      # 1.6 turns, wide (review 2 #4: a drip); the turns must not touch (a self-intersecting tube drops out of the boolean)
NW = 21
for j in range(NW):
    t = j / (NW - 1)
    a = 1.6 * math.tau * t
    # narrow under the skirt, opening to r 0.22 below its hem, then closing to the point
    r = 0.05 + 0.20 * (t / 0.55) ** 2 if t <= 0.55 else 0.25 * (1 - t) / 0.45 + 0.01
    wisp.append((T.x - 0.38 * t + r * math.cos(a), r * math.sin(a), T.z - 0.06 - (T.z - 0.06 - HOVER) * t))
parts.append(assign(tube('wisp', wisp, [0.075 * (1 - j / (NW - 1)) + 0.008 for j in range(NW)], res=6), mat_wisp))

body = union(body, parts)
set_smooth(body, angle=50)

bm = vertex_slot_mask(body, {'body'})
paint_zones(body, FACE, [], mask=bm)


def sd_collar(co, nm):        # green torso and neck below a collar line with a slight V at the front (review 2 #3)
    v = 0.035 * np.clip(1 - np.abs(co[:, 1]) / 0.10, 0, 1) * (co[:, 0] > 0)
    return co[:, 2] - (T.z + 0.24 - v)


def sd_blush(co, nm):
    e = (np.sqrt(((np.abs(co[:, 1]) - 0.15) / 0.06) ** 2 + ((co[:, 2] - (H.z - 0.05)) / 0.04) ** 2) - 1.0) * 0.04
    return np.maximum(e, (H.x + 0.10) - co[:, 0])


paint_soft(body, [(sd_collar, srgb('#4fb846')), (sd_blush, BLUSH)], mask=bm, edge=0.011)


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
setup_render(samples=SPP, ink_px=6.0 * SIZE / 1024, inner_px=3.2 * SIZE / 1024, crease_deg=100, decal_px=1.5 * SIZE / 512)
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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'petalwisp_final.blend')))
co, _ = mesh_arrays(body)
print(f'PETALWISP total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}, zmin {co[:, 2].min():.3f} zmax {co[:, 2].max():.3f}')
