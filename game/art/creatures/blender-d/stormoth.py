"""Stormoth - big moth, wide storm wings held in a V, hovering. Indigo wings with a yellow lightning
bolt and cloud spots, white storm-cloud ruff, feathery antennae. Palette gold / indigo / violet / white."""
import sys, os, time, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

T0 = time.perf_counter()
sc = reset_scene()
OUTPNG = sys.argv[-1] if sys.argv[-1].endswith('.png') else os.path.join(OUT, 'stormoth.png')

INDIGO = srgb('#3d2fa0'); VIOLET = srgb('#8660e6'); VIOLET_D = srgb('#5a42c4'); GOLD = srgb('#ffcf3a'); GOLD_D = srgb('#e0a420')
WHITE = srgb('#f6f3ff'); EYE = srgb('#1c1240'); INK = '#1a1030'
PITCH = 14.0   # nose-down dive pose (deg)

# ------------------------------------------------------------------ body blockout
B = Blob('stormoth', resolution=0.03)
B.add((0.10, 0, 1.00), 0.33, size=(1.0, 0.95, 0.9))          # thorax
B.add((0.44, 0, 1.06), 0.23)                                 # head
for i in range(7):                                           # abdomen: tapering, drooping
    t = i / 6
    B.add((-0.12 - 0.72 * t, 0, 0.96 - 0.30 * t ** 1.3), 0.27 - 0.17 * t ** 1.1, stiff=2.2)
for s in (-1, 1):                                            # fuzzy shoulder tufts
    B.add((0.12, 0.24 * s, 1.22), 0.12, stiff=2.5)
B.add((0.02, 0, 1.28), 0.12, stiff=2.5)
# legs: tiny tapered chains dangling under the thorax (the lowest points of the hovering moth)
for i, (x, z0) in enumerate([(0.24, 0.80), (0.02, 0.76)]):
    for s in (-1, 1):
        B.chain((x, 0.12 * s, z0), (x + 0.04, 0.20 * s, z0 - 0.30), 0.055, 0.035, n=6, stiff=3.0)
body = B.mesh(voxel=0.016)
print('  blockout tris', tri_count(body), f'{time.perf_counter() - T0:.1f}s')

mat_body = toon_material('body', attr='Col', ink=INK)
mat_wing = toon_material('wing', attr='Col', ink=INK)
mat_ruff = toon_material('ruff', WHITE, ink=INK)
mat_spot = toon_material('spot', WHITE, ink=INK)
mat_bolt = toon_material('bolt', GOLD, glow=0.35, ink='#7a4a08')
mat_ant = toon_material('antenna', GOLD, ink='#7a4a08')
mat_eye = toon_material('eye', GOLD, ink=INK)
mat_pupil = toon_material('pupil', EYE, ink=INK)
mat_glint = toon_material('glint', (1, 1, 1), glow=1.0, ink='#ffffff')
assign(body, mat_body)

# ------------------------------------------------------------------ storm-cloud ruff (white puffs around the neck)
R = Blob('ruff', resolution=0.03)
for i in range(9):
    a = 2 * math.pi * i / 9
    R.add((0.30 - 0.03 * math.cos(a), 0.30 * math.sin(a), 1.05 + 0.27 * math.cos(a)), 0.135 + 0.02 * (i % 2), stiff=2.5)
for i in range(5):
    a = math.pi * (0.15 + 0.7 * i / 4)
    R.add((0.36, 0.22 * math.cos(a), 1.08 + 0.22 * math.sin(a)), 0.10, stiff=3.0)
ruff = assign(R.mesh(voxel=0.016), mat_ruff)

parts = [ruff]
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

# ------------------------------------------------------------------ wings
def scallop(p0, p1, n, depth, out):
    """points along p0->p1 with n outward bumps (out = unit outward 2-D vector)."""
    pts = []
    p0, p1, out = np.array(p0), np.array(p1), np.array(out)
    for i in range(n):
        a, b = p0 + (p1 - p0) * i / n, p0 + (p1 - p0) * (i + 1) / n
        for k in range(1, 6):
            t = k / 6
            pts.append(tuple(a + (b - a) * t + out * depth * math.sin(math.pi * t)))
        pts.append(tuple(b))
    return pts


def forewing_outline():
    ctrl = [(0.05, 0.0), (0.38, 0.30), (0.72, 0.85), (0.88, 1.28), (0.76, 1.50), (0.48, 1.50), (0.30, 1.34), (0.12, 1.30),
            (-0.02, 1.12), (-0.18, 1.08), (-0.30, 0.86), (-0.44, 0.78), (-0.50, 0.52), (-0.56, 0.40), (-0.46, 0.14), (-0.22, 0.0)]
    return smooth_closed(ctrl, subdiv=5)


def hindwing_outline():
    ctrl = [(-0.06, 0.0), (-0.18, 0.38), (-0.42, 0.78), (-0.72, 0.98), (-1.00, 0.86), (-1.02, 0.62), (-0.92, 0.46), (-0.90, 0.26), (-0.76, 0.12), (-0.50, 0.0)]
    return smooth_closed(ctrl, subdiv=5)


def bolt_outline():
    # classic zig-zag bolt, from the wing root area toward the apex (wing-local 2-D)
    return [(0.10, 0.26), (0.38, 0.52), (0.26, 0.57), (0.56, 0.90), (0.42, 0.93), (0.70, 1.30),
            (0.24, 0.90), (0.38, 0.84), (0.04, 0.52), (0.18, 0.47)]


WING_ROOT = Vector((0.05, 0.0, 1.10))
wings = []
for s, v_ang in ((1, 66.0), (-1, 58.0)):      # +Y far wing a touch higher than the near one
    def mirror(pts):
        return [(x, y * s) for (x, y) in pts]
    rot_w = (v_ang * s, 0, 0)
    loc = WING_ROOT + Vector((0, 0.10 * s, 0))
    fw = slab(f'forewing{s}', mirror(forewing_outline()), 0.035, loc=loc, rot=rot_w, plane='XY', bevel=0.0)
    hw = slab(f'hindwing{s}', mirror(hindwing_outline()), 0.035, loc=loc + Vector((0, 0, -0.015)), rot=rot_w, plane='XY', bevel=0.0, scale=0.88)
    assign(fw, mat_wing); assign(hw, mat_wing)
    bolt = slab(f'bolt{s}', mirror(bolt_outline()), 0.075, loc=loc, rot=rot_w, plane='XY', bevel=0.0)
    assign(bolt, mat_bolt)
    # cloud spots: flattened spheres pushed through the wing so they show on both faces
    Rm = Euler([math.radians(a) for a in rot_w], 'XYZ').to_matrix()
    spots = []
    for (x, y, r) in [(0.40, 1.20, 0.085), (-0.02, 1.00, 0.10), (-0.26, 0.64, 0.075), (-0.66, 0.60, 0.085), (0.24, 0.76, 0.05), (-0.36, 0.30, 0.06)]:
        p = loc + Rm @ Vector((x, y * s, 0))
        sp = ellipsoid(f'spot{s}_{len(spots)}', p, (r, r, 0.028), track=Rm @ Vector((0, 0, 1)))
        spots.append(assign(sp, mat_spot))
    wing = union(fw, [hw, bolt] + spots)
    wings.append(wing)

# ------------------------------------------------------------------ head details
H = Vector((0.44, 0, 1.06))
for s in (-1, 1):
    dirn = Vector((0.80, 0.52 * s, 0.30)).normalized()
    ec = H + dirn * 0.21
    e = ellipsoid(f'eye{s}', ec, (0.095, 0.125, 0.06), track=dirn, roll=-30 * s)
    parts.append(assign(e, mat_eye))
    pu = ellipsoid(f'pupil{s}', ec + dirn * 0.045, (0.045, 0.07, 0.03), track=dirn, roll=-30 * s)
    parts.append(assign(pu, mat_pupil))
    g = ellipsoid(f'glint{s}', ec + dirn * 0.065 + Lw * 0.045, (0.03, 0.03, 0.02))
    parts.append(assign(g, mat_glint))

# feathery antennae: serrated comb slabs, swept forward-up and outward


def comb_outline(L=0.62, n=9):
    top, bot = [], []
    for i in range(n):
        x0 = 0.06 + (L - 0.10) * i / n
        x1 = 0.06 + (L - 0.10) * (i + 0.55) / n
        w = 0.035 + 0.10 * math.sin(math.pi * min(1.0, (i + 1) / (n * 0.85)))   # tooth length profile
        top += [(x0, 0.025), (x1, w)]
        bot += [(x0, -0.025), (x1, -w)]
    pts = [(0.0, -0.02), (0.0, 0.02)] + top + [(L, 0.0)] + bot[::-1]
    return pts


for s in (-1, 1):
    an = slab(f'antenna{s}', comb_outline(L=0.55), 0.035, loc=H + Vector((0.06, 0.09 * s, 0.20)), rot=(28 * s, -72, 22 * s), plane='XY', bevel=0.0)
    parts.append(assign(an, mat_ant))

body = union(body, parts)
set_smooth(body, angle=50)
body = union(body, wings, solver='EXACT')
set_smooth(body, angle=50)

# ------------------------------------------------------------------ colour zones (after the final union: booleans zero attributes)
wm = vertex_slot_mask(body, {'wing'})
rr = lambda co: np.sqrt((np.abs(co[:, 1]) - 0.10) ** 2 + (co[:, 2] - 1.10) ** 2)   # distance from the wing root
# flat indigo wings: a gradient zone interpolates along the slab's long fan triangles and streaks
paint_zones(body, INDIGO, mask=wm, zones=[])
bm = vertex_slot_mask(body, {'body'})
paint_zones(body, VIOLET, mask=bm, zones=[
    (lambda co, nm: bm & (co[:, 0] < -0.12), INDIGO),                                   # abdomen indigo
    (lambda co, nm: bm & (co[:, 0] < -0.12) & (np.mod(-(co[:, 0] + 0.12), 0.24) < 0.10), GOLD_D),  # gold bands
    (lambda co, nm: bm & (co[:, 0] > 0.30) & (co[:, 2] < 0.98), VIOLET_D),              # chin shade
    (lambda co, nm: bm & (co[:, 2] < 0.72) & (co[:, 0] > -0.2) & (co[:, 0] < 0.4), srgb('#2a1f6e')),  # legs
])
smoothstep_blend(body, 'Col', iters=1)

# ------------------------------------------------------------------ pose: nose-down dive, then camera + render
pivot = Vector((0.1, 0, 1.0))
body.matrix_world = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(PITCH), 4, 'Y') @ Matrix.Translation(-pivot)
apply_xform(body)
setup_render(samples=int(os.environ.get('SPP', 24)), ink_px=6.0, inner_px=3.0, crease_deg=100)
cam, info = frame_camera([body], yaw=35, elev=12)
print('  frame', {k: round(float(v), 3) for k, v in info.items()})
save_blend(os.path.join(HERE, 'stormoth.blend'))
render(OUTPNG, 'stormoth')
print(f'STORMOTH total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
