"""Pyrelord - the flame line's final stage (docs/CREATURES.md): a heavy, chest-high fox beast.

Thick gauntleted legs and a proud head. Signature: a flame crown between swept charcoal horns, a fiery mane
collar, a comet-flame tail, ember studs on the spine, golden eyes under a brow, gold claws and bands.
Palette: crimson, gold, charcoal, flame orange/yellow. Lineage marks kept from Ashkit and Cindertail: the fox
face with a cream (here gold) mask below the eyes, dark ear backs, sooty boots.
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
    eye_y=0.27, eye_z=2.06, eye_w=0.11, eye_h=0.12, eye_d=0.045, eye_out=0.014, eye_fwd=0.15,
    snout=(1.30, 0.0, 1.93), snout_r=0.22, snout_size=(1.45, 0.92, 0.80),
    head_turn=16.0, head_lift=4.0,
)

CRIMSON = srgb('#d8321e'); GOLD = srgb('#ffcf7a'); GOLD_D = srgb('#e8a63a'); SOOT = srgb('#2c2230')
EMBER = srgb('#ff8a1e'); EMBER_CORE = srgb('#ffe14d'); IRIS = srgb('#ffd23f'); PUPIL = srgb('#2b1a1e')
WHITE = srgb('#ffffff'); EAR_BACK = srgb('#3a1f22')
INK = '#24121a'

# ------------------------------------------------------------------ blockout (metaballs)
C = Vector((0.95, 0.0, 2.05))          # head centre
B = Blob('pyrelord', resolution=0.04)
B.add((-0.24, 0, 1.26), 0.52, size=(1.40, 0.80, 0.74))        # body, tapering to the waist
B.add((0.40, 0, 1.42), 0.54, size=(0.95, 1.0, 1.05))          # deep chest, the biggest mass, in front
B.chain((0.55, 0, 1.55), (0.86, 0, 1.92), 0.32, 0.28, n=5)    # thick neck
B.add(C, 0.43, size=(1.08, 1.0, 0.86))                        # proud head
for s in (-1, 1):
    B.add((1.10, 0.28 * s, 1.88), 0.16)                       # heavy cheeks
B.add(P['snout'], P['snout_r'], size=P['snout_size'], stiff=3.0)   # muzzle
B.add((1.06, 0, 1.80), 0.20, size=(1.4, 0.95, 0.8))           # jaw / throat fill
GROUND = 0.0
FRONT_X, HIND_X, LY = 0.40, -0.68, 0.30
for s in (-1, 1):
    y = LY * s
    B.add((FRONT_X - 0.04, y * 1.05, 1.24), 0.34)             # big shoulder
    B.chain((FRONT_X, y, 1.10), (FRONT_X + 0.02, y, 0.55), 0.23, 0.15, n=5)    # forearm tapers to the wrist
    B.add((FRONT_X + 0.03, y, 0.34), 0.21, size=(1.05, 1.0, 1.25))             # gauntlet cuff flares out
    B.add((FRONT_X + 0.09, y, GROUND + 0.11), 0.17, size=(1.45, 1.05, 0.66), stiff=2.5)   # big paw
    B.add((HIND_X + 0.04, y, 1.18), 0.34, size=(1.1, 0.85, 1.05))                         # haunch
    B.chain((HIND_X + 0.02, y, 1.08), (HIND_X - 0.12, y, 0.56), 0.24, 0.15, n=5)
    B.add((HIND_X - 0.06, y, 0.34), 0.20, size=(1.05, 1.0, 1.25))              # hind gauntlet cuff
    B.add((HIND_X + 0.07, y, GROUND + 0.11), 0.17, size=(1.45, 1.05, 0.66), stiff=2.5)
# long tail rising up and back from the rump
for co, r in [((-0.92, 0.0, 1.36), 0.15), ((-1.10, 0.02, 1.52), 0.14), ((-1.24, 0.04, 1.72), 0.13), ((-1.32, 0.05, 1.92), 0.12)]:
    B.add(co, r)
body = B.mesh(voxel=0.022)
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
mat_iris = toon_material('eye', IRIS, glow=0.35, ink=INK)
mat_pupil = toon_material('pupil', PUPIL, ink=INK)
mat_glint = toon_material('glint', WHITE, glow=1.0, ink='#ffffff')
mat_nose = toon_material('nose', PUPIL, ink=INK)
mat_soot = toon_material('soot', SOOT, ink=INK)
mat_gold = toon_material('gold', GOLD_D, glow=0.15, ink='#8a5418')
mat_ember = toon_material('ember', EMBER, glow=0.75, ink='#b2321a')
mat_core = toon_material('ember_core', EMBER_CORE, glow=1.0, ink='#ff9a1e')
assign(body, mat_body)
parts = []
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

# ears: smaller than the kit's relative to the head, swept back between the horns
EAR = dict(c=(0.80, 0.30, 2.42), s=(0.10, 0.21, 0.38), rx=-24, ry=-30)
for s in (-1, 1):
    e = ellipsoid(f'ear{s}', (EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]), EAR['s'], rot=(EAR['rx'] * s, EAR['ry'], 0), taper=0.92)
    parts.append(assign(e, mat_body))
    # swept charcoal horns: from the brow back over the skull
    h = tube(f'horn{s}', [(0.98, 0.20 * s, 2.30), (0.86, 0.32 * s, 2.50), (0.62, 0.44 * s, 2.64), (0.36, 0.50 * s, 2.66)],
             [0.075, 0.062, 0.042, 0.016], res=10)
    parts.append(assign(h, mat_soot))

# golden eyes (iris + pupil + glint) under a heavy soot brow
for s in (-1, 1):
    p, n = snap((C.x + 1.0, P['eye_y'] * s, P['eye_z']), (C.x, P['eye_y'] * s, P['eye_z']))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f, roll=12 * s), mat_iris))
    parts.append(assign(ellipsoid(f'pupil{s}', ec + f * 0.03, (P['eye_w'] * 0.45, P['eye_h'] * 0.62, 0.025), track=f), mat_pupil))
    t = (Lw - f * Lw.dot(f)).normalized()
    g = ellipsoid(f'glint{s}', ec + t * (0.42 * P['eye_w']) + f * 0.042, (0.030, 0.033, 0.012), track=f)
    parts.append(assign(g, mat_glint))
    # brow: a soot ridge over the eye, tilted down toward the nose (fierce, not angry)
    bp, bn = snap((C.x + 1.0, (P['eye_y'] - 0.01) * s, P['eye_z'] + 0.15), (C.x, (P['eye_y'] - 0.01) * s, P['eye_z'] + 0.15))
    brow = ellipsoid(f'brow{s}', bp - bn * 0.02, (0.16, 0.05, 0.045), track=bn, roll=-90 + 22 * s)
    parts.append(assign(brow, mat_soot))

# nose, a short grim-proud mouth line and two small fangs
sx, sy, sz = P['snout']
tip, tn = snap((sx + 1, 0, sz + 0.05), (sx, 0, sz + 0.05))
parts.append(assign(ellipsoid('nose', tip - tn * 0.02, (0.06, 0.095, 0.066), rot=(180, 0, 0), taper=0.45), mat_nose))
zf = sz - 0.07
xt = sx + 0.20
mid, _ = snap((sx + 1, 0, zf - 0.02), (sx, 0, zf - 0.02))
lobe = {}
for s in (-1, 1):
    lobe[s] = [snap((x, s, z), (x, 0, z))[0] for (x, z) in ((xt - 0.03, zf - 0.024), (xt - 0.09, zf - 0.024), (xt - 0.15, zf - 0.016), (xt - 0.20, zf - 0.004))]
smile = list(reversed(lobe[-1])) + [mid] + lobe[1]
parts.append(assign(tube('mouth', [tuple(q) for q in smile], [0.007, 0.010, 0.012, 0.012, 0.012, 0.012, 0.012, 0.010, 0.007], res=8), mat_nose))
for s in (-1, 1):
    fp = lobe[s][0]
    parts.append(assign(ellipsoid(f'fang{s}', (fp.x - 0.005, fp.y * 0.9, fp.z - 0.035), (0.022, 0.022, 0.05), rot=(180, 0, 0), taper=0.9), mat_glint))

# flame crown between the horns
for i, (y, h, x) in enumerate(((0.0, 0.34, 0.90), (-0.11, 0.24, 0.86), (0.11, 0.24, 0.86))):
    parts.append(assign(ellipsoid(f'crown{i}', (x, y, 2.38 + h * 0.55), (0.10, 0.10, h), rot=(-14 * (y / 0.11 if y else 0), -12, 0), taper=0.9), mat_ember))
parts.append(assign(ellipsoid('crown_core', Vector((0.92, 0, 2.52)) + d_cam * 0.05, (0.055, 0.055, 0.18), rot=(0, -12, 0), taper=0.9), mat_core))
# fiery mane collar: tongues of flame around the neck, sweeping back
NC = Vector((0.66, 0, 1.72)); AX = Vector((0.55, 0, 0.83)).normalized()
U = Vector((0, 1, 0)); Wv = AX.cross(U).normalized()
for i in range(10):
    a = (i / 10) * math.tau + 0.25
    out = U * math.cos(a) + Wv * math.sin(a)
    if out.z < -0.55:
        continue                                            # no tongues under the throat
    base = NC + out * 0.30
    dirn = (out * 0.55 + Vector((-0.85, 0, 0.35))).normalized()
    hgt = 0.34 + 0.08 * (i % 2)
    q = ellipsoid(f'mane{i}', base + dirn * hgt * 0.55, (0.10, 0.10, hgt), track=dirn, taper=0.9)
    parts.append(assign(q, mat_ember if i % 3 else mat_core))
# ember studs along the spine
for i, (x, z) in enumerate(((0.12, 1.66), (-0.20, 1.62), (-0.50, 1.55))):
    parts.append(assign(ellipsoid(f'stud{i}', (x, 0, z), (0.07, 0.06, 0.10), rot=(0, -20, 0), taper=0.6), mat_core))
# comet flame on the tail tip
parts.append(assign(ellipsoid('ember', (-1.38, 0.05, 2.22), (0.27, 0.27, 0.50), rot=(0, -18, 0), taper=0.9), mat_ember))
parts.append(assign(ellipsoid('ember_core', Vector((-1.37, 0.05, 2.14)) + d_cam * 0.16, (0.14, 0.14, 0.30), rot=(0, -18, 0), taper=0.9), mat_core))
# gold claws on every paw
for (lx, ly) in ((FRONT_X, LY), (FRONT_X, -LY), (HIND_X, LY), (HIND_X, -LY)):
    for j, dy in enumerate((-0.07, 0.0, 0.07)):
        c0 = Vector((lx + 0.30, ly + dy, 0.05))
        parts.append(assign(ellipsoid(f'claw{lx}{ly}{j}', c0, (0.035, 0.03, 0.06), rot=(0, 75, 0), taper=0.85), mat_gold))

body = union(body, parts)
set_smooth(body, angle=50)

# ------------------------------------------------------------------ colour zones (vertex colours)
bm = vertex_slot_mask(body, {'body'})


def ear_local(co, s):
    R = np.array(Euler([math.radians(a) for a in (EAR['rx'] * s, EAR['ry'], 0)], 'XYZ').to_matrix())
    return (co - np.array((EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]))) @ R


def inner_ear(co, nm):
    m = np.zeros(len(co), dtype=bool)
    for s in (-1, 1):
        l = ear_local(co, s)
        t = np.clip((l[:, 2] + 0.05) / 0.36, 0, 1)
        m |= (l[:, 0] > 0.0) & (l[:, 2] > -0.05) & (l[:, 2] < 0.26) & (np.abs(l[:, 1]) < 0.16 * (1 - t) ** 0.8)
    return bm & m


def ear_back(co, nm):
    m = np.zeros(len(co), dtype=bool)
    for s in (-1, 1):
        l = ear_local(co, s)
        inside = (l[:, 0] / 0.13) ** 2 + (l[:, 1] / 0.24) ** 2 + (l[:, 2] / 0.41) ** 2 < 1.0
        m |= inside & (l[:, 0] < 0.02) & (l[:, 2] > -0.08)
    return bm & m


def mask(co, nm):
    ay = np.abs(co[:, 1])
    ztop = (P['eye_z'] - P['eye_h'] - 0.03) + 0.12 * np.clip((ay - 0.26) / 0.26, 0, 1) ** 1.5
    jaw = 1.74 + 0.80 * (co[:, 0] - 1.12) + 0.20 * np.clip((ay - 0.22) / 0.4, 0, 1)
    back = (co[:, 0] - 0.80) > 0.6 * (1.78 - co[:, 2])
    return bm & (co[:, 2] < np.minimum(ztop, jaw)) & (co[:, 2] > 1.40) & back


zones = [
    (lambda co, nm: bm & (co[:, 2] < 0.98) & (co[:, 2] > 0.70) & (np.abs(co[:, 1]) < 0.34) & (co[:, 0] > -0.75) & (co[:, 0] < 0.30), GOLD),  # belly
    (lambda co, nm: bm & (((co[:, 0] - 0.78) / 0.24) ** 2 + (co[:, 1] / 0.34) ** 2 + ((co[:, 2] - 1.40) / 0.40) ** 2 < 1), GOLD),           # chest
    (mask, GOLD),
    (inner_ear, GOLD),
    (ear_back, EAR_BACK),
    (lambda co, nm: bm & (co[:, 2] < 0.58) & (co[:, 0] > -0.95), SOOT),                                # gauntlets
    (lambda co, nm: bm & (co[:, 2] < 0.66) & (co[:, 2] >= 0.58) & (co[:, 0] > -0.95), GOLD_D),         # gold bands
]
paint_zones(body, CRIMSON, zones, mask=bm)
smoothstep_blend(body, 'Col', iters=1)


# ------------------------------------------------------------------ battle pose: head turned toward the camera (shape key)
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


PIV = np.array((0.62, 0.0, 1.52))


def head_weight(co):
    w = np.maximum(smooth(1.70, 1.92, co[:, 2]), smooth(0.92, 1.10, co[:, 0]) * smooth(1.55, 1.75, co[:, 2]))
    return w * smooth(0.10, 0.35, co[:, 0])


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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'pyrelord_final.blend')))
print(f'PYRELORD total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
