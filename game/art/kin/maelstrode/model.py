"""Maelstrode - Tide line stage 3 (docs/CREATURES.md): one continuous body, a whirlpool coil on the ground rising into a
proud S-neck.

Signature: the spiral coil (the whirlpool), white fin frills and crest, thick barbels, dorsal fins, a tail fluke rising
from the coil's centre. Palette: deep blue, aqua belly, white fins, gold eyes. Built with the Ashkit recipe, except
the body: a tube along shape.path() joined with the head and voxel-remeshed (the touching coil turns fuse into one
clean surface, which a boolean union of a self-touching tube cannot do). 'battle' key turns the whole body toward the
camera. Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
sys.path.insert(0, HERE)
from common import *
from mathutils.bvhtree import BVHTree
from shape import path, HEAD_C

T0 = time.perf_counter()
sc = reset_scene()
P = dict(eye_y=0.085, eye_z=HEAD_C[2] + 0.05, eye_w=0.085, eye_h=0.095, eye_d=0.036, eye_out=0.013, eye_fwd=0.6, turn=16.0)

BLUE = srgb('#1e64c8'); BLUE_D = srgb('#164a9a'); AQUA = srgb('#8fe8f0'); WHITE_F = srgb('#f4faff'); GOLD = srgb('#ffc832')
PUPIL = srgb('#141a30'); WHITE = srgb('#ffffff')
INK = '#0a1a40'

PTS, i_coil, i_neck, i_head = path()
body = tube('maelstrode', [p for p, r in PTS], [r for p, r in PTS], res=6, bevel_res=4)
head = ellipsoid('head', HEAD_C, (0.23, 0.175, 0.16), rot=(0, 4, 0))
snout = ellipsoid('snout', (HEAD_C[0] + 0.17, 0, HEAD_C[2] - 0.04), (0.12, 0.12, 0.095))
body = join(body, [head, snout])
activate(body)
body.data.remesh_voxel_size = 0.014; bpy.ops.object.voxel_remesh()
m = body.modifiers.new('sm', 'SMOOTH'); m.factor = 0.5; m.iterations = 3      # the turns no longer touch (shape.py), so smoothing cannot fuse them
bpy.ops.object.modifier_apply(modifier='sm')
co, nm = mesh_arrays(body)
co[:, 2] -= co[:, 2].min()
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(body, dg)
HC = Vector(HEAD_C)


def snap(target, origin):
    target, origin = Vector(target), Vector(origin)
    d = (target - origin).normalized()
    hit, n, _, _ = bvh.ray_cast(origin, d, 5.0)
    if hit is None:
        raise RuntimeError(f'no hit {target}')
    return hit, n.normalized()


mat_body = toon_material('body', attr='Col', ink=INK)
mat_eye = toon_material('eye', GOLD, glow=0.2, ink=INK)
mat_pupil = toon_material('pupil', PUPIL, ink=INK)
mat_glint = toon_material('glint', WHITE, glow=1.0, ink='#ffffff')
mat_mouth = toon_material('mouth', srgb('#0a1a50'), ink=INK)
mat_fin = toon_material('fin', WHITE_F, ink=INK)
mat_barbel = toon_material('barbel', BLUE_D, ink=INK)
assign(body, mat_body)
parts = []
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()
_ta = math.radians(P['turn'])
d_bat = Vector((d_cam.x * math.cos(_ta) - d_cam.y * math.sin(_ta), d_cam.x * math.sin(_ta) + d_cam.y * math.cos(_ta), d_cam.z))


def cw(poly):
    """slab() triangulates a concave outline correctly only when it runs clockwise (a counter-clockwise one folds
    triangles over each other), so every outline goes in clockwise."""
    P_ = np.array(poly, float)
    a_ = np.sum(P_[:, 0] * np.roll(P_[:, 1], -1) - np.roll(P_[:, 0], -1) * P_[:, 1])
    return list(poly) if a_ < 0 else list(poly)[::-1]


# fins: a lens-ish profile, 0.05 thick at the root thinning to 0.012 at the tip (review 2 #2: rods and dashes)
FIN_T = 0.05
FIN_TAPER = (1, 1.0, 0.24)

# gold eyes with round dark pupils and glints, set forward on the head so the far eye still faces the battle camera
# (review 2 #1: snapped on the sides it was a sliver)
for s in (-1, 1):
    p, n = snap((2.0, P['eye_y'] * s * 1.15, P['eye_z']), (HC.x, P['eye_y'] * s, P['eye_z']))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    print(f'  eye {s}: faces the battle camera {f.dot(d_bat):.2f}')
    assert f.dot(d_bat) > 0.35, f'eye {s} turned away from the battle camera ({f.dot(d_bat):.2f})'
    ec = p - f * (P['eye_d'] - P['eye_out'])
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f), mat_eye))
    pc = ec + f * (P['eye_d'] * 0.55)
    parts.append(assign(ellipsoid(f'pupil{s}', pc, (P['eye_w'] * 0.62, P['eye_h'] * 0.66, P['eye_d'] * 0.6), track=f), mat_pupil))
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.40, 0.024), (-0.50, 0.012))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        loc = pc + dirv * (abs(off) * P['eye_w'] * 0.62) + f * (P['eye_d'] * 0.62)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.010), track=f), mat_glint))
# a wide, calm mouth line along the snout
mz = HC.z - 0.07
pts = [snap((2.0, y, mz + 0.012 * (abs(y) / 0.08) ** 2), (HC.x + 0.1, y, mz + 0.012 * (abs(y) / 0.08) ** 2))[0] for y in (-0.08, -0.04, 0.0, 0.04, 0.08)]
parts.append(assign(tube('mouth', [tuple(p) for p in pts], [0.006, 0.008, 0.009, 0.008, 0.006], res=8), mat_mouth))
# thick barbels from the sides of the snout, drooping and curling forward at the ends
for s in (-1, 1):
    b0, _ = snap((HC.x + 0.16, 0.6 * s, HC.z - 0.04), (HC.x + 0.16, 0, HC.z - 0.04))
    bar = [tuple(b0 - Vector((0, 0.02 * s, 0))), tuple(b0 + Vector((0.02, 0.08 * s, -0.06))), tuple(b0 + Vector((0.03, 0.12 * s, -0.17))),
           tuple(b0 + Vector((0.08, 0.13 * s, -0.24)))]
    parts.append(assign(tube(f'barbel{s}', bar, [0.032, 0.026, 0.018, 0.010], res=8), mat_barbel))
# no centre crest (verify 2): from the front it was a white horn between the frills, and leaned back or rooted behind the
# crown it read as a bone sticking out of the head; the frills and the dorsal fins carry the white-fin signature
# frills: fanned white fins behind the jaw on each side
FRILL = smooth_closed([(0.0, 0.0), (-0.05, 0.12), (-0.14, 0.18), (-0.20, 0.10), (-0.24, 0.0), (-0.20, -0.08), (-0.10, -0.08)], subdiv=5)
for s in (-1, 1):
    fp, _ = snap((HC.x - 0.10, 3.0 * s, HC.z - 0.02), (HC.x - 0.10, 0, HC.z - 0.02))
    parts.append(assign(slab(f'frill{s}', cw([(x * 1.3, z * 1.3) for x, z in FRILL]), 0.04, loc=tuple(fp + Vector((-0.02, 0.02 * s, 0))), rot=(0, 0, 34 * s), plane='XZ', taper=(0, 0.3, 1.0)), mat_fin))
# dorsal fins down the back of the neck: each placed by a frame (base along the neck, standing out of the back)
FIN = [(0.0, 0.0), (0.05, 0.13), (0.14, 0.19), (0.14, 0.0)]     # 0.22 proud of the neck (verify 2: slots cut into the neck)
neck = [Vector(p) for p, r in PTS[i_neck:i_head]]
FIN_BASES = []
for j, (u, sc_) in enumerate(((0.22, 0.8), (0.48, 1.0), (0.74, 0.85))):
    k = int(u * (len(neck) - 1)); a, b = neck[k], neck[min(k + 1, len(neck) - 1)]
    c = a.lerp(b, u * (len(neck) - 1) - k)
    T = (b - a).normalized()
    # staggered: each root sits 35 deg off the back line, alternately left and right, and the fin splays a further 15 deg,
    # so from behind every fin breaks the neck's silhouette (verify 2: inside it they read as slots cut into the neck)
    sg = 1 if j % 2 == 0 else -1
    b0 = Vector((-1.0, 0, 0)); b0 = (b0 - T * b0.dot(T)).normalized()
    ra = math.radians(35 * sg); b0 = (b0 * math.cos(ra) + T.cross(b0) * math.sin(ra)).normalized()
    hit, n = snap(c + b0, c)
    Nb = (n - T * n.dot(T)).normalized()
    sp_ = math.radians(15 * sg)
    Nb = (Nb * math.cos(sp_) + T.cross(Nb) * math.sin(sp_)).normalized()
    fin = slab(f'dorsal{j}', cw([(x * sc_ * 1.3, z * sc_ * 1.3) for x, z in FIN]), FIN_T * 0.8, plane='XZ', taper=FIN_TAPER)
    M = Matrix((-T, Nb.cross(-T).normalized(), Nb)).transposed().to_4x4(); M.translation = hit - Nb * 0.02
    fin.matrix_world = M; apply_xform(fin)
    FIN_BASES.append(np.array(hit))
    parts.append(assign(fin, mat_fin))
# the tail fluke: two white lobes at the tip rising from the centre
# a waisted base as wide as the stalk's top, so the round stalk flattens into the fluke (verify 2: a sawn-off post)
FLUKE = smooth_closed([(0.0, -0.02), (0.04, 0.0), (0.10, 0.08), (0.16, 0.18), (0.06, 0.12), (0.0, 0.07), (-0.06, 0.12), (-0.16, 0.18),
                       (-0.10, 0.08), (-0.04, 0.0)], subdiv=4)
tip = Vector(PTS[0][0])
fl = slab('fluke', cw([(x * 1.45, z * 1.45) for x, z in FLUKE]), FIN_T * 1.5, loc=tuple(tip + Vector((0, 0, -0.03))), rot=(0, 0, 70), plane='XZ',
           taper=(1, 1.0, 0.16))      # thick enough at the base to hold the stalk's tip inside it (verify 2: a seam in the lobes)
facing(fl, d_bat, label='fluke battle')
parts.append(assign(fl, mat_fin))

body = union(body, parts)
set_smooth(body, angle=50)

bm = vertex_slot_mask(body, {'body'})
paint_zones(body, BLUE, [], mask=bm)

# the centre line, dense, with arclength, radius and tangent: zones are painted in the tube's own frame
_P = np.array([p for p, r in PTS], float); _R = np.array([r for p, r in PTS], float)
_D, _DR, _S = [_P[0]], [_R[0]], [0.0]
for i_ in range(len(_P) - 1):
    for j_ in range(1, 9):
        q_ = _P[i_] + (_P[i_ + 1] - _P[i_]) * j_ / 8
        _S.append(_S[-1] + float(np.linalg.norm(q_ - _D[-1]))); _D.append(q_); _DR.append(_R[i_] + (_R[i_ + 1] - _R[i_]) * j_ / 8)
_D = np.array(_D); _DR = np.array(_DR); _S = np.array(_S)
_T = np.gradient(_D, axis=0); _T /= np.linalg.norm(_T, axis=1)[:, None]
S_COIL, S_NECK = _S[i_coil * 8], _S[i_neck * 8]
_co, _nm = mesh_arrays(body)
_near = np.empty(len(_co), dtype=np.int64); _other = np.full(len(_co), 9.0)
for a_ in range(0, len(_co), 4000):
    dd = np.linalg.norm(_co[a_:a_ + 4000, None, :] - _D[None, :, :], axis=2)
    _near[a_:a_ + 4000] = np.argmin(dd, axis=1)
    own = _S[_near[a_:a_ + 4000]]
    far = np.abs(_S[None, :] - own[:, None]) > 0.55              # another stretch of the body (the next coil turn)
    _other[a_:a_ + 4000] = np.where(far, dd - _DR[None, :], 9.0).min(axis=1)
_sv = _S[_near]


def sd_belly(co, nm):
    """The aqua belly (review 2 #3): a stripe by angle round the tube axis on the side facing out of the coil (the
    front of the neck), ending in a V 0.08 under the chin and closing to a point on the coil's last stretch."""
    c = _D[_near]; t = _T[_near]
    v = co - c; v -= t * np.sum(v * t, axis=1)[:, None]
    rad = np.linalg.norm(v, axis=1) + 1e-9
    bd = c.copy(); bd[:, 2] = 0; bd -= t * np.sum(bd * t, axis=1)[:, None]
    bd /= np.linalg.norm(bd, axis=1)[:, None] + 1e-9
    th = np.arccos(np.clip(np.sum(v * bd, axis=1) / rad, -1, 1))
    arc = th * rad
    k = np.clip((_sv - (S_NECK - 0.22)) / 0.34, 0, 1); k = np.sqrt(k)        # closes to a point where the neck meets the coil
    w = 0.95 * rad * k
    # the top end: a designed V in world space (verify 2: by arclength it smeared under the chin, where the nearest
    # centre-line point jumps across the bend into the head)
    vee = co[:, 2] - (Z_TOP - 1.3 * np.abs(co[:, 1]))
    return np.maximum(arc - w, vee)


Z_TOP = HC.z - 0.16 - 0.15          # the V's point, 0.15 under the chin: clear of the chin's shadow


def sd_groove(co, nm):        # the whirlpool's grooves: where a coil turn meets the next, a deeper blue
    coil = (_sv > S_COIL) & (_sv < S_NECK - 0.1)
    return np.where(coil, _other - 0.045, 1.0)


# the dorsal roots: no dark blob any more (verify 2: a soft blob above each fin); the union seam's crease ink is the line
paint_soft(body, [(sd_groove, BLUE_D), (sd_belly, AQUA)], mask=bm, edge=0.013)


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
    key.value = 0.0
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'maelstrode_final.blend')))
co, _ = mesh_arrays(body)
print(f'MAELSTRODE total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}, zmin {co[:, 2].min():.3f} zmax {co[:, 2].max():.3f}')
