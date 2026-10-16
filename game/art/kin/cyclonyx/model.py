"""Cyclonyx - Gale line stage 2 (docs/CREATURES.md): a sleek raptor, wings raised in a V, hooked beak, fierce brow. It
hovers (lowest point HOVER above the floor).

Signature: two long tail streamers with orange tips; a swept crest; orange primaries. Palette: sky blue, light
underwings, white, orange. Built with the Ashkit recipe; the head is its own mesh joined by a boolean (a neck
crease); each wing (top, underwing, primaries) has its own materials so the rig claims it exactly; 'battle' key turns
the whole body toward the camera. Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
HOVER = 0.14
H = Vector((0.24, 0.0, HOVER + 0.80))          # head
P = dict(eye_y=0.10, eye_z=H.z + 0.03, eye_w=0.075, eye_h=0.085, eye_d=0.036, eye_out=0.013, eye_fwd=0.12, turn=16.0)

SKY = srgb('#4aa8f0'); SKY_D = srgb('#2f7fd0'); WHITE_B = srgb('#f4f8ff'); UNDER = srgb('#cfeaff'); ORANGE = srgb('#ff8a2a')
BEAK = srgb('#ffc04a'); EYE = srgb('#14203a'); WHITE = srgb('#ffffff')
INK = '#10203a'

B = Blob('cyclonyx', resolution=0.03)
B.add((0.04, 0, HOVER + 0.44), 0.30, size=(1.1, 0.95, 1.0))      # chest
B.add((-0.20, 0, HOVER + 0.38), 0.24, size=(1.2, 0.95, 0.9))     # back and belly
B.add((-0.42, 0, HOVER + 0.36), 0.13, size=(1.3, 1.0, 0.7))      # the tail root
B.add((0.16, 0, HOVER + 0.64), 0.17)                             # the neck
body = B.mesh(voxel=0.016)
HB = Blob('head', resolution=0.03)
HB.add(H, 0.22, size=(1.1, 1.0, 0.95))
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
mat_beak = toon_material('beak', BEAK, ink='#7a4a10')
mat_brow = toon_material('brow', SKY_D, ink=INK)
mat_crest = toon_material('crest', SKY_D, ink=INK)
mat_fan = toon_material('fan', WHITE_B, ink=INK)
mat_talon = toon_material('talon', ORANGE, ink='#7a3a10')
mat_streamer = toon_material('streamer', SKY_D, ink=INK)
mat_stip = toon_material('stip', ORANGE, glow=0.1, ink='#7a3a10')
mat_wing = {s: toon_material(f'wing{side(s)}', SKY, ink=INK) for s in (-1, 1)}
mat_under = {s: toon_material(f'under{side(s)}', UNDER, ink=INK) for s in (-1, 1)}
mat_prim = {s: toon_material(f'prim{side(s)}', ORANGE, ink='#7a3a10') for s in (-1, 1)}
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
    for k, (off, r) in enumerate(((0.45, 0.028), (-0.55, 0.013))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u = abs(off)
        loc = ec + dirv * (u * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u * u)) - 0.004)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.010), track=f), mat_glint))
    # the fierce brow: a slanted ridge cutting across the top of the eye, low over the beak
    bp, bn = snap((1.0, P['eye_y'] * s * 0.9, P['eye_z'] + 0.075), (H.x - 0.05, P['eye_y'] * s * 0.9, P['eye_z'] + 0.075))
    parts.append(assign(ellipsoid(f'brow{s}', bp + bn * 0.004, (0.035, 0.10, 0.026), track=bn, roll=90 + 24 * s), mat_brow))   # inner ends low: fierce, not worried
# the hooked beak: thick at the base, hooking down at the tip
b0, bn0 = snap((1.0, 0, H.z - 0.04), (H.x - 0.05, 0, H.z - 0.04))
hook = [tuple(b0 - bn0 * 0.04), tuple(b0 + Vector((0.08, 0, -0.005))), tuple(b0 + Vector((0.15, 0, -0.03))), tuple(b0 + Vector((0.17, 0, -0.09)))]
parts.append(assign(tube('beak', hook, [0.07, 0.05, 0.03, 0.01], res=8), mat_beak))
# the swept crest: three feathers raking back from the crown
top, _ = snap((H.x - 0.04, 0, 3.0), (H.x - 0.04, 0, H.z))
for i, (y, l, ry) in enumerate(((0.0, 0.24, 62), (0.05, 0.19, 56), (-0.05, 0.19, 56))):
    parts.append(assign(ellipsoid(f'crest{i}', top + Vector((-0.10, y, 0.04)), (l, 0.035, 0.03), rot=(0, -ry + 90 - 70, 180), taper=0.8, taper_axis=0), mat_crest))
# tucked talons
for s in (-1, 1):
    parts.append(assign(ellipsoid(f'talon{s}', (0.04, 0.10 * s, HOVER + 0.15), (0.07, 0.045, 0.04), rot=(0, 20, 0)), mat_talon))
# a short white tail fan and the two long streamers with orange tips
for i, (y, rz) in enumerate(((0.0, 0), (0.06, 14), (-0.06, -14))):
    parts.append(assign(ellipsoid(f'fan{i}', (-0.62, y, HOVER + 0.36), (0.20, 0.05, 0.02), rot=(0, 6, 180 + rz), taper=0.5, taper_axis=0), mat_fan))
for s in (-1, 1):
    st = [(-0.46, 0.04 * s, HOVER + 0.36), (-0.74, 0.07 * s, HOVER + 0.30), (-0.98, 0.10 * s, HOVER + 0.34), (-1.12, 0.12 * s, HOVER + 0.46)]
    parts.append(assign(tube(f'streamer{s}', st, [0.032, 0.026, 0.02, 0.016], res=8), mat_streamer))
    parts.append(assign(ellipsoid(f'stip{s}', (-1.14, 0.125 * s, HOVER + 0.55), (0.03, 0.05, 0.10), rot=(0, -20, 0), taper=0.6, taper_axis=2), mat_stip))

# the wings: a sky-blue top slab over a light underwing slab, a fan of orange primaries at the tip; raised in a V
WING = smooth_closed([(0.10, 0.03), (0.18, 0.30), (0.16, 0.60), (0.06, 0.78), (-0.12, 0.74), (-0.22, 0.50), (-0.20, 0.22), (-0.10, 0.03)], subdiv=5)
for s in (-1, 1):
    m = 1 if s > 0 else -1
    top_w = slab(f'wtop{s}', [(x, y * m) for x, y in WING], 0.03, loc=(0, 0, 0.006), plane='XY', bevel=0.005)
    und = slab(f'wund{s}', [(x * 0.97, y * m * 0.98) for x, y in WING], 0.02, loc=(0, 0, -0.012), plane='XY', bevel=0.004)
    assign(top_w, mat_wing[s]); assign(und, mat_under[s])
    prims = []
    for j in range(4):
        x = 0.04 - 0.07 * j
        prims.append(assign(ellipsoid(f'prim{s}{j}', (x - 0.02 * j, (0.84 - 0.03 * j) * m, 0), (0.045, 0.22, 0.014), rot=(0, 0, (14 + 9 * j) * m), taper=0.6, taper_axis=1 if m > 0 else 1), mat_prim[s]))
    wing = union(top_w, [und] + prims)
    wing.location = (-0.04, 0.20 * s, HOVER + 0.56)
    wing.rotation_euler = Euler((math.radians(48 * s), math.radians(-8), math.radians(-14 * s)), 'XYZ')
    apply_xform(wing)
    parts.append(wing)

body = union(body, parts)
set_smooth(body, angle=50)

bm = vertex_slot_mask(body, {'body'})
zones = [
    (lambda co, nm: bm & (nm[:, 2] < 0.1) & (co[:, 0] > -0.30) & (co[:, 2] < HOVER + 0.62), WHITE_B),                       # white chest and belly
    (lambda co, nm: bm & (co[:, 0] > H.x + 0.06) & (co[:, 2] < H.z) & ((co[:, 1] / 0.14) ** 2 < 1), WHITE_B),                 # white cheeks under the beak
    (lambda co, nm: bm & (nm[:, 2] > 0.5) & (co[:, 0] < 0.10) & (co[:, 2] > HOVER + 0.50), SKY_D),                           # darker back
]
paint_zones(body, SKY, zones, mask=bm)
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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'cyclonyx_final.blend')))
co, _ = mesh_arrays(body)
print(f'CYCLONYX total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}, zmin {co[:, 2].min():.3f} zmax {co[:, 2].max():.3f}')
