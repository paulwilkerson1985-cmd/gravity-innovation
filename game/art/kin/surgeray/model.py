"""Surgeray - rare Tide/Spark single (docs/CREATURES.md): an electric ray resting on the ground; its wing-fin tips touch
the floor, its head is raised.

Signature: yellow lightning bolts on the wings and back, a bolt-tipped whip tail, electric-node antennae. Palette: royal
blue, pale belly, yellow.

The body is analytic, not a remeshed slab: a polar grid over the diamond outline, a thin wing slab with a rounded rim
plus smooth domes for the body and the head (taut shading, clean ink, no crumples). It is then posed for the low battle
camera with one smooth function (pose): the wings bend down to the floor, the head curls up, and the whole disc pitches
toward the camera. The battle camera sits in front of the ray and low (12 deg), so a flat ray reads as a sliver and a
nose-up ray shows its belly; pitched toward the camera, the top with its bolts faces it (the 'top facing' print).
Bolts are laid in the rest frame on the height field and posed with the body, so they stay flush and undistorted.
The antennae and nodes have per-side materials and the tail bolt its own slot, so the rig claims them exactly; the
'battle' key turns the whole body toward the camera. Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(turn=36.0,          # a flat ray reads from the front: turned further toward the camera than the round kin (16)
         pitch=26.0,          # the disc tips toward the battle camera (deg, nose down)
         droop=0.20,          # the wing tips bend down this far to the floor
         head=0.10,           # the head curls up at the front (raises the face off the floor)
         lead=0.0,            # the outer leading edges lift (so the wing tips, not the edges, touch the floor)
         rim=0.022,           # half-thickness of the wing slab: the rounded rim's radius
         tilt_az=0.0,         # the azimuth the disc tips toward (deg from +x; the battle camera is at -39)
         tipfix=1.0,          # how far the raised wing tip is bent back down to the floor (1 = both tips touch)
         eye_x=0.215, eye_y=0.105, eye_w=0.078, eye_h=0.095, eye_d=0.04, eye_out=0.016)
import json
P.update(json.loads(os.environ.get('POSE', '{}')))
BACK_YAW = 36.0      # the back sheet turns the body turn + head_back (anim.py keeps the sum at 36, as before)

ROYAL = srgb('#2a4ad8'); ROYAL_D = srgb('#1c34a8'); BELLY = srgb('#dfe8ff'); YELLOW = srgb('#ffe03a'); EYE = srgb('#141a3a')
WHITE = srgb('#ffffff')
INK = '#0c1440'


def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ the outline (x forward, y out): a broad diamond
SPAN = 0.70
HALF = [(0.40, 0.0), (0.375, 0.10), (0.30, 0.22), (0.14, 0.42), (-0.03, 0.62), (-0.13, 0.70), (-0.19, 0.62),
        (-0.25, 0.45), (-0.33, 0.26), (-0.40, 0.11), (-0.44, 0.0)]
CTRL = HALF + [(x, -y) for x, y in reversed(HALF[1:-1])]
OUTL = np.array(smooth_closed(CTRL, subdiv=12))
CX = -0.04                                     # the polar centre (the outline is star-shaped about it)
_th = np.unwrap(np.arctan2(OUTL[:, 1], OUTL[:, 0] - CX))
assert np.all(np.diff(_th) > 0), 'outline is not star-shaped about the centre'
_rr = np.hypot(OUTL[:, 0] - CX, OUTL[:, 1])
RIM = P['rim']


def radius(t):
    return np.interp(np.mod(t, 2 * np.pi), np.mod(_th, 2 * np.pi)[np.argsort(np.mod(_th, 2 * np.pi))],
                     _rr[np.argsort(np.mod(_th, 2 * np.pi))], period=2 * np.pi)


def bump(x, y, cx, sx, sy, h):
    return h * np.exp(-((x - cx) / sx) ** 2 - (y / sy) ** 2)


def dome_top(x, y):      # the body (a low wide dome) and the head (a rounder rise at the front that carries the face)
    return bump(x, y, -0.06, 0.30, 0.26, 0.090) + bump(x, y, 0.15, 0.17, 0.20, 0.125)


def dome_bot(x, y):
    return bump(x, y, -0.03, 0.30, 0.28, 0.050)


def wfall(q):            # 1 in the middle, 0 with zero slope where the rim starts (a smooth join)
    return (1 - np.clip(q, 0, 1) ** 4) ** 1.5


def qof(x, y):
    R = radius(np.arctan2(y, x - CX))
    return np.hypot(x - CX, y) / (R * (1 - RIM / R))


def top_z(x, y):
    return RIM + dome_top(x, y) * wfall(qof(x, y))


def build_body(N=288, K=30, J=7):
    tt = np.linspace(0, 2 * np.pi, N, endpoint=False)
    R = radius(tt); s_in = 1 - RIM / R; cs, sn = np.cos(tt), np.sin(tt)
    rings = []          # (x, y, z, rest side) per ring: side +1 top, -1 bottom
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
    me = bpy.data.meshes.new('surgeray'); me.from_pydata(V, [], F); me.update()
    bm_ = bmesh.new(); bm_.from_mesh(me); bmesh.ops.recalc_face_normals(bm_, faces=bm_.faces); bm_.to_mesh(me); bm_.free()
    o = link(bpy.data.objects.new('surgeray', me))
    n_top = 1 + (K + J - 1) * N          # vertex indices below this are the top surface (centre + top rings + upper rim)
    return o, n_top


TIP = (-0.13, 0.70)


def _bend(co):
    """The wings bend down (each cross-section rotated with the centreline, so the slab keeps its thickness) and the
    head curls up."""
    co = np.asarray(co, float)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    u = np.abs(y) / SPAN
    c = -P['droop'] * u ** 2
    a = np.arctan(-2 * P['droop'] * u / SPAN * np.sign(y))
    Y = y - z * np.sin(a); Z = c + z * np.cos(a)
    Z = Z + P['head'] * sstep(-0.05, 0.42, x) ** 1.4 * (1 - sstep(0.12, 0.60, u))
    Z = Z + P['lead'] * sstep(-0.10, 0.30, x) * sstep(0.25, 0.75, u)        # the outer leading edges lift off the floor
    return np.stack([x, Y, Z], 1)


def _tilt(co):
    """The disc tips by `pitch` degrees toward the azimuth tilt_az (rotation about the horizontal axis across it)."""
    az = math.radians(P['tilt_az']); h = np.array((math.cos(az), math.sin(az), 0.0)); k = np.array((-h[1], h[0], 0.0))
    t = math.radians(P['pitch'])
    return co * math.cos(t) + np.cross(k, co) * math.sin(t) + np.outer(co @ k, k) * (1 - math.cos(t))


def pose(co):
    """Rest frame -> display pose: bend, tilt toward the camera, then the raised wing bent back down to the floor."""
    co = np.asarray(co, float)
    out = _tilt(_bend(co))
    tz = _tilt(_bend(np.array([[TIP[0], TIP[1], 0.0], [TIP[0], -TIP[1], 0.0]])))[:, 2]
    fix = np.where(co[:, 1] > 0, tz[0] - tz.min(), tz[1] - tz.min()) * P['tipfix']
    out[:, 2] -= fix * sstep(0.15, 1.0, np.abs(co[:, 1]) / SPAN)
    return out


body, N_TOP = build_body()
REST, _ = mesh_arrays(body)
co = pose(REST)
FLOOR = co[:, 2].min()
co[:, 2] -= FLOOR
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
low = np.argsort(co[:, 2])[:6]
print('wing tip heights', np.round(pose(np.array([[TIP[0], TIP[1], 0.0], [TIP[0], -TIP[1], 0.0]]))[:, 2] - FLOOR, 3).tolist())
print('lowest rest points', np.round(REST[low], 2).tolist(), 'z', np.round(co[low, 2], 3).tolist())


def pose_w(c):
    out = pose(np.atleast_2d(c)); out[:, 2] -= FLOOR
    return out


set_smooth(body)
# the measure the pose is for: the top surface's area-weighted facing to the battle camera (signed: > 0 is the top)
D_BATTLE = np.array(battle_dir(turn=P['turn']))
D_BACK = np.array(camera_basis(-12.0 + BACK_YAW, 30.0)[0])     # the back sheet's camera in this frame
me = body.data
tops = [f.index for f in me.polygons if all(v < N_TOP for v in f.vertices)]
tmp = body.copy(); tmp.data = body.data.copy(); link(tmp)
bm_ = bmesh.new(); bm_.from_mesh(tmp.data)
bmesh.ops.delete(bm_, geom=[f for f in bm_.faces if f.index not in set(tops)], context='FACES')
bm_.to_mesh(tmp.data); bm_.free()
facing(tmp, D_BATTLE, min_dot=0.45, label='top |n.d| battle')
nn = np.array([f.normal for f in tmp.data.polygons]); ar = np.array([f.area for f in tmp.data.polygons])
for nm_, dv in (('battle', D_BATTLE), ('back', D_BACK)):
    print(f'  top facing {nm_} signed: {float((nn @ dv * ar).sum() / ar.sum()):.3f}')
bpy.data.objects.remove(tmp, do_unlink=True)

dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(body, dg)


def surf(x, y):
    """The posed top surface at rest (x, y): the point and its outward normal."""
    p = Vector(pose_w((x, y, float(top_z(x, y))))[0])
    hit, n, _, _ = bvh.find_nearest(p)
    return hit, n.normalized()


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

# big eyes on the front of the head, looking out and up at the camera
EYES = []
for s in (-1, 1):
    p, n = surf(P['eye_x'], P['eye_y'] * s)
    f = (n + Vector((0.25, 0, 0))).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    EYES.append((ec, f))
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f), mat_eye))
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.45, 0.030), (-0.55, 0.014))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u_ = abs(off)
        loc = ec + dirv * (u_ * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u_ * u_)) - 0.004)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.011), track=f), mat_glint))
EYE_MID = (EYES[0][0] + EYES[1][0]) / 2
EYE_CENTRE = EYE_MID - (EYES[0][1] + EYES[1][1]).normalized() * 0.16
# a small smile on the front lip (the corners sit further back, which reads as higher on the raised face)
MOUTH_X = 0.352
pts = [surf(MOUTH_X - 0.016 * (abs(yy) / 0.055) ** 2, yy) for yy in (-0.055, -0.028, 0.0, 0.028, 0.055)]
parts.append(assign(tube('mouth', [tuple(p + n * 0.006) for p, n in pts], [0.006, 0.009, 0.010, 0.009, 0.006], res=6), mat_mouth))


def bolt_outline(path, w0, w1):
    """A lightning-bolt polygon around a zig-zag path: mitred offsets, the width tapering from w0 to w1 (a point)."""
    Q = [np.array(p, float) for p in path]; n = len(Q); L, R = [], []
    for i in range(n):
        d0 = Q[i] - Q[i - 1] if i > 0 else Q[1] - Q[0]
        d1 = Q[i + 1] - Q[i] if i < n - 1 else Q[-1] - Q[-2]
        n0 = np.array([-d0[1], d0[0]]) / np.linalg.norm(d0); n1 = np.array([-d1[1], d1[0]]) / np.linalg.norm(d1)
        m = n0 + n1; m /= np.linalg.norm(m)
        k = min(2.0, 1.0 / max(0.3, m @ n1))
        w = (w0 + (w1 - w0) * i / (n - 1)) / 2 * k
        L.append(tuple(Q[i] + m * w)); R.append(tuple(Q[i] - m * w))
    return L[:-1] + [tuple(Q[-1] + (Q[-1] - Q[-2]) / np.linalg.norm(Q[-1] - Q[-2]) * 0.03)] + R[:-1][::-1]


def skin_bolt(path, name, w0, w1, mat, t=0.018, proud=0.005):
    """A thin flat bolt laid on the rest height field, then posed with the body: flush, crisp and undistorted."""
    o = slab(name, bolt_outline(path, w0, w1), t, plane='XY')
    c, _ = mesh_arrays(o)
    zl = c[:, 2] - (c[:, 2].max() + c[:, 2].min()) / 2
    c[:, 2] = top_z(c[:, 0], c[:, 1]) + zl + t / 2 - (t - proud)
    c = pose_w(c)
    o.data.vertices.foreach_set('co', c.ravel()); o.data.update()
    set_smooth(o, angle=60)
    return assign(o, mat)


# a bolt down the back and one across each wing
parts.append(skin_bolt([(0.02, 0.03), (-0.07, -0.05), (-0.13, 0.05), (-0.23, -0.04), (-0.29, 0.04), (-0.37, -0.01)],
                       'bolt_back', 0.065, 0.016, mat_bolt))
for s in (-1, 1):
    parts.append(skin_bolt([(0.07, 0.22 * s), (-0.03, 0.31 * s), (0.05, 0.37 * s), (-0.06, 0.48 * s), (-0.09, 0.57 * s)],
                           f'bolt{s}', 0.06, 0.016, mat_bolt))
# electric-node antennae on the head, behind the eyes
ANT = {}
for s in (-1, 1):
    a0, an = surf(0.03, 0.14 * s)
    stalk = [tuple(a0 - an * 0.02), tuple(a0 + Vector((-0.02, 0.04 * s, 0.09))), tuple(a0 + Vector((-0.05, 0.085 * s, 0.165)))]
    parts.append(assign(tube(f'ant{s}', stalk, [0.018, 0.015, 0.012], res=8), mat_ant[s]))
    nc = Vector(stalk[-1]) + Vector((0, 0, 0.035))
    parts.append(assign(ellipsoid(f'node{s}', nc, (0.042, 0.042, 0.042)), mat_node[s]))
    ANT[s] = (a0, nc)
# the whip tail droops from the raised rear in an arc toward the camera side (-y): held off the floor it clears the near
# wing's trailing edge in the battle view (on the floor it hid behind the wing), and the bolt rises from its end
P0 = Vector(pose_w((-0.30, 0.0, 0.0))[0]); PE = Vector(pose_w((-0.44, 0.0, 0.0))[0])
TAIL = [tuple(P0), tuple(PE + Vector((-0.02, 0.0, -0.01))), tuple(PE + Vector((-0.09, -0.13, -0.05))),
        tuple(PE + Vector((-0.15, -0.27, -0.12))), tuple(PE + Vector((-0.17, -0.39, -0.18)))]
tail_o = assign(tube('tail', TAIL, [0.040, 0.032, 0.022, 0.016, 0.013], res=8), mat_tail)
TL = sum((Vector(TAIL[i + 1]) - Vector(TAIL[i])).length for i in range(1, len(TAIL) - 1))
print(f'  tail length past the rear {TL:.2f} (body length {HALF[0][0] - HALF[-1][0]:.2f})')
E = Vector(TAIL[-1]); te = (E - Vector(TAIL[-2])).normalized()
ax = (te * 0.45 + Vector((0, 0, 0.9))).normalized()            # the bolt rises off the tail end like a little flag
cmix = Vector(tuple(D_BATTLE + D_BACK)).normalized()
nb = (cmix - ax * cmix.dot(ax)).normalized()                     # and faces both sheet cameras
e1 = ax.cross(nb).normalized()
BOLT = [(0.0, 0.0), (0.055, 0.11), (0.012, 0.11), (0.06, 0.24), (-0.055, 0.085), (-0.012, 0.085), (-0.05, 0.0)]
tb = slab('tailbolt', [(bx * 1.15, bz * 1.15) for bx, bz in BOLT], 0.026, plane='XY')
c, _ = mesh_arrays(tb)
c[:, 2] -= (c[:, 2].max() + c[:, 2].min()) / 2
org = E - ax * 0.02 + e1 * (0.025 * 1.15)                        # the bolt's foot centred on the tail end
w = np.array(org)[None, :] + c[:, :1] * np.array(e1)[None, :] + c[:, 1:2] * np.array(ax)[None, :] + c[:, 2:3] * np.array(nb)[None, :]
tb.data.vertices.foreach_set('co', w.ravel()); tb.data.update()
set_smooth(tb, angle=60)
assign(tb, mat_tbolt)
TB_TOP = Vector(tuple(w[np.argmax(w @ np.array(ax))]))

KD = KDTree(len(co)); [KD.insert(Vector(v), i) for i, v in enumerate(co)]; KD.balance()
body = union(body, parts)
body = join(body, [tail_o, tb])     # the bent tube refuses the boolean, and a joined tube then gets eaten by the next one
set_smooth(body, angle=50)

# colour zones by REST position (each vertex looks up the nearest posed body vertex): exact, pose-independent shapes
bm = vertex_slot_mask(body, {'body'})
cof, _ = mesh_arrays(body)
RQ = np.array([REST[KD.find(Vector(v))[1]] for v in cof])
paint_zones(body, ROYAL, [], mask=bm)
FACE = np.array((0.40, 0.0, 0.0)); FACE_R = np.array((0.12, 0.18, 0.09))


def sd_face(c, n):      # a soft oval around the mouth that runs into the pale underside, kept below the eyes
    q = (RQ - FACE) / FACE_R
    return (np.linalg.norm(q, axis=1) - 1.0) * 0.10


paint_soft(body, [(lambda c, n: (np.abs(RQ[:, 1]) / SPAN - 0.80) * -0.15, ROYAL_D),     # wing tips, a shade deeper
                  (lambda c, n: RQ[:, 2] + 0.002, BELLY),                                # the pale belly, up to the rim
                  (sd_face, BELLY)], mask=bm, edge=0.010)


def add_battle_key(o, turn_deg):
    o.shape_key_add(name='Basis')
    k = o.shape_key_add(name='battle')
    c, _ = mesh_arrays(o)
    a = math.radians(-turn_deg)
    out = c.copy()
    out[:, 0] = c[:, 0] * math.cos(a) - c[:, 1] * math.sin(a)
    out[:, 1] = c[:, 0] * math.sin(a) + c[:, 1] * math.cos(a)
    k.data.foreach_set('co', out.ravel())
    return k


# rig landmarks for anim.py (rest frame, before the battle turn)
r3 = lambda v: tuple(round(float(x), 3) for x in v)
print('RIG eye_centre', r3(EYE_CENTRE), 'eyes', r3(EYES[0][0]), r3(EYES[1][0]))
for s in (-1, 1):
    print(f'RIG ear{side(s)}', r3(ANT[s][0]), r3(ANT[s][1]))
    print(f'RIG fin{side(s)} root', r3(pose_w((-0.04, 0.24 * s, 0.0))[0]), 'tip', r3(pose_w((-0.13, 0.70 * s, 0.0))[0]))
print('RIG tail', [r3(p) for p in TAIL], 'bolt top', r3(TB_TOP))

key = add_battle_key(body, P['turn'])
OUTDIR = os.environ.get('OUTDIR', os.path.join(HERE, 'rounds', 'r1'))
os.makedirs(OUTDIR, exist_ok=True)
SPP = int(os.environ.get('SPP', 12)); SIZE = int(os.environ.get('SIZE', 768)); MODE = os.environ.get('MODE', 'both')
setup_render(samples=SPP, ink_px=6.0 * SIZE / 1024, inner_px=3.2 * SIZE / 1024, crease_deg=115, decal_px=1.5 * SIZE / 1024)
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
