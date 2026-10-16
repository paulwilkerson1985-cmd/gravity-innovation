"""Verdantusk - the Flora line's final stage (docs/CREATURES.md): a massive, low, pillar-legged thicket beast.

Heavy brow, small fierce eyes, big curved ivory tusks, leaf ears, a thistle crown. Signature: a grove growing on
its back (two little trees, bushes, ferns, pink blossoms). Pillar legs: mossy thighs, bark shins, ivory toenails.
Palette: deep green, lime belly, bark brown, ivory, pink. Built with the Ashkit recipe (see ../cindertail/model.py).
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
    eye_y=0.27, eye_z=1.25, eye_w=0.12, eye_h=0.12, eye_d=0.044, eye_out=0.014, eye_fwd=0.18,
    snout=(1.46, 0.0, 1.04), snout_r=0.25, snout_size=(0.95, 1.05, 0.82),
    head_turn=14.0, head_lift=3.0,
)

GREEN = srgb('#2c8c3a'); LIME = srgb('#c9ef8a'); BARK = srgb('#6b4a2e'); IVORY = srgb('#fff1d0'); PINK = srgb('#e05ab8')
LEAF_L = srgb('#5fcf4a'); LEAF_D = srgb('#1f6e2c'); EYE = srgb('#1c2a18'); WHITE = srgb('#ffffff'); NOSE = srgb('#2a3a22')
INK = '#102010'

# ------------------------------------------------------------------ blockout (metaballs)
C = Vector((1.06, 0.0, 1.22))          # head centre: low, slung in front of the shoulders
B = Blob('verdantusk', resolution=0.045)
B.add((-0.20, 0, 1.12), 0.64, size=(1.40, 1.02, 0.80))         # massive barrel
B.add((0.46, 0, 1.18), 0.58, size=(0.95, 1.0, 0.92))           # front mass, shoulders
B.add(C, 0.44, size=(1.05, 1.0, 0.92))                         # heavy head
B.add(P['snout'], P['snout_r'], size=P['snout_size'], stiff=3.0)   # broad snout
B.add((1.20, 0, 1.52), 0.19, size=(1.15, 1.7, 0.5), stiff=3.0)     # heavy brow ridge (above the eyes, not over them)
GROUND = 0.0
FRONT_X, HIND_X, LY = 0.48, -0.76, 0.42
for s in (-1, 1):
    y = LY * s
    for lx in (FRONT_X, HIND_X):
        B.add((lx, y * 0.95, 1.00), 0.34)                      # mossy thigh
        B.chain((lx, y, 0.86), (lx + 0.03, y, 0.18), 0.27, 0.25, n=5)   # pillar
        B.add((lx + 0.05, y, GROUND + 0.12), 0.27, size=(1.15, 1.1, 0.55), stiff=2.5)   # round foot
body = B.mesh(voxel=0.024)
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
mat_ivory = toon_material('ivory', IVORY, ink='#7a6a48')
mat_bark = toon_material('bark', BARK, ink=INK)
mat_leaf_l = toon_material('leaf_l', LEAF_L, ink=INK)
mat_leaf_d = toon_material('leaf_d', LEAF_D, ink=INK)
mat_pink = toon_material('pink', PINK, glow=0.15, ink='#6a1858')
assign(body, mat_body)
parts = []
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

# leaf ears: big drooping leaves out to the sides
EAR = dict(c=(0.82, 0.60, 1.50), rx=-10, ry=10)
for s in (-1, 1):
    parts.append(assign(ellipsoid(f'ear{s}', (EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]), (0.22, 0.32, 0.06), rot=(-34 * s, 10, 22 * s), taper=0.5, taper_axis=1), mat_body))

# small fierce eyes tucked under the brow
for s in (-1, 1):
    p, n = snap((C.x + 1.0, P['eye_y'] * s, P['eye_z']), (C.x, P['eye_y'] * s, P['eye_z']))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f), mat_eye))
    t = (Lw - f * Lw.dot(f)).normalized()
    parts.append(assign(ellipsoid(f'glint{s}', ec + t * (0.4 * P['eye_w']) + f * 0.036, (0.034, 0.036, 0.012), track=f), mat_glint))

# nostrils on the broad snout, and the big curved ivory tusks from the corners of the mouth
sx, sy, sz = P['snout']
for s in (-1, 1):
    np_, nn = snap((sx + 1, 0.09 * s, sz + 0.05), (sx, 0.09 * s, sz + 0.05))
    parts.append(assign(ellipsoid(f'nostril{s}', np_ - nn * 0.01, (0.035, 0.045, 0.03), track=nn), mat_nose))
    root, _ = snap((sx - 0.05, s, sz - 0.12), (sx - 0.05, 0, sz - 0.12))
    tusk = [tuple(root), (root.x + 0.20, root.y + 0.08 * s, root.z - 0.10), (root.x + 0.38, root.y + 0.13 * s, root.z + 0.04),
            (root.x + 0.44, root.y + 0.10 * s, root.z + 0.34)]
    parts.append(assign(tube(f'tusk{s}', tusk, [0.085, 0.075, 0.055, 0.02], res=10), mat_ivory))
# ivory toenails: three on the front of every foot
for (lx, ly) in ((FRONT_X, LY), (FRONT_X, -LY), (HIND_X, LY), (HIND_X, -LY)):
    for j, dy in enumerate((-0.13, 0.0, 0.13)):
        parts.append(assign(ellipsoid(f'nail{lx}{ly}{j}', (lx + 0.30, ly + dy, 0.08), (0.055, 0.06, 0.06)), mat_ivory))


def thistle(name, c, r):
    parts.append(assign(ellipsoid(f'{name}_calyx', Vector(c) - Vector((0, 0, r * 0.7)), (r * 0.8, r * 0.8, r * 0.6)), mat_leaf_d))
    parts.append(assign(ellipsoid(f'{name}', c, (r, r, r * 0.85)), mat_pink))
    for i in range(9):
        a = i * 2.39996; zz = 0.25 + 0.7 * (i / 8)
        dirn = Vector((math.cos(a) * math.sqrt(1 - zz * zz), math.sin(a) * math.sqrt(1 - zz * zz), zz)).normalized()
        parts.append(assign(ellipsoid(f'{name}_sp{i}', Vector(c) + dirn * r, (r * 0.22, r * 0.22, r * 0.6), track=dirn, taper=0.9), mat_pink))


# thistle crown on the brow
thistle('crown', (1.10, 0.0, 1.78), 0.10)
for s in (-1, 1):
    thistle(f'crown{s}', (1.04, 0.16 * s, 1.72), 0.075)

# the grove on the back: probe the back's top, then plant two little trees, bushes, ferns and blossoms on it


def ground_on_back(x, y):
    p, _ = snap((x, y, 5.0), (x, y, 1.0))
    return p


def tree(name, x, y, h, crown, cols):
    b = ground_on_back(x, y)
    trunk = [tuple(b - Vector((0, 0, 0.05))), (b.x + 0.02, b.y, b.z + h * 0.55), (b.x - 0.01, b.y, b.z + h)]
    parts.append(assign(tube(f'{name}_trunk', trunk, [0.07, 0.055, 0.045], res=8), mat_bark))
    top = Vector((b.x, b.y, b.z + h + crown * 0.55))
    for j, (o, r) in enumerate(((Vector((0, 0, 0)), crown), (Vector((crown * 0.6, 0.1, -crown * 0.3)), crown * 0.72),
                                (Vector((-crown * 0.55, -0.08, -crown * 0.25)), crown * 0.7))):
        parts.append(assign(ellipsoid(f'{name}_c{j}', top + o, (r, r, r * 0.85)), cols[j % 2]))
    # pink blossoms dotted on the crown
    for j in range(4):
        a = j * 1.9 + 0.6
        q = top + Vector((math.cos(a) * crown * 0.8, math.sin(a) * crown * 0.8, crown * 0.35))
        parts.append(assign(ellipsoid(f'{name}_b{j}', q, (0.05, 0.05, 0.04)), mat_pink))


tree('tree0', -0.12, 0.10, 0.52, 0.32, (mat_leaf_l, mat_leaf_d))
tree('tree1', -0.58, -0.14, 0.36, 0.24, (mat_leaf_d, mat_leaf_l))
for i, (x, y, r, m) in enumerate(((0.30, -0.18, 0.20, mat_leaf_d), (-0.48, 0.30, 0.18, mat_leaf_l), (0.18, 0.28, 0.15, mat_leaf_l))):
    b = ground_on_back(x, y)
    parts.append(assign(ellipsoid(f'bush{i}', b + Vector((0, 0, r * 0.4)), (r, r, r * 0.8)), m))
for i, (x, y, a) in enumerate(((0.05, -0.32, -50), (-0.32, -0.36, -30), (0.36, 0.34, 40), (-0.80, 0.0, 0))):
    b = ground_on_back(x, y)
    parts.append(assign(ellipsoid(f'fern{i}', b + Vector((0, 0, 0.14)), (0.06, 0.04, 0.24), rot=(a * 0.6, -14, a), taper=0.8), mat_leaf_l))
# leaf tail
parts.append(assign(ellipsoid('tail0', (-1.04, 0, 1.12), (0.26, 0.04, 0.12), rot=(0, 35, 0), taper=0.6, taper_axis=0), mat_leaf_d))

body = union(body, parts)
set_smooth(body, angle=50)

# ------------------------------------------------------------------ colour zones (vertex colours)
bm = vertex_slot_mask(body, {'body'})
zones = [
    (lambda co, nm: bm & (co[:, 2] < 0.78) & (co[:, 2] > 0.48) & (np.abs(co[:, 1]) < 0.36) & (co[:, 0] > -0.70) & (co[:, 0] < 0.40), LIME),   # belly
    (lambda co, nm: bm & (((co[:, 0] - 0.86) / 0.24) ** 2 + (co[:, 1] / 0.40) ** 2 + ((co[:, 2] - 0.98) / 0.30) ** 2 < 1), LIME),          # throat
    (lambda co, nm: bm & (co[:, 0] > 1.30) & (co[:, 2] < 1.18), LIME),                                     # snout
    (lambda co, nm: bm & (co[:, 0] > 1.10) & (co[:, 2] > 1.44) & (co[:, 2] < 1.64) & (np.abs(co[:, 1]) < 0.44), LEAF_D),   # brow
    (lambda co, nm: bm & (co[:, 2] < 0.64) & (np.abs(co[:, 1]) > 0.20), BARK),                            # bark shins
]
paint_zones(body, GREEN, zones, mask=bm)
smoothstep_blend(body, 'Col', iters=1)


# ------------------------------------------------------------------ battle pose: head turned toward the camera (shape key)
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


PIV = np.array((0.70, 0.0, 1.16))


def head_weight(co):
    return smooth(0.76, 0.94, co[:, 0]) * smooth(0.40, 0.60, co[:, 2])


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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'verdantusk_final.blend')))
print(f'VERDANTUSK total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
