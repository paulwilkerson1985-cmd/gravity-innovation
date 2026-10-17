"""Thistlehorn - Flora line stage 2 (docs/CREATURES.md): a stocky goat/deer grazer with hooves and leaf ears.

Signature: one forward horn crowned by a purple thistle bloom; a mossy mantle on its back fringed with rounded
leaves lying flat down the flanks. Palette: green, pale lime belly, purple bloom, bone horn, brown hooves.
Built with the Ashkit recipe (see ../cindertail/model.py). Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(
    eye_y=0.20, eye_z=1.53, eye_w=0.10, eye_h=0.125, eye_d=0.042, eye_out=0.014, eye_fwd=0.14,
    snout=(1.00, 0.0, 1.38), snout_r=0.19, snout_size=(1.15, 0.95, 0.85),
    head_turn=16.0, head_lift=4.0,
)

GREEN = srgb('#3ead48'); LIME = srgb('#ddf7ac'); MOSS = srgb('#1f6e33'); MOSS_L = srgb('#2a8a3c'); MANTLE = srgb('#24803a')
THISTLE = srgb('#b04ad8'); THISTLE_D = srgb('#7a2aa0'); HOOF = srgb('#5a4030'); HORN = srgb('#e8dcb0')
EYE = srgb('#22301e'); WHITE = srgb('#ffffff'); NOSE = srgb('#2a3a22')
INK = '#132414'

# ------------------------------------------------------------------ blockout (metaballs)
C = Vector((0.72, 0.0, 1.50))          # head centre
B = Blob('thistlehorn', resolution=0.035)
B.add((-0.10, 0, 0.98), 0.44, size=(1.35, 0.95, 0.86))         # stocky barrel body
B.add((0.32, 0, 1.02), 0.36, size=(1.0, 0.95, 1.0))            # chest
B.chain((0.40, 0, 1.08), (0.62, 0, 1.34), 0.25, 0.21, n=5)     # neck
B.add(C, 0.30, size=(1.18, 0.98, 0.92))                         # head
B.add(P['snout'], P['snout_r'], size=P['snout_size'], stiff=3.0)   # soft muzzle
for s in (-1, 1):
    B.add((0.88, 0.17 * s, 1.40), 0.13)                         # muzzle cheeks
GROUND = 0.0
FRONT_X, HIND_X, LY = 0.30, -0.44, 0.21
for s in (-1, 1):
    y = LY * s
    B.add((FRONT_X - 0.04, y, 0.92), 0.22)                      # shoulder
    B.chain((FRONT_X, y, 0.84), (FRONT_X + 0.01, y, 0.14), 0.12, 0.085, n=6)
    B.add((FRONT_X + 0.03, y, GROUND + 0.06), 0.095, size=(1.4, 1.05, 0.7), stiff=3.5)    # hoof (flat front, not a round cap)
    B.add((HIND_X + 0.04, y, 0.92), 0.25, size=(1.1, 0.85, 1.05))                         # haunch
    B.chain((HIND_X + 0.02, y, 0.84), (HIND_X - 0.08, y, 0.40), 0.14, 0.095, n=5)
    B.chain((HIND_X - 0.08, y, 0.40), (HIND_X, y, 0.14), 0.09, 0.085, n=4)
    B.add((HIND_X + 0.03, y, GROUND + 0.06), 0.095, size=(1.4, 1.05, 0.7), stiff=3.5)
# the mossy mantle: a raised lumpy cushion lying on the back; stiff, so it makes a silhouette step the ink follows
# (polish review 2: the flatter cushion left the mantle a stain with a wandering edge)
MANTLE_BALLS = [(-0.10, 0, 1.30, 0.26), (0.08, 0.06, 1.28, 0.20), (-0.32, -0.05, 1.27, 0.20), (0.0, -0.12, 1.32, 0.16), (-0.20, 0.13, 1.33, 0.15)]
MANTLE_SIZE = (1.25, 1.1, 0.95)
for (x, y, z, r) in MANTLE_BALLS:
    B.add((x, y, z), r, size=MANTLE_SIZE, stiff=3.5)
body = B.mesh(voxel=0.018)
co, nm = mesh_arrays(body)
co[:, 2] = np.maximum(co[:, 2], GROUND)
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
print('  blockout tris', tri_count(body), f'{time.perf_counter() - T0:.1f}s')

dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(body, dg)


def snap(target, origin):
    target, origin = Vector(target), Vector(origin)
    d = (target - origin).normalized()
    hit, n, _, _ = bvh.ray_cast(origin, d, 5.0)
    if hit is None:
        raise RuntimeError(f'no hit {target}')
    return hit, n.normalized()


# ------------------------------------------------------------------ hard parts
mat_body = toon_material('body', attr='Col', ink=INK)
mat_eye = toon_material('eye', EYE, ink=INK)
mat_glint = toon_material('glint', WHITE, glow=1.0, ink='#ffffff')
mat_nose = toon_material('nose', NOSE, ink=INK)
mat_leaf = toon_material('leaf', MOSS, ink=INK)
mat_horn = toon_material('horn', HORN, ink='#6a5a3a')
mat_thistle = toon_material('thistle', THISTLE, glow=0.1, ink='#4a1868')
mat_calyx = toon_material('calyx', MOSS_L, ink=INK)
assign(body, mat_body)
parts = []
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

# leaf ears: broad leaves sticking out sideways and a little back, tilted up
EAR = dict(c=(0.60, 0.33, 1.66), s=(0.05, 0.26, 0.11), rx=0, ry=-20, rz=-18)
for s in (-1, 1):
    e = ellipsoid(f'ear{s}', (EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]), EAR['s'],
                  rot=(-24 * s, EAR['ry'], EAR['rz'] * s), taper=0.55, taper_axis=1 if s > 0 else 1)
    parts.append(assign(e, mat_body))

# eyes (big, round: a gentle grazer) with glints
for s in (-1, 1):
    p, n = snap((C.x + 1.0, P['eye_y'] * s, P['eye_z']), (C.x, P['eye_y'] * s, P['eye_z']))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f), mat_eye))
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.45, 0.036), (-0.55, 0.017))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u = abs(off)
        loc = ec + dirv * (u * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u * u)) - 0.004)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.013), track=f), mat_glint))

# nose pad and a small content smile on the muzzle
sx, sy, sz = P['snout']
tip, tn = snap((sx + 1, 0, sz + 0.05), (sx, 0, sz + 0.05))
parts.append(assign(ellipsoid('nose', tip - tn * 0.02, (0.04, 0.085, 0.05), rot=(180, 0, 0), taper=0.3), mat_nose))
zf = sz - 0.06
xt = sx + 0.14
mid, _ = snap((sx + 1, 0, zf - 0.03), (sx, 0, zf - 0.03))
lobe = {}
for s in (-1, 1):
    lobe[s] = [snap((x, s, z), (x, 0, z))[0] for (x, z) in ((xt - 0.02, zf - 0.026), (xt - 0.06, zf - 0.02), (xt - 0.10, zf - 0.008), (xt - 0.13, zf + 0.006))]
smile = list(reversed(lobe[-1])) + [mid] + lobe[1]
parts.append(assign(tube('mouth', [tuple(q) for q in smile], [0.005, 0.008, 0.010, 0.010, 0.010, 0.010, 0.010, 0.008, 0.005], res=8), mat_nose))

# the signature horn: one thick bone horn from the forehead, curving forward, up and over, crowned by a thistle whose
# calyx is sunk into the horn tip (polish review 2: the thin stalk and ball read as a lollipop)
hp = [(0.78, 0.0, 1.66), (0.86, 0.0, 1.83), (0.98, 0.0, 1.94), (1.10, 0.0, 1.99), (1.20, 0.0, 1.97)]
parts.append(assign(tube('horn', hp, [0.12, 0.10, 0.085, 0.07, 0.06], res=12), mat_horn))
TC = Vector((1.24, 0.0, 2.13))
parts.append(assign(ellipsoid('calyx', Vector((1.22, 0, 2.01)), (0.12, 0.12, 0.10), segs=48, rings=24), mat_calyx))
parts.append(assign(ellipsoid('thistle', TC, (0.17, 0.17, 0.14), segs=48, rings=24), mat_thistle))
for i in range(13):   # the spiky crown of the bloom
    a = i * 2.39996; zz = 0.25 + 0.7 * (i / 12)
    dirn = Vector((math.cos(a) * math.sqrt(1 - zz * zz), math.sin(a) * math.sqrt(1 - zz * zz), zz)).normalized()
    parts.append(assign(ellipsoid(f'spine{i}', TC + dirn * 0.15, (0.032, 0.032, 0.085), track=dirn, taper=0.9), mat_thistle))

# the mantle's leaf fringe: rounded leaves lying flat down both flanks, and one down the rump
# (polish review 2: three different leaves, overlapping, tucked under the mantle edge so only the free tips are inked)
for s in (-1, 1):
    for i, (x, z, w, ry) in enumerate(((0.20, 1.12, 0.15, 10), (-0.06, 1.14, 0.19, -4), (-0.32, 1.11, 0.13, -12))):
        # rounded leaf hanging from the mantle's edge, lying on the flank, tip pointing down; its top half in the body
        lf = ellipsoid(f'leaf{s}{i}', (x, 0.385 * s, z - 0.10), (w, 0.07, 0.21), rot=(180 + 42 * s, ry, 0), taper=0.45, taper_axis=2)
        parts.append(assign(lf, mat_leaf))
parts.append(assign(ellipsoid('leafrump', (-0.56, 0, 1.14), (0.15, 0.14, 0.06), rot=(0, 52, 0), taper=0.55, taper_axis=0), mat_leaf))
# leaf tail: two leaves rising up and back from the rump
parts.append(assign(ellipsoid('tail0', (-0.70, 0.0, 1.16), (0.20, 0.06, 0.09), rot=(0, 38, 0), taper=0.6, taper_axis=0), mat_leaf))
parts.append(assign(ellipsoid('tail1', (-0.66, 0.05, 1.26), (0.16, 0.03, 0.075), rot=(10, 60, 14), taper=0.6, taper_axis=0), mat_body))

body = union(body, parts)
set_smooth(body, angle=50)

# ------------------------------------------------------------------ colour zones (vertex colours)
bm = vertex_slot_mask(body, {'body'})


def ear_inner(co, nm):
    m = np.zeros(len(co), dtype=bool)
    for s in (-1, 1):
        c = np.array((EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]))
        d = co - c
        m |= (np.abs(d[:, 1]) < 0.22) & (np.abs(d[:, 0]) < 0.06) & (np.abs(d[:, 2]) < 0.10) & (nm[:, 2] > 0.3) & (np.abs(co[:, 1]) > 0.38)
    return bm & m


def belly_sd(co, nm):
    # ellipsoid AND downward faces only: the box zone also painted the inner legs (polish review 2, cross-kin 1)
    return np.maximum(sd_ellipse((-0.12, 0, 0.68), (0.36, 0.26, 0.20))(co, nm), (nm[:, 2] + 0.45) * 0.2)


def mantle_sd(co, nm):
    # a saddle blanket over the cushion: rounded ends seen from above, a level hem along the flanks where the leaves
    # hang (polish review 2: the normal test let the edge wander across the neck and flank like a stain)
    q = np.sqrt(((co[:, 0] + 0.15) / 0.42) ** 2 + (co[:, 1] / 0.85) ** 2)
    return np.maximum((q - 1.0) * 0.42, 1.02 - co[:, 2] + 0.12 * ((co[:, 0] + 0.15) / 0.42) ** 2)


zones = [
    (ear_inner, LIME),
    (lambda co, nm: bm & (co[:, 2] < 0.14), HOOF),                                                        # hooves
]
paint_zones(body, GREEN, zones, mask=bm)
smoothstep_blend(body, 'Col', iters=1)
paint_soft(body, [(belly_sd, LIME),
                  (sd_ellipse((0.62, 0, 1.00), (0.18, 0.21, 0.28)), LIME),                            # chest
                  (sd_ellipse((1.16, 0, 1.32), (0.30, 0.24, 0.13)), LIME),                            # muzzle, snapped to the snout tip
                  (mantle_sd, MANTLE)], mask=bm, edge=0.012)


# ------------------------------------------------------------------ battle pose: head turned toward the camera (shape key)
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


PIV = np.array((0.44, 0.0, 1.12))


def head_weight(co):
    w = np.maximum(smooth(1.30, 1.48, co[:, 2]) * smooth(0.40, 0.55, co[:, 0]), smooth(0.62, 0.78, co[:, 0]) * smooth(1.12, 1.30, co[:, 2]))
    return w


def add_battle_key(o, turn_deg, lift_deg):
    o.shape_key_add(name='Basis')
    k = o.shape_key_add(name='battle')
    co, _ = mesh_arrays(o)
    w = head_weight(co)
    a = math.radians(-turn_deg); b = math.radians(-lift_deg)
    rel = co - PIV
    aw = a * w; bw = b * w
    x1 = rel[:, 0] * np.cos(bw) + rel[:, 2] * np.sin(bw)
    z1 = -rel[:, 0] * np.sin(bw) + rel[:, 2] * np.cos(bw)
    y1 = rel[:, 1]
    x2 = x1 * np.cos(aw) - y1 * np.sin(aw)
    y2 = x1 * np.sin(aw) + y1 * np.cos(aw)
    out = co.copy()
    out[:, 0], out[:, 1], out[:, 2] = x2 + PIV[0], y2 + PIV[1], z1 + PIV[2]
    k.data.foreach_set('co', out.ravel())
    return k


key = add_battle_key(body, P['head_turn'], P['head_lift'])

# ------------------------------------------------------------------ render
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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'thistlehorn_final.blend')))
print(f'THISTLEHORN total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
