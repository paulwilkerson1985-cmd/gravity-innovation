"""Dropple - Tide line stage 1 (docs/CREATURES.md): a wobbly water droplet with a face, hopping.

Signature: a curling droplet tip, glossy shine spots, tiny flipper fins. Palette: sky blue, pale aqua face,
deep-blue fins. Built with the Ashkit recipe (metaball blockout -> face parts snapped with a BVH ray cast -> union
-> colour zones -> 'battle' key that turns the whole body toward the camera). Env: SPP, SIZE, OUTDIR,
MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(eye_y=0.22, eye_z=0.78, eye_w=0.13, eye_h=0.16, eye_d=0.05, eye_out=0.016, eye_fwd=0.10, turn=16.0)

SKY = srgb('#3fa9f5'); AQUA = srgb('#c8f0ff'); DEEP = srgb('#1f5fc0'); TIP = srgb('#2f86e0'); EYE = srgb('#14233e'); WHITE = srgb('#ffffff')
INK = '#0e1c36'

# ------------------------------------------------------------------ blockout (metaballs)
C = Vector((0.0, 0.0, 0.66))
B = Blob('dropple', resolution=0.03)
B.add(C, 0.66, size=(1.0, 1.0, 0.94))                          # the round drop
B.add((0.0, 0, 0.30), 0.55, size=(1.05, 1.05, 0.55))           # a wide, flat-bottomed base: it sits, it doesn't roll
for co, r in [((-0.04, 0, 1.18), 0.30), ((-0.07, 0, 1.30), 0.25), ((-0.12, 0, 1.40), 0.21), ((-0.18, 0, 1.49), 0.18),
              ((-0.24, 0, 1.56), 0.15), ((-0.30, 0, 1.60), 0.13), ((-0.36, 0, 1.62), 0.11)]:
    B.add(co, r)                                               # the tip, curling back
body = B.mesh(voxel=0.016, smooth_iters=3)     # smoothing removes the metaball junction crease behind the tip
co, nm = mesh_arrays(body)
co[:, 2] = np.maximum(co[:, 2], 0.0)
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(body, dg)


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
mat_mouth = toon_material('mouth', DEEP, ink=INK)
mat_fin = toon_material('fin', DEEP, ink=INK)
mat_shine = toon_material('shine', WHITE, glow=0.8, ink='#ffffff')
assign(body, mat_body)
parts = []
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

for s in (-1, 1):
    p, n = snap((1.0, P['eye_y'] * s, P['eye_z']), (0, P['eye_y'] * s, P['eye_z']))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f), mat_eye))
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.45, 0.045), (-0.55, 0.022))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u = abs(off)
        loc = ec + dirv * (u * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u * u)) - 0.004)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.015), track=f), mat_glint))
# a small open smile under the eyes: the corners lift so it reads as a smile, not a bird's V, at 300 px
mz = 0.56
def smile_z(y):
    return mz + 0.03 * (abs(y) / 0.14) ** 2 + (0.03 if abs(y) > 0.13 else 0.0)
pts = [snap((1.0, y, smile_z(y)), (0, y, smile_z(y)))[0] for y in (-0.15, -0.08, -0.03, 0.0, 0.03, 0.08, 0.15)]
pts[3] = pts[3] + Vector((0, 0, -0.012))
parts.append(assign(tube('mouth', [tuple(p) for p in pts], [0.009, 0.014, 0.017, 0.018, 0.017, 0.014, 0.009], res=8), mat_mouth))
# tiny flipper fins at the sides, low and drooping out and back: centred outside the body so each fin leaves the
# silhouette (inside the radius it surfaced as a flat inked sticker). The outer edge droops (rot x +20s), so from the
# side the fin shows as a thin flipper, not a flat teardrop facing the camera. (A fillet ball at the root was tried:
# it read as a knuckle; the boolean junction already inks a crease.)
for s in (-1, 1):
    parts.append(assign(ellipsoid(f'fin{s}', (0.04, 0.78 * s, 0.34), (0.19, 0.12, 0.06), rot=(20 * s, 10, -30 * s), taper=0.5, taper_axis=0), mat_fin))
# glossy shine spots: one large, one small, on the key-light side (upper left in both the front and the foe view) and
# well inside the outline from the battle camera (a shine on the silhouette fused into a kidney smear)
ta = math.radians(-P['turn'])
d_front = camera_basis(90, 12)[0]


def battle_n(n):
    return Vector((n.x * math.cos(ta) - n.y * math.sin(ta), n.x * math.sin(ta) + n.y * math.cos(ta), n.z))


d_b34 = camera_basis(-45, 12)[0]
for i, (dirn, r) in enumerate((((0.69, -0.28, 0.67), 0.07), ((0.52, -0.07, 0.85), 0.03))):
    sp, sn = snap(Vector(C) + Vector(dirn) * 3, Vector(C))
    print(f'  shine{i}: off-silhouette battle {math.degrees(math.asin(min(1, abs(battle_n(sn).dot(d_cam))))):.0f} deg, '
          f'front {math.degrees(math.asin(min(1, abs(sn.dot(d_front))))):.0f} deg, back34 n.d {sn.dot(d_b34):.2f} (<0 hidden)')
    parts.append(assign(ellipsoid(f'shine{i}', sp - sn * 0.008, (r, r * 1.35, 0.012), track=sn, roll=30), mat_shine))

body = union(body, parts)
set_smooth(body, angle=50)

bm = vertex_slot_mask(body, {'body'})
paint_zones(body, SKY, [], mask=bm)


def sd_face(co, nm):      # pale face: an oval on the front of the drop, around the mouth and under the eyes
    k = np.sqrt((co[:, 1] / 0.44) ** 2 + ((co[:, 2] - 0.50) / 0.30) ** 2)
    return np.maximum((k - 1.0) * 0.30, 0.20 - co[:, 0])


def sd_tip(co, nm):       # the tip deepens along its arc: distance from the base centre, a ramp from 1.20 to 1.55
    r = np.linalg.norm(co - np.array([0.0, 0.0, 0.0]), axis=1)
    return 1.375 - r


def sd_bands(co, nm):     # back marking: two ripple bands across the back, each ending in a rounded cap at the sides
    phi = np.arctan2(np.abs(co[:, 1]), -co[:, 0])              # 0 at the back, pi/2 at the flank
    rad = np.hypot(co[:, 0], co[:, 1])
    out = np.full(len(co), 9.0)
    for zc, ph, w, end in ((0.62, 0.0, 0.050, 1.30), (0.92, 1.6, 0.045, 1.20)):
        a = np.abs(co[:, 2] - (zc + 0.05 * np.sin(co[:, 1] * 9.0 + ph)))
        b = np.maximum(0.0, (phi - end) * rad)                 # arc length past the band's end
        out = np.minimum(out, np.sqrt(a * a + b * b) - w)
    return out


paint_soft(body, [(sd_face, AQUA), (sd_bands, TIP)], mask=bm, edge=0.012)
paint_soft(body, [(sd_tip, TIP)], mask=bm, edge=0.175)


def add_battle_key(o, turn_deg):
    """The whole body turns toward the camera (a blob has no separate head)."""
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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'dropple_final.blend')))
print(f'DROPPLE total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
