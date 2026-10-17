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

SKY = srgb('#9fd6ff'); SKY_D = srgb('#6fb4ec'); WHITE_B = srgb('#f6fbff'); CLOUD = srgb('#dbe8f5'); CLOUD_D = srgb('#c9dcef'); ORANGE = srgb('#ff9a3c')
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
mat_wing = {s: toon_material('wing.L' if s > 0 else 'wing.R', attr='Col', ink=INK) for s in (-1, 1)}   # one slot per side (rig)
mat_tail = toon_material('tail', attr='Col', ink=INK)
mat_tuft = toon_material('tuft', WHITE_B, ink=INK)
mat_seam = toon_material('seam', srgb('#7a3a10'), ink='#7a3a10')
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
parts.append(assign(ellipsoid('beak', bp + Vector((0.05, 0, 0)), (0.13, 0.075, 0.06), rot=(0, 12, 0), taper=0.75, taper_axis=0), mat_beak))
# a thin ink seam along the bite line, so the beak reads as a beak and not an orange nose dot
by = Matrix.Rotation(math.radians(12), 3, 'Y')
seam = [bp + Vector((0.05, 0, 0)) + by @ Vector((x, 0, z)) for x, z in ((-0.06, -0.004), (0.0, -0.006), (0.06, -0.006), (0.115, -0.002))]
seam = [p + Vector((0, 0, 0)) for p in seam]
parts.append(assign(tube('seam', [tuple(p) for p in seam], [0.006, 0.005, 0.004, 0.003], res=6), mat_seam))


def frame_rot(t, n):
    """Euler (deg) whose local +x is t (the taper end: the tip) and local +y is n (the thin axis: the flat side)."""
    t = Vector(t).normalized(); n = (Vector(n) - t * Vector(n).dot(t)).normalized(); w = t.cross(n)
    return [math.degrees(a) for a in Matrix((t, n, w)).transposed().to_euler('XYZ')]


# stubby wings: centred outside the body (inside its radius they surfaced as flat inked ovals), the tip out, back
# and down with a pale feathered tip
WINGS = {}
for s in (-1, 1):
    c = Vector((-0.04, 0.62 * s, 0.58)); t = Vector((-0.70, 0.42 * s, -0.42)).normalized()
    WINGS[s] = (c, t)
    parts.append(assign(ellipsoid(f'wing{s}', c, (0.26, 0.10, 0.16), rot=frame_rot(t, (0.2, s, 0.45)), taper=0.55, taper_axis=0), mat_wing[s]))
# a little tail fan at the back (the player's own kin is seen from behind): sky feathers with white tips
TAILS = []
for i, sp in enumerate((0.0, 0.42, -0.42)):     # an upright fan: from behind you see its face, from the side its edge
    t = Vector((-0.45, sp, 0.89)).normalized()
    c = Vector((-0.44, 0.06 * sp, 0.58)) + t * 0.17
    TAILS.append((c, t))
    parts.append(assign(ellipsoid(f'tail{i}', c, (0.22, 0.06, 0.13), rot=frame_rot(t, (1, 0, 0)), taper=0.35, taper_axis=0), mat_tail))
# the wind-swirl tuft: a curl rising from the crown and rolling forward, and a small curl behind it
top, _ = snap((H.x - 0.04, 0, 3.0), (H.x - 0.04, 0, H.z))
curl = [(0, 0, -0.04), (-0.04, 0, 0.12), (0.02, 0, 0.27), (0.14, 0, 0.29), (0.19, 0, 0.19), (0.12, 0, 0.13), (0.07, 0, 0.18)]
yaw = Matrix.Rotation(math.radians(35), 3, 'Z')     # 35 faces the battle camera and the in-game back view
parts.append(assign(tube('tuft', [tuple(top + yaw @ Vector(c)) for c in curl], [0.075, 0.07, 0.06, 0.05, 0.04, 0.03, 0.022], res=10), mat_tuft))
back, _ = snap((H.x - 0.24, 0, 3.0), (H.x - 0.24, 0, H.z))
curl2 = [(0, 0, -0.03), (-0.06, 0, 0.08), (-0.02, 0, 0.16), (0.05, 0, 0.13), (0.02, 0, 0.09)]
yaw2 = Matrix.Rotation(math.radians(125), 3, 'Z')  # the small curl turns to the back cameras, so they see a curl, not a candle
parts.append(assign(tube('tuft2', [tuple(back + yaw2 @ Vector(c)) for c in curl2], [0.05, 0.045, 0.035, 0.025, 0.018], res=10), mat_tuft))

body = union(body, parts)
set_smooth(body, angle=50)

bm = vertex_slot_mask(body, {'body'})
paint_zones(body, SKY, [], mask=bm)


def sd_cloud(co, nm):
    return co[:, 2] - 0.30


def sd_cloud_under(co, nm):
    return np.maximum(co[:, 2] - 0.10, nm[:, 2] + 0.2)


def sd_belly(co, nm):     # the belly stops above the cloud (z > 0.42), so the two whites keep the body's lower edge
    k = np.sqrt((co[:, 1] / 0.30) ** 2 + ((co[:, 2] - 0.58) / 0.24) ** 2)
    return np.maximum.reduce([(k - 1.0) * 0.24, 0.18 - co[:, 0], 0.42 - co[:, 2]])


paint_soft(body, [(sd_cloud, CLOUD), (sd_cloud_under, CLOUD_D), (sd_belly, WHITE_B)], mask=bm, edge=0.012)
for s in (-1, 1):                     # wings: SKY_D with a pale feathered tip
    wm = vertex_slot_mask(body, {mat_wing[s].name}) & ~bm
    paint_zones(body, SKY_D, [], mask=wm)
    c, t = WINGS[s]
    paint_soft(body, [(lambda co, nm, c=c, t=t: 0.12 - (co - np.array(c)) @ np.array(t), WHITE_B)], mask=wm, edge=0.012)
tm = vertex_slot_mask(body, {'tail'}) & ~bm
paint_zones(body, SKY, [], mask=tm)


def sd_tail_tips(co, nm):
    return np.min([0.09 - (co - np.array(c)) @ np.array(t) for c, t in TAILS], axis=0)


paint_soft(body, [(sd_tail_tips, WHITE_B)], mask=tm, edge=0.012)


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
