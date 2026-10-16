"""Stormoth - Spark line stage 2 (docs/CREATURES.md): a big moth with wide storm wings held in a V; slower wingbeats,
hovers higher (lowest point HOVER above the floor).

Signature: indigo wings with a yellow lightning bolt and cloud spots, a white storm-cloud ruff, feathery antennae.
Palette: gold, indigo, violet, cloud white. Built with the Ashkit recipe; each wing (with its bolt and spots), each
antenna and the abdomen have their own materials so the rig claims them exactly; 'battle' key turns the whole body
toward the camera. Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
HOVER = 0.34
C = Vector((0.0, 0.0, HOVER + 0.36))          # thorax
H = Vector((0.30, 0.0, C.z + 0.10))           # head
P = dict(eye_y=0.11, eye_z=H.z + 0.03, eye_w=0.085, eye_h=0.105, eye_d=0.04, eye_out=0.014, eye_fwd=0.10, turn=16.0)

GOLD = srgb('#f0b432'); GOLD_D = srgb('#c88a1c'); FACE = srgb('#ffe4a0'); INDIGO = srgb('#3d2fa0'); VIOLET = srgb('#7a4ad0')
BOLT = srgb('#ffe23a'); CLOUD = srgb('#f4f6ff'); EYE = srgb('#1a1430'); WHITE = srgb('#ffffff')
INK = '#1a1030'

B = Blob('stormoth', resolution=0.03)
B.add(C, 0.30)                                # the fuzzy gold thorax
body = B.mesh(voxel=0.016)
displace(body, strength=0.018, scale=0.10, tex_type='CLOUDS', depth=2)
HB = Blob('head', resolution=0.03)
HB.add(H, 0.24)
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


def side(s):
    return 'L' if s > 0 else 'R'


mat_body = toon_material('body', attr='Col', ink=INK)
mat_eye = toon_material('eye', EYE, ink=INK)
mat_glint = toon_material('glint', WHITE, glow=1.0, ink='#ffffff')
mat_mouth = toon_material('mouth', srgb('#5a3410'), ink=INK)
mat_ruff = toon_material('ruff', CLOUD, ink=INK)
mat_abd = toon_material('abdomen', GOLD, ink=INK)
mat_aband = toon_material('aband', VIOLET, ink=INK)
mat_wing = {s: toon_material(f'wing{side(s)}', INDIGO, ink=INK) for s in (-1, 1)}
mat_bolt = {s: toon_material(f'bolt{side(s)}', BOLT, glow=0.6, ink='#7a5a00') for s in (-1, 1)}
mat_spot = {s: toon_material(f'spot{side(s)}', CLOUD, ink=INK) for s in (-1, 1)}
mat_ant = {s: toon_material(f'ant{side(s)}', GOLD_D, ink=INK) for s in (-1, 1)}
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
mz = H.z - 0.09
pts = [snap((1.0, y, mz + 0.02 * (abs(y) / 0.07) ** 2), (H.x - 0.05, y, mz + 0.02 * (abs(y) / 0.07) ** 2))[0] for y in (-0.07, -0.035, 0.0, 0.035, 0.07)]
parts.append(assign(tube('mouth', [tuple(p) for p in pts], [0.006, 0.008, 0.009, 0.008, 0.006], res=8), mat_mouth))

# the white storm-cloud ruff: a ring of cloud puffs around the neck
RB = Blob('ruff', resolution=0.025)
for i in range(11):
    a = i * math.tau / 11
    RB.add((0.14, 0.25 * math.cos(a), C.z + 0.04 + 0.23 * math.sin(a)), 0.10 + 0.02 * (i % 2), stiff=3.0)
parts.append(assign(RB.mesh(voxel=0.014), mat_ruff))

# the abdomen: a tapered gold segment hanging behind, with violet bands
A0 = Vector((C.x - 0.40, 0, C.z - 0.14))
parts.append(assign(ellipsoid('abdomen', A0, (0.34, 0.20, 0.19), rot=(0, 18, 180), taper=0.55, taper_axis=0), mat_abd))
for i, dx in enumerate((0.10, -0.06, -0.20)):
    t = ((-dx / (0.34 * 0.951)) + 1) / 2                     # where the band sits along the taper (ellipsoid's own +x is world -x)
    r = 0.20 * (1 - 0.55 * t ** 1.6) + 0.008       # flush with the abdomen, a hair proud
    parts.append(assign(ellipsoid(f'aband{i}', A0 + Vector((dx, 0, dx * 0.325)), (0.03, r, r * 0.95), rot=(0, -18, 0)), mat_aband))   # along the drooping axis

# the wings: forewing + hindwing outlines in the wing's own plane (x forward, y out), the bolt and two cloud spots
# joined on, then raised into a V and swept back
FORE = smooth_closed([(0.08, 0.04), (0.22, 0.32), (0.30, 0.66), (0.20, 0.94), (-0.04, 0.90), (-0.18, 0.62), (-0.14, 0.30), (-0.04, 0.06)], subdiv=5)
HIND = smooth_closed([(-0.06, 0.04), (-0.14, 0.26), (-0.34, 0.50), (-0.50, 0.44), (-0.44, 0.20), (-0.22, 0.03)], subdiv=5)
BOLTP = [(0.17, 0.14), (0.01, 0.46), (0.13, 0.48), (-0.04, 0.84), (0.25, 0.40), (0.11, 0.38), (0.25, 0.14)]
for s in (-1, 1):
    m = 1 if s > 0 else -1
    fore = slab(f'fore{s}', [(x, y * m) for x, y in FORE], 0.024, plane='XY', bevel=0.004)
    hind = slab(f'hind{s}', [(x, y * m) for x, y in HIND], 0.022, plane='XY', bevel=0.004)
    bolt = slab(f'bolt{s}', [(x, y * m) for x, y in BOLTP], 0.034, plane='XY')
    spots = [ellipsoid(f'spot{s}{j}', (x, y * m, 0), (r, r, 0.016)) for j, (x, y, r) in enumerate(((-0.02, 0.72, 0.07), (-0.34, 0.38, 0.065), (0.06, 0.86, 0.04)))]
    assign(fore, mat_wing[s]); assign(hind, mat_wing[s]); assign(bolt, mat_bolt[s])
    for o in spots:
        assign(o, mat_spot[s])
    wing = union(fore, [hind, bolt] + spots)
    wing.location = (C.x - 0.06, 0.16 * s, C.z + 0.10)
    wing.rotation_euler = Euler((math.radians(34 * s), math.radians(-6), math.radians(-12 * s)), 'XYZ')
    apply_xform(wing)
    parts.append(wing)

# feathery antennae: a stalk curving up and out, ending in a flat feather
for s in (-1, 1):
    a0, _ = snap((H.x + 0.06, 0.08 * s, 3.0), (H.x + 0.06, 0.08 * s, H.z))
    stalk = [tuple(a0 + Vector((0, 0, -0.03))), tuple(a0 + Vector((0.04, 0.05 * s, 0.10))), tuple(a0 + Vector((0.04, 0.11 * s, 0.20)))]
    parts.append(assign(tube(f'stalk{s}', stalk, [0.016, 0.014, 0.012], res=8), mat_ant[s]))
    parts.append(assign(ellipsoid(f'feather{s}', a0 + Vector((0.02, 0.15 * s, 0.30)), (0.03, 0.075, 0.16), rot=(-20 * s, -12, 0), taper=0.45, taper_axis=2), mat_ant[s]))

body = union(body, parts)
set_smooth(body, angle=50)

bm = vertex_slot_mask(body, {'body'})
zones = [
    (lambda co, nm: bm & (co[:, 0] > H.x + 0.08) & ((co[:, 1] / 0.18) ** 2 + ((co[:, 2] - (H.z - 0.05)) / 0.15) ** 2 < 1), FACE),
    (lambda co, nm: bm & (co[:, 0] < H.x - 0.10) & (co[:, 2] < C.z - 0.12), GOLD_D),
]
paint_zones(body, GOLD, zones, mask=bm)
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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'stormoth_final.blend')))
co, _ = mesh_arrays(body)
print(f'STORMOTH total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}, zmin {co[:, 2].min():.3f} zmax {co[:, 2].max():.3f}')
