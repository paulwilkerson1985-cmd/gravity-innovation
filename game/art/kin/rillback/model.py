"""Rillback - Tide line stage 2 (docs/CREATURES.md): a low, long river otter on webbed paws, round head, whiskers.

Signature: the broad flat surfboard back (white with a navy racing stripe) and a paddle tail with a fluke.
Palette: blue, pale aqua belly, white board, navy stripe. Built with the Ashkit recipe (see ../cindertail/model.py).
Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(
    eye_y=0.22, eye_z=1.36, eye_w=0.11, eye_h=0.13, eye_d=0.044, eye_out=0.014, eye_fwd=0.14,
    snout=(1.42, 0.0, 1.18), snout_r=0.19, snout_size=(0.95, 1.25, 0.78),
    head_turn=16.0, head_lift=4.0,
)

BLUE = srgb('#2d8fe0'); AQUA = srgb('#c4ebff'); BOARD = srgb('#f2fbff'); STRIPE = srgb('#1d5fc4'); DARK = srgb('#163a6e')
EYE = srgb('#14233e'); WHITE = srgb('#ffffff')
INK = '#0e1c36'

# ------------------------------------------------------------------ blockout (metaballs)
C = Vector((1.08, 0.0, 1.30))          # head centre
B = Blob('rillback', resolution=0.035)
B.add((-0.18, 0, 0.74), 0.42, size=(1.95, 0.98, 0.78))         # long low body
B.add((0.52, 0, 0.84), 0.38, size=(1.0, 0.98, 0.95))           # chest
B.add((-0.62, 0, 0.80), 0.32, size=(1.3, 0.95, 0.85))           # full rump: the back stays level under the board
B.chain((0.62, 0, 0.92), (0.86, 0, 1.14), 0.30, 0.27, n=5)     # thick otter neck
B.add(C, 0.40, size=(1.02, 1.0, 0.90))                         # round head
B.add(P['snout'], P['snout_r'], size=P['snout_size'], stiff=3.0)   # blunt whisker pad
GROUND = 0.0
FRONT_X, HIND_X, LY = 0.48, -0.70, 0.32
for s in (-1, 1):
    y = LY * s
    B.chain((FRONT_X, y * 0.95, 0.62), (FRONT_X + 0.04, y, 0.14), 0.14, 0.12, n=5)          # short front legs
    B.add((FRONT_X + 0.10, y * 1.05, GROUND + 0.07), 0.15, size=(1.5, 1.25, 0.55), stiff=2.5)   # webbed paw
    B.add((HIND_X + 0.04, y * 0.9, 0.62), 0.27, size=(1.15, 0.85, 1.0))                     # haunch
    B.chain((HIND_X + 0.02, y, 0.52), (HIND_X - 0.02, y, 0.14), 0.15, 0.12, n=4)
    B.add((HIND_X + 0.08, y * 1.05, GROUND + 0.07), 0.15, size=(1.5, 1.25, 0.55), stiff=2.5)
# paddle tail: thick at the root, flattening and tapering back along the ground
for co, r in [((-1.02, 0, 0.62), 0.22), ((-1.24, 0, 0.50), 0.18), ((-1.44, 0, 0.40), 0.14)]:
    B.add(co, r, size=(1.0, 1.25, 0.62))
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
mat_nose = toon_material('nose', DARK, ink=INK)
mat_board = toon_material('board', BOARD, ink=INK)
mat_stripe = toon_material('stripe', STRIPE, ink=INK)
mat_whisker = toon_material('whisker', WHITE, glow=0.6, ink='#ffffff')
assign(body, mat_body)
parts = []
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

# small round ears with dark insides
EAR = dict(c=(0.92, 0.36, 1.62), rx=-20, ry=-10)
for s in (-1, 1):
    e = ellipsoid(f'ear{s}', (EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]), (0.07, 0.12, 0.12), rot=(EAR['rx'] * s, EAR['ry'], 0))
    parts.append(assign(e, mat_body))
    parts.append(assign(ellipsoid(f'earin{s}', (EAR['c'][0] + 0.045, EAR['c'][1] * s * 0.98, EAR['c'][2] - 0.01), (0.03, 0.07, 0.07), rot=(EAR['rx'] * s, EAR['ry'], 0)), mat_nose))

for s in (-1, 1):
    p, n = snap((C.x + 1.0, P['eye_y'] * s, P['eye_z']), (C.x, P['eye_y'] * s, P['eye_z']))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f), mat_eye))
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.45, 0.038), (-0.55, 0.018))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u = abs(off)
        loc = ec + dirv * (u * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u * u)) - 0.004)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.013), track=f), mat_glint))

sx, sy, sz = P['snout']
tip, tn = snap((sx + 1, 0, sz + 0.06), (sx, 0, sz + 0.06))
parts.append(assign(ellipsoid('nose', tip - tn * 0.02, (0.05, 0.10, 0.06), rot=(180, 0, 0), taper=0.35), mat_nose))
zf = sz - 0.05
xt = sx + 0.12
mid, _ = snap((sx + 1, 0, zf - 0.03), (sx, 0, zf - 0.03))
lobe = {}
for s in (-1, 1):
    lobe[s] = [snap((x, s, z), (x, 0, z))[0] for (x, z) in ((xt - 0.02, zf - 0.028), (xt - 0.06, zf - 0.022), (xt - 0.10, zf - 0.010), (xt - 0.13, zf + 0.004))]
smile = list(reversed(lobe[-1])) + [mid] + lobe[1]
parts.append(assign(tube('mouth', [tuple(q) for q in smile], [0.006, 0.009, 0.011, 0.011, 0.011, 0.011, 0.011, 0.009, 0.006], res=8), mat_nose))
# whiskers: two white strokes fanning from each side of the pad
for s in (-1, 1):
    for j, dz in enumerate((0.03, -0.03)):
        a, _ = snap((sx, s, sz + dz), (sx, 0, sz + dz))
        b = a + Vector((-0.05, 0.22 * s, dz * 1.5))
        parts.append(assign(tube(f'whisker{s}{j}', [tuple(a), tuple(a.lerp(b, 0.5) + Vector((0, 0, 0.01))), tuple(b)], [0.012, 0.010, 0.006], res=6), mat_whisker))

# the surfboard back: a broad flat white board with a navy racing stripe, nose toward the head
# probe the back's height under the board's middle and seat the board on it
top, _ = snap((-0.16, 0, 3.0), (-0.16, 0, 0.7))
bz = top.z + 0.02
# (polish review 2: a thicker board with rocker, pitched so its top face turns to the battle camera, and a wider stripe;
# the 0.065 plate read as a white sliver from the foe camera)
BX, BPITCH, ROCKER, TAIL_LIFT = -0.14, 4.0, 0.07, 0.03


def bend_board(o):
    """Rocker (nose and tail curve up) and a pitch that drops the nose toward the camera and lifts the tail."""
    me = o.data
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    u = (co[:, 0] - BX) / 0.80
    co[:, 2] += ROCKER * u ** 2 - math.tan(math.radians(BPITCH)) * (co[:, 0] - BX) + TAIL_LIFT * np.clip(-u, 0, 1)
    me.vertices.foreach_set('co', co.ravel()); me.update()
    return o


board = bend_board(ellipsoid('board', (BX, 0, bz), (0.80, 0.40, 0.11), segs=64, rings=32))
parts.append(assign(board, mat_board))
# the stripe is a narrower, slightly taller copy of the board's lens: flush along its length, no floating band
stripe = bend_board(ellipsoid('stripe', (BX, 0, bz), (0.76, 0.11, 0.124), segs=64, rings=32))
parts.append(assign(stripe, mat_stripe))
facing(board, d_cam, label='board top (battle camera)')
print('  board seated at z', round(bz, 3))
# (the head fin is cut: it is not in docs/CREATURES.md and read as a stray spike)
# tail fluke: two thick lobes in a V with a notch between them (polish review 2: the flat disc read as a plate)
for s in (-1, 1):
    parts.append(assign(ellipsoid(f'fluke{s}', (-1.64, 0.15 * s, 0.37), (0.17, 0.25, 0.08), rot=(0, 8, -32 * s)), mat_board))

body = union(body, parts)
set_smooth(body, angle=50)

# ------------------------------------------------------------------ colour zones (vertex colours)
bm = vertex_slot_mask(body, {'body'})
zones = [
    (lambda co, nm: bm & (co[:, 2] < 0.12), STRIPE),                                                      # webbed paws
]
paint_zones(body, BLUE, zones, mask=bm)
smoothstep_blend(body, 'Col', iters=1)


def belly_sd(co, nm):
    # ellipsoid AND downward faces only: the box zone also painted the inner legs (polish review 2, cross-kin 1)
    return np.maximum(sd_ellipse((-0.18, 0, 0.42), (0.66, 0.30, 0.20))(co, nm), (nm[:, 2] + 0.45) * 0.2)


paint_soft(body, [(belly_sd, AQUA),
                  (sd_ellipse((0.80, 0, 0.92), (0.24, 0.30, 0.32)), AQUA),                            # chest / throat
                  (sd_ellipse((1.46, 0, 1.12), (0.25, 0.28, 0.14)), AQUA)], mask=bm, edge=0.012)      # whisker pad (snout ellipsoid)


# ------------------------------------------------------------------ battle pose: head turned toward the camera (shape key)
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


PIV = np.array((0.66, 0.0, 0.96))


def head_weight(co):
    return smooth(0.74, 0.92, co[:, 0]) * smooth(0.80, 0.98, co[:, 2])


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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'rillback_final.blend')))
print(f'RILLBACK total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
