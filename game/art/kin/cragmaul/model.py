"""Cragmaul - hunched boulder brute: tiny head sunk between huge shoulders, knuckle-walking.
Crystal-studded fists resting on the ground, crystal cluster on the back, cyan eyes under a rock brow.
Palette: brown, light chest, dark fists, cyan.
Ported from the bake-off D design (../../creatures/blender-d/cragmaul.py: the static foe art the gates used) onto
the shared kit, plus a 'battle' head-turn shape key for the sprite sheets. Env: SPP, SIZE, OUTDIR,
MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *

T0 = time.perf_counter()
sc = reset_scene()

BROWN = srgb('#8c5a3a'); BROWN_D = srgb('#6a4028'); CHEST = srgb('#dcb98e'); FIST = srgb('#4a3b3d'); CYAN = srgb('#5ce9ff'); CYAN_D = srgb('#1fb7d6')
INK = '#1f1416'

# ------------------------------------------------------------------ blockout
B = Blob('cragmaul', resolution=0.035)
B.add((0.00, 0, 0.95), 0.55, size=(1.0, 0.95, 0.85))            # boulder torso
B.add((-0.15, 0, 1.30), 0.42)                                     # back hump
for s in (-1, 1):
    B.add((0.25, 0.52 * s, 1.40), 0.36)                           # huge shoulders (highest points)
    B.add((0.12, 0.40 * s, 1.15), 0.30)                           # shoulder-torso fill
B.add((0.78, 0, 1.22), 0.28)                                      # tiny head, sunk between the shoulders
B.add((0.90, 0, 1.10), 0.19, stiff=3.0)                           # jaw block
# rock brow: a stiff ridge that melts into the skull, so only its underside ledge is inked (polish review 2: a boolean
# ellipsoid carried its own closed ink loop and read as a flat cap)
B.add((0.88, 0, 1.39), 0.20, size=(1.0, 1.25, 0.55), stiff=4.0)
# rock plates: a few firm bumps on the shoulders and hump so the boulder skin reads in the silhouette
for (x, y, z, r) in [(0.30, 0.62, 1.60, 0.16), (0.12, -0.58, 1.58, 0.15), (-0.40, 0.22, 1.42, 0.17), (-0.48, -0.20, 1.20, 0.15), (-0.05, 0.0, 1.72, 0.14), (0.42, -0.30, 1.52, 0.12)]:
    B.add((x, y, z), r, stiff=4.0)
# arms: from the shoulders down-forward to fists on the ground, outside the torso (near fist a little forward)
ARMS = {1: (0.62, 0.70), -1: (0.86, 0.74)}
for s, (fx, fy) in ARMS.items():
    B.chain((0.32, 0.62 * s, 1.34), (fx - 0.06, fy * s, 0.42), 0.19, 0.21, n=6)
# short thick hind legs + flat feet
for s in (-1, 1):
    B.chain((-0.18, 0.34 * s, 0.70), (-0.20, 0.38 * s, 0.22), 0.20, 0.19, n=4)
    B.add((-0.10, 0.40 * s, 0.13), 0.19, size=(1.45, 1.05, 0.62), stiff=2.5)
body = B.mesh(voxel=0.02, smooth_iters=2)
# lumpy boulder skin; gentler than 0.06, whose creases passed the crease angle and drew stray ink on back and shoulders
displace(body, strength=0.035, scale=0.30, tex_type='CLOUDS', depth=1)
set_smooth(body)
print('  blockout tris', tri_count(body), f'{time.perf_counter() - T0:.1f}s')

mat_body = toon_material('body', attr='Col', ink=INK)
mat_fist = toon_material('fist', FIST, ink=INK)
mat_cry = toon_material('crystal', CYAN, glow=0.45, ink='#0e5a70')
mat_eye = toon_material('eye', CYAN, glow=0.95, ink='#0e5a70')
mat_mouth = toon_material('mouth', srgb('#2a1a1c'), ink=INK)
# the pupil uses the 'glint' slot name so the sheet kit's blink and far-eye hide treat it with the eye
mat_pupil = toon_material('glint', CYAN_D, glow=0.5, ink='#0e5a70')
assign(body, mat_body)

d_cam, rot, right, up = camera_basis()
parts = []

# fists: faceted boulders (low-subdivision icospheres, displaced) with cyan crystal studs
for s, (fx, fy) in ARMS.items():
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0, location=(fx, fy * s, 0.33))
    f = bpy.context.object; f.name = f'fist{s}'; f.scale = (0.36, 0.33, 0.33)
    apply_xform(f)
    displace(f, strength=0.06, scale=0.25, tex_type='VORONOI')
    set_smooth(f, angle=35)
    parts.append(assign(f, mat_fist))
    # knuckle crystals: a row across the top of the fist, leaning forward
    for i, (dx, dy, h) in enumerate([(-0.14, 0.0, 0.34), (0.0, -0.16, 0.38), (0.0, 0.16, 0.38), (0.17, 0.0, 0.30), (0.08, 0.0, 0.46)]):
        c = crystal(f'kc{s}{i}', (fx + dx, fy * s + dy, 0.50), 0.075 + 0.012 * (i % 2), h, rot=(-22 * dy / 0.16 if dy else 0, 24 + 10 * dx / 0.17, 0))
        parts.append(assign(c, mat_cry))

# crystal cluster on the back
for i, (x, y, h, r, rx, ry) in enumerate([(-0.22, 0.0, 0.62, 0.13, 0, -22), (-0.08, 0.16, 0.42, 0.09, -20, -5), (-0.30, -0.17, 0.46, 0.10, 22, -28),
                                           (-0.42, 0.06, 0.36, 0.085, -8, -42), (-0.05, -0.12, 0.30, 0.07, 18, 10)]):
    c = crystal(f'bc{i}', (x, y, 1.55), r, h, rot=(rx, ry, 0))
    parts.append(assign(c, mat_cry))

# cyan glowing eyes under the brow (now part of the blockout), big enough to read at sprite size, with a darker pupil
Hc = Vector((0.78, 0, 1.22))
for s in (-1, 1):
    dirn = Vector((0.92, 0.32 * s, 0.04)).normalized()
    e = ellipsoid(f'eye{s}', Hc + dirn * 0.262, (0.10, 0.11, 0.035), track=dirn)
    parts.append(assign(e, mat_eye))
    parts.append(assign(ellipsoid(f'pupil{s}', Hc + dirn * 0.287, (0.045, 0.058, 0.014), track=dirn), mat_pupil))
# grim mouth line across the jaw
mouth = tube('mouth', [(1.00, -0.15, 1.05), (1.08, -0.05, 1.035), (1.08, 0.05, 1.035), (1.00, 0.15, 1.05)], [0.012, 0.014, 0.014, 0.012], res=10)
parts.append(assign(mouth, mat_mouth))

body = union(body, parts)
set_smooth(body, angle=45)
# ground the whole creature: the fists' lowest point on z = 0 (the bake-off model left them 0.02 under it)
co, nm = mesh_arrays(body)
co[:, 2] -= co[:, 2].min()
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()

# ------------------------------------------------------------------ colour zones
bm = vertex_slot_mask(body, {'body'})
paint_zones(body, BROWN, mask=bm, zones=[
    (lambda co, nm: bm & (co[:, 2] < 0.20) & (co[:, 0] < 0.2), BROWN_D),   # feet
])
smoothstep_blend(body, 'Col', iters=1)
# soft zones along designed curves (polish review 2: the box jaw and the smeared chest-plate edge)
paint_soft(body, [
    # light chest plate: front of the torso under the head, between the arms (front-facing only)
    (lambda co, nm: np.maximum(sd_ellipse((0.50, 0, 0.66), (0.34, 0.50, 0.48))(co, nm), (-0.15 - nm[:, 0]) * 0.2), CHEST),
    (sd_ellipse((1.00, 0, 1.07), (0.14, 0.21, 0.13)), CHEST),                                  # light jaw: an ellipsoid on the jaw tip
    (sd_ellipse((0.92, 0, 1.41), (0.16, 0.32, 0.10)), BROWN_D),                                # darker brow
], mask=bm, edge=0.014)

# ------------------------------------------------------------------ battle pose: head turned toward the camera (shape key)
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


PIV = np.array((0.62, 0.0, 1.18))


def head_weight(co):
    # the small head, brow and jaw in front of the shoulders (not the arms: they are outside |y| 0.30)
    return smooth(0.62, 0.74, co[:, 0]) * smooth(0.95, 1.02, co[:, 2]) * smooth(0.34, 0.26, np.abs(co[:, 1]))


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


key = add_battle_key(body, 14.0, 3.0)

# ------------------------------------------------------------------ render
OUTDIR = os.environ.get('OUTDIR', os.path.join(HERE, 'rounds', 'r1'))
os.makedirs(OUTDIR, exist_ok=True)
SPP = int(os.environ.get('SPP', 12)); SIZE = int(os.environ.get('SIZE', 768)); MODE = os.environ.get('MODE', 'both')
setup_render(samples=SPP, ink_px=6.0 * SIZE / 1024, inner_px=3.0 * SIZE / 1024, crease_deg=100)
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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'cragmaul_final.blend')))
print(f'CRAGMAUL total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
