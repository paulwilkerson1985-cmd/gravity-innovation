"""Surgeray - rare Tide/Spark single (docs/CREATURES.md): an electric ray resting on the ground; its wing-fin tips touch
the floor, its nose is slightly raised.

Signature: yellow lightning bolts on the wings and back, a bolt-tipped whip tail, electric-node antennae. Palette: royal
blue, pale belly, yellow. Built with the Ashkit recipe: the body is a lens-shaped slab (the ray outline, bulged in the
middle) bent so the wing tips droop to the floor and the nose lifts; bolts are glowing zig-zag tubes laid on the skin;
the antennae have per-side materials so the rig claims them exactly; 'battle' key turns the whole body toward the
camera. Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(eye_y=0.12, eye_w=0.10, eye_h=0.12, eye_d=0.045, eye_out=0.015, eye_fwd=0.20, turn=16.0)

ROYAL = srgb('#2a4ad8'); ROYAL_D = srgb('#1c34a8'); BELLY = srgb('#dfe8ff'); YELLOW = srgb('#ffe03a'); EYE = srgb('#141a3a')
WHITE = srgb('#ffffff')
INK = '#0c1440'

# ------------------------------------------------------------------ the ray: outline (x forward, y out), bulged into a lens
OUT = smooth_closed([(0.46, 0.0), (0.34, 0.22), (0.10, 0.52), (-0.06, 0.74), (-0.22, 0.60), (-0.40, 0.26), (-0.50, 0.0),
                     (-0.40, -0.26), (-0.22, -0.60), (-0.06, -0.74), (0.10, -0.52), (0.34, -0.22)], subdiv=6)
body = slab('surgeray', OUT, 0.06, plane='XY', bulge=0.30)
m = body.modifiers.new('sub', 'SUBSURF'); m.levels = 2
activate(body); bpy.ops.object.modifier_apply(modifier='sub')
co, _ = mesh_arrays(body)
y = np.abs(co[:, 1]); x = co[:, 0]
lift = 0.13 - 0.11 * np.clip(y / 0.74, 0, 1) ** 2.0 + 0.10 * np.clip(x / 0.46, 0, 1) ** 1.5    # wing tips droop to the floor, nose lifts
co[:, 2] = co[:, 2] * (1.0 - 0.6 * np.clip(y / 0.74, 0, 1)) + lift
co[:, 2] -= co[:, 2].min()
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
# the head mound: a rounded rise on the front of the back that carries the face
ztop = co[np.abs(co[:, 1]) < 0.1][:, 2].max()
mound = ellipsoid('mound', (0.14, 0, ztop - 0.06), (0.30, 0.25, 0.17))
body = union(body, [mound])
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(body, dg)


def snap(target, origin):
    target, origin = Vector(target), Vector(origin)
    d = (target - origin).normalized()
    hit, n, _, _ = bvh.ray_cast(origin, d, 5.0)
    if hit is None:
        raise RuntimeError(f'no hit {target}')
    return hit, n.normalized()


def mid(x, y):
    """The middle of the body's thickness at (x, y): a ray start that is inside the lens."""
    top, _ = snap((x, y, -1.0), (x, y, 3.0)); bot, _ = snap((x, y, 3.0), (x, y, -1.0))
    return (top.z + bot.z) / 2


def side(s):
    return 'L' if s > 0 else 'R'


mat_body = toon_material('body', attr='Col', ink=INK)
mat_eye = toon_material('eye', EYE, ink=INK)
mat_glint = toon_material('glint', WHITE, glow=1.0, ink='#ffffff')
mat_mouth = toon_material('mouth', srgb('#0e1a5a'), ink=INK)
mat_bolt = toon_material('bolt', YELLOW, glow=0.6, ink='#7a5a00')
mat_tail = toon_material('tail', ROYAL_D, ink=INK)
mat_tbolt = toon_material('tbolt', YELLOW, glow=0.6, ink='#7a5a00')      # own slot: the rig's tail tip claims it whole
mat_ant = {s: toon_material(f'ant{side(s)}', ROYAL_D, ink=INK) for s in (-1, 1)}
mat_node = {s: toon_material(f'node{side(s)}', YELLOW, glow=0.8, ink='#7a5a00') for s in (-1, 1)}
assign(body, mat_body)
parts = []
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

# eyes on the raised front edge, looking forward and up
for s in (-1, 1):
    zc = mid(0.14, P['eye_y'] * s)
    p, n = snap((1.0, P['eye_y'] * s, zc + 0.30), (0.14, P['eye_y'] * s, zc))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f), mat_eye))
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.45, 0.030), (-0.55, 0.014))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u = abs(off)
        loc = ec + dirv * (u * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u * u)) - 0.004)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.011), track=f), mat_glint))
# a small smile on the front rim
zm = mid(0.30, 0.0) - 0.01
pts = [snap((1.0, yy, zm + 0.015 * (abs(yy) / 0.08) ** 2), (0.30, yy, zm + 0.015 * (abs(yy) / 0.08) ** 2))[0] for yy in (-0.08, -0.04, 0.0, 0.04, 0.08)]
parts.append(assign(tube('mouth', [tuple(p) for p in pts], [0.006, 0.009, 0.010, 0.009, 0.006], res=8), mat_mouth))


def on_skin(path2d, name, r0, r1):
    """A glowing zig-zag laid on the top of the skin: points dropped onto the body from above."""
    pts = []
    for (px, py) in path2d:
        hit, n = snap((px, py, -1.0), (px, py, 3.0))
        pts.append(tuple(hit - n * 0.006))
    radii = [r0 + (r1 - r0) * j / (len(pts) - 1) for j in range(len(pts))]
    return assign(tube(name, pts, radii, res=1), mat_bolt)


# a bolt down the back and one across each wing
parts.append(on_skin([(0.20, 0.02), (0.08, -0.05), (0.02, 0.05), (-0.12, -0.04), (-0.20, 0.04), (-0.34, -0.02)], 'bolt_back', 0.030, 0.012))
for s in (-1, 1):
    parts.append(on_skin([(0.06, 0.22 * s), (-0.02, 0.32 * s), (0.08, 0.40 * s), (-0.04, 0.52 * s), (0.02, 0.58 * s), (-0.08, 0.66 * s)], f'bolt{s}', 0.028, 0.010))
# electric-node antennae on the head
for s in (-1, 1):
    a0, _ = snap((0.22, 0.10 * s, -1.0), (0.22, 0.10 * s, 3.0))
    stalk = [tuple(a0 + Vector((0, 0, -0.02))), tuple(a0 + Vector((0.02, 0.03 * s, 0.10))), tuple(a0 + Vector((0.0, 0.06 * s, 0.18)))]
    parts.append(assign(tube(f'ant{s}', stalk, [0.018, 0.015, 0.012], res=8), mat_ant[s]))
    parts.append(assign(ellipsoid(f'node{s}', Vector(stalk[-1]) + Vector((0, 0, 0.035)), (0.045, 0.045, 0.045)), mat_node[s]))
# the whip tail, ending in a bolt-shaped tip
tb, _ = snap((-0.46, 0, -1.0), (-0.46, 0, 3.0))
tail = [tuple(tb + Vector((0.06, 0, -0.03))), (-0.70, 0.02, tb.z - 0.02), (-0.94, -0.02, tb.z + 0.02), (-1.12, 0.02, tb.z + 0.10)]
parts.append(assign(tube('tail', tail, [0.045, 0.028, 0.02, 0.014], res=8), mat_tail))
tip = Vector(tail[-1])
BOLT = [(0.0, 0.0), (0.05, 0.10), (0.0, 0.10), (0.06, 0.22), (-0.06, 0.08), (-0.01, 0.08), (-0.05, 0.0)]
parts.append(assign(slab('tailbolt', [(bx * 1.2, bz * 1.2) for bx, bz in BOLT], 0.03, loc=tuple(tip + Vector((-0.02, 0, -0.01))), rot=(0, 20, 50), plane='XZ'), mat_tbolt))

body = union(body, parts)
set_smooth(body, angle=50)

bm = vertex_slot_mask(body, {'body'})
zones = [
    (lambda co, nm: bm & (nm[:, 2] < -0.15), BELLY),                                              # pale underside
    (lambda co, nm: bm & (co[:, 0] > 0.20) & (nm[:, 0] > 0.25) & (np.abs(co[:, 1]) < 0.30), BELLY),  # pale face on the mound front
    (lambda co, nm: bm & (nm[:, 2] > 0.2) & (np.abs(co[:, 1]) > 0.40), ROYAL_D),                   # darker wing tips
]
paint_zones(body, ROYAL, zones, mask=bm)
smoothstep_blend(body, 'Col', iters=2)


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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'surgeray_final.blend')))
co, _ = mesh_arrays(body)
print(f'SURGERAY total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}, zmin {co[:, 2].min():.3f} zmax {co[:, 2].max():.3f}')
