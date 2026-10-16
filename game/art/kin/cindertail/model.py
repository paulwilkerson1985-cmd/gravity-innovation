"""Cindertail - Ashkit's evolution: a lanky adolescent fox (docs/CREATURES.md, Flame line).

Long legs, a long snout, swept-back ears and slanted eyes. Signature: a bushy tail ending in a big flame plume,
a cream flame ruff on the chest, tall soot boots. Palette: vermilion, cream, charcoal, gold.
Built with the Ashkit recipe (../../ashkit/scripts/ashkit_v2.py): metaball blockout -> voxel remesh -> face parts
snapped onto the skull with a BVH ray cast -> Boolean union -> vertex-colour zones -> 'battle' head turn shape
key. Keeps Ashkit's lineage marks: dark ear backs, sooty ear tips, cream mask below the eyes, ember tail.
Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND (default ./cindertail_final.blend).
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(
    eye_y=0.24, eye_z=1.70, eye_w=0.115, eye_h=0.15, eye_d=0.045, eye_out=0.014, eye_fwd=0.12, eye_slant=16.0,
    snout=(1.00, 0.0, 1.55), snout_r=0.19, snout_size=(1.75, 0.78, 0.70),
    head_turn=16.0, head_lift=4.0,
)

ORANGE = srgb('#f0502a'); CREAM = srgb('#ffdca6'); SOOT = srgb('#34263b'); GOLD = srgb('#ffcc33')
EMBER = srgb('#ffb02a'); EMBER_CORE = srgb('#fff3b0'); EYE = srgb('#2b1a1e'); WHITE = srgb('#ffffff'); NOSE = srgb('#2b1a1e')
EAR_BACK = srgb('#4a2a26')
INK = '#2a1418'

# ------------------------------------------------------------------ blockout (metaballs)
C = Vector((0.64, 0.0, 1.66))          # head centre (smaller than the kit's, relative to the body)
B = Blob('cindertail', resolution=0.035)
B.add((-0.12, 0, 0.92), 0.40, size=(1.45, 0.82, 0.78))         # long body
B.add((0.28, 0, 1.02), 0.31, size=(1.0, 0.92, 1.08))           # deep chest
B.chain((0.36, 0, 1.12), (0.56, 0, 1.46), 0.24, 0.21, n=5)     # neck, rising forward
B.add(C, 0.37, size=(1.06, 1.0, 0.88))                         # head
for s in (-1, 1):
    B.add((0.80, 0.27 * s, 1.52), 0.15)                        # cheek fluff
B.add(P['snout'], P['snout_r'], size=P['snout_size'], stiff=3.0)  # long snout
B.add((0.76, 0, 1.44), 0.17, size=(1.4, 0.9, 0.8))            # jaw / throat fill (no fold under the snout)
GROUND = 0.0
FRONT_X, HIND_X = 0.26, -0.50
for s in (-1, 1):
    y = 0.20 * s
    # front legs: straight, long, under the shoulders
    B.add((FRONT_X - 0.02, y, 0.92), 0.21)                     # shoulder
    B.chain((FRONT_X, y, 0.86), (FRONT_X + 0.01, y, 0.16), 0.125, 0.10, n=7)
    B.add((FRONT_X + 0.07, y, GROUND + 0.085), 0.12, size=(1.45, 0.95, 0.68), stiff=2.5)   # paw
    # hind legs: haunch, then thigh back to a hock, then a long cannon down to the paw
    B.add((HIND_X + 0.04, y, 0.86), 0.25, size=(1.1, 0.82, 1.05))   # haunch
    B.chain((HIND_X + 0.02, y, 0.80), (HIND_X - 0.10, y, 0.40), 0.15, 0.115, n=5)
    B.chain((HIND_X - 0.10, y, 0.40), (HIND_X - 0.02, y, 0.15), 0.11, 0.10, n=4)
    B.add((HIND_X + 0.05, y, GROUND + 0.085), 0.12, size=(1.45, 0.95, 0.68), stiff=2.5)
# bushy tail: thickens as it rises up and back from the rump
for co, r in [((-0.70, 0.02, 1.02), 0.16), ((-0.84, 0.04, 1.16), 0.22), ((-0.97, 0.06, 1.34), 0.26), ((-1.04, 0.07, 1.54), 0.25)]:
    B.add(co, r, size=(1.0, 0.92, 1.0))
body = B.mesh(voxel=0.018)
co, nm = mesh_arrays(body)
co[:, 2] = np.maximum(co[:, 2], GROUND)
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
print('  blockout tris', tri_count(body), f'{time.perf_counter() - T0:.1f}s', 'zmin', co[:, 2].min())

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
mat_ember = toon_material('ember', EMBER, glow=0.75, ink='#c8481c')
mat_core = toon_material('ember_core', EMBER_CORE, glow=1.0, ink='#ffb02a')
mat_ruff = toon_material('ruff', CREAM, ink=INK)
mat_ruff_gold = toon_material('ruff_gold', GOLD, glow=0.25, ink='#c0731c')
assign(body, mat_body)
parts = []
# ears: tall, swept back and tilted outward, seated deep in the skull
EAR = dict(c=(0.44, 0.27, 2.10), s=(0.11, 0.25, 0.48), rx=-22, ry=-26)
for s in (-1, 1):
    e = ellipsoid(f'ear{s}', (EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]), EAR['s'], rot=(EAR['rx'] * s, EAR['ry'], 0), taper=0.92)
    parts.append(assign(e, mat_body))

d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()
for s in (-1, 1):
    p, n = snap((C.x + 1.0, P['eye_y'] * s, P['eye_z']), (C.x, P['eye_y'] * s, P['eye_z']))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    # slanted: the outer corner lifts (roll about the eye's own axis)
    e = ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f, roll=P['eye_slant'] * s)
    parts.append(assign(e, mat_eye))
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.45, 0.040), (-0.55, 0.019))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u = abs(off)
        loc = ec + dirv * (u * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u * u)) - 0.004)
        g = ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.014), track=f)
        parts.append(assign(g, mat_glint))
    print('  eye', s, tuple(round(v, 3) for v in p))

# nose on the snout tip; a short upturned smile whose low point is its centre (as Ashkit after gate 1)
sx, sy, sz = P['snout']
tip, tn = snap((sx + 1, 0, sz + 0.04), (sx, 0, sz + 0.04))
nose = ellipsoid('nose', tip - tn * 0.02, (0.052, 0.080, 0.058), rot=(180, 0, 0), taper=0.45)
parts.append(assign(nose, mat_nose))
zf = sz - 0.06
xt = sx + 0.25          # the smile's centre sits a little behind the nose; ray origins stay inside the snout
mid, _ = snap((sx + 1, 0, zf - 0.035), (sx, 0, zf - 0.035))
lobe = {}
for s in (-1, 1):
    lobe[s] = [snap((x, s, z), (x, 0, z))[0] for (x, z) in ((xt - 0.03, zf - 0.031), (xt - 0.08, zf - 0.024), (xt - 0.13, zf - 0.012), (xt - 0.17, zf + 0.004))]
smile = list(reversed(lobe[-1])) + [mid] + lobe[1]
parts.append(assign(tube('mouth', [tuple(q) for q in smile], [0.006, 0.009, 0.011, 0.011, 0.011, 0.011, 0.011, 0.009, 0.006], res=8), mat_nose))
# flame plume on the tail tip (big), with a pale core turned toward the camera
fl = ellipsoid('ember', (-1.06, 0.07, 1.90), (0.27, 0.27, 0.44), rot=(0, -14, 0), taper=0.9)
parts.append(assign(fl, mat_ember))
fc = ellipsoid('ember_core', Vector((-1.05, 0.07, 1.84)) + d_cam * 0.16, (0.14, 0.14, 0.27), rot=(0, -14, 0), taper=0.9)
parts.append(assign(fc, mat_core))
# cream flame ruff on the chest: three tongues pointing down, the middle one gold-tipped
# (big enough to break the chest silhouette in profile, like a flame bib)
for i, (y, h, w, mat) in enumerate(((0.0, 0.34, 0.11, mat_ruff_gold), (-0.13, 0.29, 0.10, mat_ruff), (0.13, 0.29, 0.10, mat_ruff),
                                    (-0.22, 0.22, 0.08, mat_ruff), (0.22, 0.22, 0.08, mat_ruff))):
    t = ellipsoid(f'ruff{i}', (0.56 - 0.08 * abs(y), y, 1.10 - h * 0.30), (w * 0.8, w, h), rot=(0, 158, 0), taper=0.92)
    parts.append(assign(t, mat))

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
        t = np.clip((l[:, 2] + 0.05) / 0.45, 0, 1)
        m |= (l[:, 0] > 0.0) & (l[:, 2] > -0.05) & (l[:, 2] < 0.33) & (np.abs(l[:, 1]) < 0.19 * (1 - t) ** 0.8)
    return bm & m


def ear_back(co, nm):
    m = np.zeros(len(co), dtype=bool)
    for s in (-1, 1):
        l = ear_local(co, s)
        inside = (l[:, 0] / 0.14) ** 2 + (l[:, 1] / 0.28) ** 2 + (l[:, 2] / 0.51) ** 2 < 1.0
        m |= inside & (l[:, 0] < 0.02) & (l[:, 2] > -0.10)
    return bm & m


def ear_tip(co, nm):
    m = np.zeros(len(co), dtype=bool)
    for s in (-1, 1):
        m |= ear_local(co, s)[:, 2] > 0.27
    return bm & m


def mask(co, nm):
    # fox mask: snout, cheeks and jaw cream; the top edge passes below the eyes and sweeps up the cheek
    ay = np.abs(co[:, 1])
    ztop = (P['eye_z'] - P['eye_h'] - 0.03) + 0.12 * np.clip((ay - 0.26) / 0.26, 0, 1) ** 1.5
    jaw = 1.38 + 0.80 * (co[:, 0] - 0.80) + 0.20 * np.clip((ay - 0.20) / 0.4, 0, 1)
    back = (co[:, 0] - 0.50) > 0.6 * (1.40 - co[:, 2])
    return bm & (co[:, 2] < np.minimum(ztop, jaw)) & (co[:, 2] > 1.02) & back


zones = [
    (lambda co, nm: bm & (co[:, 2] < 0.70) & (co[:, 2] > 0.52) & (np.abs(co[:, 1]) < 0.26) & (co[:, 0] > -0.55) & (co[:, 0] < 0.18), CREAM),  # belly
    (lambda co, nm: bm & (((co[:, 0] - 0.52) / 0.22) ** 2 + (co[:, 1] / 0.26) ** 2 + ((co[:, 2] - 1.10) / 0.34) ** 2 < 1), CREAM),          # chest
    (mask, CREAM),
    (inner_ear, CREAM),
    (ear_back, EAR_BACK),
    (ear_tip, SOOT),
    (lambda co, nm: bm & (co[:, 2] < 0.36) & (co[:, 0] > -0.75), SOOT),   # tall soot boots
]
paint_zones(body, ORANGE, zones, mask=bm)
smoothstep_blend(body, 'Col', iters=1)


# ------------------------------------------------------------------ battle pose: head turned toward the camera (shape key)
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


PIV = np.array((0.40, 0.0, 1.10))


def head_weight(co):
    w = np.maximum(smooth(1.28, 1.48, co[:, 2]), smooth(0.62, 0.80, co[:, 0]) * smooth(1.10, 1.30, co[:, 2]))
    return w * smooth(-0.20, 0.05, co[:, 0])


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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'cindertail_final.blend')))
print(f'CINDERTAIL total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
