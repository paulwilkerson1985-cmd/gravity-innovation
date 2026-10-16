"""Ashkit - chubby fox kit: head as big as the body, stubby legs, huge ears, sooty ear tips and
socks, cream mask/belly, glowing ember on a short fluffy tail. 3/4 front battle pose facing +X."""
import sys, os, time, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

T0 = time.perf_counter()
sc = reset_scene()
OUTPNG = sys.argv[-1] if sys.argv[-1].endswith('.png') else os.path.join(OUT, 'ashkit.png')

ORANGE = srgb('#ff7a2e'); CREAM = srgb('#ffe9c6'); SOOT = srgb('#3b2d33'); EMBER = srgb('#ffb02a'); EMBER_CORE = srgb('#fff3b0')
EYE = srgb('#2b1a1e'); WHITE = srgb('#ffffff'); NOSE = srgb('#2b1a1e'); BLUSH = srgb('#ff9a7a')
INK = '#2a1418'

# ------------------------------------------------------------------ blockout (metaballs)
C = Vector((0.40, 0.0, 1.16))          # head centre
B = Blob('ashkit', resolution=0.035)
B.add((-0.06, 0, 0.62), 0.50, size=(1.05, 0.92, 0.86))        # body
B.add((0.16, 0, 0.84), 0.38)                                  # chest / neck
B.add((0.26, 0, 1.00), 0.32)                                  # neck fill (smooth back line)
B.add(C, 0.60, size=(0.95, 1.06, 0.92))                       # head (as big as the body)
for s in (-1, 1):
    B.add((0.60, 0.37 * s, 0.98), 0.27)                       # cheek fluff
B.add((0.94, 0, 1.00), 0.21, stiff=3.0)                       # muzzle
# legs: stubby. Near-side (-Y) front paw raised in a ready-to-pounce pose.
legs = [(0.24, 0.27, 0.0, 0.0), (0.26, -0.27, 0.12, 0.13), (-0.30, 0.27, 0.0, 0.0), (-0.30, -0.27, 0.0, 0.0)]
for (x, y, dx, dz) in legs:
    top = Vector((x, y, 0.50)); foot = Vector((x + dx, y, 0.14 + dz))
    B.chain(top, foot, 0.145, 0.135, n=5)
    B.add((foot.x + 0.06, foot.y, foot.z - 0.03), 0.15, size=(1.35, 1.0, 0.72), stiff=2.5)   # paw
# short fluffy tail curling up
for i, (co, r) in enumerate([((-0.52, 0.04, 0.70), 0.24), ((-0.66, 0.08, 0.86), 0.22), ((-0.72, 0.11, 1.03), 0.19)]):
    B.add(co, r)
body = B.mesh(voxel=0.018)
print('  blockout tris', tri_count(body), f'{time.perf_counter() - T0:.1f}s')

# ------------------------------------------------------------------ hard parts
mat_body = toon_material('body', attr='Col', ink=INK)
mat_eye = toon_material('eye', EYE, ink=INK)
mat_glint = toon_material('glint', WHITE, glow=1.0, ink='#ffffff')
mat_nose = toon_material('nose', NOSE, ink=INK)
mat_ember = toon_material('ember', EMBER, glow=0.75, ink='#c8481c')
mat_core = toon_material('ember_core', EMBER_CORE, glow=1.0, ink='#ffb02a')
assign(body, mat_body)

parts = []
# ears: big tapered slabs (thin in X, wide in Y), tilted outward and a little back
for s in (-1, 1):
    e = ellipsoid(f'ear{s}', (0.30, 0.34 * s, 1.70), (0.13, 0.30, 0.50), rot=(-26 * s, -10, 0), taper=0.92)
    parts.append(assign(e, mat_body))
# eyes: huge, flattened on the head surface along the surface normal, plus a white glint
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()
for s in (-1, 1):
    dirn = Vector((0.93, 0.30 * s, 0.27)).normalized()
    ec = C + Vector((dirn.x * 0.57 * 0.91, dirn.y * 0.63 * 0.91, dirn.z * 0.55 * 0.91))
    e = ellipsoid(f'eye{s}', ec, (0.17, 0.17, 0.06), track=dirn)
    parts.append(assign(e, mat_eye))
    if s < 0:   # big glint only on the near eye; the far one gets the small secondary glint
        g = ellipsoid(f'glint{s}', ec + dirn * 0.06 + Lw * 0.075, (0.052, 0.052, 0.03), track=dirn)
        parts.append(assign(g, mat_glint))
    g2 = ellipsoid(f'glint2{s}', ec + dirn * 0.065 - Lw * 0.06, (0.026, 0.026, 0.02), track=dirn)
    parts.append(assign(g2, mat_glint))
# nose + a small smirk line on the near side (thin tube; its own outline makes it an ink line)
n = ellipsoid('nose', (1.13, 0, 1.03), (0.065, 0.085, 0.06))
parts.append(assign(n, mat_nose))
mouth = tube('mouth', [(1.10, -0.03, 0.935), (1.07, -0.10, 0.905), (1.01, -0.16, 0.915)], [0.012, 0.012, 0.010], res=12)
parts.append(assign(mouth, mat_nose))
# ember flame on the tail tip: outer teardrop + pale core
fl = ellipsoid('ember', (-0.74, 0.12, 1.26), (0.19, 0.19, 0.30), rot=(0, -12, 0), taper=0.88)
parts.append(assign(fl, mat_ember))
fc = ellipsoid('ember_core', Vector((-0.73, 0.12, 1.22)) + d_cam * 0.13, (0.10, 0.10, 0.19), rot=(0, -12, 0), taper=0.9)
parts.append(assign(fc, mat_core))

body = union(body, parts)
set_smooth(body, angle=50)

# ------------------------------------------------------------------ colour zones (vertex colours)
bm = vertex_slot_mask(body, {'body'})


def ear_local(co, s):
    """coordinates in the ear's local frame (x front, y across, z along the ear axis)."""
    R = np.array(Euler([math.radians(a) for a in (-26 * s, -10, 0)], 'XYZ').to_matrix())
    return (co - np.array((0.30, 0.34 * s, 1.70))) @ R          # R^-1 = R^T, (co @ R) == R^T co


def inner_ear(co, nm):
    m = np.zeros(len(co), dtype=bool)
    for s in (-1, 1):
        l = ear_local(co, s)
        t = np.clip((l[:, 2] + 0.05) / 0.45, 0, 1)
        m |= (l[:, 0] > 0.0) & (l[:, 2] > -0.05) & (l[:, 2] < 0.33) & (np.abs(l[:, 1]) < 0.21 * (1 - t) ** 0.8)
    return bm & m


def ear_tip(co, nm):
    m = np.zeros(len(co), dtype=bool)
    for s in (-1, 1):
        m |= ear_local(co, s)[:, 2] > 0.27
    return bm & m


paw_c = np.array((0.26 + 0.12 + 0.06, -0.27, 0.14 + 0.13 - 0.03))
zones = [
    # belly: underside of the body (position based -> no blotches on the flanks)
    (lambda co, nm: bm & (co[:, 2] < 0.50) & (co[:, 2] > 0.30) & (np.abs(co[:, 1]) < 0.36 - 0.6 * (0.50 - co[:, 2])) & (co[:, 0] > -0.42) & (co[:, 0] < 0.20), CREAM),
    # chest bib: front of the body below the head
    (lambda co, nm: bm & (((co[:, 0] - 0.46) / 0.26) ** 2 + ((co[:, 2] - 0.60) / 0.30) ** 2 < 1) & (np.abs(co[:, 1]) < 0.30), CREAM),
    # cream mask: lower front of the head (muzzle, cheeks' underside)
    (lambda co, nm: bm & ((co[:, 0] - C.x) > 0.26) & ((co[:, 2] - C.z) < 0.12) & ((co[:, 2] - C.z) > -0.60), CREAM),
    (inner_ear, CREAM),
    (ear_tip, SOOT),
    # sooty socks
    (lambda co, nm: bm & (co[:, 2] < 0.27) & (co[:, 0] > -0.5), SOOT),
    (lambda co, nm: bm & (np.linalg.norm(co - paw_c, axis=1) < 0.21), SOOT),  # raised paw
]
paint_zones(body, ORANGE, zones, mask=bm)
smoothstep_blend(body, 'Col', iters=1)

# ------------------------------------------------------------------ camera + render
setup_render(samples=int(os.environ.get('SPP', 24)), ink_px=6.0, inner_px=3.2, crease_deg=100)
cam, info = frame_camera([body], yaw=35, elev=12)
print('  frame', {k: round(v, 3) for k, v in info.items()})
save_blend(os.path.join(HERE, 'ashkit.blend'))
dt = render(OUTPNG, 'ashkit')
print(f'ASHKIT total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
