"""Surgeray - rare Tide/Spark single (docs/CREATURES.md): a ray that has beached itself on purpose. Its pectoral disc
lies spread on the floor like a cape, and from the front of the disc a stout neck rises like a lightning rod to a broad,
flat ray head with domed eyes and a wide manta grin.

Signature: the cape's two wing tips curl up into yellow electric nodes (terminals), a yellow lightning bolt strikes down
each side of the neck and across each wing, and a whip tail rises behind with a gold electrode fork at its tip. Palette: royal blue,
pale ice belly (neck front, jaw, chest bib), yellow. Built like Maelstrode: the disc (an analytic polar grid), the neck
tube along shape.path() and the head are joined and voxel-remeshed into one surface; hard parts (eyes, nodes, spiracles,
the tail fork) are unioned; colour zones are signed distances painted after splitting the mesh under each edge (crisp cel
edges). The 'battle' key turns the whole body toward the camera. Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
sys.path.insert(0, HERE)
from common import *
from mathutils.bvhtree import BVHTree
from shape import path, HEAD_C, EYE_CENTRE

T0 = time.perf_counter()
sc = reset_scene()
P = dict(turn=16.0, curl=0.045, curl_u0=0.76, lip=0.034, lip_w=0.10, rim=0.030, voxel=0.012, neck_widen=1.12,
         fillet_iters=64, eye_x=0.50, eye_y=0.10, eye_z=1.02, eye_w=0.082, eye_h=0.092, eye_d=0.038, eye_out=0.018,
         gaze_in=0.45)

ROYAL = srgb('#2a4ad8'); ROYAL_D = srgb('#1c34a8'); BELLY = srgb('#e2ecff'); YELLOW = srgb('#ffe03a')
GOLD = srgb('#ffcc1e'); PUPIL = srgb('#10163a'); WHITE = srgb('#ffffff')
INK = '#0c1440'; INK_Y = '#7a5a00'


def sstep(e0, e1, x):
    t = np.clip((np.asarray(x, float) - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ the cape: a ray's disc spread on the floor
# (its front lobe reaches past the neck, so the neck's fillet lands on the disc, not on its rim)
SPAN = 0.74
HALF = [(0.37, 0.0), (0.32, 0.13), (0.15, 0.33), (0.0, 0.56), (-0.08, 0.70), (-0.14, 0.74), (-0.20, 0.66), (-0.28, 0.46),
        (-0.38, 0.26), (-0.48, 0.11), (-0.54, 0.0)]
CTRL = HALF + [(x, -y) for x, y in reversed(HALF[1:-1])]
OUTL = np.array(smooth_closed(CTRL, subdiv=12))
CX = -0.10
_th = np.unwrap(np.arctan2(OUTL[:, 1], OUTL[:, 0] - CX))
assert np.all(np.diff(_th) > 0) or np.all(np.diff(_th) < 0), 'outline is not star-shaped about the centre'
_tm = np.mod(_th, 2 * np.pi); _o = np.argsort(_tm)
_rr = np.hypot(OUTL[:, 0] - CX, OUTL[:, 1])
RIM = P['rim']


def radius(t):
    return np.interp(np.mod(t, 2 * np.pi), _tm[_o], _rr[_o], period=2 * np.pi)


def bump(x, y, cx, sx, sy, h):
    return h * np.exp(-((x - cx) / sx) ** 2 - (y / sy) ** 2)


def dome_top(x, y):      # the body's ridge along the middle, highest under the neck
    return bump(x, y, -0.10, 0.34, 0.20, 0.085) + bump(x, y, 0.12, 0.16, 0.16, 0.06)


def dome_bot(x, y):
    return bump(x, y, -0.10, 0.30, 0.24, 0.012)


def wfall(q):
    return (1 - np.clip(q, 0, 1) ** 4) ** 1.5


def build_disc(N=256, K=26, J=6):
    tt = np.linspace(0, 2 * np.pi, N, endpoint=False)
    R = radius(tt); s_in = 1 - RIM / R; cs, sn = np.cos(tt), np.sin(tt)
    rings = []
    for k in range(1, K + 1):
        q = k / K; rho = s_in * R * q; x = CX + rho * cs; y = rho * sn
        rings.append((x, y, RIM + dome_top(x, y) * wfall(q)))
    for j in range(1, J):
        ps = j / J * np.pi / 2; rho = R - RIM + RIM * np.sin(ps)
        rings.append((CX + rho * cs, rho * sn, np.full(N, RIM * np.cos(ps))))
    rings.append((CX + R * cs, R * sn, np.zeros(N)))
    for j in range(J - 1, 0, -1):
        ps = j / J * np.pi / 2; rho = R - RIM + RIM * np.sin(ps)
        rings.append((CX + rho * cs, rho * sn, np.full(N, -RIM * np.cos(ps))))
    for k in range(K, 0, -1):
        q = k / K; rho = s_in * R * q; x = CX + rho * cs; y = rho * sn
        rings.append((x, y, -(RIM + dome_bot(x, y) * wfall(q))))
    V = [(CX, 0.0, RIM + float(dome_top(CX, 0.0))), (CX, 0.0, -(RIM + float(dome_bot(CX, 0.0))))]
    for x, y, z in rings:
        V += list(zip(x, y, z))
    M = len(rings)
    vid = lambda r, i: 2 + r * N + (i % N)
    F = [(0, vid(0, i), vid(0, i + 1)) for i in range(N)]
    for r in range(M - 1):
        F += [(vid(r, i), vid(r + 1, i), vid(r + 1, i + 1), vid(r, i + 1)) for i in range(N)]
    F += [(1, vid(M - 1, i + 1), vid(M - 1, i)) for i in range(N)]
    me = bpy.data.meshes.new('disc'); me.from_pydata(V, [], F); me.update()
    b = bmesh.new(); b.from_mesh(me); bmesh.ops.recalc_face_normals(b, faces=b.faces); b.to_mesh(me); b.free()
    return link(bpy.data.objects.new('disc', me))


def curl_rise(y):
    """The tip curl: only the outer quarter of the span (u0 on) leaves the floor, so the disc stays flat (review 3: a
    curl over the outer half read as a tent from the back camera). Returns the rise and its slope d/d|y|."""
    u0 = P['curl_u0']
    s_ = np.clip((np.abs(y) / SPAN - u0) / (1 - u0), 0, 1)
    t = s_ * s_ * (3 - 2 * s_)
    return P['curl'] * t ** 2, P['curl'] * 2 * t * 6 * s_ * (1 - s_) / (1 - u0) / SPAN


def lip(x, y):
    """The leading edges (the rim that faces the battle camera) roll up off the floor, the tips and the front under the
    neck excepted, so the pale underside shows as a band under the near wing."""
    th = np.arctan2(y, x - CX); e = radius(th) - np.hypot(x - CX, y)
    win = sstep(0.14, 0.26, np.abs(y)) * (1 - sstep(1.25, 1.52, np.abs(th)))
    return P['lip'] * (1 - sstep(0.0, P['lip_w'], e)) ** 2 * win


def curl(co):
    """The wing tips curl up off the floor (each cross-section turned with the centre line, so the slab keeps its
    thickness) and the leading edges lift a little; the rest of the rim stays on the floor."""
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    c, dc = curl_rise(y)
    a = np.arctan(dc) * np.sign(y)
    Y = y - z * np.sin(a); Z = c + z * np.cos(a) + lip(x, y)
    return np.stack([x, Y, Z], 1)


disc = build_disc()
c0, _ = mesh_arrays(disc)
TOP_REST = c0[:, 2] > 0
c1 = curl(c0)
DZ = -c1[:, 2].min(); c1[:, 2] += DZ          # the cape's underside on the floor
disc.data.vertices.foreach_set('co', c1.ravel()); disc.data.update()
TIPS = [curl(np.array([[-0.14, 0.74 * s, 0.0]]))[0] + np.array([0, 0, DZ]) for s in (1, -1)]
print('wing tips', [np.round(t, 3).tolist() for t in TIPS])

# ------------------------------------------------------------------ neck, head, tail: tubes along the centre line
PTS, i_body, i_neck, i_head = path()
# the neck grows out of the disc: its base is ~15 % wider than r11's (and flares a little more where it meets the disc),
# then a local smooth fillets the join (below), so the outline flows round the base instead of plugging in
NW = P['neck_widen']
NECK_BASE = [((0.04, 0.0, 0.13), 0.17 * NW), ((0.13, 0.0, 0.22), 0.17 * NW)]
neck_pts = NECK_BASE + [(p, r * (1 + (NW - 1) * 0.5) if k == 0 else r) for k, (p, r) in enumerate(PTS[i_neck:i_head])] \
    + [((0.36, 0.0, 0.94), 0.092)]
neck = tube('neck', [p for p, r in neck_pts], [r for p, r in neck_pts], res=6, bevel_res=4)
HC = Vector(HEAD_C)
head = ellipsoid('head', HC, (0.20, 0.18, 0.11), rot=(0, -4, 0))
# a ray's muzzle: a shallow spade (wide, flat, narrowing to a soft point), not a gecko's round snout
snout = ellipsoid('snout', (HC.x + 0.13, 0, HC.z - 0.025), (0.155, 0.19, 0.068), taper=0.26, taper_axis=0)
# the eye domes taper back into the crown as ridges (a ray's raised eyes): a round dome inked a frown arc behind the eye
# from the back camera (review 3)
domes = [ellipsoid(f'dome{s}', (P['eye_x'] - 0.06, P['eye_y'] * s, P['eye_z']), (0.11, 0.085, 0.08), rot=(0, 0, 180),
                   taper=0.55, taper_axis=0) for s in (-1, 1)]
tail_pts = [(p, max(r, 0.027)) for p, r in PTS[:i_body]] + [((-0.56, 0.0, 0.09), 0.05), ((-0.40, 0.0, 0.09), 0.06)]
tail_o = tube('tail', [p for p, r in tail_pts], [r for p, r in tail_pts], res=8, bevel_res=4)
body = join(disc, [neck, head, snout, tail_o] + domes)
body.name = 'surgeray'; body.data.name = 'surgeray'
activate(body)
body.data.remesh_voxel_size = P['voxel']; bpy.ops.object.voxel_remesh()
m = body.modifiers.new('sm', 'SMOOTH'); m.factor = 0.5; m.iterations = 3
bpy.ops.object.modifier_apply(modifier='sm')


def local_smooth(o, w, iters, name='fil'):
    """Smooth only where w (0..1 per vertex) > 0: on a concave join this is a fillet (as Cindertail's fuse)."""
    g = o.vertex_groups.new(name=name)
    for i in np.where(w > 1e-3)[0]:
        g.add([int(i)], float(w[i]), 'REPLACE')
    m_ = o.modifiers.new(name, 'SMOOTH'); m_.iterations = iters; m_.factor = 0.5; m_.vertex_group = name
    activate(o); bpy.ops.object.modifier_apply(modifier=name)
    o.vertex_groups.remove(o.vertex_groups[name])


# fillet the neck into the disc: everything within reach of the neck's base ring, above the disc's underside
co, nm = mesh_arrays(body)
_zs = [0.13, 0.22] + [p[2] for p, r in PTS[i_neck:i_neck + 2]]; _xs = [0.04, 0.13] + [p[0] for p, r in PTS[i_neck:i_neck + 2]]
dh = np.hypot(co[:, 0] - np.interp(co[:, 2], _zs, _xs), co[:, 1])
w_f = (1 - sstep(0.32, 0.48, dh)) * sstep(0.055, 0.11, co[:, 2]) * (1 - sstep(0.36, 0.50, co[:, 2]))
local_smooth(body, w_f, P['fillet_iters'])
# soften the brow loop: the eye domes' back and top blend into the crown (it inked a frown arc from the back camera)
co, nm = mesh_arrays(body)
w_b = np.zeros(len(co))
for s_ in (-1, 1):
    dd = np.linalg.norm((co - np.array((P['eye_x'] - 0.06, P['eye_y'] * s_, P['eye_z']))) / np.array((1.3, 1.0, 1.0)), axis=1)
    w_b = np.maximum(w_b, np.exp(-((dd - 0.085) / 0.05) ** 2) * (1 - sstep(P['eye_x'] - 0.06, P['eye_x'] + 0.0, co[:, 0])))
local_smooth(body, w_b, 24, 'brow')
co, nm = mesh_arrays(body)
FLOOR = co[:, 2].min()
co[:, 2] = np.maximum(co[:, 2], 0.0)          # the cape's underside is the floor (DZ): flatten anything below it
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
print(f'  remeshed body: {tri_count(body)} tris, floor shift {FLOOR:.3f}')
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
mat_eye = toon_material('eye', GOLD, glow=0.25, ink=INK)
mat_pupil = toon_material('pupil', PUPIL, ink=INK)
mat_glint = toon_material('glint', WHITE, glow=1.0, ink='#ffffff')
mat_mouth = toon_material('mouth', srgb('#0e1a5a'), ink=INK)
mat_ttip = toon_material('ttip', YELLOW, glow=0.8, ink=INK_Y)         # own slot: rigid on the tail bone
mat_node = {s: toon_material(f'node{"L" if s > 0 else "R"}', YELLOW, glow=0.8, ink=INK_Y) for s in (1, -1)}
assign(body, mat_body)
parts = []
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()
D_BAT = battle_dir(turn=P['turn'])
D_BACK = camera_basis(-12.0 + P['turn'], 30.0)[0]

# eyes: gold irises with big dark pupils and glints in the domes on top of the head, looking forward and up
EYES = []
for s in (-1, 1):
    p, n = snap((P['eye_x'] + 0.5, (P['eye_y'] + 0.28) * s, P['eye_z'] + 0.14), (P['eye_x'] - 0.06, P['eye_y'] * s, P['eye_z'] - 0.02))
    f = (n + Vector((0.3, 0, 0.0))).normalized()
    print(f'  eye {s}: faces the battle camera {f.dot(D_BAT):.2f}, the back camera {f.dot(D_BACK):.2f}')
    ec = p - f * (P['eye_d'] - P['eye_out'])
    EYES.append((ec, f))
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f), mat_eye))
    # the pupil looks toward the battle camera (the far eye shows its pupil, not a gold sliver)
    db = Vector(tuple(D_BAT)); g = (f + (db - f * db.dot(f)) * 0.45).normalized()
    pc = ec + g * (P['eye_d'] * 0.55)
    if s > 0:      # the far eye in battle: its pupil turns inward (screen left, toward the other eye): the gaze converges
        Ls = -camera_basis(35.0 + P['turn'], 12.0)[2]
        g = (g + (Ls - g * Ls.dot(g)) * P['gaze_in']).normalized()
        pc = ec + g * (P['eye_d'] * 0.55)
    parts.append(assign(ellipsoid(f'pupil{s}', pc, (P['eye_w'] * 0.62, P['eye_h'] * 0.68, P['eye_d'] * 0.6), track=g), mat_pupil))
    f = g
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.40, 0.020), (-0.48, 0.010))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        loc = pc + dirv * (abs(off) * P['eye_w'] * 0.62) + f * (P['eye_d'] * 0.62)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.009), track=f), mat_glint))
# the wide manta grin across the front of the snout, its corners turned up
MZ = HC.z - 0.035
mpts = []
for y in (-0.14, -0.10, -0.05, 0.0, 0.05, 0.10, 0.14):
    z = MZ + 0.032 * (abs(y) / 0.14) ** 2.2
    mpts.append(snap((2.0, y * 1.05, z), (HC.x + 0.05, y * 0.9, z))[0])
parts.append(assign(tube('mouth', [tuple(p) for p in mpts], [0.008, 0.011, 0.013, 0.014, 0.013, 0.011, 0.008], res=8), mat_mouth))
# spiracles: two small dark slits on the crown just behind the eyes (a ray's breathing holes), along the body, so
# the head reads ray, not gecko, from the battle and the back cameras
def oriented_ellipsoid(name, c, radii, X, Y, Z):
    o = ellipsoid(name, (0, 0, 0), radii, segs=24, rings=12)
    q, _ = mesh_arrays(o)
    M = np.array([tuple(X), tuple(Y), tuple(Z)])
    o.data.vertices.foreach_set('co', (np.array(tuple(c))[None, :] + q @ M).ravel()); o.data.update()
    return o


for s in (-1, 1):
    hit, n = snap((P['eye_x'] - 0.20, (P['eye_y'] + 0.16) * s, P['eye_z'] + 0.42), (P['eye_x'] - 0.17, P['eye_y'] * s, P['eye_z'] - 0.05))
    fw = Vector((1.0, 0.0, 0.0))                     # along the eye ridge, behind the eye
    X = (fw - n * fw.dot(n)).normalized(); Y = n.cross(X).normalized()
    print(f'  spiracle {s}: {np.round(tuple(hit), 3)}, normal {np.round(tuple(n), 2)}')
    parts.append(assign(oriented_ellipsoid(f'spiracle{s}', hit - n * 0.003, (0.026, 0.0085, 0.010), X, Y, n), mat_mouth))
# the nodes: yellow terminals on the curled wing tips
NODES = {}
for s, tp in zip((1, -1), TIPS):
    tp = Vector(tp)
    nc = tp + Vector((0.0, 0.010 * s, 0.016))          # a bulb that ends the wing, not a ball held up
    NODES[s] = nc
    parts.append(assign(ellipsoid(f'node{s}', nc, (0.046, 0.046, 0.046)), mat_node[s]))

body = union(body, parts)

# the tail tip: a gold electrode fork (two short prongs, each ending in a terminal like the wing-tip nodes, with a
# collar where the tail ends), unioned on the tail (rigid on the tail bone, its own slot). r11's flat bolt glyph was a
# Pikachu-family trope and went edge-on into a horn in the front view; the bolts stay as body paint.
E = Vector(PTS[0][0]); te = (E - Vector(PTS[1][0])).normalized()
ax = (te * 0.5 + Vector((0, 0, 0.8))).normalized()
cmix = Vector(tuple(np.array(D_BAT) + np.array(D_BACK))).normalized()
nb = (cmix - ax * cmix.dot(ax)).normalized()
e1 = ax.cross(nb).normalized()
tparts = [assign(ellipsoid('ttip_collar', E + ax * 0.012, (0.040, 0.040, 0.030), track=ax), mat_ttip)]
for sg in (1, -1):
    dp = (ax * math.cos(math.radians(27)) + e1 * math.sin(math.radians(27)) * sg).normalized()
    a0 = E + ax * 0.02
    tparts.append(assign(tube(f'ttip_prong{sg}', [tuple(a0), tuple(a0 + dp * 0.05), tuple(a0 + dp * 0.095)],
                              [0.020, 0.017, 0.015], res=6, bevel_res=3), mat_ttip))
    tparts.append(assign(ellipsoid(f'ttip_ball{sg}', a0 + dp * 0.11, (0.038, 0.038, 0.038)), mat_ttip))
body = union(body, tparts)
set_smooth(body, angle=50)

# ------------------------------------------------------------------ colour zones (signed distances, crisp edges)
def seg_dist(q, A, B):
    """Distance from 2-D points q to segment AB."""
    ab = B - A; t = np.clip(((q - A) @ ab) / max(1e-12, ab @ ab), 0, 1)
    return np.linalg.norm(q - (A + t[:, None] * ab), axis=1)


def poly_sd(q, poly):
    """Signed distance from 2-D points q to a closed polygon (negative inside)."""
    poly = np.asarray(poly, float); n = len(poly)
    d = np.full(len(q), 9.0); inside = np.zeros(len(q), bool)
    for i in range(n):
        A, B = poly[i], poly[(i + 1) % n]
        d = np.minimum(d, seg_dist(q, A, B))
        c = ((A[1] > q[:, 1]) != (B[1] > q[:, 1]))
        xint = A[0] + (q[:, 1] - A[1]) * (B[0] - A[0]) / np.where(np.abs(B[1] - A[1]) < 1e-12, 1e-12, B[1] - A[1])
        inside ^= c & (q[:, 0] < xint)
    return np.where(inside, -d, d)


def bolt_outline(path_, w0, w1):
    """A lightning-bolt polygon round a zig-zag path: mitred offsets, the width tapering from w0 to w1, a point at the end."""
    Q = [np.array(p, float) for p in path_]; n = len(Q); L, R = [], []
    for i in range(n):
        d0 = Q[i] - Q[i - 1] if i > 0 else Q[1] - Q[0]
        d1 = Q[i + 1] - Q[i] if i < n - 1 else Q[-1] - Q[-2]
        n0 = np.array([-d0[1], d0[0]]) / np.linalg.norm(d0); n1 = np.array([-d1[1], d1[0]]) / np.linalg.norm(d1)
        mm = n0 + n1; mm /= np.linalg.norm(mm)
        k = min(2.0, 1.0 / max(0.3, mm @ n1))
        w_ = (w0 + (w1 - w0) * i / (n - 1)) / 2 * k
        L.append(tuple(Q[i] + mm * w_)); R.append(tuple(Q[i] - mm * w_))
    tip = tuple(Q[-1] + (Q[-1] - Q[-2]) / np.linalg.norm(Q[-1] - Q[-2]) * 0.035)
    return L[:-1] + [tip] + R[:-1][::-1]


# a bolt across each wing (top view, x/y), striking out from the ridge toward the curled tip
WING_BOLT = {s: bolt_outline([(0.03, 0.18 * s), (-0.06, 0.25 * s), (0.02, 0.32 * s), (-0.10, 0.46 * s), (-0.07, 0.52 * s),
                              (-0.14, 0.62 * s)], 0.075, 0.02) for s in (1, -1)}
# a bolt striking down each side of the neck (side view, x/z), from under the jaw to the cape
NECK_BOLT = bolt_outline([(0.32, 0.86), (0.25, 0.75), (0.31, 0.68), (0.22, 0.56), (0.28, 0.50), (0.21, 0.40)], 0.07, 0.02)

bm = vertex_slot_mask(body, {'body'})
paint_zones(body, ROYAL, [], mask=bm)


def sd_wing_bolt(co, nm):
    top = (nm[:, 2] > 0.25) & (np.abs(co[:, 1]) > 0.10)
    d = np.minimum(poly_sd(co[:, :2], WING_BOLT[1]), poly_sd(co[:, :2], WING_BOLT[-1]))
    return np.where(top, d, np.maximum(d, 0.03))


def sd_neck_bolt(co, nm):
    side = (np.abs(nm[:, 1]) > 0.30) & (co[:, 2] > 0.26)
    d = poly_sd(co[:, [0, 2]], NECK_BOLT)
    return np.where(side, d, np.maximum(d, 0.03))


def sd_belly(co, nm):
    """The pale front: a throat V on the neck's forward side (plane cuts in y, so the edge is straight and crisp; no
    pale neck front below mid-height: that was the Lapras read) and the chin under the grin."""
    zs = np.array([p[2] for p, r in PTS[i_neck - 1:i_head + 1]]); xs = np.array([p[0] for p, r in PTS[i_neck - 1:i_head + 1]])
    cx = np.interp(co[:, 2], zs, xs)
    wdt = 0.097 * np.sqrt(sstep(0.58, 0.86, co[:, 2])) - 0.012
    neck_sd = np.maximum(np.abs(co[:, 1]) - wdt, cx - co[:, 0] - 0.02)
    neck_sd = np.where(co[:, 2] < HC.z - 0.04, neck_sd, 1.0)
    jaw = co[:, 2] - (MZ - 0.012 + 0.032 * (np.abs(co[:, 1]) / 0.14) ** 2.2)
    chin = (np.linalg.norm((co - np.array((HC.x + 0.13, 0.0, HC.z - 0.10))) / np.array((0.17, 0.16, 0.10)), axis=1) - 1) * 0.10
    jaw = np.maximum(jaw, chin)                                      # the chin only: under the grin, not a collar
    return np.minimum(neck_sd, jaw)


def sd_under(co, nm):
    """The ray's pale underside, seen as a band under the lifted leading edge and under the curled wing tips: below the
    rim's mid-plane (a plane cut that rises with the curl and the lip, so the edge is a clean line, not the normal's
    stair-steps)."""
    mid = DZ + curl_rise(co[:, 1])[0] + lip(co[:, 0], co[:, 1]) - 0.004
    return np.where(np.abs(co[:, 1]) > 0.20, co[:, 2] - mid, 1.0)


ZONES = [(sd_under, BELLY), (sd_belly, BELLY), (sd_wing_bolt, YELLOW), (sd_neck_bolt, YELLOW)]


def crisp_zones(o, sdfs, edge=0.010, passes=2):
    """Split the edges a colour edge crosses (or nears) so vertex colours change within a quarter voxel (as Cindertail)."""
    for _ in range(passes):
        co_, nm_ = mesh_arrays(o)
        d = np.stack([np.asarray(f(co_, nm_), float) for f in sdfs], 1)
        bmx = bmesh.new(); bmx.from_mesh(o.data); bmx.edges.ensure_lookup_table()
        ev = np.array([(e.verts[0].index, e.verts[1].index) for e in bmx.edges], dtype=np.int64).reshape(-1, 2)
        a, b = d[ev[:, 0]], d[ev[:, 1]]
        hit = ((a * b < 0) | (np.minimum(np.abs(a), np.abs(b)) < edge)).any(1)
        sel = [bmx.edges[i] for i in np.where(hit)[0]]
        bmesh.ops.subdivide_edges(bmx, edges=sel, cuts=1, use_grid_fill=True)
        bmx.to_mesh(o.data); bmx.free(); o.data.update()
        print(f'  crisp_zones: split {len(sel)} edges -> {tri_count(o)} tris')


crisp_zones(body, [f for f, _ in ZONES])
bm = vertex_slot_mask(body, {'body'})
paint_zones(body, ROYAL, [], mask=bm)
paint_soft(body, ZONES, mask=bm, edge=0.004)


def add_battle_key(o, turn_deg):
    o.shape_key_add(name='Basis')
    k = o.shape_key_add(name='battle')
    c_, _ = mesh_arrays(o)
    a = math.radians(-turn_deg)
    out = c_.copy()
    out[:, 0] = c_[:, 0] * math.cos(a) - c_[:, 1] * math.sin(a)
    out[:, 1] = c_[:, 0] * math.sin(a) + c_[:, 1] * math.cos(a)
    k.data.foreach_set('co', out.ravel())
    return k


key = add_battle_key(body, P['turn'])
OUTDIR = os.environ.get('OUTDIR', os.path.join(HERE, 'rounds', 'r1'))
os.makedirs(OUTDIR, exist_ok=True)
SPP = int(os.environ.get('SPP', 12)); SIZE = int(os.environ.get('SIZE', 768)); MODE = os.environ.get('MODE', 'both')
setup_render(samples=SPP, ink_px=6.0 * SIZE / 1024, inner_px=3.2 * SIZE / 1024, crease_deg=100, decal_px=1.5 * SIZE / 512)
sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
if MODE in ('turn', 'both'):
    from turn import turnaround
    key.value = 0.0
    turnaround(body, OUTDIR, size=SIZE, spp=SPP, ground_px=int(SIZE * 0.9))
if MODE in ('battle', 'both'):
    key.value = 1.0
    cam, info = frame_camera([body], yaw=35, elev=12, size=SIZE, ground_px=int(SIZE * 900 / 1024))
    render(os.path.join(OUTDIR, 'battle.png'), 'battle')
    if os.environ.get('BACKCAM'):
        bpy.data.objects.remove(cam, do_unlink=True)
        frame_camera([body], yaw=-12, elev=30, size=SIZE, ground_px=int(SIZE * 900 / 1024))
        render(os.path.join(OUTDIR, 'backcam.png'), 'back camera')
    key.value = 0.0
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'surgeray_final.blend')))
co, _ = mesh_arrays(body)
print(f'SURGERAY total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}, zmin {co[:, 2].min():.3f} zmax {co[:, 2].max():.3f}')
