"""Breezel - Gale line stage 1 (docs/CREATURES.md): a round puff chick (one big puff + head) with stubby wings.

Signature: a curly wind-swirl tuft; it rides a little cloud cushion. Palette: pale sky blue, white, orange beak.
Built with the Ashkit recipe; 'battle' key turns the whole body toward the camera.
Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(eye_y=0.16, eye_z=1.08, eye_w=0.11, eye_h=0.14, eye_d=0.045, eye_out=0.016, eye_fwd=0.10, turn=16.0)

SKY = srgb('#9fd6ff'); SKY_D = srgb('#6fb4ec'); WHITE_B = srgb('#f6fbff'); CLOUD_D = srgb('#c9dcef'); ORANGE = srgb('#ff9a3c')
EYE = srgb('#1a2438'); WHITE = srgb('#ffffff')
INK = '#1a2a44'

H = Vector((0.08, 0.0, 1.02))                                  # head centre
B = Blob('breezel', resolution=0.03)
B.add((0.0, 0, 0.50), 0.46, size=(1.08, 1.08, 0.86), stiff=3.0)  # the body puff
# the cloud cushion: lumpy puffs in a ring under the body
for i in range(7):
    a = i * math.tau / 7 + 0.3
    B.add((0.47 * math.cos(a), 0.47 * math.sin(a), 0.16), 0.20 + 0.03 * (i % 2), stiff=3.2)
B.add((0.0, 0, 0.16), 0.36, size=(1.3, 1.3, 0.5), stiff=2.5)
body = B.mesh(voxel=0.016)
co, nm = mesh_arrays(body)
co[:, 2] = np.maximum(co[:, 2], 0.0)
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
# the big chick head is its own mesh, joined by a boolean so a neck crease shows (metaballs blend it into a skittle)
HB = Blob('head', resolution=0.03)
HB.add(H, 0.40, size=(1.0, 1.04, 0.96))
head = HB.mesh(voxel=0.016)
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
mat_beak = toon_material('beak', ORANGE, glow=0.1, ink='#7a3a10')
mat_wing = toon_material('wing', SKY_D, ink=INK)
mat_tuft = toon_material('tuft', WHITE_B, ink=INK)
assign(body, mat_body)
parts = [assign(head, mat_body)]
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

for s in (-1, 1):
    p, n = snap((1.0, P['eye_y'] * s, P['eye_z']), (H.x - 0.1, P['eye_y'] * s, P['eye_z']))
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
# a small orange beak between and below the eyes, pointing forward and a little down
bp, bn = snap((1.0, 0, 0.98), (H.x - 0.1, 0, 0.98))
parts.append(assign(ellipsoid('beak', bp + Vector((0.035, 0, 0)), (0.10, 0.075, 0.06), rot=(0, 12, 0), taper=0.75, taper_axis=0), mat_beak))
# stubby wings at the sides, tips out and back
for s in (-1, 1):
    parts.append(assign(ellipsoid(f'wing{s}', (-0.04, 0.48 * s, 0.56), (0.24, 0.08, 0.17), rot=(-20 * s, -10, -28 * s), taper=0.55, taper_axis=0), mat_wing))
# a little white tail fan at the back (the player's own kin is seen from behind)
for i, (y, rz, ry) in enumerate(((0.0, 0, -52), (0.13, 26, -42), (-0.13, -26, -42))):
    parts.append(assign(ellipsoid(f'tail{i}', (-0.50, y, 0.54), (0.24, 0.10, 0.075), rot=(0, ry, 180 + rz), taper=0.7, taper_axis=0), mat_tuft))
# the wind-swirl tuft: a curl rising from the crown and rolling forward, and a small curl behind it
top, _ = snap((H.x - 0.04, 0, 3.0), (H.x - 0.04, 0, H.z))
curl = [(0, 0, -0.04), (-0.04, 0, 0.12), (0.02, 0, 0.27), (0.14, 0, 0.29), (0.19, 0, 0.19), (0.12, 0, 0.13), (0.07, 0, 0.18)]
yaw = Matrix.Rotation(math.radians(35), 3, 'Z')
parts.append(assign(tube('tuft', [tuple(top + yaw @ Vector(c)) for c in curl], [0.075, 0.07, 0.06, 0.05, 0.04, 0.03, 0.022], res=10), mat_tuft))
back, _ = snap((H.x - 0.24, 0, 3.0), (H.x - 0.24, 0, H.z))
curl2 = [(0, 0, -0.03), (-0.06, 0, 0.08), (-0.02, 0, 0.16), (0.05, 0, 0.13), (0.02, 0, 0.09)]
parts.append(assign(tube('tuft2', [tuple(back + yaw @ Vector(c)) for c in curl2], [0.05, 0.045, 0.035, 0.025, 0.018], res=10), mat_tuft))

body = union(body, parts)
set_smooth(body, angle=50)

bm = vertex_slot_mask(body, {'body'})
zones = [
    (lambda co, nm: bm & (co[:, 2] < 0.30), WHITE_B),                                                                 # the cloud
    (lambda co, nm: bm & (co[:, 2] < 0.10) & (nm[:, 2] < -0.2), CLOUD_D),                                               # its shaded underside
    (lambda co, nm: bm & (co[:, 0] > 0.18) & (co[:, 2] > 0.30) & ((co[:, 1] / 0.30) ** 2 + ((co[:, 2] - 0.56) / 0.26) ** 2 < 1), WHITE_B),   # belly
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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'breezel_final.blend')))
print(f'BREEZEL total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
